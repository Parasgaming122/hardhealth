# H.A.R.D Task Tracker

Legend: [done] completed · [wip] in progress · [todo] not started · [blocked] needs external input

---

## Phase 1 — Audit & gap analysis — COMPLETE

Full inventory of roles/pages/components/APIs vs `HARD_Developer_Brief_v2.md`, documented in
`task.md` (repo root). Quality gate at end of Phase 1: `tsc --noEmit` 0 errors, vitest 17/17.

## Session 12 (2026-11-21) — Workspace page differentiation + front-desk validation + email linking

Owner feedback after testing the Session-11 final version; every item below was reported live.

- [done] **Every workspace page now renders DISTINCT content (was: same panel on all pages)**:
  - Doctor: overview = dashboard (KPIs + quick links + latest prescriptions read-only) ·
    Patients = clinical directory · New prescription = the ONLY page with the composer ·
    Prescriptions = full history list with Repeat/Amend (both now navigate to the composer
    with the medicines loaded). `Select for prescription` in the directory also navigates.
  - Pharmacy: a section-string mismatch (`"Dispenses"/"Bills"` vs the mapped
    `"Recent dispenses"`) made ALL four pages render the resolve card. Now Overview =
    dashboard, Resolve = lookup+OTP tool, Dispenses/Bills = the pharmacist's OWN recorded
    actions from the DB (`listMyPharmacyActivity`, self-scoped per brief §4).
  - Lab: overview duplicated the issue form AND the reports page listed hard-coded demo
    rows (Amna/Bilal LAB-948x). Now Overview = dashboard, Issue report = the form only,
    Reports issued = REAL `lab_reports` rows with public verification links.
  - Platform admin: the overview embedded the role-assignment manager and the business
    configuration editor (both have their own pages) plus the offline demo's fake panels.
    Now Overview = real `admin_platform_summary` KPI dashboard + quick links, and
    /admin/audit lists REAL `audit_events` (metadata only, actor names resolved via
    profiles) instead of the demo event list. Demo panels remain only on /demo.
- [done] **Front-desk tab strip navigates**: the overview's "Patient Directory / Register New
  Patient / Daily Collections & Ledger" buttons flipped LOCAL state only (URL never changed)
  while the sidebar actually navigated — the strip is now real `<a href>` links (role=tablist),
  and `/front-desk/patients` shows the DIRECTORY (it previously showed the registration form
  because the section map collapsed `patients` and `patients/new` into the same label).
- [done] **Registration validation (shared client+server)**: `lib/provider/patient-validation.ts`
  — the reported "30 numbers as a phone" is rejected; Pakistani phone normalization
  (0300-1234567 / +92 / landline), 13-digit CNIC, name charset + length, optional-but-validated
  email, DOB between 1900 and today. Same module runs in the form (inline per-field errors)
  and in `registerRealPatient` (source of truth). 12 unit tests.
- [done] **Email column + portal-signup linking**: migration `20261121100000` adds
  `patients.phone` + `patients.email` with a case-insensitive partial UNIQUE index
  (`patients_email_ci_key`, NULLs exempt). The desk records the email; when that person SIGNS
  UP with the same email, `ensurePatientRecord` CLAIMS the existing row (stamps user_id, keeps
  the desk-issued Health ID, receipts and history preserved; audited as
  `portal_account_linked`) instead of creating a duplicate — 7 unit tests incl. never hijacking
  another account's row and the same-user race. Duplicate emails at the desk are rejected with
  a friendly message. `listRealPatients` shows phone/email/portal-link status in the directory.
