# H.A.R.D Project Documentation (AI Working Memory)

> This folder is the persistent working memory for the H.A.R.D (Healthcare Accounting & Record Keeping) project.
> It exists so that any future session (human or AI) can pick up exactly where the last one stopped.
> **Read this README first, then `TASKS.md` (current state), then `CHANGES.md` (what was last done).**

---

## What this project is

- **Product**: H.A.R.D — Healthcare Accounting & Record Keeping. A healthcare-finance prototype
  (FinTech Expo Fall 2026, owner: Asees Mehtab, 25SP-004-BA).
- **Pitch**: providers issue verified digital prescriptions/lab reports/receipts; pharmacies resolve
  ONE prescription via QR token only; patients get a live expense dashboard + timeline; platform earns
  a yearly storage subscription; providers earn a 30% revenue share on fees they collect.
- **Stack**: Next.js 16.4.5 (App Router, React 19.3.1), TypeScript 7, Tailwind CSS 4, Supabase
  (Auth + Postgres, RLS everywhere, direct anon/authenticated grants revoked), Radix UI primitives,
  recharts, lucide-react, qrcode.react + html5-qrcode. Node 22+ (README says Node 22 LTS+; sandbox had v24 fine).
- **Spec**: `HARD_Developer_Brief_v2.md` (repo root) is the authoritative product brief. `plan.md` is the
  implementation plan. `TODO.md` tracks delivery outcomes. `task.md` is the raw log of the previous sessions.

## Repository layout (the parts that matter)

```
app/
  page.tsx                          public landing page
  login/ , signup/                  auth screens (email/password + Google OAuth)
  auth/callback/route.ts            OAuth callback (role comes from DB, never from URL)
  demo/page.tsx                     isolated offline fictional demo (5-7 min loop)
  access-pending/page.tsx
  [workspace]/[[...section]]/page.tsx  ALL authenticated role routes (single dynamic route)
  verify/lab/[token]/               public lab verification (hash + QR)
  rx/resolve/                       public pharmacy prescription resolver
  api/rx/resolve/route.ts           GET endpoint for pharmacy token resolution
  pharmacy/actions.ts               pharmacy server actions (dispense w/ OTP 4812, bill attach)
components/
  secure-workspace.tsx              master authenticated shell (sidebar, topbar, section dispatch)
  admin-user-manager.tsx            platform-admin user directory & role grant/revoke
  admin-providers-manager.tsx       NEW (Phase 2 Part 3): full provider lifecycle manager
  real-patient-portal.tsx           live patient dashboard (all 8 tabs)
  real-doctor-panel.tsx             doctor workspace (history, Rx writer, templates demo-only)
  real-front-desk-panel.tsx         CNIC registration, Health ID, receipts, 30/70 split
  real-pharmacy-panel.tsx           token resolve, OTP dispense, bill attach
  real-lab-panel.tsx                report issuing w/ SHA-256 hash + QR
  panels/platform-admin-panel.tsx   demo-data-driven admin panel (config, ledger, audit)
  panels/provider-admin-panel.tsx   provider org panel
  ui.tsx                            Button/Badge/Modal (Radix Dialog)/RolePicker
lib/
  auth/roles.ts                     workspace config, allowed paths, role types
  auth/trusted-origin.ts            OAuth redirect origin allowlist
  auth/signup-validation.ts         zod-less manual signup validation
  admin/actions.ts                  user directory + grant/revoke role server actions
  admin/provider-actions.ts         NEW (Phase 2 Part 3): provider CRUD/status server actions
  admin/types.ts                    AdminDirectoryUser, AdminApprovedProvider
  patient/, provider/               real data loaders + server actions per role
  supabase/server.ts                SSR client + createSupabaseAdminClient (service role)
  supabase/env.ts                   env guards (throws if SUPABASE_SERVICE_ROLE_KEY missing)
  domain.ts, mock-data.ts           shared domain helpers + demo fixtures
supabase/migrations/
  20261110130000_initial_hard_schema.sql
  20261110140000_pharmacy_resolve_rate_limit.sql
  20261111192154_hard_patient_signup_admin_roles.sql
tests/                              vitest unit + node:test e2e smoke
```

## Where things stand (see TASKS.md for detail)

