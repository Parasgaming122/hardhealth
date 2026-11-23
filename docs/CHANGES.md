# Change Log

Reverse-chronological log of every session's changes. Each entry lists files touched, why, and the
backup zip + tempfile URL produced.

---

## 2026-11-21 — Session 12: workspace pages made distinct + front-desk validation + email-linked signup

**Context**: the owner tested the Session-11 final version and reported, per workspace, that
switching sidebar pages changed nothing (identical content), that the front-desk overview tabs
did not navigate, that patient registration accepted any input ("30 numbers" as a phone, no
email field), and asked for validated fields plus desk-registration → signup linking by email.

### Root causes found

1. **Pharmacy**: `RealPharmacyPanel` compared `section === "Dispenses" || "Bills"` but
   `mapSectionForPanel` sent `"Recent dispenses"` — the condition could never be true, so all
   four pages rendered the resolve card.
2. **Doctor/Lab/Admin**: the panels only branched on ONE section value (`"Patient history"` /
   `"Reports issued"`), so every other route fell through to the same tool card; the admin
   overview additionally embedded the users manager + demo panels wholesale.
3. **Front desk**: the overview tab strip called `setActiveTab` (local state — URL never moved),
   and the section map labeled `patients` as `"Register patient"`, making the directory page a
   duplicate of the registration form.
4. **No validation**: the client checked only name-nonempty + CNIC-13; the server action the
   same. Phone/email were never stored (no columns).

### Changes

1. `supabase/migrations/20261121100000_patient_contact_email_link.sql` (NEW) — `patients.phone`
   + `patients.email` with a case-insensitive partial UNIQUE index (`patients_email_ci_key`);
   NULL emails exempt so desk-only registrations never collide.
2. `lib/provider/patient-validation.ts` (NEW) — shared validation/normalization (Pakistani
   phone incl. +92 forms, 13-digit CNIC, name charset, optional email, DOB range) used by BOTH
   the form and `registerRealPatient`. `lib/provider/patient-validation.test.ts` (NEW, 12 cases).
3. `lib/provider/actions.ts` — `registerRealPatient` validates via the shared module, stores
   phone/email, pre-checks duplicate email with a friendly message (portal-account aware),
   handles the email 23505 race and the migration-missing hint; revalidates the collections page.
4. `lib/patient/real-patient.ts` — `ensurePatientRecord` now CLAIMS an unlinked desk
   registration whose email matches the signing-up account (stamps user_id, keeps the
   desk-issued Health ID, best-effort `portal_account_linked` audit) before inserting a new
   row; never hijacks rows owned by another account; survives the same-user update race.
   `tests/fake-supabase.ts` gained `.is()` + an `auth.admin.getUserById` stub;
   `lib/patient/email-claim.test.ts` (NEW, 7 cases).
5. `lib/provider/real-provider.ts` — `listRealPatients` selects phone/email/user_id (D10
   fallbacks per column generation); NEW `listRecentLabReports`, `listMyPharmacyActivity`
   (pharmacist's own dispenses + their bills), `listFrontDeskCollections` (real invoices +
   ledger splits, desk-org scoped). `lib/provider/types.ts` — new summary types.
6. `lib/admin/audit-log.ts` (NEW) — `listRecentAuditEvents`: real audit_events (metadata only),
   actor display names resolved in one extra query.
7. `components/real-doctor-panel.tsx` — four distinct sections; Repeat/Amend/`Select for
   prescription` now load state AND navigate to the composer; the recent-prescriptions list is
   a shared renderer reused by overview (read-only), prescriptions page (full) and composer.
8. `components/real-front-desk-panel.tsx` — REWRITE: tab strip is real links (role=tablist);
   Overview = quick actions + latest registrations; Register = validated form with email field
   + inline per-field errors + config-driven fee math; Directory = phone/email/portal-status
   columns; Collections = real invoices. `app/globals.css` — `.input-invalid` / `.field-error`.
9. `components/real-pharmacy-panel.tsx` — REWRITE: Overview (dashboard + quick links) / Resolve
   (tool) / Dispenses / Bills (own real records). `components/real-lab-panel.tsx` — REWRITE:
   Overview / New report / Reports issued (real rows, verification links).
10. `components/secure-workspace.tsx` — section maps fixed (front-desk directory, pharmacy
    distinct labels, lab overview), `panelSectionToHref` covers pharmacy/lab/directory; admin
    workspace: overview = real `admin_platform_summary` dashboard + quick links (no embedded
    managers/demo panels), audit = real event table; new props wired through.
11. `app/[workspace]/[[...section]]/page.tsx` — fetches lab reports, pharmacy activity,
    front-desk collections (desk org), admin audit events; passes them down.
12. `tests/panel-sections.render.test.tsx` (NEW, 16 cases) — renderToString per section pins
    that every page renders distinct content and the complained-about duplicates are gone.
    `lib/db/auto-setup.test.ts` — migration list updated for the 9th migration;
    `lib/db/migrations-manifest.ts` regenerated.

### Verification (all green)

- `npx tsc --noEmit` 0 errors · `npx vitest run` **87 passed** (4 e2e skipped without env).
- Real-Postgres e2e (embedded PG 18.7, `scripts` recipe): 4/4 — a fresh DB builds all NINE
  migrations. Contact-migration behavior verified on real PG: duplicate email → 23505 on
  `patients_email_ci_key`, multiple NULL emails OK, claim UPDATE + audit insert valid.
