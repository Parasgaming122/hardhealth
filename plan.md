# H.A.R.D — Revised Implementation Plan

## Scope change and product direction

The user now requests a navigable role portal, persistent Supabase integration, security/performance work, tests, and Vercel deployment. This supersedes the prior static-only/no-external-service delivery boundary. Keep the existing H.A.R.D design reference: compact icon rail, warm-white canvas, pastel financial metrics, wide charts, charcoal patient summary panel, teal actions, PKR figures, provenance badges, and responsive mobile navigation.

### Public homepage and route hierarchy

- `/` becomes a polished public landing page using the supplied dashboard design language. It explains H.A.R.D, links to each role portal, and offers a clearly separate fictional demo. It must not expose protected records.
- `/login` is the authentication entry and `/signup` supports email/password and Google OAuth. New accounts receive only the `patient` application role through the database auth-user trigger; user metadata and request parameters cannot choose a role. Only a current `platform_admin` may grant or revoke any other application role.
- Role roots (`/patient`, `/doctor`, `/front-desk`, `/pharmacy`, `/lab`, `/provider-admin`, `/admin`) resolve to that role’s `/overview` route after session and role checks. Unauthorized users return to login or an access-denied page.
- Patient pages: `/patient/overview`, `/patient/timeline`, `/patient/prescriptions`, `/patient/reports`, `/patient/expenses`, `/patient/providers`, `/patient/billing`, `/patient/settings`.
- Doctor pages: `/doctor/overview`, `/doctor/patients`, `/doctor/patients/[patientId]`, `/doctor/prescriptions/new`, `/doctor/prescriptions/[prescriptionId]`.
- Front-desk pages: `/front-desk/overview`, `/front-desk/patients/new`, `/front-desk/patients/[patientId]`, `/front-desk/collections`.
- Pharmacy pages: `/pharmacy/overview`, `/pharmacy/resolve`, `/pharmacy/dispenses`, `/pharmacy/bills`. Pharmacy receives no patient directory, Health ID, or record-history route.
- Lab pages: `/lab/overview`, `/lab/reports/new`, `/lab/reports/[reportId]`; provider-admin pages: `/provider-admin/overview`, `/provider-admin/staff`, `/provider-admin/ledger`; platform-admin pages: `/admin/overview`, `/admin/providers`, `/admin/config`, `/admin/audit`.
- `/admin/users` provides an audited platform-admin-only user directory and role-management screen. A platform admin may open every configured role workspace and nested page; data reads and writes made under this override must be authorized in the database and audited. This application-level administrator is not a Supabase project/database owner.
- `/verify/lab/[token]` remains a minimal public verification page that reveals no patient identifiers or clinical details. `/rx/resolve` accepts only an opaque pharmacy token/code and applies the narrow single-prescription rules for pharmacy users.
- Update `/manus-routes.json` to declare every real route and dynamic pattern.

### Supabase data, identity, and privacy boundary

- Replace static export with a dynamic Next.js App Router deployment on Vercel. Use Supabase Auth and Postgres through the supported server/client SSR helpers; use secure, refreshed session cookies compatible with HTTPS Preview and Vercel.
- Model users/profiles and assigned roles, organizations/provider membership, patient-provider links, visits, prescriptions/items, dispenses, reports, costs/bills, invoices, ledger entries, storage plans, and audit events with versioned SQL migrations and generated TypeScript types.
- Enforce authorization in the database with RLS and audited SECURITY DEFINER operations, not only in React route guards. Patients can access their own records; provider staff can read only actively linked patients within their organization and role; pharmacy users resolve one opaque prescription token through a narrowly scoped operation. The user requires an active platform admin to open every H.A.R.D workspace/page, administer roles, and have all H.A.R.D application permissions; this role does not grant Supabase project/database ownership. **Privacy-scope gate:** whether “all permissions” includes direct access to identifiable clinical records is awaiting confirmation. Until confirmed, keep existing clinical-record RLS and role boundaries unchanged; any later override must be explicit, database-enforced and audited. Do not trust user-editable metadata for roles.
- Keep the role-switcher demo isolated from Supabase and clearly labeled. Seed only fictional records in development/test. No real patient data, CNICs, identity documents, or clinical files should be imported until the user separately approves a compliance-ready production design.
- Use only the Supabase URL and public anon/publishable key in browser configuration, with RLS enforced. Never put the Supabase service-role key in client code. Prefer not to require it at all. Private uploaded files, if in scope, use a private bucket and short-lived scoped access; test only with synthetic files.

### Security, performance, tests, and deployment

