-- ============================================================
-- Phase 2 batch DDL: P2-4 (CNIC uniqueness) + P2-11 (atomic
-- provider status change). Prepared for manual application via
-- the Supabase SQL editor (sandbox cannot run DDL).
--
-- Part A gives patients the CNIC identity column the brief
-- requires (5.2: "Search by CNIC or phone to prevent duplicates
-- (CNIC unique)", 11.10: "CNIC is unique per patient") with a
-- database-level hard guarantee: digits-only normalization, a
-- 13-digit format CHECK (Pakistani CNIC), and a partial UNIQUE
-- index. NULL is allowed — patient self-signups have no desk
-- identity check yet (identity_check is a front-desk concept).
--
-- Part B replaces the two-REST-call status change (update, then
-- audit insert, then compensating rollback on audit failure —
-- see DECISIONS.md D13) with a single SECURITY DEFINER RPC that
-- performs the update and the audit insert in ONE transaction.
-- Same security posture as the existing admin RPCs: private
-- implementation in hard_private, public SQL wrapper, execute
-- granted to authenticated only, role asserted inside via
-- hard_private.assert_platform_admin().
-- ============================================================

-- ---------- Part A: patients.cnic (brief 5.2 / 11.10) ----------

alter table public.patients add column if not exists cnic text;

comment on column public.patients.cnic is
  'Patient CNIC, stored as 13 digits (no dashes). NULL until the front desk desk-checks the physical card. Unique across patients.';

-- Normalize any pre-existing values to digits-only; empty strings become NULL.
update public.patients
   set cnic = nullif(regexp_replace(cnic, '[^0-9]', '', 'g'), '')
 where cnic is not null;

-- Hard format guarantee: 13 digits (Pakistani CNIC 5+7+1), or NULL.
alter table public.patients drop constraint if exists patients_cnic_format_check;
alter table public.patients add constraint patients_cnic_format_check
  check (cnic is null or cnic ~ '^[0-9]{13}$');

-- Hard uniqueness guarantee. Partial index so NULLs (self-signups
-- without a desk check yet) never collide.
create unique index if not exists patients_cnic_unique_idx
  on public.patients (cnic)
  where cnic is not null;

-- ---------- Part B: atomic provider status change (D13 durable fix) ----------

create or replace function hard_private.admin_set_provider_status(
  p_provider_id uuid,
  p_action text,
  p_note text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := hard_private.assert_platform_admin();
  v_new_status text;
  v_audit_action text;
begin
  if p_action in ('approve', 'reinstate') then
    v_new_status := 'approved';
    v_audit_action := p_action;
  elsif p_action = 'reject' then
    v_new_status := 'rejected';
    v_audit_action := 'reject';
  elsif p_action = 'suspend' then
    -- provider_organizations.status CHECK has no 'suspended' value;
    -- suspensions persist as 'rejected' with audit action 'suspend'.
    v_new_status := 'rejected';
    v_audit_action := 'suspend';
  else
    raise exception 'Unsupported provider action "%"', p_action using errcode = '22023';
  end if;

  update public.provider_organizations
     set status = v_new_status,
         approved_at = case when v_new_status = 'approved' then now() else null end,
         approved_by = case when v_new_status = 'approved' then v_actor else null end
   where id = p_provider_id;

  if not found then
    raise exception 'Provider organization not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    actor_user_id, provider_id, event_type, resource_type, resource_id, metadata
  ) values (
    v_actor,
    p_provider_id,
    'provider_status_change',
    'provider_organization',
    p_provider_id,
    jsonb_build_object(
      'action', v_audit_action,
      'status', v_new_status,
      'note', coalesce(nullif(btrim(p_note), ''), ''),
      'timestamp', now()
    )
  );

  return v_audit_action;
end;
$$;
revoke all on function hard_private.admin_set_provider_status(uuid, text, text) from public, anon, authenticated, service_role;

-- Public wrapper: the only client-callable entry point (same pattern as
-- admin_list_providers / admin_platform_summary).
create or replace function public.admin_set_provider_status(
  p_provider_id uuid,
  p_action text,
  p_note text default ''
)
returns text
language sql
security definer
set search_path = ''
as $$ select hard_private.admin_set_provider_status(p_provider_id, p_action, p_note); $$;

revoke all on function public.admin_set_provider_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_provider_status(uuid, text, text) to authenticated;
