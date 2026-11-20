# Technical Decisions & Gotchas Log

Decisions made and traps found, so future sessions don't re-derive or re-break them.

---

## D1 — "Suspended" provider status is virtual, not a DB status (2026-11-19)

**Problem**: `provider_organizations.status` CHECK constraint only allows
`('pending','approved','rejected')`. The brief wants a full lifecycle including suspend/reinstate.

**Decision**: Store suspension as `status='rejected'` + an `audit_events` row with
`event_type='provider_status_change'` and `metadata.action='suspend'`.
`listAllAdminProviders()` reconstructs the display status: `rejected` + latest audit action
`suspend` → shows as `suspended`. Reinstate sets `status='approved'` + audit action `reinstate`.

**Why not add a 'suspended' DB status**: changing the CHECK would require touching the production
Supabase project's constraint and every place that assumes approved/rejected semantics
(`admin_list_providers` filters `status='approved'`, `assign_user_role` requires approved, etc.).
The virtual approach is zero-risk for the prototype. **Revisit** if a real `suspended` status is
added to the schema later — then migrate `rejected+suspend` rows.

**Gotcha**: `updateProviderStatusAction` sets `approved_at/approved_by` to NULL when rejecting or
suspending. The audit note must be non-empty for suspensions (UI enforces `required`).

## D2 — New audit event type required a migration (2026-11-19)

`provider-actions.ts` (written by the interrupted session) inserts
`event_type='provider_status_change'`, but the `audit_events` CHECK constraint did not allow it —
every provider status change would have thrown a Postgres check violation at runtime (invisible to
TypeScript). Fixed with migration `20261119000000_provider_status_change_audit.sql`, which drops and
re-adds the CHECK with `provider_status_change` appended.

**Rule for the future**: whenever adding a new `event_type` literal to any insert, check the CHECK
constraint in the initial schema migration first and extend it in a new migration.

## D3 — Modal component API (2026-11-19)

`components/ui.tsx` `Modal` props: `{ open, onOpenChange, title, description (REQUIRED), width?,
children }` — it wraps Radix `Dialog.Root`. There is NO `onClose` prop. The interrupted session's
`admin-providers-manager.tsx` used `onClose` and omitted `description` in two modals (TypeScript
errors). Fixed by switching to `onOpenChange={(o) => { if (!o) … }}` and adding descriptions.

## D4 — Platform-admin writes use service-role client + actor re-verification

`lib/admin/provider-actions.ts` and `lib/admin/actions.ts` both:
1. authenticate the user with the normal SSR client (cookie session),
2. re-verify an ACTIVE `platform_admin` row in `user_roles` via the admin client,
3. then perform writes with the admin (service-role) client,
4. insert an audit event.

This bypasses RLS by design but keeps the authorization check server-side and DB-backed. Any new
admin action must follow the same `verifyAdmin()` pattern. The service-role key must never be
browser-exposed; it lives in `SUPABASE_SERVICE_ROLE_KEY` (server env only). **Note**: this key must
be configured in the deployment environment for `/admin/providers` management to work; it is NOT in
`.env.example` (documented in README env section of docs).

## D5 — Admin route override ≠ clinical access

When a platform admin opens e.g. `/patient/overview` without holding the patient role,
`page.tsx` wipes `access.patient` and `access.summary` before rendering; SecureWorkspace shows the
override banner. This is intentional pending the owner's privacy-scope clarification. Do not "fix"
this by widening RLS.

## D6 — page.tsx passes allAdminProviders only for platform admins on /admin

