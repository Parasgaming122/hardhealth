# H.A.R.D — Healthcare Accounting & Record Keeping

H.A.R.D is a Next.js healthcare-finance prototype. The public homepage links to separate role-based URLs (`/patient/overview`, `/doctor/overview`, `/front-desk/overview`, `/pharmacy/overview`, `/lab/overview`, `/provider-admin/overview`, `/admin/overview`), Patient registration at `/signup`, and a clearly isolated fictional interactive demo at `/demo`.

## Local development

Use Node.js 22 LTS or newer; Supabase's announced removal of Node.js 20 support took effect on 2026-06-30 ([changelog](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20)).

1. Install with the pinned pnpm lockfile: `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and **publishable** key. Never use a service-role key in browser-facing configuration.
3. For plain HTTP localhost only, `AUTH_COOKIE_MODE=local-http` opts into `SameSite=Lax` and non-Secure cookies. Leave this variable unset in HTTPS Preview and Vercel so auth cookies use `SameSite=None; Secure; HttpOnly`.
4. Run `pnpm dev`, then open `http://localhost:3000`.

The dedicated Supabase development project is `hard-health-dev` in Singapore. Its migrations are versioned under `supabase/migrations/`. The schema has RLS enabled on every application table, direct `anon`/`authenticated` table grants revoked, and narrowly scoped authenticated RPCs. `/pharmacy/resolve` calls a pharmacist-checked function that hashes the submitted token and returns only one active prescription's minimum dispensing details. Workspace summary reads, admin-directory reads, role changes, and token resolutions create audit events.

## Patient signup, Google OAuth and role assignment

Public registration at `/signup` accepts email/password and a Google OAuth option. A database Auth trigger assigns each newly created Auth identity the fixed H.A.R.D `patient` application role. The browser form and editable Auth user metadata cannot choose a staff/admin role. Email confirmation uses the application route `/auth/callback`; role selection after authentication comes from the Supabase `user_roles` table.

**Deploying to a new host?** The application itself accepts auth callbacks on any origin it is actually served from: the server verifies the browser-submitted origin against the request's forwarded headers (`x-forwarded-host` / `x-forwarded-proto`), so a custom domain, a new Vercel preview URL, or a non-Vercel host needs no code or env change. `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` / `VERCEL_BRANCH_URL` remain supported as an additional allowlist. The remaining step is always on the Supabase side, because Supabase Auth rejects OAuth and email-confirmation redirects to URLs outside its own allowlist:

1. Supabase Dashboard → **Authentication → URL Configuration**: set **Site URL** to your deployed URL (e.g. `https://your-app.vercel.app`).
2. Under **Redirect URLs** add `https://your-app.vercel.app/**` (wildcard covers `/auth/callback`), plus `http://localhost:3000/**` for local development and any preview hosts you use.
3. **Authentication → Sign In / Providers → Google**: keep the provider enabled; its client ID/secret are unchanged by redeployments. In Google Cloud the authorized redirect URI stays `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Redeploy after changing env vars, then hard-refresh the login page (browsers cache the old page).

Keep this list narrow; do not add a wildcard for unrelated domains. The callback always selects an in-app route from database roles; it does not accept a user-supplied destination.

To enable Google, configure the Google provider in Supabase Auth with the Google OAuth client ID and secret using Supabase's secure provider settings. In Google Cloud, add the Supabase provider callback `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI. Separately add the H.A.R.D application callback URL(s) described above to Supabase Auth's Redirect URLs. Do not send provider secrets in chat, source control, or browser variables. Official setup: [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

A H.A.R.D `platform_admin` manages users at `/admin/users`; the database re-checks active admin membership for every directory search, grant and revoke. Provider-scoped roles require an approved provider, role changes create audit events, and the last active platform administrator cannot be removed. This is an H.A.R.D application role, not a Supabase Dashboard role. Platform admins can navigate all H.A.R.D workspace pages, but **clinical record RLS has not been widened** while the requested privacy scope is being clarified.

There is no public admin self-promotion. The first platform administrator must be bootstrapped once by an authorized project owner in the Supabase SQL Editor. Create/confirm the Auth account first, select the exact `id` by email, verify it is yours, replace `PASTE_AUTH_USER_UUID` with that UUID, and run this block once:

```sql
do $$
declare
  target_user_id uuid := 'PASTE_AUTH_USER_UUID'::uuid;
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Auth user ID not found';
  end if;
  if exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role = 'platform_admin' and provider_id is null
  ) then
    raise exception 'This account already has a platform_admin role';
  end if;
  insert into public.user_roles (user_id, role, provider_id, created_by)
  values (target_user_id, 'platform_admin', null, null);
  insert into public.audit_events (actor_user_id, provider_id, event_type, resource_type, resource_id, metadata)
  values (null, null, 'role_assignment', 'user_role', target_user_id,
          jsonb_build_object('assigned_role', 'platform_admin', 'bootstrap', true));
end
$$;
```

This grants only the H.A.R.D app role; it does not change Supabase Dashboard/organization permissions. Supabase distinguishes app RBAC from PostgreSQL system roles ([RBAC guide](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac), [Postgres roles](https://supabase.com/docs/guides/database/postgres/roles)). Do not put the role in editable Auth user metadata or expose a service-role key in the browser.

## Automatic database setup and platform configuration

H.A.R.D includes a WordPress-style auto DB setup: point the app at any (empty) Supabase project by
setting the four public/private env values plus `DATABASE_URL` (Session pooler, port 5432) and
restart — `instrumentation.ts` applies every pending migration in `supabase/migrations/` on boot,
tracked in `hard_setup.schema_migrations`. Without `DATABASE_URL` nothing crashes: the app runs,
a quiet banner appears, and `/setup` lists exactly which env values are missing and which
migrations are pending. Platform business parameters (registration fee, plan quotas, provider
share percent, prescription validity/fills, storage alert) live in the `config` table (brief
Rule 1) edited at `/admin/config` by a platform admin; every change is audited. Until migration
`20261121000000_platform_config.sql` is applied (SQL editor or auto-setup), all consumers fall
back to the brief-22 defaults.

Prescriptions support the full version chain from the brief: a doctor can amend an issued
prescription from the doctor panel, which cancels the original QR/code (pharmacy resolves then
return only a `cancelled` status, never the medicines) and issues a new version linked to the
old record, which stays in the patient's history. Patient rows are auto-provisioned on first
visit to the patient workspace with a collision-proof Health ID (`max(health_id)+1` with
conflict retries — never `count(*)`).

## Tests and build

- `pnpm typecheck` — TypeScript static check.
- `pnpm test` — deterministic role, origin, cookie-policy, signup-validation, stylesheet and migration-security tests.
- `pnpm test:e2e` — Chromium smoke checks using `playwright-core`; set `CHROMIUM_PATH` if the browser is not on the default Playwright path, and `E2E_BASE_URL` to target a running server.
- `pnpm build` — optimized Next.js production build for Vercel.

The landing page is server-rendered and the demo client provider is loaded only under `/demo` and `/rx/resolve`, reducing client hydration on public and real role pages. The Supabase refresh proxy runs only on login/protected role routes. Production browser source maps are disabled. Security response headers are configured without restrictive frame headers that would break hosted Preview embedding.

## Data and deployment boundaries

The Supabase development database is intended for schema and synthetic test accounts only; do not add real patient data. The interactive demonstration remains fictional browser-local state. The real authenticated workspaces show role-checked database summaries, admin-only non-clinical account/role management and explicit empty states; they are not a complete clinical production product. Clinical data access has not been changed by the patient-signup/admin-role migration. Other clinical/financial reads and writes still need narrowly scoped audited RPCs before real use.

The `hard-health-records` project exists in the authorized Vercel team with Next.js, the Singapore serverless-function region, Preview deployments enabled, and only `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured for Preview. No service-role key is configured. A Vercel Preview deployment has **not** been created: the project still lacks a Git repository link, and its current Webdev canonical source is not the Vercel Git source. Connect the exact authorized GitHub repository before starting the Vercel Preview deployment; do not promote to Production. No live payment, SMS/WhatsApp, AI extraction, identity, pharmacy, lab or storage-provider integration is active.

**Do not enter real patient information.** This prototype is not approved for clinical decisions or production healthcare use. Before production, complete privacy/security and jurisdictional review, operational monitoring, backups and retention policy, multi-factor/admin hardening, comprehensive authorization testing, safe onboarding and recovery, and legal/compliance approval.