- [done] **Front-desk collections page is real**: previously patient-count × fee with
  hard-coded PKR 500/150/350 rows; now `listFrontDeskCollections` lists real invoices with
  their ledger splits (scoped to the desk's provider org), config-driven share percentages,
  and real receipt numbers.
- [done] Verification: `tsc` 0 errors · vitest **87 passed** (16 new panel render tests pin
  that each section renders distinct content) · `npm run build` success · embedded-PG e2e 4/4
  with all 9 migrations on a fresh DB · contact-migration behavior verified on real PG
  (duplicate email 23505, multiple NULL emails OK, claim UPDATE + audit insert) · live browser
  run against a local mock Supabase (`scripts/mock_supabase_s12.mjs` + `verify_s12_workspaces.mjs`)
  **39/39 checks, zero uncaught client errors** — includes the exact owner scenario
  (admin→patient switch) and inline rejection of the 30-digit phone.
- [blocked] Live run against the REAL Supabase project: the sandbox recycled and
  `.env.local` (excluded from backups) was lost — the owner must re-provide the project
  URL + keys (or rotate them) and apply migration `20261121100000` in the SQL editor, then
  the standard live pass can re-run.

## Session 11 (2026-11-20) — Final hardening: health-id crash + amendments — the last gaps

- [done] **Health-ID duplicate crash fixed and hardened (D16→D20)**: the owner hit
  `duplicate key value violates unique constraint "patients_health_id_key"` when switching to
  the patient workspace in the admin account — that build still ran the pre-Session-6
  count-based serial (`count+101` collided with baseline HARD-000102 on EVERY new patient).
  Both patient-creation paths now share `lib/patient/health-id.ts`
  (`insertPatientWithUniqueHealthId`): max(health_id) re-read FRESH on every retry (5 attempts),
  unique violations on other columns returned immediately, and `ensurePatientRecord`
  re-selects by user_id on a same-user race (two tabs). 7 new unit tests pin the behavior
  (fast path, owner's exact scenario, serial race, same-user race, non-retryable, exhaustion,
  empty table). Live: admin→patient switch provisions HARD-000103, portal renders, reload
  stable (verify_s11 A1-A5).
- [done] **P2-13 Prescription amendments (brief Section 6 + acceptance criteria) — CLOSED**:
  `amendRealPrescription` cancels the original (row kept — Rule 3), issues v+1 with
  `supersedes_id`, new code/QR/validity from config, amended items, audited
  (`write`/`prescription` + `prescription_amended` metadata — no new CHECK value, no migration
  needed), and does NOT re-charge the consultation fee. Doctor UI: Amend button on recent
  prescriptions (gated: cancelled/dispensed cannot be amended), amber amendment banner,
  issue-button switch, issued screen + print sheet show the version chain. Patient portal:
  v-chip + "replaced by RX-…" on the cancelled original. 6 new unit tests + live B2-D2.
- [done] **Pharmacy resolve API hardened (Rule 6 + latent bug)**: `/api/rx/resolve` previously
  returned full medicines for ANY status and its `.or(code,id)` filter 404'd every typed code
  (PostgREST uuid-cast bug — only QR-uuid lookups worked). Now: uuid-aware lookup, clear status
  only (no medicines/patient) for cancelled/expired/dispensed, in-memory 20/min-per-IP rate
  limit, and every resolve audited (`pharmacy_resolve`, visible in the patient's access log).
  Live C1-C3: cancelled code → bare status; new code → medicines; resolves audited.
- [done] **P2-8 note**: the owner applied `20261121000000_platform_config.sql` — the config
  table is LIVE with all 13 brief-22 defaults (probed); `/admin/config` renders real values
  (E1). The pre-migration degrade paths remain as dead-safe code.
- [done] Verification: `tsc --noEmit` 0 errors · vitest 51 passed (+4 real-Postgres e2e with the
  embedded cluster, 7 migrations on a fresh DB) · `npm run build` success · live final run
  `scripts/verify_s11_final.mjs` **23/23** · DB baseline restored exactly (4 orgs / 1 patient
  HARD-000102 / 2 users / 0 rx / 0 costs / 0 templates).

## Phase 2 — Fix Critical/High gaps — COMPLETE (Sessions 2-11)

### Part 1 — Provider status exploration (previous session, interrupted)
- [done] DB discovery: provider_organizations columns, status CHECK (no 'suspended'), available
  RPCs, audit_events metadata shape.
- [done] `lib/admin/provider-actions.ts` created (list/update-status/edit/create server actions).
- [done] `components/admin-providers-manager.tsx` created (UI with filters + 3 modals).
- [done] `app/[workspace]/[[...section]]/page.tsx` edited to fetch + pass `allAdminProviders`.
- [interrupted] Integration left broken: SecureWorkspace missing the prop; Modal API misuse;
  audit CHECK constraint missing `provider_status_change`. (Exactly what this session fixed —
  see Part 3 below.)

### Part 3 — Admin Providers Manager completion (THIS SESSION, 2026-11-19)
- [done] `components/admin-providers-manager.tsx`: fixed Modal props (`onClose`→`onOpenChange`,
  added required `description` on Suspend + Add modals); removed unused imports
  (Badge, Building2, Filter, ShieldCheck).
- [done] `components/secure-workspace.tsx`: accepts `allAdminProviders?: ProviderRecord[]`,
  imports + renders `AdminProvidersManager` on the `admin/providers` section (real DB table,
  placed above the demo-driven `PlatformAdminPanel` and the approved-orgs static table).
- [done] `supabase/migrations/20261119000000_provider_status_change_audit.sql`: extends
  `audit_events.event_type` CHECK with `provider_status_change` (required for
  updateProviderStatusAction to not violate the constraint at runtime).
- [done] `app/[workspace]/[[...section]]/page.tsx`: hardened the admin data fetch with
  `Promise.allSettled` so a missing `SUPABASE_SERVICE_ROLE_KEY` degrades to empty states +
  server-side error log instead of a 500 on `/admin` (matches `getAdminDirectoryData()`'s
  fallback pattern).
- [done] Verified: `pnpm typecheck` 0 errors, `pnpm test` 17/17 passing (5 files: roles 5, security 5,
  trusted-origin 3, signup-validation 3, globals-styles 1), `pnpm build` success.
- [done] Runtime smoke test: public routes 200, `/admin/overview` 307 → `/login` when
  unauthenticated (guard works).
- [done] **Session 4**: Manual UI verification against LIVE Supabase (owner supplied `.env.local`).
  15/15 Playwright checks: login → `/admin/providers` renders the 4 live orgs; create + edit actions
  write live rows + audit events; status changes fail gracefully + roll back pre-migration.
  Two fixes landed as a result (see CHANGES.md Session 4): props→state sync useEffect, and
  compensating rollback in `updateProviderStatusAction`.
- [done] **Session 5**: Owner applied migration 20261119000000 via the SQL editor; probe
  confirmed the live CHECK accepts `provider_status_change`. Rewrote the verify suite for
  post-migration expectations and ran the FULL status-change lifecycle live on a throwaway
  org: create → edit → APPROVE → SUSPEND (modal+note) → REINSTATE. 21/21 checks: success
  toasts, no-reload row updates, DB persistence (suspend→'rejected' mapping), audit rows with
  correct metadata.action at every step, zero client errors. One cosmetic fix landed: success
  toast past-tense map (was "suspendd"). Test orgs + test admin cleaned up afterwards.
  **Phase 2 Part 3 is now fully closed — no blockers remain on the provider manager.**

### Phase 2 remaining backlog (priority order from Phase 1 audit)
- [done] **P2-4** patients.cnic column + DB unique index — CLOSED (Session 7): owner applied
  20261119100000; probe 6/6 + front-desk live flow 14/14 (CNIC happy path, duplicate rejection,
  formatted directory, search). No pre-migration fallbacks are reachable anymore (they remain as
  dead-safe code paths).
- [done] **P2-11** atomic SECURITY DEFINER status-change RPC — CLOSED (Session 7):
  `verify_admin_ui.mjs` 21/21 with the atomic RPC live (full lifecycle + audit rows + no-reload
  updates verified against the live DB).
- [done] **NEW (Session 7, owner request)** WordPress-style **Auto DB Setup**: boot-time automatic
  migration runner (`instrumentation.ts` + `lib/db/*` + `/setup` page + friendly no-env redirects).
  Verified with real-Postgres e2e (4/4), real Next boot (applied 5 migrations in 73 ms), manual
  install flow (6/6), token gate (6/6), no-env + bad-URL boots, and a 21/21 regression run.
  See CHANGES.md Session 7 + DECISIONS.md D17/D18.
- [done] **P2-5** Doctor prescription templates — CLOSED (Sessions 8-9): `prescription_templates`
  table + doctor-only self-scoped RPCs (assert_doctor, save-with-overwrite-by-name, delete, list) +
  template chips/save UI in the real doctor panel. Session 9 probe confirmed the owner applied
  migration 20261119200000 live: table readable (0 rows), both RPCs exist and correctly refuse
  unauthenticated calls (42501 Authentication required). Verified: 37/37 unit (incl. new guardrail
  test), 4/4 real-PG e2e, 21/21 RPC functional suite, 14/14 live pre-migration runtime checks.
  Same session found+fixed the provider_id NOT NULL bug in ALL provider actions (see CHANGES.md
  Session 8 Part 2 / D20) — real prescriptions now issue end-to-end.
- [done] **P2-5b** Repeat-last-prescription (brief 7.2) — CLOSED (Session 9): "Recent
  prescriptions" strip in the doctor composer — a highlighted one-tap "Repeat last prescription
  for {patient}" banner plus per-row Repeat buttons (last 8, newest first). Repeat deep-copies the
  original's items, restores note + consultation fee, auto-switches the selected patient, and
  reminds that complaint/diagnosis are per-visit. Verified live: 15/15 Playwright checks (empty
  state → issue → list syncs via D14 → repeat → issue #2 → DB fidelity: identical items, correct
  provider/cost/audit rows) + screenshot. See CHANGES.md Session 9.
- [done] **P2-6** Printable prescription (brief 5.4.4/6) — CLOSED (Session 10): print-only
  prescription sheet (clinic header, patient/doctor/complaint/diagnosis, medicines table, notes,
  fee, verification QR, signature line) + "Print prescription (PDF)" button on the issued screen;
  print media renders ONLY the sheet. Verified live + screenshot (E1-E4 of the acceptance run).
- [done] **P2-7** Storage meter 100% upload block (brief 5.8/11.5, Rule 5) — CLOSED (Session 10):
  real meter numbers (quota from `config.base_plan_quota_mb`; each AI-ingested document accounted
  at its simulated 340 MB in the audit metadata), amber ≥80% alert, red 100% state with a coral
  blocked banner, and a hard block in `savePatientIngestion` BEFORE any write. Verified live:
  3 docs OK (3rd shows the alert), 4th blocked, reading still allowed (D1-D8).
- [done] **P2-8** Platform config table + real config editor (brief 8.7/22, Rule 1) — CLOSED
  (Session 10, DDL pending owner): migration `20261121000000_platform_config.sql` (config table,
  RLS + revoked grants, brief-22 seed defaults, `platform_get/set_config` SECURITY DEFINER RPCs
  behind `assert_platform_admin`, every change audited as `config_update`, audit CHECK extended
  with `config_update`/`payout_update`). Real editor at /admin/config; registration fee +
  provider share, prescription validity + max fills, storage quota/alert all read from config
  with brief-22 fallbacks (pre-migration degrade verified live A1-A4; full persistence checks run
  automatically once the owner applies the migration).
- [done] **P2-9** Provider-admin staff sub-roles + payout status (brief 8.6/7.5) — CLOSED
  (Session 10): the provider-admin workspace now renders a REAL panel (demo panel stays on /demo)
  with live org KPIs, staff management (add staff by email → sub-role grant within their own org
  only) and the real earnings ledger (provider-side entries with receipt, invoice total, both
  shares) + payout status toggle. Verified live C1-C11.
- [done] **P2-10** Soft delete/deactivation UI (brief 11.3, Rule 3) — CLOSED (Session 10):
  staff deactivation/reactivation with a confirmation dialog, rows kept + audited
  (`role_assignment` activate/deactivate), self-deactivation blocked, last-active provider admin
  protected. Provider lifecycle (suspend/reinstate) was already live from Session 5. Verified
  live C6-C10.
- [done] **P2-12** Owner action (optional): add `DATABASE_URL` (Supabase Session pooler, port
  5432) to the environment to switch on auto-setup for future migrations; `/setup` guides it.
  UPDATE (Session 11): the config migration 20261121000000 is now APPLIED (owner ran it in the
  SQL editor — table probed live with all 13 defaults), so nothing is pending; `DATABASE_URL`
  remains optional future-proofing only.

## Phase 3 — Acceptance-criteria validation — COMPLETE (Session 10)
- [done] Walked brief Section 20 criteria against the running app; the Session 10 acceptance run
  (`scripts/verify_s10_acceptance.mjs`) covers 34 live checks across the five new features, the
  degrade paths, and zero-client-error across every role login. Criteria verified in earlier
  sessions: duplicate CNIC rejection (S7), pharmacy single-prescription privacy + rate limiting
  (S4-6), OTP dispensing, doctor history scoping, QR content (no personal data — S6-7).
- [done] Ledger reconciliation check: for the live registration invoice, platform (350) +
  provider (150) ledger entries sum exactly to the invoice total (500) — B3.
- [found + fixed during Phase 3] `registerRealPatient` never stamped `provider_id` onto the
  invoice or the provider-side ledger entry, so the provider admin's earnings ledger could never
  find its rows (brief Rule 4). The collecting desk's ACTIVE front_desk org is now resolved and
  stamped on both (its absence is a friendly error).
- [closed in Session 11] Amending an issued prescription into a new version (schema supports
  version/supersedes_id/cancelled) — implemented as P2-13 above; the last open acceptance
  criterion from the brief is now green (live B2-D2: old QR cancelled + bare status at the
  pharmacy, v2 active, old record kept, fee not re-charged, audited).

## Phase 4 — Polish — COMPLETE (Session 10)
- [done] `manus-routes.json` synced (/setup added; 50 routes), README updated (auto DB setup +
  Phase 2 feature summary), empty states verified across the new panels (staff/ledger/config/
  storage all have explicit empty + blocked states).

## Standing user requirements
- [always] Zip + upload to tempfile.org after every work unit (see DECISIONS.md D7).
- [always] Keep this docs folder current (TASKS.md status, CHANGES.md entries, DECISIONS.md).
- [always] `pnpm typecheck` + `pnpm test` green before cutting a zip.

## Blocked / external dependencies
- [blocked] Google OAuth end-to-end: needs owner to configure Google client ID/secret + redirect
  allowlist in Supabase/Google (credentials must not pass through chat).
- [blocked] Vercel deployment: project not Git-linked; canonical source is Manus-managed storage.
- [blocked] First platform_admin bootstrap SQL must be run once by the owner (README.md snippet).
- [blocked] Privacy-scope clarification: does "admin = all permissions" include identifiable
  clinical records? Until answered, clinical RLS stays narrow.
