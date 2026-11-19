# H.A.R.D: Developer Brief v2 (Prototype)
**Healthcare Accounting & Record Keeping Database**
Owner: Asees Mehtab (25SP-004-BA) · FinTech Expo Fall 2026 · Updated 2 November 2026

> How to use: paste this into your AI coding tool or give it to a developer. Build in the order in Section 19. Anything marked **[ASSUMPTION]** is a default chosen where the owner has not decided; change freely. Fake data only, always.

---

## 0. What changed since v1

- Providers now **write prescriptions, lab reports and receipts digitally inside H.A.R.D** (no scanning needed for provider documents).
- **Every prescription has a unique ID and QR code.** Pharmacies get **access to that one prescription only**, never the patient's record, and cannot search patients. (v1 let pharmacists search patients; that is removed.)
- Pharmacies **keep their own billing software**; they attach the final bill to the prescription.
- Labs keep sending a WhatsApp message, now with a **link to the verified report**; each report carries a verification QR.
- **AI document reading** is for older or outside documents (PDF/photo) added by patients; it extracts data but does **not** prove authenticity.
- **Doctors get patient history** and fast prescription tools (templates, medicine search).
- **CNIC is the patient identifier** (aligned with the government One Patient One ID idea).
- Prototype scope is cut to **four core screens**.

---

## 1. What we are building

A web platform (plus a mobile-friendly patient view) where:

- **Providers** (doctors, clinics, hospitals, labs, pharmacies) issue verified digital prescriptions, reports and bills.
- **Patients** see one timeline of everything plus a **live expense dashboard**, and control who can see their record.
- **Pharmacies** verify a prescription by scanning its QR and see only that prescription.
- **The platform** earns from a yearly storage subscription; providers earn a **revenue share** on fees they collect.

**One-line pitch:** H.A.R.D makes every prescription legible, verifiable and tracked, and every healthcare cost visible.

**Pitch angle:** a FinTech product. Cost tracking, billing, subscription and revenue split come first; records are the supporting feature.

### Problems it solves
1. Healthcare costs are invisible to patients.
2. Handwritten prescriptions are hard to read (wrong medicine risk).
3. Paper prescriptions are easy to forge (letterhead and stamp are the only checks today).
4. Lab reports are scattered across WhatsApp chats and cannot be verified.

---

## 2. Prototype goal and core loop

A working demo of this loop in 5-7 minutes:

1. Front desk registers a patient (CNIC → Health ID), fee collected, **revenue split posts**.
2. Doctor writes a **digital prescription**; a unique **QR** is generated; a cost entry is created.
3. Pharmacist **scans the QR**, sees only that prescription, dispenses, **attaches the bill**.
4. Patient's **live dashboard** shows the prescription, the bill and spending by category, tagged Verified.
5. (Extra) Lab issues a report with verification QR; patient also uploads an old report and **AI reads it** into the record.
6. (Extra) Storage fills, upgrade invoice paid at the desk, split recalculated.

---

## 3. Roles and accounts

| Role | Who | Purpose |
|---|---|---|
| **Patient** | Individual (CNIC-based) | Owns record, views history and live spending, adds self-reported items, manages provider access |
| **Provider org** | Hospital, clinic, lab, pharmacy | Registered and verified organization with staff users |
| **Doctor** | Provider staff | Writes visits and prescriptions, sees history of linked patients |
| **Front desk** | Provider staff | Registers patients, collects fees and outstanding invoices |
| **Lab tech** | Provider staff | Issues test reports |
| **Pharmacist** | Provider staff | Scans prescription QR, dispenses, attaches bill |
| **Provider admin** | Provider staff | Manages staff and sees earnings |
| **Platform admin** | H.A.R.D team | Verifies providers, manages plans/fees/split, audits; no medical content access |
| **Court** (later) | Court officer | Full record only with approved order, time-limited |
| **Sponsor** (stretch) | Government/NGO | Funds subscriptions, anonymized usage |

Auth: email + password for the prototype; role-based redirects. Include a demo-only **role switcher** **[ASSUMPTION]**.

---

## 4. Permission matrix

R = read, C = create, U = update, — = no access