`listAllAdminProviders()` runs only when `hasPlatformAdmin && workspace === "admin"`, inside a
`Promise.all` with `getAdminDirectoryData()`. It is passed to `SecureWorkspace` as
`allAdminProviders` (full lifecycle records) while the older `adminProviders` (approved-only list,
used by AdminUserManager's role-grant provider picker) is kept for backward compatibility.

## D7 — Backup convention

After each work unit: `zip -r hard_<phase>_<part>[_<step>].zip` of repo (excluding node_modules,
.next, .git optionally — see CHANGES.md for exact exclusion list), copy to
`/home/z/my-project/download/`, upload to tempfile.org API (48h), log the tempfile URL in
CHANGES.md. Multiple zips per session are expected (user explicitly asked for zip every time
something is done).

## D8 — Medicines / counter OTP demo values

Pharmacy dispense counter OTP is hardcoded `4812` in `app/pharmacy/actions.ts` (documented demo
simulation). Mock data seed ~100 medicines lives in `lib/mock-data.ts`. Real `medicines` /
`prescription_templates` DB tables do not exist yet.

## D9 — e2e smoke test needs external chrome

`tests/e2e/smoke.test.mjs` uses playwright-core with `CHROMIUM_PATH` env; in the previous session it
failed twice (no browser). `pnpm test` (vitest) is the reliable gate in this sandbox; e2e is run
only when a server + system chrome are available. Prior session confirmed tsc 0 errors + vitest
17/17 as the quality gate.

## D10 — Admin directory fetches degrade, never crash (2026-11-19)

`/admin` workspace data loading uses `Promise.allSettled([getAdminDirectoryData(),
listAllAdminProviders()])` with per-result handling. If the service-role key is absent (the current
Vercel Preview state per README), the page renders empty states and logs
`[admin] provider lifecycle directory unavailable: …` server-side instead of returning a 500.
This mirrors `getAdminDirectoryData()`'s internal catch. The form actions themselves still surface
real errors inline via `useActionState` when the key is missing at submit time.

## D11 — AdminProvidersManager placement (2026-11-19)

On `/admin/providers` the real-DB `AdminProvidersManager` renders FIRST, followed by the
demo-data `PlatformAdminPanel("Provider approvals")` and the approved-org static table. This keeps
the real lifecycle manager (the actual work product) primary while preserving the demo approval
queue below it. When Phase 3 wires real config/audit persistence, `PlatformAdminPanel`'s demo
sections should be replaced rather than stacked.

## D12 — Live DB runtime verification path (2026-11-19, Session 4)

The sandbox has NO direct Postgres route to the Supabase project: direct host
`db.<ref>.supabase.co` is IPv6-only (sandbox is IPv4, ENETUNREACH), `/pg/*` gateway endpoints
return 404 for service-key auth, and no psql/pg_dump binaries exist. Consequences:
- **DDL (migrations) cannot be applied from the sandbox.** They need the owner (Supabase SQL
  editor), the database password (IPv4 pooler), or a platform PAT. Runtime DML works fine via
  REST + service key.
- **Browser-level verification works**: playwright-core +
  `~/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome` via `executablePath` (installed
  cache is r1200; playwright-core 1.65 expects r1254, so the default launch fails — always pass
  executablePath explicitly).
- ESM scripts outside the repo must use `createRequire("…/hardhealth/package.json")` to load
  playwright-core / supabase-js from the repo's node_modules.

## D13 — Status changes roll back if the audit write fails (2026-11-19, Session 4)

`updateProviderStatusAction` performs TWO REST calls (status update, then audit insert) — no
transaction. Runtime verification against the live DB proved a half-commit: the status changed
while the audit insert failed on the CHECK constraint (pre-migration), leaving an un-audited
mutation. Fix: capture the previous row first; if the audit insert fails, write the previous
status/approved_at/approved_by back (compensating update) and return an error that names the
missing migration when the message matches `/event_type_check|check constraint/i`. This is not
true atomicity (a crash between the two calls still half-commits) but covers the realistic
failure mode; the durable fix is a single SECURITY DEFINER RPC when the schema is next touched.
`create`/`edit` actions audit as `'write'` (already in the CHECK) so they have no known
half-commit trigger; they were left unchanged deliberately.

## D14 — AdminProvidersManager must sync props → state (2026-11-19, Session 4)

Runtime verification caught that creates/edits never appeared in the table without a manual page
reload: the component held `useState(initialProviders)` and ignored prop updates (classic
derived-state antipattern). Fixed with the repo's existing convention (see `admin-user-manager.tsx`):
`useEffect(() => setProviders(initialProviders), [initialProviders])`. Server actions call
`revalidatePath`, Next.js streams fresh props, the effect syncs state. Any new manager component
must copy this pattern.

## D15 — Provider status changes go through one SECURITY DEFINER RPC (2026-11-19, Session 6)

Replaces the D13 compensating-rollback approach: `hard_private.admin_set_provider_status(provider_id,
action, note)` performs the provider update AND the `provider_status_change` audit insert in a single
transaction, so a half-committed status change is now impossible by construction. Conventions copied
from the existing admin RPCs: private impl in `hard_private` (revoked from everyone), thin public SQL
wrapper granted to `authenticated` only, role asserted inside via `hard_private.assert_platform_admin()`.
Calling it requires the USER's Supabase client (`auth.uid()` must resolve — the service-role key
cannot invoke it), so `updateProviderStatusAction` opens a server client for the RPC while keeping
`verifyAdmin()` as a friendly early precheck. D13's rollback code is deleted, not kept as a fallback:
a DB missing the RPC reports a clear "apply migration 20261119100000" error (verified live pre-migration).

