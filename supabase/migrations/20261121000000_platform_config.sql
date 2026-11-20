-- ============================================================
-- Phase 2 P2-8: Platform configuration table (brief 8.7, 22, Rule 1)
-- Prepared for automatic application by the auto DB setup
-- (or manual application via the Supabase SQL editor).
--
-- Brief Rule 1: "Fees, plan prices, quotas, provider share,
-- prescription validity and fill count live in config, never
-- hard-coded." Brief 22 lists the proposed defaults; brief 8.7
-- puts a config editor on the platform admin panel.
--
-- Security posture (identical to the existing admin RPCs):
-- RLS enabled with NO policies (API roles cannot read/write the
-- table directly); reads of live values inside server actions use
-- the service-role admin client (bypasses RLS, read-only);
-- writes go ONLY through SECURITY DEFINER RPCs that assert the
-- caller holds an ACTIVE platform_admin role via
-- hard_private.assert_platform_admin() and audit every change as
-- event_type 'config_update'.
--
-- Also extends the audit_events event_type CHECK with
-- 'config_update' and 'payout_update' (needed by P2-8 and P2-9),
-- preserving every value the earlier migrations added.
-- ============================================================

-- ---------- Part A: audit event_type allowlist extension ----------

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'workspace_read','normal_read','write','pharmacy_resolve','pharmacy_resolve_rate_limited',
  'dispense','emergency_override','court_access','role_assignment','provider_status_change',
  'config_update','payout_update'
));

-- ---------- Part B: config table (brief 10: config: key, value) ----------

create table if not exists public.config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.config is
  'Platform business configuration (brief Rule 1 / 22). Values are text-encoded numbers. Only hard_private.platform_set_config may write; every write is audited.';

alter table public.config enable row level security;

-- API roles never touch the table directly (RLS has no policies; belt and braces).
revoke all on public.config from anon, authenticated;

-- ---------- Part C: seed defaults (brief Section 22) ----------

insert into public.config (key, value) values
  ('registration_fee', '500'),
  ('renewal_fee', '400'),
  ('base_plan_quota_mb', '1024'),
  ('plus_plan_quota_mb', '5120'),
  ('plus_plan_price', '1000'),
  ('pro_plan_quota_mb', '20480'),
  ('pro_plan_price', '2500'),
  ('provider_share_percent', '30'),
  ('storage_alert_percent', '80'),
  ('prescription_valid_days', '30'),
  ('prescription_max_fills', '1'),
  ('court_access_days', '30'),
  ('emergency_access_hours', '24')
on conflict (key) do nothing;

-- ---------- Part D: key allowlist (shared by get/set) ----------

create or replace function hard_private.config_key_allowed(p_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_key in (
    'registration_fee','renewal_fee',
    'base_plan_quota_mb','plus_plan_quota_mb','plus_plan_price',
    'pro_plan_quota_mb','pro_plan_price',
    'provider_share_percent','storage_alert_percent',
    'prescription_valid_days','prescription_max_fills',
    'court_access_days','emergency_access_hours'
  );
$$;

revoke all on function hard_private.config_key_allowed(text) from public, anon, authenticated, service_role;

-- ---------- Part E: platform admin RPCs ----------

create or replace function hard_private.platform_get_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_result jsonb;
begin
  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb)
    into v_result
    from public.config c;
  return v_result;
end;
$$;

revoke all on function hard_private.platform_get_config() from public, anon, authenticated, service_role;

create or replace function hard_private.platform_set_config(
  p_key text,
  p_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_old text;
begin
  if not hard_private.config_key_allowed(p_key) then
    raise exception 'Unknown configuration key' using errcode = '22023';
  end if;
  if p_value is null or btrim(p_value) = '' or btrim(p_value) !~ '^[0-9]{1,9}$' then
    raise exception 'Configuration values must be non-negative whole numbers' using errcode = '22023';
  end if;

  select c.value into v_old from public.config c where c.key = p_key for update;

  insert into public.config (key, value, updated_by)
    values (p_key, btrim(p_value), v_actor)
    on conflict (key) do update
      set value = excluded.value,
          updated_at = now(),
          updated_by = excluded.updated_by;

  insert into public.audit_events (
    actor_user_id, event_type, resource_type, resource_id, metadata
  ) values (
    v_actor,
    'config_update',
    'platform_config',
    null,
    jsonb_build_object('key', p_key, 'old_value', v_old, 'new_value', btrim(p_value))
  );

  return jsonb_build_object('key', p_key, 'value', btrim(p_value), 'old_value', v_old);
end;
$$;

revoke all on function hard_private.platform_set_config(text, text) from public, anon, authenticated, service_role;

-- ---------- Part F: public wrappers (the only client-callable entry points) ----------

create or replace function public.platform_get_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hard_private.platform_get_config(); $$;

create or replace function public.platform_set_config(
  p_key text,
  p_value text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hard_private.platform_set_config(p_key, p_value); $$;

revoke all on function public.platform_get_config() from public, anon, authenticated;
revoke all on function public.platform_set_config(text, text) from public, anon, authenticated;
grant execute on function public.platform_get_config() to authenticated;
grant execute on function public.platform_set_config(text, text) to authenticated;
