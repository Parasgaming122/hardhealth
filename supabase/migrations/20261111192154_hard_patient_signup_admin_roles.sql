-- Patient self-registration and guarded platform-administrator tools.
-- This migration does NOT widen clinical-table RLS or expose clinical records to platform admins.

create schema if not exists hard_private;
revoke all on schema hard_private from public, anon, authenticated, service_role;

-- Every new Supabase Auth account receives only the fixed patient application role.
-- Never derive an application role from raw_user_meta_data or signup form input.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'H.A.R.D user')
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role, provider_id, created_by)
  values (new.id, 'patient', null, null)
  on conflict (user_id, role, provider_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated, service_role;

create or replace function hard_private.assert_platform_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.role = 'platform_admin' and r.is_active
  ) then
    raise exception 'Active platform administrator required' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function hard_private.assert_platform_admin() from public, anon, authenticated, service_role;

create or replace function hard_private.admin_assign_user_role(
  p_user_id uuid,
  p_role text,
  p_provider_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
begin
  if p_user_id is null or p_role is null or p_role not in (
    'patient','doctor','front_desk','pharmacist','lab_tech','provider_admin','platform_admin'
  ) then
    raise exception 'Invalid account or application role' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  if p_role in ('patient','platform_admin') then
    if p_provider_id is not null then
      raise exception 'Patient and platform admin roles are not provider-scoped' using errcode = '22023';
    end if;
  elsif p_provider_id is null or not exists (
    select 1 from public.provider_organizations p
    where p.id = p_provider_id and p.status = 'approved'
  ) then
    raise exception 'An approved provider is required for this role' using errcode = '22023';
  end if;

  insert into public.user_roles (user_id, role, provider_id, created_by, is_active)
  values (p_user_id, p_role, p_provider_id, v_actor, true)
  on conflict (user_id, role, provider_id)
  do update set is_active = true, created_by = excluded.created_by;

  if p_role in ('doctor','front_desk','pharmacist','lab_tech','provider_admin') then
    insert into public.provider_memberships (provider_id, user_id, role, is_active)
    values (p_provider_id, p_user_id, p_role, true)
    on conflict (provider_id, user_id, role) do update set is_active = true;
  end if;

  insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, resource_id, metadata)
  values (
    v_actor, p_provider_id, 'role_assignment', 'user_role', p_user_id,
    jsonb_build_object('assigned_role', p_role, 'provider_id', p_provider_id, 'operation', 'grant')
  );
end;
$$;
revoke all on function hard_private.admin_assign_user_role(uuid, text, uuid) from public, anon, authenticated, service_role;

create or replace function hard_private.admin_revoke_user_role(
  p_user_id uuid,
  p_role text,
  p_provider_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_active_admins bigint;
begin
  if p_user_id is null or p_role is null or p_role not in (
    'patient','doctor','front_desk','pharmacist','lab_tech','provider_admin','platform_admin'
  ) then
    raise exception 'Invalid account or application role' using errcode = '22023';
  end if;
  if (p_role in ('patient','platform_admin') and p_provider_id is not null)
     or (p_role not in ('patient','platform_admin') and p_provider_id is null) then
    raise exception 'Role/provider scope does not match' using errcode = '22023';
  end if;
  if p_role = 'platform_admin' then
    perform pg_catalog.pg_advisory_xact_lock(21474836, 404);
    select count(*) into v_active_admins
    from public.user_roles r
    where r.role = 'platform_admin' and r.is_active;
    if v_active_admins <= 1 then
      raise exception 'The last active platform administrator cannot be revoked' using errcode = '23514';
    end if;
  end if;

  update public.user_roles r
  set is_active = false
  where r.user_id = p_user_id and r.role = p_role
    and r.provider_id is not distinct from p_provider_id and r.is_active;
  if not found then
    raise exception 'Active role assignment not found' using errcode = '22023';
  end if;

  if p_role in ('doctor','front_desk','pharmacist','lab_tech','provider_admin') then
    update public.provider_memberships m
    set is_active = false
    where m.provider_id = p_provider_id and m.user_id = p_user_id and m.role = p_role and m.is_active;
  end if;

  insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, resource_id, metadata)
  values (
    v_actor, p_provider_id, 'role_assignment', 'user_role', p_user_id,
    jsonb_build_object('revoked_role', p_role, 'provider_id', p_provider_id, 'operation', 'revoke')
  );
end;
$$;
revoke all on function hard_private.admin_revoke_user_role(uuid, text, uuid) from public, anon, authenticated, service_role;

create or replace function hard_private.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  roles jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_search text := nullif(trim(p_search), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 1000000));
begin
  if v_search is not null and char_length(v_search) > 120 then
    raise exception 'Search text is too long' using errcode = '22023';
  end if;

  insert into public.audit_events (actor_user_id, event_type, resource_type, metadata)
  values (
    v_actor, 'normal_read', 'admin_user_directory',
    jsonb_build_object('page_size', v_limit, 'offset', v_offset, 'filtered', v_search is not null)
  );

  return query
  select
    u.id,
    u.email::text,
    coalesce(nullif(p.display_name, ''), 'H.A.R.D user')::text,
    u.created_at,
    coalesce(
      jsonb_agg(jsonb_build_object(
        'role', r.role,
        'provider_id', r.provider_id,
        'provider_name', o.name,
        'is_active', r.is_active
      ) order by r.created_at, r.role) filter (where r.id is not null),
      '[]'::jsonb
    )
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.user_roles r on r.user_id = u.id
  left join public.provider_organizations o on o.id = r.provider_id
  where v_search is null
     or pg_catalog.strpos(pg_catalog.lower(coalesce(u.email, '')), pg_catalog.lower(v_search)) > 0
     or pg_catalog.strpos(pg_catalog.lower(coalesce(p.display_name, '')), pg_catalog.lower(v_search)) > 0
  group by u.id, u.email, p.display_name, u.created_at
  order by u.created_at desc, u.id
  limit v_limit offset v_offset;
