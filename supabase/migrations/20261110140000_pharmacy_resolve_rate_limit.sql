create index if not exists audit_events_actor_type_created_at_idx
  on public.audit_events (actor_user_id, event_type, created_at desc);

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'workspace_read','normal_read','write','pharmacy_resolve','pharmacy_resolve_rate_limited',
  'dispense','emergency_override','court_access','role_assignment'
));

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
  v_recent_attempts integer;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select m.provider_id into v_pharmacy
    from public.provider_memberships m
    join public.provider_organizations o on o.id = m.provider_id and o.status = 'approved' and o.provider_type = 'pharmacy'
    where m.user_id = v_actor and m.role = 'pharmacist' and m.is_active
    order by m.created_at limit 1;
  if v_pharmacy is null then
    raise exception 'Pharmacist access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  select count(*)::integer into v_recent_attempts
    from public.audit_events e
    where e.actor_user_id = v_actor
      and e.event_type in ('pharmacy_resolve','pharmacy_resolve_rate_limited')
      and e.created_at > now() - interval '1 minute';
  if v_recent_attempts >= 20 then
    insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, metadata)
    values (v_actor, v_pharmacy, 'pharmacy_resolve_rate_limited', 'pharmacy', jsonb_build_object('window_seconds', 60));
    return jsonb_build_object('status','rate_limited');
  end if;

  if p_token is null or length(trim(p_token)) < 10 or length(p_token) > 200 or p_token ~ '[[:space:]]' then
    insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, metadata)
    values (v_actor, v_pharmacy, 'pharmacy_resolve', 'prescription_token', jsonb_build_object('result','not_found'));
    return jsonb_build_object('status','not_found');
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

revoke all on function public.resolve_prescription(text) from public, anon, authenticated;
grant execute on function public.resolve_prescription(text) to authenticated;
