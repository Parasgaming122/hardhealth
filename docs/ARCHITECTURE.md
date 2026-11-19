# H.A.R.D Architecture

## High-level flow

```
Browser
  │
  ├── / (public landing) ──────────────┐
  ├── /login /signup (Supabase Auth)   │  server actions: signInAction / signUpAction
  ├── /demo (offline fictional demo)   │  client-only state via DemoProvider
  ├── /verify/lab/[token] (public)     │  reads lab report by verify token (no identifiers)
  ├── /rx/resolve (public page)        │  pharmacy QR/short-code entry (auth required for data)
  │
  └── /[workspace]/[[...section]]  (ALL authenticated role routes)
        │
        ├── createSupabaseServerClient()  → auth.getUser()
        ├── rpc get_my_workspace()        → roles + role-scoped summary (audited: workspace_read)
        ├── isAssignedToWorkspace()       → else "Access not permitted" card
        ├── rpc record_workspace_read()   → audited (admin override flagged)
        └── per-role data loaders:
              admin    → admin_platform_summary() + getAdminDirectoryData() + listAllAdminProviders()
              patient  → getRealPatientPortalData(user.id)
              doctor/front-desk/lab → listRealPatients()
              pharmacy → (nothing; resolve happens via token actions)
        │
        └── <SecureWorkspace> dispatches to role panel components
```

## Roles and DB scoping

| Workspace slug | Required DB role | Notes |
|---|---|---|
| /patient | patient | own record only (user_id join) |
| /doctor | doctor | provider-scoped (provider_id from user_roles) |
| /front-desk | front_desk | provider-scoped |
| /pharmacy | pharmacist | strict single-prescription scope |
| /lab | lab_tech | provider-scoped |
| /provider-admin | provider_admin | own org only |
| /admin | platform_admin | non-clinical; may open every workspace route (override), clinical data stays hidden |

Platform admin route override: `page.tsx` keeps the route shell but wipes `access.patient`/`summary`
when an admin opens a workspace they don't hold the role for. `record_workspace_read` flags
`admin_override` in audit metadata.

## Authentication

- Supabase Auth (email/password + Google OAuth). Callback: `/auth/callback`.
- `handle_new_auth_user()` trigger (20261111192154 migration) inserts profile + fixed `patient`
  role for EVERY new auth user. Role can never be chosen at signup.
- Role changes: only `platform_admin` via server actions that call
  `hard_private.admin_assign_user_role` / `admin_revoke_user_role` (or the direct-table variants in
  `lib/admin/actions.ts` using the service-role client after re-verifying the actor).
- Cookies: `authCookieOptions()` — `SameSite=None; Secure; HttpOnly` by default, `Lax` + non-Secure
  when `AUTH_COOKIE_MODE=local-http`. Session refresh happens in `proxy.ts` middleware on
  login/protected routes only.
- OAuth redirect safety: `lib/auth/trusted-origin.ts` allowlist (exact origins only, no wildcards).

## Database (Supabase Postgres)

Tables (all RLS-enabled, direct grants revoked for anon/authenticated):
`provider_organizations, profiles, user_roles, provider_memberships, patients,
patient_provider_links, visits, prescriptions, prescription_items, pharmacy_dispenses,
lab_reports, cost_items, invoices, ledger_entries, audit_events`

Key constraints:
- `provider_organizations.status` CHECK: `('pending','approved','rejected')` — **no 'suspended'**.
- `audit_events.event_type` CHECK: `('workspace_read','normal_read','write','pharmacy_resolve',
  'dispense','emergency_override','court_access','role_assignment')` — extended by migration
  `20261119000000_provider_status_change_audit.sql` with `provider_status_change`.
- `prescriptions.token_digest` bytea UNIQUE (sha256 of token); `max_fills` 1..20; status lifecycle
  active → partly_filled → dispensed / expired / cancelled.
- `patients` has NO unique index on any CNIC-like column yet (patients table currently stores
  full_name/dob/gender/blood_group; CNIC uniqueness is app-level only) — Phase 2 gap.

SECURITY DEFINER surface:
- `public.get_my_workspace()` — role payload + summary + workspace_read audit.
- `public.record_workspace_read(p_workspace)` — role check + audit incl. admin override flag.
- `public.resolve_prescription(p_token)` — pharmacist-only, hashes token, rate-limited 20/min
  (20261110140000 migration), returns minimal payload (first name + age range only).
- `public.admin_list_users / admin_list_providers / admin_platform_summary` — platform-admin-only
  wrappers over `hard_private.*` implementations.
- `public.assign_user_role / admin_assign_user_role / admin_revoke_user_role`.

Platform-admin writes (user roles, provider org changes) go through the **service-role client**
(`createSupabaseAdminClient()`) inside `"use server"` actions, after re-verifying the actor's active
platform_admin row in the DB (see `verifyAdmin()` in provider-actions.ts and
`verifyPlatformAdminActor()` in actions.ts). Service role key is server-only env
(`SUPABASE_SERVICE_ROLE_KEY`).

## The single dynamic workspace route

`app/[workspace]/[[...section]]/page.tsx` handles every role URL. `lib/auth/roles.ts`
(`workspaceConfig`, `isAllowedWorkspacePath`, `sectionTitle`) defines valid workspace/section
combinations. Invalid → notFound(). Unauthenticated → redirect /login. Wrong role → access-denied
card (no data leak).

Section dispatch inside `SecureWorkspace` (client):
- admin/users → `AdminUserManager`
- admin/providers → `PlatformAdminPanel("Provider approvals")` (demo data) + approved-org table +
  **`AdminProvidersManager`** (real DB, added this session)
- admin/{overview,config,audit} → `PlatformAdminPanel` (demo data; config/audit real persistence is
  a Phase 3 item)
- patient → `RealPatientPortal` (real DB)
- doctor/front-desk → real panels with `realPatients`
- pharmacy → `RealPharmacyPanel` (resolve via token actions)
- lab → `RealLabPanel`

## Demo isolation

`/demo` and the demo-driven panels (`PlatformAdminPanel`, `ProviderAdminPanel`, panels/*) use
`DemoProvider` (client context, `lib/mock-data.ts` fixtures) — zero Supabase interaction. Real role
panels read from Supabase. Both can render inside SecureWorkspace; the demo panels are clearly
labeled. Do not wire demo state into server actions.

## Testing

- Unit (vitest): roles, trusted-origin, signup-validation, cookie/security, globals.css integrity,
  migration security assertions (`lib/**/*.test.ts`, `tests/globals-styles.test.ts`).
- E2E smoke (`tests/e2e/smoke.test.mjs`, playwright-core): homepage, login redirect, pharmacy route
  guard; needs `E2E_BASE_URL` + `CHROMIUM_PATH` and a running dev server.
- `pnpm typecheck` must pass with 0 errors before any zip is cut.

## Known architectural gaps (from Phase 1 audit, tracked in TASKS.md)

1. Provider lifecycle (approve/reject/suspend/reinstate/edit/create) — FIXED this session (Phase 2 Part 3).
2. patients.cnic column + unique index missing (schema stores no CNIC at all right now).
3. Doctor templates only in demo memory, not DB.
4. Printable prescription PDF missing.
5. Storage meter 80%/100% enforcement (block uploads at 100%) missing.
6. No `config` table — fees/plans hard-coded in demo config only.
7. Provider-admin staff management (add/deactivate staff) not wired to DB.
8. Soft delete/deactivation for staff + patients not implemented.