end;
$$;
revoke all on function hard_private.admin_list_users(text, integer, integer) from public, anon, authenticated, service_role;

create or replace function hard_private.admin_list_providers(p_limit integer default 100)
returns table (
  provider_id uuid,
  provider_name text,
  provider_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
begin
  insert into public.audit_events (actor_user_id, event_type, resource_type, metadata)
  values (v_actor, 'normal_read', 'admin_provider_directory', jsonb_build_object('page_size', v_limit));

  return query
  select p.id, p.name, p.provider_type
  from public.provider_organizations p
  where p.status = 'approved'
  order by p.name, p.id
  limit v_limit;
end;
$$;
revoke all on function hard_private.admin_list_providers(integer) from public, anon, authenticated, service_role;

create or replace function hard_private.admin_platform_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_summary jsonb;
begin
  select jsonb_build_object(
    'providers_pending', (select count(*) from public.provider_organizations p where p.status = 'pending'),
    'providers_approved', (select count(*) from public.provider_organizations p where p.status = 'approved'),
    'invoices_paid_total', coalesce((select sum(i.total_amount) from public.invoices i where i.status = 'paid'), 0),
    'platform_ledger_total', coalesce((select sum(e.amount) from public.ledger_entries e where e.ledger_side = 'platform'), 0)
  ) into v_summary;

  insert into public.audit_events (actor_user_id, event_type, resource_type, metadata)
  values (v_actor, 'workspace_read', 'admin_platform_summary', jsonb_build_object('clinical_content_included', false));
  return v_summary;
end;
$$;
revoke all on function hard_private.admin_platform_summary() from public, anon, authenticated, service_role;

create or replace function hard_private.record_workspace_read(p_workspace text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_admin boolean;
  v_required_role text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_workspace is null or p_workspace not in ('patient','doctor','front-desk','pharmacy','lab','provider-admin','admin') then
    raise exception 'Unsupported workspace' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.role = 'platform_admin' and r.is_active
  ) into v_admin;

  v_required_role := case p_workspace
    when 'patient' then 'patient'
    when 'doctor' then 'doctor'
    when 'front-desk' then 'front_desk'
    when 'pharmacy' then 'pharmacist'
    when 'lab' then 'lab_tech'
    when 'provider-admin' then 'provider_admin'
    when 'admin' then 'platform_admin'
  end;

  if not v_admin and not exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.role = v_required_role and r.is_active
  ) then
    raise exception 'Workspace role required' using errcode = '42501';
  end if;

  insert into public.audit_events (actor_user_id, event_type, resource_type, metadata)
  values (
    v_actor, 'workspace_read', 'workspace',
    jsonb_build_object('workspace', p_workspace, 'admin_override', v_admin and p_workspace <> 'admin')
  );
end;
$$;
revoke all on function hard_private.record_workspace_read(text) from public, anon, authenticated, service_role;

-- Public RPC wrappers are the only client-callable entry points. They still enforce auth
-- in the private SECURITY DEFINER implementation and expose no clinical-record operations.
create or replace function public.assign_user_role(p_user_id uuid, p_role text, p_provider_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$ select hard_private.admin_assign_user_role(p_user_id, p_role, p_provider_id); $$;

create or replace function public.admin_assign_user_role(p_user_id uuid, p_role text, p_provider_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$ select hard_private.admin_assign_user_role(p_user_id, p_role, p_provider_id); $$;

create or replace function public.admin_revoke_user_role(p_user_id uuid, p_role text, p_provider_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$ select hard_private.admin_revoke_user_role(p_user_id, p_role, p_provider_id); $$;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (user_id uuid, email text, display_name text, created_at timestamptz, roles jsonb)
language sql
security definer
set search_path = ''
as $$ select * from hard_private.admin_list_users(p_search, p_limit, p_offset); $$;

create or replace function public.admin_list_providers(p_limit integer default 100)
returns table (provider_id uuid, provider_name text, provider_type text)
language sql
security definer
set search_path = ''
as $$ select * from hard_private.admin_list_providers(p_limit); $$;

create or replace function public.admin_platform_summary()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hard_private.admin_platform_summary(); $$;

create or replace function public.record_workspace_read(p_workspace text)
returns void
language sql
security definer
set search_path = ''
as $$ select hard_private.record_workspace_read(p_workspace); $$;

revoke all on function public.assign_user_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_assign_user_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_revoke_user_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_providers(integer) from public, anon, authenticated;
revoke all on function public.admin_platform_summary() from public, anon, authenticated;
revoke all on function public.record_workspace_read(text) from public, anon, authenticated;

grant execute on function public.assign_user_role(uuid, text, uuid) to authenticated;
grant execute on function public.admin_assign_user_role(uuid, text, uuid) to authenticated;
grant execute on function public.admin_revoke_user_role(uuid, text, uuid) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_list_providers(integer) to authenticated;
grant execute on function public.admin_platform_summary() to authenticated;
grant execute on function public.record_workspace_read(text) to authenticated;