## D16 — Health IDs are generated from max(health_id), never count(*) (2026-11-19, Session 6)

Both patient-creation paths (`ensurePatientRecord` self-signup, `registerRealPatient` desk
registration) previously derived the next serial as `count(*)+101`. That breaks the moment any
patient row is deleted: the count then maps onto an existing health_id and EVERY subsequent
signup violates `patients_health_id_key` (reproduced live — a test user's /patient/overview
crashed exactly this way after earlier test-patient cleanups). Both generators now read
`max(health_id)`, parse its numeric suffix, +1, and on a 23505 race retry with the next serial
(3 attempts). New invariant to maintain: health_id stays zero-padded 6-digit (`HARD-XXXXXX`) so
lexicographic max equals numeric max.

## D17 — Auto DB Setup design (2026-11-19, Session 7)

WordPress-style schema automation, per the owner's request ("connect a new database and it sets
itself up; if the DB isn't configured, don't error — tell me what's needed").

**Architecture** (see ARCHITECTURE.md "Automatic database setup" for the diagram):
- Source of truth stays `supabase/migrations/*.sql`. `scripts/generate-migrations-manifest.mjs`
  embeds them into `lib/db/migrations-manifest.ts` (committed; regenerated on `pnpm dev`/`build`)
  because Next output tracing does NOT ship loose .sql files to serverless bundles.
- `instrumentation.ts` `register()` runs `runAutoSetup()` once per server process (nodejs runtime
  only). It NEVER throws — every outcome is a structured record on globalThis.