| Data | Patient | Doctor (linked) | Lab (linked) | **Pharmacy** | Court (approved) | Platform admin |
|---|---|---|---|---|---|---|
| Basic info | R/U (own) | R | R (name, ID) | **—** (first name + age range only, on a scanned prescription) | R | Metadata only |
| History, visits, diagnoses | R | R/C | — | **—** | R | — |
| Prescriptions | R | R/C | — | **Only the one scanned prescription**: R + mark dispensed | R | — |
| Lab reports | R/C (self-reported) | R | R/C | **—** | R | — |
| Costs / bills | R | R (own provider's) | R/C (own) | C (own bill on that prescription) | R | Aggregates only |
| Sensitive-flagged items | R | Treating doctor only | — | — | R | — |
| Subscription / invoices | R/pay | — | — | — | — | R/U |
| Access log | R | — | — | — | — | R |

Rules:
- A provider sees a patient only with an **active link** (created at registration, or approved by the patient via OTP).
- **Pharmacies have no patient search, no Health ID visibility, no history.** They reach data only through a prescription token or code.
- Every non-patient read and write is written to the **audit log**.
- Platform admin never reads clinical content.

---

## 5. Core workflows

### 5.1 Provider onboarding
1. Provider registers (name, type, license number, address, contact, document upload). Status **Pending**.
2. Platform admin approves or rejects with a note. Approved providers create staff users and assign sub-roles.

### 5.2 Patient registration (front desk)
1. Search by **CNIC** or phone to prevent duplicates (CNIC unique).
2. If none: create patient (name, DOB, gender, CNIC, phone, blood group, height, weight, emergency contact).
3. Generate **Health ID** (e.g. `HARD-000123`) and create the **registration invoice**.
4. Front desk marks the invoice paid (cash/card/wallet, mocked). **Revenue split** posts to platform and provider ledgers.
5. Patient receives login credentials (SMS/email simulated).
6. CNIC check is a **desk check** against the physical card **[ASSUMPTION]**; mark `identity_check = desk_checked`. NADRA verification is a production item.

### 5.3 Returning patient
1. Provider searches by CNIC or Health ID. If no link exists, request one: patient approves in the app, or provider confirms at the desk with an **OTP sent to the patient** (simulated).
2. Provider adds new visits to the same record. No duplicate record.

### 5.4 Doctor visit and digital prescription
1. Doctor opens the linked patient and sees **history** (visits, prescriptions, reports, allergies).
2. Creates a visit: complaint, diagnosis, vitals, notes, optional sensitive flag.
3. Adds prescription items using **medicine search** and **saved templates**: medicine, strength, dose, frequency, duration, quantity.
4. On **Issue**, the system generates the prescription ID, QR, short code, a printable PDF (with QR), and notifies the patient.
5. Consultation cost is added as a cost item (or by front desk).
6. Everything is tagged **Verified** with provider, doctor and timestamp.

### 5.5 Pharmacy: scan and dispense
1. Pharmacist scans the QR (or types the short code). The system returns **only that prescription**.
2. Pharmacy sees: verified doctor and clinic, date, medicines, quantities, status, fills remaining, patient first name and age range **[ASSUMPTION, open decision]**.
3. Pharmacist dispenses all or some items. An **OTP is sent to the patient's phone** and entered by the patient at the counter (simulated).
4. Pharmacist enters or attaches the **bill** from their own software (bill number, line items, total; PDF upload optional). Cost items are created and linked to the prescription.
5. Prescription status updates: partly filled / dispensed. The patient is notified.

### 5.6 Lab report
1. Lab tech creates a report for a linked patient: test type, date, structured values (for blood tests), notes, optional PDF/image upload.
2. System generates a **verification QR and link** and attaches it to the report.
3. Patient is notified (simulated WhatsApp/SMS message containing the link). Cost item created.
4. Anyone (patient, doctor, insurer later) can scan the QR to confirm the report is genuine and unchanged.

### 5.7 Patient self-service and AI reading
1. Patient sees timeline, spending, storage meter, linked providers, access log.
2. Patient uploads an older PDF/photo (for example a WhatsApp report or bill). **AI extraction** returns structured fields; the patient reviews, edits and confirms. Saved as **AI-read, patient-confirmed** (see Section 12).
3. Patient can add manual expenses (tagged Self-reported) and revoke provider links.

### 5.8 Storage and billing
1. Each patient has a storage plan (quota from config). At **80%** alert patient and linked providers; at **100%** block new uploads (reading stays allowed).
2. Upgrade invoice can be paid by the patient (mock) or by a provider at the desk. Payment triggers the **revenue split**.
3. Yearly renewal creates an invoice on the anniversary. **Unpaid renewal never blocks access**; it becomes an **outstanding invoice** shown to the front desk at the next visit.

### 5.9 Court access (later phase)
Court submits a request with a case number and order document → platform admin verifies → time-limited read-only access (default 30 days) → patient notified → all views logged.

### 5.10 Emergency access **[ASSUMPTION]**
A doctor can override for an unlinked patient with a reason; access expires in 24 hours; logged; patient notified.

---

## 6. Prescription QR specification

- **Prescription ID:** UUID plus a human-readable code (e.g. `RX-7F3K-92QD`).
- **QR content:** a URL with a **signed, expiring token** (for example HMAC or JWT) that resolves only to the prescription ID. **No Health ID, CNIC, name or medical data in the QR.**
- **Short code:** 10-character alphanumeric fallback for patients without smartphones; typed into the pharmacy screen. **Rate-limit** lookups and lock after repeated wrong codes.
- **Delivery:** in the patient app, as printable PDF, and by SMS (simulated).
- **Validity:** `expires_at` (default 30 days) and `max_fills` (default 1). **[ASSUMPTION]**
- **Status:** `active`, `partly_filled`, `dispensed`, `expired`, `cancelled`.
- **Amendments:** editing an issued prescription creates a **new version** and cancels the old QR; the old record is kept.
- **Dispensing control:** patient OTP required to mark dispensed; each fill is recorded with pharmacy, pharmacist, time and items.
- **Pharmacy endpoint scope:** `GET /rx/resolve?token=…` returns the minimal view in Section 5.5 and nothing else. A pharmacy token cannot call any other patient endpoint.
- Every resolve and dispense is logged and visible to the patient.

---

## 7. Features by module

### 7.1 Patient record
- Basic info: blood group, age (from DOB), height, weight, BMI (computed).
- Medical history entries: conditions, allergies, surgeries, family history (dated).
- Visits and diagnoses; prescriptions (with items and fills); lab reports (structured values + file); imaging files (CT/MRI as uploaded files).
- **Verified / AI-read / Self-reported** badge on every item. Tags are system-set and not editable.
- Combined timeline with filters (type, date range, provider) and keyword search.
- Sensitive flag per item (visible to patient, treating doctor, court).

### 7.2 Doctor tools
- **Patient history view** on opening a patient (recent visits, active prescriptions, allergies, latest reports).
- **Medicine search** over a seeded drug list (generic and brand names) **[prototype: ~100 seeded items]**.
- **Prescription templates** (saved sets of common prescriptions) and repeat-last-prescription.
- Keep issuing a prescription under about 30 seconds; this is the adoption lever.

### 7.3 Cost tracking (the FinTech core)
- Cost item: amount, currency (PKR), category (Consultation, Test, Medicine, Procedure, Admission, Other), linked prescription/report/visit, provider, date, payment status, `covered_amount` (optional insurance field, default 0), source.
- Costs are created **automatically** from issued documents and attached bills.
- Live dashboard: totals (month/year/all time), by category, by provider, trend, biggest expenses, average per visit. Updates without manual refresh (realtime or polling).
- Monthly budget with alerts at 80% and 100%.
- CSV/PDF statement export.

### 7.3b Provider cost view (managerial accounting) **[should have]**
- Per provider: cost and revenue per visit, per test type, per medicine; monthly totals; top items. Simple tables and charts.

### 7.4 Billing and subscription
- Plans from config: **Base**, **Plus**, **Pro** (quota and yearly price).
- Invoices: registration, renewal, upgrade, outstanding. Mock payment with method and receipt number.
- Yearly renewal job; storage meter from file sizes.

### 7.5 Revenue split and ledgers
- On each paid invoice collected by a provider, split by `provider_share_percent` (config). Create platform and provider ledger entries that **sum to the invoice amount**.
- Provider earnings ledger with running balance and payout status (Pending/Settled, set manually by admin).

### 7.6 Access, consent and audit
- Provider-patient links (active/revoked), OTP confirmation, immutable **audit log**, patient-visible access log.
- Distinct log types: normal read, pharmacy resolve, emergency override, court access.

### 7.7 Notifications (in-app plus simulated SMS/WhatsApp)
New prescription, report ready (with link), dispensed, new bill, outstanding invoice, storage 80%/100%, budget alerts, provider link request, access events.

---

## 8. Dashboards and panels

### 8.1 Patient dashboard (mobile-first)
- Header: name, Health ID, storage meter.
- Cards: spent this month, this year, budget remaining.
- Charts: category donut, monthly trend line, provider bars.
- Recent activity feed; active prescriptions with QR button; alerts (outstanding invoice, storage).
- Tabs: Overview · Timeline · Prescriptions · Reports · Expenses · Providers & Access · Billing · Settings.

### 8.2 Doctor panel
- Today's patients, search by CNIC/Health ID, patient history view, New visit / New prescription, templates, recent prescriptions.

### 8.3 Front desk panel
- Register patient, search, collect fee, outstanding invoices, daily collections.

### 8.4 Lab panel
- New report, pending orders, recent reports, verification status.

### 8.5 Pharmacy panel
- **Scan / enter code** (the only way in), prescription result view, dispense with OTP, attach bill, today's dispensed list. **No patient list, no search.**

### 8.6 Provider admin dashboard
- KPI cards: patients registered, documents issued, fees collected, provider share earned (pending/settled), outstanding invoices; staff management; earnings ledger.

### 8.7 Platform admin panel
- KPIs: providers (pending/approved), patients, documents, storage used, revenue, platform share.
- Queues: provider approvals (court approvals later).
- Config: fees, plans, quotas, provider share percent, prescription validity and fills, alert thresholds.
- Finance: ledgers, invoices, payouts. Audit log search; pharmacy resolve and emergency reports.

### 8.8 Court panel and Sponsor dashboard (later / stretch)
Court: request form, status list, read-only record viewer with logged-access banner. Sponsor: funded patients, subscriptions paid, anonymized usage.

---

## 9. Screen list and UI guidance

**Prototype core screens (build these first and polish them):**
1. **Front desk: register patient** (multi-step form, CNIC check, fee collection, split confirmation)
2. **Doctor: issue prescription** (history sidebar, medicine search, templates, QR result)
3. **Pharmacy: scan and dispense** (scan/enter code, minimal prescription view, OTP, attach bill)
4. **Patient: expense dashboard and timeline** (live spending, prescription with QR, Verified badges)

**Next screens:** lab report issue and verify page; patient AI upload and review; patient billing and storage; provider earnings ledger; admin approvals and config; audit log.

**UI guidance**
- Calm, trustworthy healthcare/fintech look: blue/teal primary, white surfaces; green Verified, amber pending, red alert.
- Mobile-first for patient and pharmacy scan; desktop-first for doctor, front desk, admin.
- Always show the badge (Verified / AI-read / Self-reported) next to clinical items.
- Money as `PKR 12,500`. Loading skeletons and empty states on every list. Large touch targets on the scan screen.
- Visible **Demo / Prototype** banner. Optional Urdu labels as a stretch.

---

## 10. Data model

- **users**: id, email, password_hash, role, provider_id?, status
- **patients**: id, health_id, user_id, full_name, dob, gender, cnic (unique), phone, blood_group, height_cm, weight_kg, emergency_contact, identity_check (desk_checked/unchecked), created_by_provider_id
- **providers**: id, name, type (hospital/clinic/lab/pharmacy), license_no, address, contact, status, verified_at
- **provider_staff**: id, user_id, provider_id, sub_role (admin/doctor/front_desk/lab_tech/pharmacist)
- **provider_patient_links**: id, provider_id, patient_id, status, confirmed_via (registration/otp/patient_app), created_at
- **medical_history_entries**: id, patient_id, type, description, date, source, provider_id?
- **visits**: id, patient_id, provider_id, doctor_id, date, complaint, diagnosis, notes, vitals (json), is_sensitive
- **prescriptions**: id, code, visit_id, patient_id, doctor_id, provider_id, version, status, issued_at, expires_at, max_fills, qr_token_hash, short_code_hash, supersedes_id?
- **prescription_items**: id, prescription_id, medicine_id?, medicine_name, strength, dose, frequency, duration, quantity
- **prescription_fills**: id, prescription_id, pharmacy_provider_id, pharmacist_id, filled_at, otp_verified, items (json: item_id, quantity)
- **bills**: id, prescription_id?, provider_id, patient_id, bill_number, line_items (json), total, file_id?, created_at
- **medicines** (seed list): id, generic_name, brand_name, strength, form
- **prescription_templates**: id, doctor_id, name, items (json)
- **lab_reports**: id, patient_id, provider_id, test_type, reported_at, result_values (json), notes, file_id?, verify_token_hash, source
- **files**: id, patient_id, linked_entity_type, linked_entity_id, filename, mime_type, size_bytes, storage_path, source
- **document_ingestions** (AI): id, patient_id, file_id, extracted (json), confidence, status (pending/confirmed/rejected), confirmed_at
- **cost_items**: id, patient_id, provider_id?, linked_entity_type, linked_entity_id, category, amount, covered_amount, currency, date, payment_status, source
- **storage_plans**: id, name, quota_mb, yearly_price
- **subscriptions**: id, patient_id, plan_id, start_date, renewal_date, status
- **invoices**: id, patient_id, type (registration/renewal/upgrade/outstanding), amount, status, collected_by_provider_id?, paid_at, method, receipt_no
- **revenue_splits**: id, invoice_id, provider_id, provider_amount, platform_amount, percentage_used
- **ledger_entries**: id, owner_type (platform/provider), owner_id, invoice_id, amount, balance_after, payout_status
- **court_requests** (later): id, court_user_id, patient_id, case_number, order_file_id, reason, requested_days, status, approved_by, approved_at, expires_at
- **emergency_accesses**: id, doctor_id, patient_id, reason, started_at, expires_at
- **access_logs**: id, user_id?, role, patient_id, action, entity_type, entity_id, reason?, created_at
- **notifications**: id, user_id, type, message, link?, read_at, created_at
- **budgets**: id, patient_id, monthly_amount
- **config**: key, value

---

## 11. Business rules

1. Fees, plan prices, quotas, provider share, prescription validity and fill count live in **config**, never hard-coded.
2. Provider-issued data is auto-tagged **Verified**; AI-extracted data is **AI-read (patient-confirmed)**; patient entries are **Self-reported**. Users cannot change tags.
3. Issued records are **never deleted**. Corrections are new versions or correction entries referencing the original.
4. Every paid invoice collected by a provider creates one revenue split and two ledger entries that sum to the invoice amount.
5. Unpaid renewal never blocks reading; only uploads over quota are blocked.
6. **Pharmacy tokens grant access to one prescription only.** Expired, cancelled or fully dispensed prescriptions return a clear status and no medicine details beyond status.
7. A prescription cannot be dispensed beyond `max_fills` or after `expires_at`; dispensing requires the patient OTP.
8. Sensitive-flagged items are hidden from everyone except the patient, the treating doctor and (later) court.
9. Every non-patient read writes an access log entry.
10. CNIC is unique per patient.
11. Costs are created from issued documents and bills automatically; manual patient costs are Self-reported.

---

## 12. AI document reading (patient uploads)

**Purpose:** help patients add older or outside paper and WhatsApp documents. **It extracts; it does not verify.**

- Input: PDF or image of a lab report, prescription or receipt/bill.
- Call a vision-capable AI API **server-side only**; never expose keys in the browser. Prototype: fake documents only, or a mocked response.
- Output schema (JSON): `document_type`, `date`, `provider_name`, `items[]` (name, quantity, amount, value, unit), `total`, `confidence`, `warnings[]`.
- Flow: upload → extraction → **review screen** (patient edits and confirms) → saved as **AI-read, patient-confirmed**, original file attached.
- Add sanity checks: totals add up, duplicate document detection (same provider, date and total), low-confidence flags.
- **CNIC images:** not used for authenticity. Identity is a desk check in the prototype; NADRA Verisys (via a licensed partner) is a production item. If CNIC photos are ever processed, extract the fields and delete the image **[ASSUMPTION]**.
- Handwritten and Urdu documents will have errors, which is why confirmation is mandatory.

---

## 13. Lab report delivery and WhatsApp **[prototype: simulated]**

- Labs keep their habit of messaging the patient. The message now contains the **verified link** and the report carries a verification QR.
- Prototype: show a simulated message preview in the lab panel and patient notifications. A real WhatsApp Business integration is a later phase.
- The verification page shows: issuing lab, date, test, "genuine and unchanged" status, and a hash of the report.

---

## 14. Suggested API surface (sketch)

- `POST /auth/login`
- `POST /providers/register`, `POST /admin/providers/:id/approve`
- `GET /patients/search?cnic=`, `POST /patients` (front desk)
- `POST /patients/:id/links/request`, `POST /links/:id/confirm-otp`
- `POST /visits`, `POST /prescriptions` (issue), `POST /prescriptions/:id/amend`
- `GET /rx/resolve?token=` or `?code=` (pharmacy, minimal view), `POST /rx/:id/dispense` (with OTP), `POST /rx/:id/bill`
- `POST /lab-reports`, `GET /verify/lab/:token` (public verification page)
- `POST /ingestions` (AI upload), `POST /ingestions/:id/confirm`
- `GET /me/timeline`, `GET /me/expenses`, `POST /me/expenses`, `GET /me/access-log`
- `POST /invoices/:id/pay`, `GET /providers/me/ledger`
- `GET /admin/config`, `PUT /admin/config`, `GET /admin/audit`

---

## 15. Tech stack (any equivalent is fine)

- **Frontend:** Next.js (React), Tailwind CSS, shadcn/ui, Recharts; QR generation and scanning (for example `qrcode` and a browser camera scanner library).
- **Backend / DB:** Supabase (Postgres, auth, storage, row-level security, realtime) or Node/Express + PostgreSQL + Prisma.
- **Access control:** row-level security matching Section 4; pharmacy access only through the resolve endpoint (server-side function).
- **Files:** private bucket with signed, expiring URLs.
- **Realtime:** Supabase realtime or polling for the live dashboard.
- **Payments:** mocked ("mark as paid").
- **Hosting:** Vercel.
- **Shortcut:** if time is short, use a seeded database with fake auth and build the four core screens first.

---

## 16. Security and privacy (even for a prototype)

- Fake data only; visible Demo banner. Passwords hashed; role checks on the **server**.
- Signed, expiring file URLs; no public links. Append-only audit log.
- Rate-limit prescription resolve and short-code attempts; lock after repeated failures.
- QR tokens signed and expiring; stored hashed; contain no personal data.
- HTTPS in transit. Document that production needs encryption at rest, local hosting and a legal review. Pakistan has no enacted comprehensive data-protection law yet; the draft bill treats health data and CNIC as sensitive, so design to that standard (consent, logs, minimal data per role).
- Patients are notified of pharmacy resolves, emergency access and court access.

---

## 17. Seed data and demo script

**Seed:** 1 platform admin; providers: 1 hospital/clinic (with doctor, front desk), 1 lab, 1 pharmacy (with staff); 5 patients with 6-12 months of history, prescriptions, reports and costs (Verified and Self-reported mix); ~100 medicines; 1 patient near the storage limit; 1 patient with an outstanding renewal invoice; 1 pending provider application.

**Demo flow (5-7 min):**
1. Front desk registers a new patient and the revenue split posts.
2. Doctor opens the patient history, issues a prescription from a template; the QR appears.
3. Switch to the pharmacy: scan the QR; only that prescription is visible; dispense with OTP; attach the bill.
4. Switch to the patient: the dashboard shows the prescription, bill and updated spending, with Verified badges.
5. Lab issues a report; patient uploads an old report and AI reads it (AI-read badge).
6. Storage upgrade paid at the desk; provider ledger shows the split.
7. Admin dashboard: revenue, ledger and audit log, including the pharmacy resolve entry.

---

## 18. Prototype scope

**Must have:** roles and login; provider onboarding and approval; patient registration with Health ID and CNIC uniqueness; doctor visit and digital prescription with history view; **prescription QR with pharmacy scan, minimal view, OTP dispensing and bill attach**; automatic cost entries; patient live expense dashboard and timeline; verified/AI-read/self-reported badges; invoices with mock payment and revenue split with ledgers; audit and access log.

**Should have:** lab report issue with verification page; AI document reading for patient uploads; storage meter and upgrade; budget alerts; prescription templates and medicine search; provider cost view; CSV/PDF statement.

**Could have:** emergency override; court request and approval; sponsor dashboard; Urdu labels; simulated WhatsApp message preview.

**Out of scope:** real payment gateway, real SMS/WhatsApp, NADRA verification, DICOM viewer, insurance claim processing, integration with real pharmacy or lab software, production compliance.

---

## 19. Build order

1. **Foundation:** setup, schema, auth, roles, seed data, role-based layouts.
2. **Onboarding and registration:** provider approval, patient registration, Health ID, links.
3. **Prescriptions:** history view, medicine search, templates, issue, QR and short code, printable PDF.
4. **Pharmacy flow:** resolve endpoint with minimal view, OTP dispensing, bill attach, status updates.
5. **Costs and dashboards:** automatic cost entries, patient dashboard (live), timeline, badges.
6. **Billing:** plans, invoices, mock payment, revenue split, ledgers, storage meter.
7. **Reports and AI:** lab report issue and verification page, patient AI upload and review.
8. **Polish and extras:** admin config and audit, notifications, empty states, demo banner, export; then stretch items.

---

## 20. Acceptance criteria

- A duplicate CNIC is rejected; a new patient gets a Health ID and the registration fee creates exactly one revenue split with two ledger entries equal to the invoice amount.
- A doctor sees a linked patient's history; an unlinked patient cannot be opened without link approval or emergency override.
- Issuing a prescription generates a unique ID, QR, short code and printable PDF, and notifies the patient.
- The QR payload contains no personal or medical data.
- A pharmacy can resolve a prescription only by token or code and sees **only** that prescription (doctor, clinic, medicines, quantities, status, minimal patient identifier); it has **no way** to search patients or view any other record.
- Dispensing requires the patient OTP; an expired, cancelled or fully dispensed prescription cannot be dispensed.
- Attaching a bill creates cost items linked to the prescription, and the patient's dashboard updates without manual refresh.
- Amending a prescription cancels the old QR and issues a new version; the old record remains.
- A lab report has a verification page that confirms it is genuine.
- AI-read items are always shown as **AI-read, patient-confirmed** and require confirmation before saving.
- A patient at 100% storage cannot upload but can read everything; an unpaid renewal never blocks reading and shows as outstanding at the desk.
- Every pharmacy resolve, doctor read and other non-patient read appears in the patient's access log.
- Sensitive-flagged items are invisible to pharmacies and non-treating providers.

---

## 21. Open decisions (defaults used above)

| Decision | Default in this brief |
|---|---|
| Patient detail shown to pharmacy | First name + age range |
| Consent for provider access | Link at registration or OTP approval; patient can revoke; emergency override logged |
| Sensitive records | Flag per item; treating doctor only |
| Insurance | Optional `covered_amount`; claim-ready export is a later phase |
| Government | Optional sponsor dashboard (stretch) |
| Pricing unit | Storage plans for now; test value-based pricing in interviews |
| Prescription validity and fills | 30 days, 1 fill |
| Storage at 100% | Block uploads only |
| CNIC verification | Desk check now; NADRA via a licensed partner in production |
| Compliance | Documented as a production requirement |

---

## 22. Config defaults (proposals, not validated)

- `registration_fee` = PKR 500 (includes year 1, 1 GB)
- `renewal_fee` = PKR 400 per year
- `plus_plan` = 5 GB at PKR 1,000 per year; `pro_plan` = 20 GB at PKR 2,500 per year
- `provider_share_percent` = 30 (registration and upgrades)
- `storage_alert_percent` = 80
- `prescription_valid_days` = 30; `prescription_max_fills` = 1
- `court_access_days` = 30; `emergency_access_hours` = 24

Reference numbers for the pitch model: storage about PKR 70 per GB per year; fixed infrastructure about PKR 83,000 per year; break-even about 300 patients at these settings.