- `npm run build` success.
- **Live browser run** (`scripts/mock_supabase_s12.mjs` — a local PostgREST/GoTrue mock with
  Cedar-like fixtures, because the sandbox recycle lost `.env.local` — plus
  `scripts/verify_s12_workspaces.mjs`): **39/39**, zero uncaught client errors. Logs in through
  the real form, then per workspace: admin overview dashboard (no duplicated managers),
  REAL audit events; doctor 4 distinct pages + Repeat→composer navigation; front-desk
  directory/register/collections distinct, tab strip navigates, 30-digit phone rejected inline,
  valid registration succeeds, email-link hint shown; pharmacy 4 distinct pages with real
  dispense/bill rows; lab 3 distinct pages with the real report; patient portal renders after
  admin switch (regression check for the Session-11 crash).

### Handed to owner

1. Re-provide `.env.local` values (sandbox recycle lost them; rotate if preferred).
2. Apply `supabase/migrations/20261121100000_patient_contact_email_link.sql` in the Supabase
   SQL editor — the only manual step; every flow degrades gracefully without it.

---

## 2026-11-21 — Session 13: deployed-site auth fix (Google OAuth + signup origin rejection)

**Context**: after deploying, the owner reported two auth failures on the deployed site:
1. Google button → "Google sign-in is not ready for this site. Check the Google provider and
   redirect allowlist in Supabase Auth." (worked before on localhost)
2. Account creation → "This site origin is not configured for secure account confirmation.
   Open the approved H.A.R.D site or ask the administrator to configure its public URL."

### Root cause

Both messages are produced by the app's OWN origin gate, not by Supabase:
`lib/auth/trusted-origin.ts` trusted only `https://hard-health-records.vercel.app`,
`NEXT_PUBLIC_SITE_URL`, `VERCEL_URL`, `VERCEL_BRANCH_URL` (+ localhost in dev). The deployed
origin matched none of these, so `signUpAction` line 38 rejected signup and
`googleSignInAction` bounced to `?error=google`. (Supabase's Redirect-URLs allowlist is a
SECOND, independent gate that must also include the deployed URL — that part is dashboard
config; steps documented in README and below.)

### Changes

1. `lib/auth/trusted-origin.ts` — NEW `requestAppOriginCandidatesFromHeaders()`: derives the
   origin(s) the request provably arrived on from `x-forwarded-host`/`x-forwarded-proto`
   (first hop only; `host` fallback; both protocols tried only when no proxy set the proto —
   exact-match still required, fails closed on malformed input).
   `trustedAppOriginFrom(value, requestOrigins?)` now accepts an origin that exactly matches
   the request's own origin — redirecting back to the site the visitor is already on is
   inherently safe, and it makes ANY deployment host (custom domain, new Vercel project,
   non-Vercel PaaS) work with zero env changes. The env-var allowlist path is unchanged;
   Supabase's own allowlist remains the outer gate.
2. `app/login/actions.ts` — both `signUpAction` and `googleSignInAction` pass the
   server-derived request origins into the gate.
3. `components/secure-signup-form.tsx` + `app/login/page.tsx` — the Google alert now names
   the exact fix location: "add this site's URL to Supabase Auth → URL Configuration →
   Redirect URLs and check the Google provider".
4. `README.md` — replaced the stale "configure Site URL to the Vercel domain only" paragraph
   with a 4-step deployment checklist (Site URL, `https://<host>/**` Redirect URLs, Google
   provider, redeploy + hard refresh). `.env.example` — `NEXT_PUBLIC_SITE_URL` marked
   optional with the automatic request-origin behavior explained.

### Verification (all green)

- `npx tsc --noEmit` 0 errors · `npx vitest run` **91 passed** (4 e2e skipped without env;
  trusted-origin suite grew 5→7 cases: request-origin match/mismatch/spoof, comma-joined
  proxy hops, malformed headers, dual-protocol direct connection).
- `npm run build` success.
- **Live production-mode run** (`scripts/verify_s13_deploy_auth.mjs`, 8/8): `npm start`
  (NODE_ENV=production) with the browser origin NOT in any allowlist — exactly the deployed
  failure condition. Signup form: origin gate passes, request proceeds to the Supabase step
  ("We could not create that account" against a deliberately fake endpoint — the old code
  showed "site origin is not configured" here). Google button: action redirects to
  `<supabase>/auth/v1/authorize?provider=google&redirect_to=http://localhost:3000/auth/callback`
  — correct provider + redirect target, origin gate passed. Zero client errors.

### Handed to owner (dashboard steps — code alone cannot fix the Supabase side)

1. Supabase Dashboard → Authentication → URL Configuration → **Site URL** = deployed URL.
2. Same page → **Redirect URLs**: add `https://<deployed-host>/**` (+ keep
   `http://localhost:3000/**` for local dev, + any preview hosts).
3. Authentication → Sign In / Providers → Google stays enabled (keys unchanged).
4. Redeploy with env vars set for the runtime, then hard-refresh the login page.

---

## 2026-11-23 — Session 14: Android/mobile UI fix (bottom nav + topbar overflow)

**Context**: after deploying, the owner reported "Android UI is messed up" with a phone
screenshot of /patient/overview — green circle around the bottom area: the nav labels were
squashed into one clipped line ("verviewTimelinePrescriptionsReportsExpensesProvider") and the
fixed nav overlapped the "Digital prescriptions" card.

### Root causes (three, all in `app/globals.css`)

1. **Nav item styles never applied to the real workspaces**: the mobile-nav rules targeted
   `.mobile-nav button` only, but `SecureMobileNav` renders `<Link>` anchors — so every real
   workspace's tabs rendered as unstyled inline links (16px text, no icon-over-label column,
   no padding) overflowing into one mashed line. (The offline /demo nav uses `<button>`, which
   is why it always looked right — and why the bug went unnoticed.)
2. **Fixed-position shrink-to-fit**: `.mobile-nav` had `left:0; right:0` but no width — CSS
   sizes such boxes by *shrink-to-fit*, so with 8 non-shrinkable patient tabs the bar itself
   grew to 408px on a 360px screen, dragging the whole document into horizontal scroll
   (page wobbled sideways; avatar squashed to 16px; sign-out button off-screen).
