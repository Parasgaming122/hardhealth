-- H.A.R.D initial schema for the dedicated synthetic-data development project.
-- Direct anon/authenticated table access is revoked. Authenticated access goes through
-- narrowly scoped SECURITY DEFINER functions which enforce role checks and audit reads.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.provider_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_type text not null check (provider_type in ('clinic','hospital','lab','pharmacy')),
  license_number text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'H.A.R.D user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('patient','doctor','front_desk','pharmacist','lab_tech','provider_admin','platform_admin')),
  provider_id uuid references public.provider_organizations(id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((role in ('patient','platform_admin') and provider_id is null) or (role not in ('patient','platform_admin') and provider_id is not null)),
  unique nulls not distinct (user_id, role, provider_id)
);

create table public.provider_memberships (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('doctor','front_desk','pharmacist','lab_tech','provider_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider_id, user_id, role)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  health_id text not null unique,
  full_name text not null,
  date_of_birth date,
  gender text,
  blood_group text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.patient_provider_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  provider_id uuid not null references public.provider_organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, provider_id)
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  provider_id uuid not null references public.provider_organizations(id) on delete restrict,
  doctor_user_id uuid not null references auth.users(id) on delete restrict,
  visited_at timestamptz not null default now(),
  complaint text,
  diagnosis text,
  vitals jsonb not null default '{}'::jsonb,
  notes text,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  provider_id uuid not null references public.provider_organizations(id) on delete restrict,
  doctor_user_id uuid not null references auth.users(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete set null,
  prescription_code text not null unique,
  token_digest bytea not null unique,
  status text not null default 'active' check (status in ('active','partly_filled','dispensed','expired','cancelled')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  max_fills smallint not null default 1 check (max_fills between 1 and 20),
  fills_used smallint not null default 0 check (fills_used >= 0 and fills_used <= max_fills),
  version integer not null default 1 check (version > 0),
  supersedes_id uuid references public.prescriptions(id) on delete restrict,
  issued_at timestamptz not null default now(),
  consultation_cost numeric(12,2) not null default 0 check (consultation_cost >= 0),
  note text
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete restrict,
  medicine text not null,
  strength text not null default '',
  dose text not null default '',
  frequency text not null default '',
  duration text not null default '',
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.pharmacy_dispenses (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete restrict,
  provider_id uuid not null references public.provider_organizations(id) on delete restrict,
  pharmacist_user_id uuid not null references auth.users(id) on delete restrict,
  fill_number smallint not null check (fill_number > 0),
  otp_verified boolean not null default false,
  dispensed_at timestamptz not null default now(),
  unique (prescription_id, fill_number)
);

create table public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  provider_id uuid not null references public.provider_organizations(id) on delete restrict,
  issued_by uuid not null references auth.users(id) on delete restrict,
  test_type text not null,
  tested_at timestamptz not null default now(),
  results jsonb not null default '[]'::jsonb,
  report_hash text not null,
  token_digest bytea not null unique,
  created_at timestamptz not null default now()
);

create table public.cost_items (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  provider_id uuid references public.provider_organizations(id) on delete restrict,
  title text not null,
  category text not null check (category in ('Consultation','Test','Medicine','Procedure','Admission','Other')),
  amount numeric(12,2) not null check (amount >= 0),
  covered_amount numeric(12,2) not null default 0 check (covered_amount >= 0 and covered_amount <= amount),
  payment_status text not null default 'pending' check (payment_status in ('paid','pending','partly_covered')),
  provenance text not null default 'verified' check (provenance in ('verified','ai-confirmed','self-reported')),
  linked_type text,
  linked_id uuid,
  incurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete restrict,
  provider_id uuid references public.provider_organizations(id) on delete restrict,
  invoice_type text not null check (invoice_type in ('registration','renewal','upgrade','visit','test','medicine','other')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status text not null default 'outstanding' check (status in ('outstanding','paid','cancelled')),
  payment_method text check (payment_method in ('cash','card','wallet')),
  receipt_number text unique,
  collected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  provider_id uuid references public.provider_organizations(id) on delete restrict,
  ledger_side text not null check (ledger_side in ('platform','provider')),
  amount numeric(12,2) not null check (amount >= 0),
  payout_status text not null default 'pending' check (payout_status in ('pending','settled')),
  created_at timestamptz not null default now(),
  unique (invoice_id, ledger_side)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  provider_id uuid references public.provider_organizations(id) on delete set null,
  event_type text not null check (event_type in ('workspace_read','normal_read','write','pharmacy_resolve','dispense','emergency_override','court_access','role_assignment')),
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index patients_health_id_idx on public.patients (health_id);
create index links_provider_status_idx on public.patient_provider_links (provider_id, status);
create index links_patient_status_idx on public.patient_provider_links (patient_id, status);
create index visits_patient_date_idx on public.visits (patient_id, visited_at desc);
create index prescriptions_patient_date_idx on public.prescriptions (patient_id, issued_at desc);
create index prescriptions_provider_date_idx on public.prescriptions (provider_id, issued_at desc);
create index costs_patient_date_idx on public.cost_items (patient_id, incurred_at desc);
create index invoices_provider_status_idx on public.invoices (provider_id, status, created_at desc);
create index reports_patient_date_idx on public.lab_reports (patient_id, tested_at desc);
create index audit_patient_date_idx on public.audit_events (patient_id, created_at desc);
create index audit_actor_date_idx on public.audit_events (actor_user_id, created_at desc);

alter table public.provider_organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.provider_memberships enable row level security;
alter table public.patients enable row level security;
alter table public.patient_provider_links enable row level security;
alter table public.visits enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.pharmacy_dispenses enable row level security;
alter table public.lab_reports enable row level security;
alter table public.cost_items enable row level security;
alter table public.invoices enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_events enable row level security;

-- Supabase API users cannot query or mutate clinical/financial tables directly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
grant usage on schema public to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'H.A.R.D user')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.get_my_workspace()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_profile jsonb;
  v_roles jsonb;
  v_patient jsonb;
  v_role text;
  v_provider uuid;
  v_patient_id uuid;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object('display_name', p.display_name)
    into v_profile from public.profiles p where p.user_id = v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
      'role', ur.role,
      'provider_id', ur.provider_id,
      'provider_name', po.name
    ) order by ur.created_at), '[]'::jsonb)
    into v_roles
    from public.user_roles ur
    left join public.provider_organizations po on po.id = ur.provider_id
    where ur.user_id = v_user and ur.is_active;

  select ur.role, ur.provider_id into v_role, v_provider
    from public.user_roles ur
    where ur.user_id = v_user and ur.is_active
    order by case ur.role
      when 'patient' then 1 when 'doctor' then 2 when 'front_desk' then 3
      when 'pharmacist' then 4 when 'lab_tech' then 5
      when 'provider_admin' then 6 when 'platform_admin' then 7 else 99 end,
      ur.created_at
    limit 1;

  select p.id, jsonb_build_object(
      'health_id', p.health_id,
      'full_name', p.full_name,
      'date_of_birth', p.date_of_birth
    )
    into v_patient_id, v_patient
    from public.patients p where p.user_id = v_user;

  if v_role = 'patient' then
    select jsonb_build_object(
      'cost_this_month', coalesce((select sum(c.amount) from public.cost_items c where c.patient_id = v_patient_id and c.incurred_at >= date_trunc('month', now())), 0),
      'active_prescriptions', coalesce((select count(*) from public.prescriptions r where r.patient_id = v_patient_id and r.status in ('active','partly_filled') and r.expires_at > now()), 0),
      'reports', coalesce((select count(*) from public.lab_reports r where r.patient_id = v_patient_id), 0),
      'linked_providers', coalesce((select count(*) from public.patient_provider_links l where l.patient_id = v_patient_id and l.status = 'active'), 0)
    ) into v_summary;
  elsif v_role = 'doctor' then
    select jsonb_build_object(
      'linked_patients', coalesce((select count(*) from public.patient_provider_links l where l.provider_id = v_provider and l.status = 'active'), 0),
      'visits_today', coalesce((select count(*) from public.visits v where v.provider_id = v_provider and v.doctor_user_id = v_user and v.visited_at >= date_trunc('day', now())), 0),
      'prescriptions_issued', coalesce((select count(*) from public.prescriptions r where r.provider_id = v_provider and r.doctor_user_id = v_user), 0)
    ) into v_summary;
  elsif v_role = 'front_desk' then
    select jsonb_build_object(
      'linked_patients', coalesce((select count(*) from public.patient_provider_links l where l.provider_id = v_provider and l.status = 'active'), 0),
      'outstanding_invoices', coalesce((select count(*) from public.invoices i where i.provider_id = v_provider and i.status = 'outstanding'), 0),
      'collected_this_month', coalesce((select sum(i.total_amount) from public.invoices i where i.provider_id = v_provider and i.status = 'paid' and i.paid_at >= date_trunc('month', now())), 0)
    ) into v_summary;
  elsif v_role = 'pharmacist' then
    select jsonb_build_object('dispenses', coalesce((select count(*) from public.pharmacy_dispenses d where d.provider_id = v_provider and d.pharmacist_user_id = v_user), 0)) into v_summary;
  elsif v_role = 'lab_tech' then
    select jsonb_build_object('reports_issued', coalesce((select count(*) from public.lab_reports r where r.provider_id = v_provider and r.issued_by = v_user), 0)) into v_summary;
  elsif v_role = 'provider_admin' then
    select jsonb_build_object(
      'linked_patients', coalesce((select count(*) from public.patient_provider_links l where l.provider_id = v_provider and l.status = 'active'), 0),
      'outstanding_invoices', coalesce((select count(*) from public.invoices i where i.provider_id = v_provider and i.status = 'outstanding'), 0),
      'provider_ledger_pending', coalesce((select sum(e.amount) from public.ledger_entries e where e.provider_id = v_provider and e.ledger_side = 'provider' and e.payout_status = 'pending'), 0)
    ) into v_summary;
  elsif v_role = 'platform_admin' then
    select jsonb_build_object(
      'providers_pending', coalesce((select count(*) from public.provider_organizations p where p.status = 'pending'), 0),
      'providers_approved', coalesce((select count(*) from public.provider_organizations p where p.status = 'approved'), 0),
      'invoices_paid_total', coalesce((select sum(i.total_amount) from public.invoices i where i.status = 'paid'), 0),
      'platform_ledger_total', coalesce((select sum(e.amount) from public.ledger_entries e where e.ledger_side = 'platform'), 0)
    ) into v_summary;
  end if;

  insert into public.audit_events (actor_user_id, patient_id, provider_id, event_type, resource_type, metadata)
  values (v_user, v_patient_id, v_provider, 'workspace_read', 'workspace', jsonb_build_object('role', v_role));

  return jsonb_build_object(
    'profile', coalesce(v_profile, '{}'::jsonb),
    'roles', v_roles,
    'patient', coalesce(v_patient, '{}'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb)
  );
