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