- **Phase 1 (complete)**: full audit + gap analysis, documented in `task.md`.
- **Phase 2 (in progress)**: fixing the Critical/High gaps. Part 3 = Admin Providers Manager
  (full provider lifecycle: create/approve/reject/suspend/reinstate/edit) — code complete, and
  **runtime-verified against the live Supabase project (Session 4)**: login, live rendering,
  create, and edit all work; status changes are blocked ONLY by the unapplied migration
  `20261119000000_provider_status_change_audit.sql` (owner applies it via the Supabase SQL editor;
  until then they fail gracefully WITH rollback and a message naming the migration).
- **Next up (Phase 2 remainder / Phase 3)**: DB unique index on patients.cnic, doctor prescription
  templates persisted to DB, printable Rx PDF, storage 100% upload block, config table persistence,
  provider-admin staff management, platform config editor.

## Golden rules of this codebase (do not break)

1. **Platform admin never sees clinical content.** RLS on clinical tables stays narrow until the
   owner clarifies the "admin means all permissions" scope. Admin route access ≠ clinical data access.
2. **Pharmacy has zero patient search/history.** Only `resolve_prescription(token)` with rate limit
   (20/min) — do not add any patient-listing surface for pharmacists.
3. **All fees/plans/splits come from config**, never hard-coded (Brief Business Rule 1). Demo defaults
   live in `lib/mock-data.ts` config; real config table does NOT exist yet (Phase 3 item).
4. **Issued records are never deleted** (Business Rule 3). Suspend/deactivate = soft status change +
   audit event. The `provider_organizations.status` CHECK only allows
   `('pending','approved','rejected')`, so "suspended" is stored as `rejected` + audit metadata
   `action='suspend'` and reconstructed in `listAllAdminProviders()` (see DECISIONS.md #1).
5. **Every non-patient read/write lands in `audit_events`** (append-only, event_type CHECK constraint).
6. **Server Actions + SECURITY DEFINER RPCs are the only data path** — direct table access is revoked
   for anon/authenticated. New writes from platform admin go through `createSupabaseAdminClient()`
   (service role) AFTER re-verifying the actor is an active platform_admin in the DB.
7. **Demo (`/demo`) is fully isolated** from Supabase — fictional local state only.

## Environment / commands

```bash
pnpm install --frozen-lockfile   # Node 22+; pnpm 11.25.0 pinned via packageManager
pnpm typecheck                   # tsc --noEmit
pnpm test                        # vitest run (unit; 17 tests as of Phase 1)
pnpm test:e2e                    # node --test tests/e2e/smoke.test.mjs (needs running server + CHROMIUM_PATH)
pnpm build                       # next build (needs NEXT_PUBLIC_SUPABASE_* env or it throws in env.ts)
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`AUTH_COOKIE_MODE=local-http` (local only), and `SUPABASE_SERVICE_ROLE_KEY` (server-only, required by
the new admin provider actions; **never** prefix with NEXT_PUBLIC). **Status (Session 4)**: the real
`.env.local` exists in the workspace and is LIVE-VERIFIED against the Supabase project
(`wtawsbtjbhyzseqzfsoo`); it is gitignored and excluded from backup zips. The service-role key
enables runtime DML via REST but NOT DDL — migrations still require the Supabase SQL editor (or DB
password / platform PAT). The sandbox cannot reach the Postgres port (IPv6-only direct host).

## Live-DB verification tooling (Session 4)

Reusable scripts live in `/home/z/my-project/scripts/` (outside the repo, not shipped):
- `inspect_supabase.js` / `probe_migration_state.js` — table/constraint/RPC probes via service key.
- `create_test_admin.js` — creates a temporary platform_admin + writes `.test-admin.json`.
- `verify_admin_ui.mjs` — 15-check Playwright walk of `/admin/providers` (login → live rows →
  create → edit → approve-fail-rollback → suspend modal). Needs the dev server running and the
  test admin present.
- `cleanup_session4.js` — removes test orgs/user; pattern to copy for future cleanup.

## Backup convention (user requirement)

After every meaningful unit of work, create a zip named like `hard_phase2_part3.zip`,
`hard_phase2_part3_docs.zip`, `hard_phase2_part4.zip` … containing the whole repo state, place it in
`/home/z/my-project/download/`, and upload it to https://tempfile.org/api (48h retention) with a note
of the returned URL in `CHANGES.md`.
