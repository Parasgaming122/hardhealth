-- Provider lifecycle management (Phase 2 Part 3).
-- The platform admin provider manager records every approve/reject/suspend/reinstate decision
-- as an immutable audit event of type provider_status_change. The initial schema and the
-- pharmacy rate-limit migration did not include this event type in the CHECK constraint, so
-- status changes would fail at insert time. Extend the allowlist without changing any other
-- security posture: no new grants, no RLS changes, no clinical widening.

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'workspace_read','normal_read','write','pharmacy_resolve','pharmacy_resolve_rate_limited',
  'dispense','emergency_override','court_access','role_assignment','provider_status_change'
));

-- Provider status decisions are filtered by provider and recency when rebuilding the
-- organization lifecycle view, so index the same shape the rate limiter uses.
create index if not exists audit_events_provider_type_created_at_idx
  on public.audit_events (provider_id, event_type, created_at desc);
