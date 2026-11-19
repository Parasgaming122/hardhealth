# Change Log

Reverse-chronological log of every session's changes. Each entry lists files touched, why, and the
backup zip + tempfile URL produced.

---

## 2026-11-19 — Session 6 (this session): P2-4 CNIC uniqueness + P2-11 atomic status RPC (code complete, DDL pending)

**Context**: Phase 2 Part 3 closed in Session 5, so this session took the next backlog items that need
DDL — deliberately BATCHED into one migration file so the owner runs a single SQL in the Supabase
editor: `supabase/migrations/20261119100000_cnic_unique_atomic_status.sql`.

**Migration contents** (NOT yet applied to live DB — handed to owner):
- Part A (P2-4, brief 5.2/11.10): `patients.cnic text` column (digits-only normalization of any
  existing values), `patients_cnic_format_check` (NULL or exactly 13 digits), partial UNIQUE index
  `patients_cnic_unique_idx` on non-NULL cnic — duplicate registrations now fail hard at the DB level.
- Part B (P2-11 / D13 durable fix): `hard_private.admin_set_provider_status(provider_id, action, note)`
  SECURITY DEFINER RPC doing the provider update AND the `provider_status_change` audit insert in ONE
  transaction; public wrapper `admin_set_provider_status` granted to authenticated only (exact
  pattern of `admin_list_providers` et al.).

**App changes** (5 files):

1. `lib/provider/actions.ts` — `registerRealPatient`: CNIC normalized to 13 digits (rejects bad
   format pre-flight), duplicate pre-check with a friendly "already registered to X (HARD-xxxxx)"
   error, `cnic` included in the insert, unique-violation + missing-column errors translated
   (missing-column message names migration 20261119100000).
2. `lib/provider/real-provider.ts` — `listRealPatients` selects cnic; pre-migration fallback
   (retries without cnic) so the front desk never 500s before the owner applies the SQL.
3. `lib/provider/types.ts` — `RealPatientSummary.cnic: string | null`.
4. `lib/admin/provider-actions.ts` — `updateProviderStatusAction` rewritten to call the atomic RPC
   with the USER's client (auth.uid() must resolve inside the RPC; service key cannot call it).
   The two-REST-call flow + compensating rollback is deleted; missing-RPC errors name the migration.
5. `components/real-front-desk-panel.tsx` — CNIC column in the directory (formatted 5-7-1),
   search matches name/HealthID/CNIC-digits, client-side 13-digit validation, optimistic row
   includes cnic.
6. `lib/supabase/security.test.ts` — 2 new guardrail tests pin the migration's security posture
   (CNIC uniqueness + nullable-for-self-signups; RPC revoked from everyone except the public
   wrapper granted to authenticated).

**Bug found & fixed during smoke** (pre-existing, live in prod path): Health IDs were generated as
`count(*)+101`; with test patients deleted across sessions the count collides with an existing
health_id → `patients_health_id_key` violation on EVERY new patient (reproduced: desk user signup
crashed /patient/overview). Both generators (`ensurePatientRecord`, `registerRealPatient`) now use
`max(health_id)+1` with a 23505-retry taking the next serial. D16.

**Verification**: `pnpm typecheck` 0 errors · `pnpm test` 19/19 (2 new) · `pnpm build` success ·
`scripts/verify_premigration_s6.mjs` 11/11 against the LIVE DB pre-migration: admin providers page
loads; status change fails gracefully naming the missing migration and mutates nothing; front desk
register page loads (list fallback); CNIC register fails with the migration hint; client-side
13-digit validation active; health-id collision fixed (patient workspace renders). Test orgs/users
cleaned; DB back to 4 orgs + 1 patient.

**Handed to owner (blocking live use, not blocking dev)**: apply
`supabase/migrations/20261119100000_cnic_unique_atomic_status.sql` in the Supabase SQL editor.
After it lands, re-run `scripts/verify_admin_ui.mjs` (expect 21/21 with atomic RPC) and the S6
post-migration checks (CNIC happy-path + duplicate rejection).

---

## 2026-11-19 — Session 5: migration applied by owner + full status-change lifecycle verified live