end;
$$;

create or replace function public.assign_user_role(p_user_id uuid, p_role text, p_provider_id uuid default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_role not in ('patient','doctor','front_desk','pharmacist','lab_tech','provider_admin','platform_admin') then
    raise exception 'Unsupported role' using errcode = '22023';
  end if;
  if p_role = 'platform_admin' then
    if not exists (select 1 from public.user_roles r where r.user_id = v_actor and r.role = 'platform_admin' and r.is_active) then
      raise exception 'Platform admin role required' using errcode = '42501';
    end if;
  elsif p_role = 'patient' then
    if p_provider_id is not null or not exists (select 1 from public.user_roles r where r.user_id = v_actor and r.role = 'platform_admin' and r.is_active) then
      raise exception 'Platform admin may assign patient role' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.is_active
      and ((r.role = 'platform_admin') or (r.role = 'provider_admin' and r.provider_id = p_provider_id))
  ) then
    raise exception 'Provider or platform admin role required' using errcode = '42501';
  end if;
  if p_role not in ('patient','platform_admin') and not exists (
    select 1 from public.provider_organizations p where p.id = p_provider_id and p.status = 'approved'
  ) then
    raise exception 'Approved provider required for staff assignment' using errcode = '22023';
  end if;

  insert into public.user_roles (user_id, role, provider_id, created_by)
  values (p_user_id, p_role, p_provider_id, v_actor)
  on conflict (user_id, role, provider_id) do update set is_active = true;
  if p_role in ('doctor','front_desk','pharmacist','lab_tech','provider_admin') then
    insert into public.provider_memberships (provider_id, user_id, role)
    values (p_provider_id, p_user_id, p_role)
    on conflict (provider_id, user_id, role) do update set is_active = true;
  end if;
  insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, metadata)
  values (v_actor, p_provider_id, 'role_assignment', 'user_role', jsonb_build_object('assigned_role', p_role));
