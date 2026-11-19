# H.A.R.D Task Tracker

Legend: [done] completed · [wip] in progress · [todo] not started · [blocked] needs external input

---

## Phase 1 — Audit & gap analysis — COMPLETE

Full inventory of roles/pages/components/APIs vs `HARD_Developer_Brief_v2.md`, documented in
`task.md` (repo root). Quality gate at end of Phase 1: `tsc --noEmit` 0 errors, vitest 17/17.

## Phase 2 — Fix Critical/High gaps — IN PROGRESS

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
- [todo] **P2-4** patients.cnic column + DB unique index (duplicate CNIC hard-fail; brief 5.2/11.10).
  Note: needs DDL — batch with the next migration for the owner's SQL editor.
- [todo] **P2-5** Doctor prescription templates persisted to DB (table + CRUD + picker in
  real doctor panel; brief 5.4/7.2). Needs DDL — same batch.
- [todo] **P2-6** Printable prescription PDF/print view with QR (brief 5.4).
- [todo] **P2-7** Storage meter 100% upload block (uploads blocked, reads allowed; brief 5.8/11.5).
- [todo] **P2-8** Platform config table + real config editor persistence (brief 8.7/22, Rule 1).
- [todo] **P2-9** Provider-admin staff sub-role editing + payout status (brief 8.6).
- [todo] **P2-10** Soft delete/deactivation UI for staff + patients w/ confirmation (brief 11.3).
- [todo] **P2-11** (new, from Session 4 findings) Durable fix for the two-REST-call status change:
  single SECURITY DEFINER RPC doing update+audit atomically (replaces the compensating rollback,
  see DECISIONS.md D13). Can be combined with the DDL batch above.

## Phase 3 — Acceptance-criteria validation (after Phase 2 backlog)
- [todo] Walk brief Section 20 acceptance criteria end-to-end against the running app.
- [todo] Ledger reconciliation check (split sums equal invoice totals).

## Phase 4 — Polish
- [todo] Empty states, skeletons, badge sweep; `manus-routes.json` sync; README updates.

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