**Context**: Owner applied `supabase/migrations/20261119000000_provider_status_change_audit.sql` in
the Supabase SQL editor ("ran the sql"). Probe confirmed the live CHECK now accepts
`provider_status_change` (probe row inserted + deleted clean). This was the ONLY item blocking
approve/reject/suspend/reinstate — the entire Phase 2 Part 3 pipeline is now live-verified.

**Verification performed** (`scripts/verify_admin_ui.mjs`, rewritten for post-migration behavior;
21/21 checks, screenshots `/tmp/render/s5-*.png`):
- Login → `/admin/providers` renders the 4 live orgs; filter chips count live rows.
- Full lifecycle on a throwaway test org (live orgs untouched): create (pending) → edit →
  **APPROVE** → **SUSPEND** (confirm modal + required note) → **REINSTATE**.
- Every step: success toast + row updates WITHOUT reload (revalidatePath + D14 prop sync) +
  DB row persisted correctly + `audit_events.provider_status_change` row with
  `metadata.action` = approve/suspend/reinstate (asserted via service-role reads).
- Reinstate restores `approved_at`/`approved_by`; suspend persists as `rejected` in DB (CHECK has
  no `suspended` value — UI still labels it "suspended" in the toast; chip shows `rejected`).
- No uncaught client errors.

**Changes made this session** (2 repo files):

1. `lib/admin/provider-actions.ts` — cosmetic fix found during re-verification: the success toast
   built the past tense as `${auditAction}d`, producing "updated to suspendd." for suspensions.
   Replaced with an explicit past-tense map (approve→approved, reject→rejected, suspend→suspended,
   reinstate→reinstated). No behavioral change otherwise.
2. `scripts/verify_admin_ui.mjs` (outside repo) — rewritten from pre-migration expectations
   (graceful failures, rollback checks, suspending the live Cedar org) to post-migration
   expectations (success toasts, live chip updates, service-role audit assertions, full lifecycle
   on the throwaway org only). Note for future runs: an action fired immediately after a previous
   action's `revalidatePath` re-render is still in flight needs a settle window — chip polls use
   12s (an 8s single-shot wait flaked once).

**Cleanup after verification**: both S5 test orgs + temporary test admin deleted; live DB back to
its 4 original orgs (Metro Health Clinic still `pending` as before); append-only audit rows remain
by design.

**Quality gate**: `pnpm typecheck` 0 errors · `pnpm test` 17/17.

**Next up (TASKS.md backlog)**: P2-4 (patients.cnic + unique index), P2-11 (atomic
SECURITY DEFINER status-change RPC), P2-5 (doctor prescription templates) — all need DDL, so a
single batched migration file will be prepared for the owner's next SQL-editor run.

---

## 2026-11-19 — Session 4: .env.local wired to live Supabase + full runtime verification

**Context**: Owner supplied the real `.env.local` values (Supabase URL, publishable key, service-role
key, `AUTH_COOKIE_MODE=local-http`, site URL). This unblocked the two Part 3 follow-ups: live-DB
runtime verification and migration application. Note: `.env.local` is gitignored and is EXCLUDED
from all backup zips (credentials must not leak to tempfile.org).

**Live DB state discovered** (via service-key REST probes — no SQL route from sandbox, see
DECISIONS.md D12):
- All three pre-existing migrations ARE applied. 4 provider orgs (3 approved: Cedar Medical Centre,
  Northstar Diagnostics, Green Cross Pharmacy; 1 pending: Metro Health Clinic), 1 patient
  (HARD-000102), 2 auth users; `parasmehtabofficial@gmail.com` is the active platform_admin.
- Migration `20261119000000_provider_status_change_audit.sql` is **NOT applied** (probe insert of
  `event_type='provider_status_change'` violates the CHECK). DDL cannot be applied from the
  sandbox — owner must paste the SQL into the Supabase SQL editor (file:
  `supabase/migrations/20261119000000_provider_status_change_audit.sql`).