end;
$$;

create or replace function public.resolve_prescription(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid;
  v_rx public.prescriptions%rowtype;
  v_patient public.patients%rowtype;
  v_payload jsonb;
  v_age integer;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_token is null or length(trim(p_token)) < 10 or length(p_token) > 200 then
    return jsonb_build_object('status','not_found');
  end if;
  select m.provider_id into v_pharmacy
    from public.provider_memberships m
    join public.provider_organizations o on o.id = m.provider_id and o.status = 'approved' and o.provider_type = 'pharmacy'
    where m.user_id = v_actor and m.role = 'pharmacist' and m.is_active
    order by m.created_at limit 1;
  if v_pharmacy is null then
    raise exception 'Pharmacist access required' using errcode = '42501';
  end if;

  select * into v_rx from public.prescriptions r
    where r.token_digest = extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256')
    limit 1;
  if not found then
    insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, metadata)
    values (v_actor, v_pharmacy, 'pharmacy_resolve', 'prescription_token', jsonb_build_object('result','not_found'));
    return jsonb_build_object('status','not_found');
  end if;

  insert into public.audit_events (actor_user_id, patient_id, provider_id, event_type, resource_type, resource_id, metadata)
  values (v_actor, v_rx.patient_id, v_pharmacy, 'pharmacy_resolve', 'prescription', v_rx.id, jsonb_build_object('status',v_rx.status));

  if v_rx.status not in ('active','partly_filled') then
    return jsonb_build_object('status',v_rx.status);
  end if;
  if v_rx.expires_at <= now() then
    return jsonb_build_object('status','expired');
  end if;
  if v_rx.fills_used >= v_rx.max_fills then
    return jsonb_build_object('status','dispensed');
  end if;

  select * into v_patient from public.patients p where p.id = v_rx.patient_id;
  v_age := case when v_patient.date_of_birth is null then null else extract(year from age(current_date, v_patient.date_of_birth))::integer end;
  select jsonb_build_object(
    'status', v_rx.status,
    'prescription_code', v_rx.prescription_code,
    'prescribed_at', v_rx.issued_at,
    'expires_at', v_rx.expires_at,
    'doctor_name', (select p.display_name from public.profiles p where p.user_id = v_rx.doctor_user_id),
    'provider_name', (select o.name from public.provider_organizations o where o.id = v_rx.provider_id),
    'patient_first_name', split_part(v_patient.full_name, ' ', 1),
    'patient_age_range', case when v_age is null then null else concat((v_age / 10) * 10, '–', ((v_age / 10) * 10) + 9) end,
    'fills_remaining', greatest(0, v_rx.max_fills - v_rx.fills_used),
    'medicines', coalesce((select jsonb_agg(jsonb_build_object(
      'medicine', i.medicine,
      'strength', i.strength,
      'dose', i.dose,
      'frequency', i.frequency,
      'duration', i.duration,
      'quantity', i.quantity
    ) order by i.created_at) from public.prescription_items i where i.prescription_id = v_rx.id), '[]'::jsonb)
  ) into v_payload;
  return v_payload;
end;
$$;

revoke all on function public.get_my_workspace() from public, anon, authenticated;
revoke all on function public.assign_user_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_prescription(text) from public, anon, authenticated;
grant execute on function public.get_my_workspace() to authenticated;
grant execute on function public.assign_user_role(uuid, text, uuid) to authenticated;
grant execute on function public.resolve_prescription(text) to authenticated;
