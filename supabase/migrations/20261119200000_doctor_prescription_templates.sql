-- ============================================================
-- Phase 2 P2-5: Doctor prescription templates (brief 5.4, 7.2, 15)
-- Prepared for automatic application by the auto DB setup
-- (or manual application via the Supabase SQL editor).
--
-- Brief 5.4: doctors add prescription items using "medicine
-- search and saved templates". Brief 7.2: "Prescription
-- templates (saved sets of common prescriptions) ... keep
-- issuing a prescription under about 30 seconds; this is the
-- adoption lever." Brief 15 sketches the shape:
-- prescription_templates: id, doctor_id, name, items (json).
--
-- Security posture (identical to the existing admin RPCs):
-- RLS enabled with NO policies (API roles cannot read/write the
-- table directly), access only through SECURITY DEFINER RPCs in
-- hard_private with thin public SQL wrappers granted to
-- authenticated. Every RPC asserts the caller holds an ACTIVE
-- doctor role via hard_private.assert_doctor() and scopes every
-- statement to the caller's own doctor_user_id.
--
-- Save semantics: insert with ON CONFLICT (doctor_user_id, name)
-- DO UPDATE — saving a "new" template under an existing name
-- overwrites that template (no accidental duplicates, matches
-- the <30s repeat flow). Renaming via p_template_id that
-- collides with another of the doctor's names raises 23505,
-- translated to a friendly message in the server action.
-- ============================================================

-- ---------- Part A: table (brief 15) ----------

create table if not exists public.prescription_templates (
  id uuid primary key default gen_random_uuid(),
  doctor_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_user_id, name)
);

comment on table public.prescription_templates is
  'Doctor-owned saved sets of common prescriptions (brief 7.2). Items shape: [{medicine, strength, dose, frequency, duration, quantity}] — same fields as prescription_items.';

create index if not exists prescription_templates_doctor_idx
  on public.prescription_templates (doctor_user_id, updated_at desc);

alter table public.prescription_templates enable row level security;

-- API roles never touch the table directly (RLS has no policies; belt and braces):
revoke all on public.prescription_templates from anon, authenticated;

-- ---------- Part B: doctor role assertion ----------

create or replace function hard_private.assert_doctor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.role = 'doctor' and r.is_active
  ) then
    raise exception 'Doctor role required' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function hard_private.assert_doctor() from public, anon, authenticated, service_role;

-- ---------- Part C: list / save / delete (private implementations) ----------

create or replace function hard_private.doctor_list_templates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_doctor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'name', t.name,
             'items', t.items,
             'created_at', t.created_at,
             'updated_at', t.updated_at
           ) order by t.name)
      from public.prescription_templates t
     where t.doctor_user_id = v_actor
  ), '[]'::jsonb);
end;
$$;

revoke all on function hard_private.doctor_list_templates() from public, anon, authenticated, service_role;

create or replace function hard_private.doctor_save_template(
  p_name text,
  p_items jsonb,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_doctor();
  v_id uuid;
  v_bad integer;
begin
  if p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 80 then
    raise exception 'Template name must be 1-80 characters' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 25 then
    raise exception 'A template must contain between 1 and 25 medicines' using errcode = '22023';
  end if;

  -- Every element needs a non-empty medicine string and a quantity of 1-1000.
  select count(*) into v_bad
    from jsonb_array_elements(p_items) e
   where e->'medicine' is null
      or jsonb_typeof(e->'medicine') <> 'string'
      or btrim(e->>'medicine') = ''
      or e->'quantity' is null
      or e->>'quantity' !~ '^[0-9]{1,4}$'
      or (e->>'quantity')::int not between 1 and 1000;
  if v_bad > 0 then
    raise exception 'Each template item needs a medicine name and a quantity between 1 and 1000' using errcode = '22023';
  end if;

  if p_template_id is not null then
    -- Update an existing template of THIS doctor only.
    update public.prescription_templates
       set name = btrim(p_name),
           items = p_items,
           updated_at = now()
     where id = p_template_id
       and doctor_user_id = v_actor
     returning id into v_id;
    if v_id is null then
      raise exception 'Template not found' using errcode = 'P0002';
    end if;
  else
    -- Save-as-new: the same name overwrites the doctor's existing template
    -- (the <30s repeat flow must never create accidental duplicates).
    insert into public.prescription_templates (doctor_user_id, name, items)
      values (v_actor, btrim(p_name), p_items)
      on conflict (doctor_user_id, name) do update
        set items = excluded.items,
            updated_at = now()
      returning id into v_id;
  end if;

  insert into public.audit_events (
    actor_user_id, event_type, resource_type, resource_id, metadata
  ) values (
    v_actor,
    'write',
    'prescription_template',
    v_id,
    jsonb_build_object(
      'name', btrim(p_name),
      'items_count', jsonb_array_length(p_items),
      'mode', case when p_template_id is null then 'save' else 'update' end
    )
  );

  return v_id;
end;
$$;

revoke all on function hard_private.doctor_save_template(text, jsonb, uuid) from public, anon, authenticated, service_role;

create or replace function hard_private.doctor_delete_template(
  p_template_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_doctor();
  v_name text;
begin
  delete from public.prescription_templates
   where id = p_template_id
     and doctor_user_id = v_actor
   returning name into v_name;
  if v_name is null then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    actor_user_id, event_type, resource_type, resource_id, metadata
  ) values (
    v_actor,
    'write',
    'prescription_template',
    p_template_id,
    jsonb_build_object('name', v_name, 'mode', 'delete')
  );

  return v_name;
end;
$$;

revoke all on function hard_private.doctor_delete_template(uuid) from public, anon, authenticated, service_role;

-- ---------- Part D: public wrappers (the only client-callable entry points) ----------

create or replace function public.doctor_list_templates()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hard_private.doctor_list_templates(); $$;

create or replace function public.doctor_save_template(
  p_name text,
  p_items jsonb,
  p_template_id uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$ select hard_private.doctor_save_template(p_name, p_items, p_template_id); $$;

create or replace function public.doctor_delete_template(
  p_template_id uuid
)
returns text
language sql
security definer
set search_path = ''
as $$ select hard_private.doctor_delete_template(p_template_id); $$;

revoke all on function public.doctor_list_templates() from public, anon, authenticated;
revoke all on function public.doctor_save_template(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.doctor_delete_template(uuid) from public, anon, authenticated;
grant execute on function public.doctor_list_templates() to authenticated;
grant execute on function public.doctor_save_template(text, jsonb, uuid) to authenticated;
grant execute on function public.doctor_delete_template(uuid) to authenticated;