**Verification performed** (Playwright driving the real UI at localhost:3000 against the live DB,
15/15 checks, screenshots in session logs):
- Login as a temporary platform_admin → `/admin/overview`; `/admin/providers` renders all 4 live
  orgs with live staff counts; filter chips count live rows.
- `createProviderAction` → live insert + `write` audit row; new row appears WITHOUT reload.
- `editProviderDetailsAction` → live update + `write` audit row; edit reflects without reload.
- `updateProviderStatusAction` (approve + suspend-modal flows) → fails GRACEFULLY pre-migration
  with a clear error naming the missing migration; status is ROLLED BACK (verified via reload +
  direct DB read: Cedar stayed `approved` after a failed suspend).

**Changes made this session** (2 files, both fixes found BY the runtime verification):

1. `components/admin-providers-manager.tsx`
   - Added `useEffect(() => setProviders(initialProviders), [initialProviders])` (the
     `admin-user-manager.tsx` convention). Before: created/edited providers only appeared after a
     manual page reload because local state ignored prop updates after `revalidatePath`.

2. `lib/admin/provider-actions.ts` — `updateProviderStatusAction` hardening:
   - Fetches the previous `status/approved_at/approved_by` before mutating.
   - If the audit insert fails, writes the previous values back (compensating update) so the
     registry is never mutated without an audit trail (the live DB proved a real half-commit:
     status changed while the audit insert threw the CHECK violation).
   - Error message now explains the rollback and names the missing migration when the failure
     matches the CHECK-constraint signature.

**Cleanup after verification**: all 4 test provider orgs deleted; temporary test platform_admin
user deleted (cascades profiles + user_roles); DB back to its pre-session state except ~6 harmless
append-only `write` audit rows whose `provider_id` became NULL on org delete (audit_events is
append-only by design).

**Quality gate**: `pnpm typecheck` 0 errors · `pnpm test` 17/17 · `pnpm build` success.

**Backups produced**: `hard_phase2_part4_envcheck.zip` (final state; tempfile URL logged below).

**Handed to owner (blocking status changes only)**: apply
`supabase/migrations/20261119000000_provider_status_change_audit.sql` in the Supabase SQL editor.
Everything else in the provider manager already works against the live DB.

---

## 2026-11-19 — Session 3: Complete Phase 2 Part 3 (Admin Providers Manager)

**Context**: Previous session (Session 2) ran out of credits mid-Phase 2. Per `task.md`, it had
created `lib/admin/provider-actions.ts`, created `components/admin-providers-manager.tsx`, and
edited `app/[workspace]/[[...section]]/page.tsx` — and nothing else. The repo compiled with
3 TypeScript errors and 1 latent database-level bug.

**Analysis performed first (per user instruction "understand before doing anything")**:
- Read every root doc (task.md, TODO.md, README.md, plan.md, AGENTS.md, full 465-line brief).
- Read all three Phase 2 files + every file they touch (secure-workspace, ui, supabase server/env,
  admin actions/types, roles, both relevant migrations, platform-admin-panel).
- Confirmed the exact broken state with `pnpm typecheck` (3 errors, matching analysis).

**Changes made this session**:

1. `docs/` folder created (this file set): README.md (memory index), ARCHITECTURE.md,
   DECISIONS.md, TASKS.md, CHANGES.md. This is the AI working memory the user requested.

2. `components/admin-providers-manager.tsx`
   - Suspend modal: `onClose={() => setConfirmSuspendProvider(null)}` → 
     `onOpenChange={(o) => { if (!o) setConfirmSuspendProvider(null); }}`, added required
     `description` prop.
   - Add-provider modal: same `onClose` → `onOpenChange` fix + required `description`.
   - Removed unused imports: `Badge`, `Building2`, `Filter`, `ShieldCheck` (lint hygiene).

3. `components/secure-workspace.tsx`
   - Added optional `allAdminProviders?: ProviderRecord[]` prop.
   - Imported `AdminProvidersManager` and `ProviderRecord` type.
   - `admin/providers` section now renders `<AdminProvidersManager initialProviders={allAdminProviders ?? []} />`
     ABOVE the existing demo `PlatformAdminPanel` + approved-org static table, so the platform admin
     gets the real-DB full lifecycle manager (create/approve/reject/suspend/reinstate/edit) while the
     demo approval queue remains visible below.