3. **Content padding shorter than the fixed nav**: the secure workspace's mobile rule set
   `padding-bottom:40px` while the nav is ~61px — the last card hid behind the bar.

### Changes

1. `app/globals.css` (800px block): nav items styled for **both `button` and `a`** (icon-over-
   label column, 8px font, nowrap, 46px touch target, teal active, hover pill); the bar is now
   `width:100%; max-width:100vw` (kills the shrink-to-fit), `overflow-x:auto` with hidden
   scrollbars so 8 tabs SWIPE horizontally instead of overflowing the page; few-tab workspaces
   still spread evenly (`flex:1 0 auto`). Generic `.content` mobile padding-bottom now
   `calc(86px + env(safe-area-inset-bottom))`; topbar allows wrapping and its avatar/logout
   buttons no longer squash (`flex:none`).
2. `app/globals.css` (480px block): the three textual topbar controls (Authenticated badge,
   Explore Offline Demo pill, Workspaces switcher) compact to icon-only pills so one row fits
   360px — scoped `.topbar …` so the login/signup hero badge keeps its text.
3. `components/secure-mobile-nav.tsx`: now a client component; on deep links (e.g.
   /patient/billing) the ACTIVE tab auto-scrolls into view (centered) inside the scrollable
   bar. `components/secure-workspace.tsx`: `title="Switch workspace"` on the icon-only
   switcher summary.

### Verification (all green)

- Reproduced the owner's state first (`scripts/verify_s14_mobile_ui.mjs before` — 6 failures
  matching the screenshot: 16px row-direction items, page 408px wide on 360px viewport,
  Billing tab unreachable at left=463, padding 88 < nav 82).
- **After the fix: 15/15 checks PASS in dev AND in the production build** (Pixel-like context:
  360×760, DPR 3, isMobile, touch): 8 tabs styled, internal scroll only, document exactly
  360px (no sideways wobble), last card fully visible 72px above the nav, deep-linked Billing
  tab auto-centered, /demo button-nav still styled, login hero badge text intact, doctor
  workspace (4 tabs) clean, zero client errors. VLM review of the after-screenshot confirms
  the layout (remaining "dark N button" is the dev-mode Next.js indicator, absent in prod).
- Desktop regression: Session-12 suite `verify_s12_workspaces.mjs` **39/39**, no client errors.
- `npx tsc --noEmit` 0 · `npx vitest run` **91 passed** · `npm run build` success.

---

## 2026-11-20 — Session 11: health-id crash fix (final) + P2-13 amendments + pharmacy resolve hardening

**Context**: The owner reported the production crash `duplicate key value violates unique constraint
"patients_health_id_key"` when switching to the patient workspace in the admin account, and asked for
a final fully-verified version. Sandbox had been recycled — restored from
`hard_phase2_part10_allp2.zip` (Session 10's commit `ef2e981`), `.env.local` rebuilt.

### Root cause of the reported crash

The stack trace matched the ORIGINAL pre-Session-6 `ensurePatientRecord` (`if (error || !inserted)`
+ `serial = count(*)+101`): with the single baseline patient, every new patient row was computed as
`HARD-000102` → guaranteed duplicate. The live repo already carried the D16 fix; the running build
predated it. D16's retry had two residual holes (stale `serial += 1` without re-reading max;
`patients_user_id_key` same-user races unhandled) — both closed this session.

### Changes

1. `lib/patient/health-id.ts` (NEW) — shared `insertPatientWithUniqueHealthId`: fresh
   `max(health_id)` read on EVERY retry (5 attempts), non-health_id unique violations returned
   immediately for caller handling. `lib/patient/real-patient.ts` — `ensurePatientRecord` uses it
   and re-selects by `user_id` on a 23505 (two-tabs race) before throwing. D25.
2. `lib/provider/actions.ts` — `registerRealPatient` refactored onto the same helper (CNIC
   friendly errors preserved); NEW `amendRealPrescription` (P2-13, brief Section 6): cancel
   original → insert v+1 with `supersedes_id` → amended items → `write`/`prescription` audit with
   `prescription_amended` metadata (no migration needed) → revalidates. Fee NOT re-charged. D26.
3. `app/api/rx/resolve/route.ts` — uuid-aware lookup (fixes latent 404-on-every-typed-code
   PostgREST uuid-cast bug), Rule 6 gate (cancelled/expired/dispensed → bare status, no medicines,
   no patient), 20/min-per-IP in-memory rate limit, every resolve audited as `pharmacy_resolve`.
4. `components/real-doctor-panel.tsx` — Amend button per recent prescription (gated by status),
   amber amendment banner with cancel, issue-button switches to `Issue amended prescription v2
   (cancels RX-…)`, issued screen + print sheet show `v2 · supersedes RX-…`.
   `lib/provider/types.ts` + `lib/provider/real-provider.ts` — `DoctorRecentPrescription` carries
   `version`/`supersedesCode` (second query resolves superseded codes).
5. `lib/patient/types.ts` + `lib/patient/real-patient.ts` + `components/real-patient-portal.tsx` —
   prescriptions carry `version`/`supersedesCode`/`supersededByCode` (reverse map); portal shows
   the v-chip and "replaced by RX-…" on the cancelled original.
