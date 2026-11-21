-- P2-14 (owner feedback 2026-11-21): patient contact details + email-linked
-- signup. The front desk records a phone number and (optionally) an email at
-- registration; when that person later signs up with the SAME email, the
-- portal claims the existing patient row (user_id is stamped onto it) instead
-- of creating a duplicate Health ID — "register at the desk, sign up at home,
-- one record" (brief 5.2: one patient, one Health ID).
--
-- Phone is stored as normalized digits (0-prefixed Pakistani national number).
-- Email is stored lowercase; the UNIQUE partial index keeps one patient row
-- per email while still allowing any number of NULL emails (desk-only
-- registrations without an email address). Direct table grants were already
-- revoked in the initial schema, so no additional grant changes are needed:
-- only the service role and SECURITY DEFINER functions touch this table.

alter table public.patients
  add column if not exists phone text,
  add column if not exists email text;

-- One patient record per email (case-insensitive). NULL emails are excluded
-- from the index, so unlinked desk registrations never collide.
create unique index if not exists patients_email_ci_key
  on public.patients (lower(email))
  where email is not null;

-- Helpful error naming (used by registerRealPatient's friendly messages).
comment on index public.patients_email_ci_key is
  'One patient row per email (lowercase); NULL emails allowed multiple times.';