4. `supabase/migrations/20261119000000_provider_status_change_audit.sql` (NEW)
   - Drops the `audit_events_event_type_check` constraint and re-creates it with
     `provider_status_change` appended to the allowed list. Without this,
     `updateProviderStatusAction` would throw a Postgres check violation on every call (the update
     itself succeeds, the audit insert after it fails, and the action returns an error).

5. `app/[workspace]/[[...section]]/page.tsx` — one hardening change on top of Session 2's work:
   replaced the bare `Promise.all([getAdminDirectoryData(), listAllAdminProviders()])` with
   `Promise.allSettled` + per-result handling and a server-side `console.error`. Rationale: the
   repo README documents that the Vercel Preview has NO service-role key configured; without this,
   a platform admin opening `/admin` would get a hard 500 from `listAllAdminProviders()` (it throws
   when `SUPABASE_SERVICE_ROLE_KEY` is missing). Now the workspace degrades to empty states, the
   same pattern `getAdminDirectoryData()` already uses internally, and the misconfiguration is
   logged server-side. `lib/admin/provider-actions.ts` was not modified — it was already correct
   once the consumer side was wired.

**Verification**:
- `pnpm typecheck` → 0 errors (was 3).
- `pnpm test` → 17/17 passing (5 files: roles 5, security 5, trusted-origin 3, signup-validation 3,
  globals-styles 1 — includes the new migration file passing the security assertions unchanged).
- `pnpm build` → compiled successfully (with placeholder env vars, as build does not need real
  Supabase values beyond presence).
- Runtime smoke test with dev server: `/`, `/login`, `/signup`, `/demo`, `/rx/resolve` → 200 with
  correct titles; unauthenticated `/admin/overview` → 307 redirect to `/login` (expected guard
  behavior).

**Backups produced**:
- `hard_phase2_part3_docs.zip` (state after docs folder creation, before code fixes)
- `hard_phase2_part3.zip` (final state: docs + completed integration + migration)
- tempfile.org URLs logged at the bottom of this file after upload.

**Known follow-ups** (also in TASKS.md): apply the new migration to `hard-health-dev`;
set `SUPABASE_SERVICE_ROLE_KEY` in the deployment env for the admin provider actions to work at
runtime; manual UI pass on /admin/providers afterwards.

---

## 2026-11-1x — Session 2 (previous, interrupted): Phase 2 Part 3 started

From `task.md`: DB exploration (provider org columns, status constraint, RPC list, audit metadata),
then created `lib/admin/provider-actions.ts` + `components/admin-providers-manager.tsx`, edited
`app/[workspace]/[[...section]]/page.tsx` (3 files total, committed in `25437bf`). Ran out of
credits immediately after the third file — integration, Modal API fixes and the audit CHECK
migration were never done. Repo was left non-compiling.

## 2026-11-1x — Session 1 (previous): Phase 1 audit

Full brief-vs-code gap analysis (roles, components, APIs, migrations), documented in `task.md`
(commit `aa9f746`). Identified the Critical/High gap list that Phase 2 is working through.
Dev server confirmed running; tsc 0 errors; vitest 17/17 at that time.

---

## tempfile.org upload log

| zip | uploaded at | URL | expires |
|---|---|---|---|
| hard_phase2_part5_verified.zip (incl. .git history, commit 197a452; .env.local EXCLUDED) | 2026-11-19 | https://tempfile.org/841DVfgLHLj/ | +48h |
| hard_phase2_part4_envcheck.zip (incl. .git history, commit 1082cff; .env.local EXCLUDED) | 2026-11-19 | https://tempfile.org/k3TZi6t1QrD/ | +48h |
| hard_phase2_part3_docs.zip | 2026-11-19 | https://tempfile.org/yKT7E9W8CEx/ | +48h |
| hard_phase2_part3.zip (incl. .git history, commit f3683e3) | 2026-11-19 | https://tempfile.org/de89D4X2uRm/ | +48h |