6. Tests: `tests/fake-supabase.ts` (NEW chainable admin-client fake), `lib/patient/health-id.test.ts`
   (NEW, 7 cases incl. the owner's exact scenario + both race shapes),
   `lib/provider/amend.test.ts` (NEW, 6 cases: happy path, cancelled/dispensed/mismatch/empty
   guards, expired-revival).

### Verification (all green)

- `npx tsc --noEmit` 0 errors · `npx vitest run` **51 passed** · real-Postgres e2e
  (embedded PG 18 cluster, D17 recipe re-created in `/home/z/my-project/scripts/prep_e2e_cluster.mjs`)
  **4/4** — fresh DB builds all 7 migrations · `npm run build` success.
- Live final run `scripts/verify_s11_final.mjs` **23/23**: A1-A5 the reported admin→patient
  switch (HARD-000103 provisioned, portal renders, reload stable); E1 config editor with LIVE
  values (owner applied the config migration — table probed, all 13 defaults present); B0-B10 the
  amendment flow (banner → v2 issued → DB supersede chain → items → fee charged ONCE → audited);
  C1-C3 pharmacy resolve (cancelled code → bare status, new code → medicines, resolves audited);
  D1-D2 patient portal version chain; F1 zero uncaught client errors.
- Cleanup `scripts/cleanup_s11.js`: live DB restored to its exact baseline (4 orgs / 1 patient
  HARD-000102 / 2 users / 0 rx / 0 costs / 0 templates).

### Faithfulness status (task.md audit)

All 13 Phase-1 gap rows closed; with P2-13 the LAST open acceptance criterion (amendments) is
green. Remaining non-built items are exactly the ones the brief itself defers (court + sponsor:
"later phase / stretch"). No pending owner SQL.

---

## 2026-11-20 — Session 10: Phase 2 backlog completed (P2-6..P2-10) + Phase 3 acceptance + Phase 4 polish

**Context**: The owner asked to complete the entire remaining TASKS.md backlog at once, then run
all tests; also to verify `task.md` is completed faithfully against the brief. All five remaining
P2 items were implemented in one session, verified live end-to-end (34/34 acceptance checks),
and Phases 3 + 4 were closed.

### New migration `20261121000000_platform_config.sql` (P2-8; owner applies this one file)

- `public.config` (key/value/updated_at/updated_by), RLS enabled, no policies, grants revoked.
- Brief-22 seed defaults: registration_fee 500, renewal_fee 400, base/plus/pro plan quotas +
  prices, provider_share_percent 30, storage_alert_percent 80, prescription_valid_days 30,
  prescription_max_fills 1, court_access_days 30, emergency_access_hours 24.
- `hard_private.config_key_allowed` allowlist; `platform_get/set_config` SECURITY DEFINER RPCs
  behind the existing `assert_platform_admin()`; every write audited (`config_update` with old +
  new value). Audit CHECK extended with `config_update` + `payout_update` (preserving every
  earlier value). Public wrappers granted to `authenticated` only (D15 pattern).

### App changes (16 files)

1. `lib/admin/config-defaults.ts` (NEW) — UI-safe constants (defaults + labels); `lib/admin/config.ts`
   (NEW, server-only) — `readPlatformConfig()` with brief-22 fallbacks (D10); `lib/admin/config-actions.ts`
   (REWRITE, "use server") — `getPlatformConfigForAdmin` + `updatePlatformConfigAction` (audited RPC
   writes). Splitting constants out of the "use server" file was mandatory (Next.js only allows
   async-function exports there) and keeps client components off the next/headers graph.
2. `components/admin-config-editor.tsx` (NEW) — the real /admin/config editor: 13 keys, unsaved-
   changes badge, per-change audit trail notice; replaces the demo config form on the admin
   workspace (demo panel keeps Finance & ledgers there).
3. `lib/provider/actions.ts` — `registerRealPatient` now reads `registration_fee` +
   `provider_share_percent` from config AND stamps the desk's ACTIVE front_desk org onto the
   invoice + provider ledger entry (Phase 3 caught the omission: the provider ledger could never
   find its rows). `issueRealPrescription` reads `prescription_valid_days` +
   `prescription_max_fills` from config.
4. `components/real-front-desk-panel.tsx` — KPI cards + collections math now config-driven
   (fee/share percentages rendered from live values, no hard-coded PKR 500/150/350).
5. `lib/patient/real-patient.ts` (P2-7) — `SIMULATED_DOCUMENT_MB` (340/doc) +
   `getPatientStorage()` (used = sum of ingestion audit metadata sizes; quota = config
   `base_plan_quota_mb`); `getRealPatientPortalData` fills real numbers + `storagePct`.
6. `lib/patient/actions.ts` (P2-7) — `savePatientIngestion` blocks at 100% BEFORE any write with
   a friendly "reading stays available — upgrade at the desk" message; returns the 80%+ warning;
   audit metadata now carries `size_mb`.
7. `components/real-patient-portal.tsx` (P2-7) — real meter (used/quota/pct, amber ≥80%, red +
   coral "uploads blocked" banner at 100%); the upload modal surfaces the block + warning.
8. `lib/provider-admin/types.ts` (NEW) + `lib/provider-admin/actions.ts` (NEW) (P2-9/P2-10) —
   `getProviderAdminData` (org KPIs, staff, provider-side ledger — all scoped to the caller's own
   ACTIVE provider_admin org), `addProviderStaffAction` (grant sub-role in own org only),
   `setStaffActiveAction` (soft delete/reactivate with self + last-admin guards),
   `setPayoutStatusAction` (own-org provider rows only; audit write failure now ROLLS BACK the
   status change so ledger and audit never diverge pre-migration).
9. `components/real-provider-admin-panel.tsx` (NEW) — the real provider-admin workspace: live
   KPIs, staff table with status badges, add-staff dialog, deactivate/reactivate confirmation
   modal, earnings ledger with payout toggle. Wired into the workspace (demo panel stays on /demo).
10. `components/real-doctor-panel.tsx` (P2-6) — print-only prescription sheet + "Print
    prescription (PDF)" button on the issued screen; `app/globals.css` print rules make ONLY the
    sheet visible in print media (visibility technique + page-break guard).
11. `components/secure-workspace.tsx` + `app/[workspace]/[[...section]]/page.tsx` — new props
    (`platformConfig`, `frontDeskConfig`, `providerAdminData`), provider-admin swap, doctor
    identity (name + provider name from `get_my_workspace`) for the print sheet.
12. `lib/db/migrations-manifest.ts` regenerated (7 migrations); `lib/db/auto-setup.test.ts` list
    updated; `lib/db/auto-setup.e2e.test.ts` fresh-DB probes extended with the config table + RPC;
    `lib/supabase/security.test.ts` gained the P2-8 guardrail test (RLS/revokes/assert/allowlist/
    audit/seed defaults/no over-grant); `public/manus-routes.json` synced (/setup).

### Verification performed

- `pnpm typecheck` 0 errors · `pnpm test` 38/38 · `pnpm build` success.
- **Real-Postgres e2e** (embedded PG 18 cluster + pgcrypto stub recipe, D17): 4/4 with the 7th
  migration — a fresh DB builds all 7 including the config table + RPCs.
- **Live acceptance run** (`scripts/verify_s10_acceptance.mjs`, 5 temporary role users on Cedar):
  **34/34** — A: config editor renders + pre-migration degrade (friendly hint, no crash);
  B: front-desk registration with config fee + LEDGER RECONCILIATION (350+150=500);
  C: provider admin workspace, add staff → grant → deactivate (confirmation) → reactivate →
  self-deactivation blocked, payout toggle shows the ROLLBACK + migration hint pre-migration and
  persists once applied; D: storage meter 0→30%→66%→99% (amber alert)→4th upload BLOCKED, only 3
  cost items written, reading still allowed at 100%; E: print button + print-only sheet (verified
  via print-media screenshot); F: zero uncaught client errors across every role login.
- **Cleanup** (`scripts/cleanup_s10.js` incl. the D18/created_by orphan sweep): live DB restored
  to its exact baseline (4 orgs / 1 patient / 2 users / 0 everything / 504 audit events).

### Handed to owner (the only remaining manual step)

Apply `supabase/migrations/20261121000000_platform_config.sql` in the Supabase SQL editor — OR
set `DATABASE_URL` (Session pooler, port 5432) and restart: the auto DB setup applies it and
`/setup` shows it flipping to applied. Until then every config consumer runs on the brief-22
defaults and the editor shows the friendly hint.

---

## 2026-11-20 — Session 9: P2-5 closed live (templates DDL applied by owner) + P2-5b repeat-last-prescription

**Context**: Sandbox was recycled — the working tree was restored from
`hard_phase2_part8_templates.zip` (zip excludes `.env.local`; recreated from the owner-supplied
values). Typecheck 0 errors / tests 37/37 straight after restore. The owner had applied migration
`20261119200000_doctor_prescription_templates.sql` ("done") — probe confirmed it live:
`prescription_templates` readable (0 rows), `doctor_list_templates` +
`doctor_save_template` exist and correctly refuse a keyless service-role call (42501
Authentication required — `assert_doctor()` working). Live baseline: 4 orgs, 1 patient
(HARD-000102), 2 auth users, 0 prescriptions/templates/cost items, 504 audit events.
**P2-5 is fully closed (code + DDL live).** Then the session took the next backlog item,
**P2-5b repeat-last-prescription** (brief 7.2: templates + repeat-last-prescription, <30s issuing).

### Part 1 — P2-5b feature (6 files, NO new migration)

Data access decision: `prescriptions` has RLS + revoked `authenticated` grants, but the app's
established trust model already reads clinical tables server-side with the admin client after
`auth.getUser()` (patient directory, `issueRealPrescription`). `listDoctorRecentPrescriptions`
follows that pattern, strictly self-scoped to `doctor_user_id = <authenticated user id>` — a
doctor only ever sees their own issuing history. Degrades to `[]` on any read failure (D10), so
the workspace never 500s.

1. `lib/provider/types.ts` — new `DoctorRecentPrescription` (id, code, status, issuedAt,
   consultationCost, note, patientId/Name/HealthId, items).
2. `lib/provider/real-provider.ts` — `listDoctorRecentPrescriptions(userId, limit = 8)`: admin
   client, embeds `patients(full_name, health_id)` + `prescription_items`, orders
   `issued_at desc`; rows asserted to an explicit `RxRow` type (supabase-js types embeds as a
   union with an inner-error shape) and normalized defensively via the shared
   `normalizeTemplateItems`.
3. `app/[workspace]/[[...section]]/page.tsx` — doctor workspace fetches
   `listDoctorRecentPrescriptions(user.id)` alongside templates; passes
   `doctorRecentPrescriptions` to `SecureWorkspace`.
4. `components/secure-workspace.tsx` — `doctorRecentPrescriptions` prop + pass-through.
5. `components/real-doctor-panel.tsx` — "Recent prescriptions" strip between the saved-templates
   block and the medicines editor: (a) highlighted emerald banner
   **"Repeat last prescription for {selected patient}"** (code · date · med count · fee) shown
   whenever the selected patient has history; (b) per-row Repeat buttons for the doctor's last 8
   prescriptions across patients (code — patient (health id) · date · count · status · fee);
   (c) `applyRepeat()` deep-copies items, restores note + consultation fee, auto-switches the
   selected patient to the row's patient, and status-reminds that complaint/diagnosis are not
   stored on the original (per-visit fields). Props→state sync per D14.
6. `lib/provider/actions.ts` — `issueRealPrescription` now also revalidates
   `/doctor/prescriptions/new` + `/doctor/overview` so the repeat list + template chips refresh
   right after issuing (matches `revalidateDoctorPaths()` in template-actions).

### Part 2 — Verification performed

- `pnpm typecheck` 0 errors · `pnpm test` 37/37 · `pnpm build` success.
- **Live runtime verification** (`scripts/verify_s9_repeat.mjs`, fresh test doctor on Cedar via
  `create_test_doctor_s9.js`) — **15/15**: login lands (D18: on /patient/overview, which
  auto-provisions a HARD-000103 patient row for every new user — account for it, clean it up);
  empty state; issue #1 (RX-78S8-3LMX); recent list syncs without reload; highlighted banner
  shows code/date/fee; repeat reloads 1 medicine + note + fee 3500 into the composer; issue #2
  from the repeated state (RX-KBDS-8UT6); DB: 2 prescriptions both Cedar/active/3500/same
  patient; item-level fidelity (repeat == original, all 6 fields); 2 consultation cost items;
  2 prescription audit rows; zero client errors. Screenshot confirmed the strip layout.
- **Cleanup** (`scripts/cleanup_s9.js`): FK-order deletes (audit → cost → items → rx →
  auto-provisioned patient → auth user) — baseline re-verified exactly
  (4 orgs / 1 patient / 2 users / 0 rx / 0 templates / 0 costs / 504 audits).

**Result**: P2-5b closed. Doctor's <30s flow now has three entry points: catalogue search,
saved templates, and one-tap repeat. Next backlog: P2-6 printable prescription, P2-7 storage
meter block, P2-8 config table.

---

## 2026-11-19 — Session 8: P2-5 doctor prescription templates + provider_id bug fix

**Context**: Session 7 had finished the auto DB setup but was cut off before its commit/backup — this
session committed it (7fb7972), cut `hard_phase2_part7_autodbsetup.zip` (tempfile URL below), then
took the next backlog item: **P2-5 Doctor prescription templates** (brief 5.4/7.2/15 — saved sets of
common prescriptions; "keep issuing a prescription under about 30 seconds; this is the adoption lever").

### Part 1 — P2-5 feature (code complete; DDL pending for the live DB)

**New migration** `supabase/migrations/20261119200000_doctor_prescription_templates.sql`:
- `public.prescription_templates` (id, doctor_user_id→auth.users cascade, name 1-80, items jsonb
  array, created_at, updated_at, `unique (doctor_user_id, name)`) — the exact shape brief 15 sketches.
- RLS enabled, zero policies, table grants revoked — API roles can never touch it directly.
- `hard_private.assert_doctor()` + `doctor_list_templates` / `doctor_save_template` /
  `doctor_delete_template` (SECURITY DEFINER, self-scoped to `doctor_user_id`, every mutation audited
  as `write/prescription_template`), public SQL wrappers granted to authenticated only (the D15
  pattern).
- Save semantics: insert with `ON CONFLICT (doctor_user_id, name) DO UPDATE` — saving a "new"
  template under an existing name overwrites it (no accidental duplicates in the <30s repeat flow);
  explicit `p_template_id` update path for renames; 23505 on rename collisions translated to a
  friendly action-level message.
- **Param-order rule learned the hard way**: Postgres requires defaulted params LAST
  (`doctor_save_template(p_name, p_items, p_template_id default null)`) — the first draft had the
  defaulted param first and every function failed to compile ("input parameters after one with a
  default value must also have defaults").

**App changes (7 files)**:
1. `lib/provider/types.ts` — `PrescriptionItemDraft`, `DoctorTemplateSummary`.
2. `lib/provider/template-actions.ts` (NEW) — `saveDoctorTemplateAction` /
   `deleteDoctorTemplateAction` called with the USER's client (auth.uid() must resolve inside the
   RPCs); missing-function errors name migration 20261119200000 (+ the auto-setup alternative).
3. `lib/provider/real-provider.ts` — `listDoctorTemplates()` read helper; degrades to `[]` with a
   server-side log when the migration is absent (D10 pattern) so the doctor workspace never 500s.
4. `app/[workspace]/[[...section]]/page.tsx` — fetches templates for the doctor workspace.
5. `components/secure-workspace.tsx` — `doctorTemplates` prop pass-through.
6. `components/real-doctor-panel.tsx` — template chips (tap = load items, X = delete), save-current-
   items-as-template input, status/error notices, "Saved templates" KPI; props→state sync per D14.
7. `lib/db/migrations-manifest.ts` (regenerated, now 6 migrations) + `lib/db/auto-setup.test.ts`
   (list updated to 6) + `lib/supabase/security.test.ts` (guardrail test for the new migration) +
   `lib/db/auto-setup.e2e.test.ts` (fresh-DB probes for the table + RPC; partial count made
   count-agnostic).

### Part 2 — pre-existing live bug found & fixed: provider_id NOT NULL violations

The runtime verification caught that `issueRealPrescription` NEVER set `provider_id` — every real
prescription insert failed with a not-null violation (the flow had never been live-verified before).
Same latent bug in `dispenseRealPrescription` (pharmacy_dispenses) and `issueRealLabReport`
(lab_reports). Fix: `requireActiveProviderId(admin, userId, role)` resolves the caller's provider
from their ACTIVE staff role row and all three inserts (+ their audit events) now carry it. A
staff user without a provider org gets a friendly "ask an admin to assign one" error. See D20.

### Verification performed

- `pnpm typecheck` 0 errors · `pnpm test` 37/37 · `pnpm build` success.
- **Real-Postgres e2e** (`HARD_E2E_PG` suite): 4/4 with the 6th migration included — fresh DB builds
  all 6 (templates table + RPC probed), baseline/partial scenarios still green.
- **Template RPC functional suite** (`scripts/verify_templates_rpc.mjs`, throwaway Supabase-like DB):
  21/21 — save/overwrite-by-name/update-by-id/rename; validation (empty name, 0 items, missing
  medicine, non-numeric quantity); self-scoped listing; cross-doctor edit/delete blocked ("not
  found"); patient + anonymous rejected with 42501; audit rows for save/update/delete; direct table
  read as `authenticated` denied.
- **Live pre-migration runtime verification** (`scripts/verify_premigration_s8.mjs`) 14/14 with a
  temporary doctor user (created on Cedar Medical Centre): doctor workspace renders the templates
  KPI + empty state (list RPC missing → clean degrade, no 500); save-template shows the coral notice
  naming migration 20261119200000; **prescription issuing now works end-to-end** (RX-8W14-IFSF
  issued live with 1 item, PKR 3500 cost item, audit row — all verified via service-role reads);
  `/doctor/prescriptions/new` renders the same UI; zero client errors.
- **Cleanup**: test prescription + items + cost + audit rows deleted; test doctor user deleted;
  orphaned auto-provisioned patient row (HARD-000103, the D18 trap) deleted — live DB back to its
  exact baseline (4 orgs, 1 patient HARD-000102, 2 auth users, 0 prescriptions).

**Handed to owner (blocking live template use only)**: apply
`supabase/migrations/20261119200000_doctor_prescription_templates.sql` in the Supabase SQL editor —
OR simply set `DATABASE_URL` (Session pooler, port 5432) and restart: the auto DB setup applies it
automatically and `/setup` will show it flipping from pending to applied.

---

## 2026-11-19 — Session 7: S6 migration verified live + WordPress-style Auto DB Setup (NEW FEATURE)

**Context**: Owner applied `20261119100000_cnic_unique_atomic_status.sql` ("ran the sql"), closing
P2-4 + P2-11. The session then built the owner-requested **auto database setter**: connect a new
database and the app sets it up by itself, WordPress-style; if the DB is not configured, the app
must never crash with a cryptic error — it must tell the owner exactly which env values to add.

### Part 1 — verification of the owner-applied migration (all PASS, live DB)

- `scripts/probe_s7_migration.js` 6/6: `patients.cnic` column exists; duplicate CNIC insert rejected
  by `patients_cnic_unique_idx` (23505); malformed 5-digit CNIC rejected by
  `patients_cnic_format_check`; two NULL-cnic patients coexist; `admin_set_provider_status` RPC
  exists + executes (service key reaches `assert_platform_admin()`, which correctly refuses a
  keyless actor).
- `scripts/verify_admin_ui.mjs` 21/21 with the ATOMIC RPC now live: full lifecycle
  create→edit→approve→suspend→reinstate with toasts, no-reload chip updates, DB persistence
  (suspend→'rejected'), `provider_status_change` audit rows at every step. **P2-11 closed.**
- `scripts/verify_postmigration_s7.mjs` 14/14 (NEW): front desk registers a patient WITH a 13-digit
  CNIC (HARD-000105, digits-only in DB, PKR 500 invoice, 150/350 ledger split); duplicate CNIC →
  friendly "already registered to … (HARD-xxxxxx)" error, zero rows created; directory shows the
  formatted 5-7-1 CNIC; search by CNIC digits finds the row. **P2-4 closed.**
- Cleanup script bugs found + fixed while verifying: throwaway org deletion is RESTRICTed by
  `user_roles` (delete test auth users BEFORE orgs) and every logged-in test user gets an
  auto-provisioned `patients` row (`ensurePatientRecord` on `/patient/overview`) that must be
  deleted while `user_id` still points at them. Live DB returned to its 4 orgs / 1 patient
  (HARD-000102) / 2 auth users baseline.

### Part 2 — Auto DB Setup (the WordPress-style "auto db setter")

**What it does**: point the app at ANY new (empty) Supabase project — set the 4 env values, restart
— and `instrumentation.ts` applies every pending `supabase/migrations/*.sql` automatically on boot,
inside transactions, tracked in a new `hard_setup.schema_migrations` bookkeeping table. No env / no
DATABASE_URL / wrong URL / failed migration never crashes anything: the app runs, the root layout
shows a quiet banner, and `/setup` explains exactly what is missing and how to fix it.

**New files (8)**:

1. `scripts/generate-migrations-manifest.mjs` — codegen: embeds all migration SQL into
   `lib/db/migrations-manifest.ts` (Next output tracing does not ship the migrations folder to
   Vercel, so the SQL must be an imported module). Wired into `pnpm dev`/`pnpm build` +
   `pnpm migrations:manifest`; generated file is committed.
2. `lib/db/setup-state.ts` — runtime-agnostic (edge-safe) helpers: env requirement checklist
   (names + presence only, never values), globalThis run-record cache, pooler/URL validation,
   pure planning helpers (`computeMigrationStatuses`, `shouldBaseline`).
3. `lib/db/auto-setup.ts` — the runner + read-only status check (node-only, `pg`): session advisory
   lock serializes concurrent cold starts; per-migration `BEGIN; <file sql>; INSERT version; COMMIT`;
   **baseline mode** for schemas migrated manually before auto-setup existed (the live DB's exact
   situation); friendly error translation (wrong password, unreachable host, non-Supabase DB,
   transaction pooler 6543, non-postgres URL scheme).
4. `instrumentation.ts` — Next boot hook; nodejs runtime only; NEVER throws; logs a one-line
   summary; records every outcome for `/setup` + the banner.
5. `app/setup/page.tsx` + `app/setup/actions.ts` + `app/setup/setup-runner-form.tsx` — the friendly
   setup page: env checklist with "where to find it" hints, live connection + per-migration
   applied/pending table, last-run record, "Run database setup now" button, and the
   switch-to-a-new-database recipe. `noindex`.
6. `components/setup-banner.tsx` — root-layout strip rendered ONLY when the public env is missing
   or the last setup run failed.

**Modified files (6)**:

7. `proxy.ts` + `lib/supabase/proxy.ts` — friendly guard: matcher now covers `/`, `/login`,
   `/signup` + the protected roots; missing public env redirects to `/setup` (307) instead of the
   previous `getSupabasePublicConfig()` throw → 500. Defense-in-depth copy inside
   `updateSupabaseSession`.
8. `app/layout.tsx` — renders `<SetupBanner />`.
9. `package.json` — `pg@8.13.1` dependency + `@types/pg`; manifest codegen in dev/build scripts.
10. `.env.example` — documents DATABASE_URL / AUTO_DB_SETUP / SETUP_TOKEN + the 5432-not-6543 rule.
11. `README.md` — new "Automatic database setup" section.
12. `pnpm-lock.yaml`, `lib/db/migrations-manifest.ts` (generated).

**Access rules for the manual /setup action** (verified end-to-end): correct `SETUP_TOKEN` (when
configured) OR signed-in active platform_admin OR a virgin database (nothing applied, no app
schema — the WordPress `install.php` rule; the window closes as soon as the schema exists).

**Bugs found & fixed during verification**:
- `AUTO_DB_SETUP=false` originally killed the manual runner too — the flag now gates only the boot
  hook (instrumentation), manual /setup runs always work (matches the documented semantics).
- A non-postgres `DATABASE_URL` (e.g. a sqlite-style `file:…` value) crashed inside `pg` with a
  cryptic AggregateError that escaped as an uncaughtException → 500 on /setup. Both entry points
  now validate the `postgres(ql)://` scheme first and return a clean, credential-free error.
- (test-harness only) React 19 auto-resets form inputs after each server action — verify scripts
  must wait for the reset before re-filling the token field.

**Verification performed**:
- Unit: `lib/db/auto-setup.test.ts` 16 new tests (manifest invariants, planning helpers, runner
  with fake pg pool: apply/baseline/up-to-date/pending-order/rollback+hint/env-missing/disabled/
  pooler/bad-scheme). Suite: 36 passed + 4 e2e skipped by default.
- **Real-Postgres e2e** (`lib/db/auto-setup.e2e.test.ts`, runs only with `HARD_E2E_PG` set; uses a
  locally downloaded embedded Postgres 18 + stub pgcrypto/auth/roles — recipe in the file header):
  4/4 — non-Supabase DB fails with the Supabase hint; fresh DB builds from scratch (15 tables, RPCs,
  RLS on patients, 5 versions, idempotent second run); hand-migrated DB is baselined without
  re-running DDL; partially-migrated DB applies exactly the 2 pending.
- **Real Next.js boot e2e**: dev server started with `DATABASE_URL` → empty stubbed DB →
  instrumentation applied all 5 migrations in 73 ms; `/setup` shows 5/5 applied + "Nothing to do".
- **Manual install flow** (`scripts/verify_setup_manual.mjs`) 6/6: virgin DB shows the open button,
  click applies all 5, page flips to up-to-date, button hidden.
- **Token gate** (`scripts/verify_setup_token.mjs`) 6/6: installed DB shows the token field; no
  token → denied; wrong token → denied; correct token → applies exactly the 2 pending.
- **No-env boot** (all Supabase vars + DATABASE_URL unset): `/`, `/login`, `/signup`,
  `/admin/overview` → 307 `/setup`; `/demo` → 200 with the amber "Setup needed" banner; `/setup`
  200 listing exactly which values to add; boot log = one friendly line.
- **Bad-URL boot** (`file:…`): server stays up, /setup 200 with the clean scheme error.
- **Regression**: `verify_admin_ui.mjs` 21/21 again with the new proxy/layout/instrumentation
  active; test data cleaned; live DB at baseline.
- Gates: `pnpm typecheck` 0 errors · `pnpm test` 36/36 · `pnpm build` success (`/setup` route
  registered, Proxy active).

**Note for the owner**: the sandbox/global shell exports a sqlite-style `DATABASE_URL=file:…`
which the app now rejects cleanly. On your machine/Vercel simply leave DATABASE_URL unset until
you want auto-setup, then paste the Supabase **Session pooler** string (port 5432).

---

## 2026-11-19 — Session 6: P2-4 CNIC uniqueness + P2-11 atomic status RPC (code complete, DDL pending)

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
| hard_phase2_part13_deploy_auth.zip (incl. .git history, session 13 commit 0adda05; .env.local EXCLUDED) | 2026-11-21 | https://tempfile.org/F4AMa4NhbAU/ | +48h |
| hard_phase2_part9_repeat.zip (incl. .git history, commit 19c0dc5; .env.local EXCLUDED) | 2026-11-20 | https://tempfile.org/hckkZPYQBFM/ | +48h |
| hard_phase2_part8_templates.zip (incl. .git history, commit 70d14fb; .env.local EXCLUDED) | 2026-11-20 | https://tempfile.org/W6hnqZvKy5J/ | +48h |
| hard_phase2_part7_autodbsetup.zip (incl. .git history, session 7 commit 7fb7972; .env.local EXCLUDED) | 2026-11-19 | https://tempfile.org/mPaV3rMuU4J/ | +48h |
| hard_phase2_part6_cnic_atomic.zip (incl. .git history, session 6 commit; .env.local EXCLUDED) | 2026-11-19 | https://tempfile.org/HR4ifvgD5ym/ | +48h |
| hard_phase2_part5_verified.zip (incl. .git history, commit 197a452; .env.local EXCLUDED) | 2026-11-19 | https://tempfile.org/841DVfgLHLj/ | +48h |
| hard_phase2_part4_envcheck.zip (incl. .git history, commit 1082cff; .env.local EXCLUDED) | 2026-11-19 | https://tempfile.org/k3TZi6t1QrD/ | +48h |
| hard_phase2_part3_docs.zip | 2026-11-19 | https://tempfile.org/yKT7E9W8CEx/ | +48h |
| hard_phase2_part3.zip (incl. .git history, commit f3683e3) | 2026-11-19 | https://tempfile.org/de89D4X2uRm/ | +48h |