- Runner (`lib/db/auto-setup.ts`, `pg`): session `pg_advisory_lock(780423901284)` serializes
  concurrent cold starts; bookkeeping in `hard_setup.schema_migrations` (own schema — never
  collides with the supabase CLI's `supabase_migrations`); each migration applied as
  `BEGIN; <whole file as one simple query>; INSERT version; COMMIT` so $$ function bodies with
  semicolons are safe and a failed file rolls back completely.
- **Baseline rule**: bookkeeping table empty + `public.patients` exists → the schema was applied
  manually before auto-setup existed (the live DB's state) → record every manifest version as
  applied ('baselined') instead of re-running DDL that would fail "already exists". LIMITATION:
  a PARTIALLY hand-migrated DB is baselined as fully migrated — per-migration status is visible
  on /setup, so the owner can spot and fix it; new migrations are always incremental.
- `DATABASE_URL` must be the **Session pooler (5432)** or direct connection: the transaction
  pooler (6543) cannot carry session advisory locks or multi-statement simple queries — the
  runner refuses it with a pointed message. Non-`postgres(ql)://` values are refused before `pg`
  sees them (see D18).
- `/setup` manual action access: SETUP_TOKEN (timing-safe compare) OR active platform_admin OR
  virgin DB (0 applied + no `public.patients`). The virgin window is the WordPress install.php
  rule — anyone can install an uninstalled app; it closes the moment the schema exists.
- `AUTO_DB_SETUP=false` gates ONLY the boot hook; manual /setup runs always work (semantics
  documented in .env.example).
- Missing env is NEVER an error: proxy redirects `/`, `/login`, `/signup` + protected roots to
  `/setup` (307) when the public env is absent; the root layout banner shows when env is broken
  or the last run failed; `/demo`, `/verify/*`, `/rx/*` keep working offline.

**Why not run DDL through the Supabase REST API**: it cannot execute arbitrary SQL (by design);
only the pg protocol can. So auto-setup genuinely needs the database connection string — exactly
like WordPress needs DB host/user/password in wp-config. `/setup` explains where to find it.

**Test recipe for real-postgres e2e** (no system postgres in the sandbox, no root for apt):
embedded Postgres 18 from Zonky (maven central, `embedded-postgres-binaries-linux-amd64`),
`initdb -U postgres --auth=trust`, port 54329, plus stubs that mimic Supabase: roles
`anon`/`authenticated`/`service_role`, `auth` schema with `auth.users` + `auth.uid()`, and a
minimal `pgcrypto` extension stub whose `digest(data, 'sha256')` maps to core `sha256()` (zonky
ships without contrib). Encapsulated in `lib/db/auto-setup.e2e.test.ts` (runs only when
`HARD_E2E_PG` is set) + `/home/z/my-project/scripts/make_local_supa_db.mjs`.

## D18 — Three traps found while verifying the auto setup (2026-11-19, Session 7)

1. **The sandbox shell exports a global `DATABASE_URL=file:/home/z/my-project/db/custom.db`**
   (sqlite-style, for sandbox tooling, from `/home/z/my-project/.env`). Any dev server started
   without overriding it inherits the value. Handing it to `pg` produced a cryptic
   `AggregateError` that escaped as an **uncaughtException** (process-level, uncatchable by
   try/catch around await) → 500 on /setup. Fix: `isValidDatabaseUrl()` scheme validation in BOTH
   `runAutoSetup` and `checkDatabaseStatus`, before any pg object is created; error reports the
   scheme only, never the path/credentials. Rule for future sessions: start dev servers with
   `env -u DATABASE_URL` to reproduce the owner's no-DATABASE_URL local state.
2. **React 19 auto-resets uncontrolled form inputs after every server action** that uses
   `useActionState` + form actions. Verify scripts that fill a field, submit, and re-fill must
   wait for the reset (`waitForFunction` on `input.value === ""`) between submissions, or the
   new value is silently wiped mid-flight (cost one debugging round on the token-gate test).
3. **Test-data cleanup ordering (live DB)**: `user_roles.provider_id` RESTRICTs
   `provider_organizations` deletion, so throwaway auth users must be deleted BEFORE their orgs;
   and every test user that ever hit `/patient/overview` owns an auto-provisioned `patients` row
   (via `ensurePatientRecord`) whose `user_id` becomes NULL on user delete — delete those rows
   while the user still exists or they orphan.

## D19 — Prescription templates are doctor-owned, DB-enforced, name-unique (2026-11-19, Session 8)

Brief 15 sketches `prescription_templates(id, doctor_id, name, items json)` — implemented literally
with the repo's RPC security posture (D15): RLS + revoked table grants, `hard_private.assert_doctor()`
gate, every statement scoped to `doctor_user_id = auth.uid()`, `write/prescription_template` audit
rows. Templates are personal to the doctor (not org-shared) — the brief says doctor_id, and sharing
is a later product decision. `unique (doctor_user_id, name)` + insert `ON CONFLICT (doctor_user_id,
name) DO UPDATE` = save-same-name overwrites (the <30s repeat flow never creates duplicates);
renaming onto an existing name raises 23505, translated to a friendly message in the action.
Item validation (1-25 items, non-empty medicine, quantity 1-1000) lives in the RPC, mirrored
client-side in `normalizeItems`. GOTCHA: Postgres requires defaulted function params LAST —
`doctor_save_template(p_name, p_items, p_template_id default null)`; a defaulted param first fails
the whole function compile. PostgREST calls pass named args, so arg order never matters to callers.

## D20 — Provider actions MUST resolve provider_id from the caller's role row (2026-11-19, Session 8)

`prescriptions`, `pharmacy_dispenses` and `lab_reports` all carry `provider_id NOT NULL`, but
`issueRealPrescription` / `dispenseRealPrescription` / `issueRealLabReport` never set it — every
real insert failed with a not-null violation (caught live in Session 8; the flows had only ever been
exercised through mock data). All three now call `requireActiveProviderId(admin, userId, role)`:
resolve the caller's ACTIVE staff role row (`user_roles.provider_id`, oldest first) and use it for
the insert AND the audit event. A staff user without a provider org gets a friendly actionable
error. RULE for any future provider-scoped write: derive provider_id server-side from the session —
never trust it from client input, never omit it.

## D21 — Sandbox process model (2026-11-19, Session 8)

The runtime sandbox reaps background processes BETWEEN tool calls: a dev server started with
`&`/`nohup`/`setsid` in one Bash call is dead by the next call (even though it stays up within the
same call). Dev-server + Playwright verification must therefore run in ONE Bash command
(start server → wait for 200 → run script → `pkill -f "next"`), and the harness kill after the
command's timeout does the final cleanup. The e2e Postgres cluster on 127.0.0.1:54329 DOES survive
between calls (it runs outside the reaped process tree). tempfile.org moved its API: uploads are now
`POST https://tempfile.org/api/upload/local` with field `files` + `expiryHours` (1/6/24/48), not
`POST /api` with `file` — the old endpoint 404s.

## D22 — Config is a table + audited admin RPCs, consumed via fallback defaults (2026-11-20, Session 10)

Brief Rule 1 ("fees, plans, quotas, share, validity, fills live in config, never hard-coded") is
implemented as migration `20261121000000` (`public.config`, RLS no-policy + revoked grants,
brief-22 seeds) with `platform_get/set_config` SECURITY DEFINER RPCs behind
`assert_platform_admin`, every write audited as `config_update` (old + new value). Server
consumers read via `readPlatformConfig()` which falls back to the brief-22 defaults when the
table is missing — so pre-migration databases run unchanged and the editor shows a friendly
hint instead of an error. Two structural rules learned: (1) "use server" files may ONLY export
async functions — constants/types live in sibling plain modules (`lib/admin/config-defaults.ts`,
`lib/provider-admin/types.ts`); (2) a client component must never statically import a module
that reaches `next/headers` (pulls the admin client into the client graph and breaks the
Turbopack build with a misleading "Pages Router" error) — client imports point at
config-defaults only.

## D23 — Storage accounting is simulated-but-honest (2026-11-20, Session 10)

The prototype stores no real files, so each AI-ingested document is accounted at a fixed
`SIMULATED_DOCUMENT_MB = 340` recorded in the ingestion audit event's metadata; the meter sums
those rows and the quota comes from `config.base_plan_quota_mb`. The 100% block happens BEFORE
any write (brief Rule 5 + acceptance: block uploads, keep reads). Three documents (1020/1024 MB)
trip the ≥80% amber alert; the fourth is refused. This exercises the exact production policy
without a storage bucket, and swapping 340 MB for real file sizes later changes one constant.

## D24 — The audit trail is part of every mutation: fail the action, not the audit (2026-11-20, Session 10)

Phase 3 verification caught two audit-integrity bugs: (1) `registerRealPatient` never stamped
`provider_id` on the invoice/provider ledger row, so the provider admin's earnings ledger could
never find its rows — the collecting desk's ACTIVE front_desk org is now resolved and stamped on
both (brief Rule 4); (2) `setPayoutStatusAction` swallowed audit-insert failures, silently
producing ledger changes without an audit row when the live CHECK did not yet know
`payout_update`. The action now ROLLS BACK the status change when the audit write fails and
raises a migration-hint error — state and audit trail can never diverge. Rule for new mutations:
check the audit insert result; on failure, undo the mutation and surface the error.