- Protect every role route on the server and at the database layer, with a platform-admin override checked against active database roles. Validate all user inputs server-side; use opaque, expiring, single-purpose pharmacy tokens; constrain file type/size; avoid logging sensitive values; audit every admin override read/write; set secure headers and rate limits for auth/token resolution. Do not claim regulatory compliance without an external legal/security review.
- Reduce client work by using Server Components by default, fetching only role-authorized paginated data, splitting heavy charts and camera QR scanning by route, and removing full-app client hydration where practical. Measure a production baseline and after-state with build/bundle analysis and mobile Lighthouse/Core Web Vitals; report measured results rather than claiming unmeasured RAM/CPU improvements.
- Add unit tests for role/policy helpers, patient-default signup invariants, admin grants/override, record validation, token transitions, balanced ledgers and visible UI interactions; integration/RLS tests against a dedicated local or non-production Supabase project; and browser smoke tests for role routing and core workflows. Never run destructive test writes against the production database.
- Use the existing TypeScript diagnostics, lint/typecheck, unit/integration tests, browser tests, and optimized Vercel build. Deploy to a user-authorized Vercel project with separate Preview/Production environment variables. Keep Vercel/Supabase credentials in secure input/configuration only, never in Git or chat. Confirm the final deployment URL and build result before reporting deployment success.

## Project structure

- `app/`: public homepage, login and signup; grouped authenticated role routes and nested pages, including admin user management; minimal public lab verification and pharmacy resolver routes plus OAuth callbacks.
- `components/`: existing H.A.R.D shell and design system, role panels, patient financial overview, reusable data states/forms, and route-aware navigation.
- `lib/supabase/`: browser/server Supabase clients and session helpers; `lib/auth/`: role/session guards and permission utilities; `lib/data/`: typed, scoped data access.
- `supabase/migrations/`, `supabase/seed.sql`, `supabase/tests/`: schema, fictional non-production fixtures, RLS policies and database authorization tests.
- `tests/`: unit, integration and browser-flow suites. `public/manus-routes.json` stays synchronized with all page routes.
- Root: Vercel-compatible Next.js runtime configuration, lockfile, safe `.env.example`, and README for secure setup, test data and deployment boundaries.

## Design direction

**Design movement:** Contemporary civic-fintech interface with the calm precision of a patient portal and the clarity of a modern ledger.

**Core principles:** Financial clarity first; clinical provenance always visible; role-appropriate privacy by default; quiet, practical accessibility across mobile and desktop.

**Color philosophy:** Warm white and pale mineral backgrounds reduce noise; the patient overview pairs an ivory canvas and soft pastel financial cards with a charcoal context panel; deep ink-blue supports legibility; teal is the ownable action color; mint marks verified states, amber pending items, and coral restrained alerts.

**Layout paradigm:** A compact persistent icon rail and contextual topbar on desktop, mobile bottom navigation for patient/pharmacy, and route-specific content rather than one client-rendered mega-panel. The public homepage is an editorial entry into role workspaces, not a duplicate dashboard.

**Signature elements:** Linked ledger-line H.A.R.D monogram and medical cross; amber/rose/aqua financial metric accents balanced by charcoal summary surfaces; monospaced Health IDs, receipt codes, and verification marks.

**Interaction philosophy:** Keep task actions obvious and reversible. Show the pharmacy’s narrow scope before resolve. Confirm state changes inline without implying an external payment, notification or identity check ran.

**Animation:** Short 140–200 ms transitions for route panels and success states; lazy-load charts/scanner; no looping motion around money or medicine; honor reduced-motion settings.

**Typography system:** Geist Sans or equivalent for UI and Geist Mono for IDs, dates and amounts; compact uppercase labels; hierarchy through weight, spacing and alignment.

**Brand essence:** A healthcare-finance record for patients and providers that makes every cost visible and every issued document traceable. Personality: measured, transparent, dependable.

**Brand voice:** Direct, calm and specific. Headlines: “Your care, accounted for.” / “Every visit. Every cost. One clear record.” CTAs: “Open patient workspace” / “Resolve one prescription.”

**Wordmark and logo:** Geometric H/A monogram with linked ledger lines and a small medical cross, paired with the H.A.R.D wordmark.

**Signature brand color:** Ledger teal `#0F8B80`.

## Dependencies and approval gates

Provisioning is partly complete: H.A.R.D is a dynamic Next.js 16 application with Supabase Auth/Postgres wired to the dedicated `hard-health-dev` development project and an authorized Vercel `hard-health-records` project. Preview configuration uses only the public Supabase URL and publishable key; no service-role key is configured. Google OAuth also requires the owner to enable the Google provider and configure its client credentials and redirect allowlist in Supabase/Google. The Webdev project still uses its Manus-managed canonical repository, the Vercel project is not Git-linked, and no Vercel deployment has been created; connect a confirmed GitHub source before the first Preview deployment. Do not connect production patient data or deploy a real-data healthcare service under this prototype plan.
