"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Check, FileClock, Link2, Plus, Search, UserPlus, UsersRound, WalletCards } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { pkr, dateLabel } from "@/lib/domain";
import type { FrontDeskCollectionRow, RealPatientSummary } from "@/lib/provider/types";
import { formatPakistaniPhone, validatePatientRegistration } from "@/lib/provider/patient-validation";
import { registerRealPatient } from "@/lib/provider/actions";

type FieldErrors = Partial<Record<"fullName" | "cnic" | "phone" | "email" | "dob", string>>;

/**
 * Owner feedback 2026-11-21:
 *  1. the overview tab strip ("Patient Directory / Register New Patient /
 *     Daily Collections & Ledger") changed NOTHING — it was local state, while
 *     the sidebar actually navigated. The strip is now real navigation links.
 *  2. the registration form accepted any input ("30 numbers" as a phone).
 *     Both the client form and the server action now run the SAME shared
 *     validation (lib/provider/patient-validation.ts).
 *  3. no email field — the desk can now record the patient's email; when that
 *     person signs up with the same email, the portal CLAIMS this registration
 *     (one Health ID, receipts and history preserved).
 *  4. the collections page invented rows (patient count × fee, hard-coded
 *     PKR 500/150/350). It now lists REAL invoices with their ledger splits.
 */
export function RealFrontDeskPanel({
  patients: initialPatients,
  collections = [],
  config,
  section = "Overview",
}: {
  patients: RealPatientSummary[];
  /** Real invoices with ledger splits (listFrontDeskCollections). */
  collections?: FrontDeskCollectionRow[];
  /** P2-8 (brief Rule 1): live fee + share percentages from the config table. */
  config?: { registrationFee: number; providerSharePercent: number };
  section?: string;
}) {
  const regFee = Math.max(0, Math.round(config?.registrationFee ?? 500));
  const providerSharePct = Math.min(100, Math.max(0, Math.round(config?.providerSharePercent ?? 30)));
  const platformSharePct = 100 - providerSharePct;
  const providerSharePkr = Math.round((regFee * providerSharePct) / 100);
  const platformSharePkr = regFee - providerSharePkr;

  const [patients, setPatients] = useState(initialPatients);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [result, setResult] = useState<{ healthId: string; fullName: string; receiptNo: string; email: string | null } | null>(null);

  // Registration form
  const [fullName, setFullName] = useState("");
  const [cnic, setCnic] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Female");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("cash");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    const qDigits = search.replace(/[^0-9]/g, "");
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.healthId.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        // CNIC / phone search: digits-only match so "35202" or a full
        // "35202-1234567-1" both find the patient regardless of formatting.
        (qDigits.length >= 3 && (!!p.cnic && p.cnic.includes(qDigits) || !!p.phone && p.phone.includes(qDigits)))
    );
  }, [patients, search]);

  const linkedCount = patients.filter((p) => p.hasAccount).length;

  const handleRegister = async () => {
    setServerError("");
    // Same shared rules as the server action — instant per-field feedback.
    const validated = validatePatientRegistration({ fullName, cnic, phone, email, dob });
    if (!validated.ok) {
      setFieldErrors({ [validated.field]: validated.error } as FieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await registerRealPatient({
        fullName: validated.value.fullName,
        cnic: validated.value.cnic,
        phone: validated.value.phone,
        email: validated.value.email ?? undefined,
        dob: validated.value.dob ?? undefined,
        gender,
        bloodGroup,
        paymentMethod,
      });

      setResult({
        healthId: res.patient.healthId,
        fullName: res.patient.fullName,
        receiptNo: res.receiptNo,
        email: validated.value.email,
      });

      setPatients((prev) => [
        {
          id: res.patient.id,
          healthId: res.patient.healthId,
          fullName: res.patient.fullName,
          cnic: validated.value.cnic,
          dob: validated.value.dob,
          bloodGroup,
          phone: validated.value.phone,
          email: validated.value.email,
          hasAccount: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      // Clear form
      setFullName("");
      setCnic("");
      setPhone("");
      setEmail("");
      setDob("");
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to register patient");
    } finally {
      setSubmitting(false);
    }
  };

  const navTabs = [
    { key: "overview", label: "Overview", href: "/front-desk/overview", icon: UsersRound },
    { key: "directory", label: `Patient Directory (${patients.length})`, href: "/front-desk/patients", icon: UsersRound },
    { key: "register", label: "Register New Patient", href: "/front-desk/patients/new", icon: UserPlus },
    { key: "collections", label: "Daily Collections & Ledger", href: "/front-desk/collections", icon: WalletCards },
  ];
  const activeTab =
    section === "Register patient" ? "register" : section === "Patient directory" ? "directory" : section === "Daily collections" ? "collections" : "overview";

  const totalCollected = collections.reduce((sum, c) => sum + c.amount, 0);
  const totalProviderShare = collections.reduce((sum, c) => sum + (c.providerShare ?? 0), 0);
  const totalPlatformShare = collections.reduce((sum, c) => sum + (c.platformShare ?? 0), 0);
  const collectedToday = collections
    .filter((c) => new Date(c.date).toDateString() === new Date().toDateString())
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-label"><UsersRound size={15} /> Registered patients</div>
          <div className="kpi-value">{patients.length}</div>
          <div className="kpi-foot">{linkedCount} with a linked portal account</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><WalletCards size={15} /> Collected today</div>
          <div className="kpi-value">{pkr(collectedToday)}</div>
          <div className="kpi-foot">{collections.length} receipts on record</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><BadgeCheck size={15} /> Provider share</div>
          <div className="kpi-value">{providerSharePct}%</div>
          <div className="kpi-foot">{pkr(totalProviderShare)} earned from receipts</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><FileClock size={15} /> Platform share</div>
          <div className="kpi-value">{platformSharePct}%</div>
          <div className="kpi-foot">{pkr(totalPlatformShare)} reconciled to ledger</div>
        </div>
      </div>

      {/* Real navigation — the sidebar and this strip now move the SAME pages
          (owner feedback: the old strip flipped local state and the URL never changed). */}
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2" role="tablist" aria-label="Front desk pages">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <a
              key={tab.key}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition no-underline ${
                active ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={13} /> {tab.label}
            </a>
          );
        })}
      </div>

      {section === "Daily collections" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Front desk collections &amp; revenue split</h2>
              <div className="card-caption">Real invoices from the database · {providerSharePct}% provider share, {platformSharePct}% platform share posted to ledger</div>
            </div>
            <Badge type="verified">Balanced</Badge>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Total Collected</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1">{pkr(totalCollected)}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">{collections.length} receipts</div>
              </div>
              <div className="rounded-xl bg-emerald-50/60 p-4 border border-emerald-100">
                <div className="text-[10px] text-emerald-800 font-bold uppercase">Provider Earnings ({providerSharePct}%)</div>
                <div className="text-xl font-extrabold text-emerald-800 mt-1">{pkr(totalProviderShare)}</div>
                <div className="text-[9px] text-emerald-600 mt-0.5">Retained by clinic</div>
              </div>
              <div className="rounded-xl bg-teal-50/60 p-4 border border-teal-100">
                <div className="text-[10px] text-teal-800 font-bold uppercase">Platform Share ({platformSharePct}%)</div>
                <div className="text-xl font-extrabold text-teal-800 mt-1">{pkr(totalPlatformShare)}</div>
                <div className="text-[9px] text-teal-600 mt-0.5">Storage &amp; network fee</div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Receipt No.</th>
                    <th>Patient</th>
                    <th>Health ID</th>
                    <th>Type</th>
                    <th>Total Fee</th>
                    <th>Clinic ({providerSharePct}%)</th>
                    <th>Platform ({platformSharePct}%)</th>
                    <th>Method</th>
                    <th className="text-right">Ledger Status</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((c) => (
                    <tr key={c.invoiceId}>
                      <td className="mono font-bold">{c.receiptNo}</td>
                      <td><strong>{c.patientName}</strong></td>
                      <td className="mono font-bold text-emerald-800">{c.healthId}</td>
                      <td className="capitalize">{c.invoiceType}</td>
                      <td>{pkr(c.amount)}</td>
                      <td>{c.providerShare === null ? "—" : pkr(c.providerShare)}</td>
                      <td>{c.platformShare === null ? "—" : pkr(c.platformShare)}</td>
                      <td className="capitalize">{c.paymentMethod}</td>
                      <td className="text-right">
                        <Badge type={c.status === "paid" ? "verified" : "pending"}>{c.status === "paid" ? "Split Posted" : c.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {collections.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center p-6 text-slate-400 text-xs">No collections recorded yet — register a patient to issue the first receipt.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : section === "Register patient" ? (
        <section className="card max-w-2xl">
          <div className="card-head">
            <div>
              <h2 className="card-title">Patient desk registration</h2>
              <div className="card-caption">Creates the patient record, assigns a unique Health ID, and posts the ledger split</div>
            </div>
          </div>
          <div className="card-body">
            {result ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check size={24} />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800">Registration Successful</h3>
                <div className="mt-2 font-mono text-xl font-extrabold text-emerald-800">{result.healthId}</div>
                <p className="mt-1 text-xs text-slate-600">{result.fullName}</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[10px] font-mono text-slate-600 shadow-sm">
                  <span>Receipt No:</span> <strong>{result.receiptNo}</strong> · <span>Fee: {pkr(regFee)} Paid</span>
                </div>
                {result.email ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-white px-3 py-1.5 text-[10px] text-emerald-800">
                    <Link2 size={12} />
                    When <strong>{result.email}</strong> signs up as a patient, this registration links to their portal automatically — one Health ID, receipts preserved.
                  </div>
                ) : (
                  <p className="mt-3 text-[10px] text-slate-400">Tip: record the patient's email next time — their portal signup will then link to this registration automatically.</p>
                )}
                <div className="mt-5 flex justify-center gap-2">
                  <Button size="small" onClick={() => setResult(null)}>
                    <Plus size={12} /> Register another patient
                  </Button>
                  <Button variant="secondary" size="small" onClick={() => { window.location.href = "/front-desk/patients"; }}>
                    View patient directory
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {serverError && <div className="notice coral">{serverError}</div>}
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="fd-full-name">Full name *</label>
                    <input
                      id="fd-full-name"
                      className={`input ${fieldErrors.fullName ? "input-invalid" : ""}`}
                      placeholder="e.g. Zainab Noor"
                      value={fullName}
                      maxLength={100}
                      onChange={(e) => { setFullName(e.target.value); clearFieldError("fullName"); }}
                    />
                    {fieldErrors.fullName && <div className="field-error">{fieldErrors.fullName}</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="fd-cnic">CNIC (National ID) *</label>
                    <input
                      id="fd-cnic"
                      className={`input ${fieldErrors.cnic ? "input-invalid" : ""}`}
                      placeholder="42101-1234567-1 (13 digits)"
                      value={cnic}
                      inputMode="numeric"
                      onChange={(e) => { setCnic(e.target.value); clearFieldError("cnic"); }}
                    />
                    {fieldErrors.cnic && <div className="field-error">{fieldErrors.cnic}</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="fd-phone">Phone number *</label>
                    <input
                      id="fd-phone"
                      className={`input ${fieldErrors.phone ? "input-invalid" : ""}`}
                      placeholder="0300-1234567 or 042-35778800"
                      value={phone}
                      inputMode="tel"
                      onChange={(e) => { setPhone(e.target.value); clearFieldError("phone"); }}
                    />
                    {fieldErrors.phone && <div className="field-error">{fieldErrors.phone}</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="fd-email">
                      Email <span className="text-slate-400 font-normal">(optional — links the portal signup)</span>
                    </label>
                    <input
                      id="fd-email"
                      className={`input ${fieldErrors.email ? "input-invalid" : ""}`}
                      placeholder="zainab@example.com"
                      value={email}
                      inputMode="email"
                      onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                    />
                    {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
                    <div className="text-[9px] text-slate-400">
                      If this patient later signs up with the same email, their portal account connects to this registration automatically.
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="fd-dob">Date of birth</label>
                    <input
                      id="fd-dob"
                      className={`input ${fieldErrors.dob ? "input-invalid" : ""}`}
                      type="date"
                      value={dob}
                      onChange={(e) => { setDob(e.target.value); clearFieldError("dob"); }}
                    />
                    {fieldErrors.dob && <div className="field-error">{fieldErrors.dob}</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="fd-gender">Gender</label>
                    <select id="fd-gender" aria-label="Gender" className="select" value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="fd-blood">Blood group</label>
                    <select id="fd-blood" aria-label="Blood group" className="select" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="fd-payment">Registration payment method ({pkr(regFee)})</label>
                    <select id="fd-payment" aria-label="Payment method" className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "cash" | "card" | "wallet")}>
                      <option value="cash">Cash at desk</option>
                      <option value="card">Credit / Debit Card</option>
                      <option value="wallet">Mobile Wallet</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 text-[10px] space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span>Registration &amp; year 1 storage:</span>
                    <strong>{pkr(regFee)}</strong>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span>Provider share ({providerSharePct}%):</span>
                    <strong>+ {pkr(providerSharePkr)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Platform share ({platformSharePct}%):</span>
                    <strong>{pkr(platformSharePkr)}</strong>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button disabled={submitting} onClick={handleRegister}>
                    {submitting ? "Processing…" : "Issue receipt & register patient"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : section === "Patient directory" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Registered patients on database</h2>
              <div className="card-caption">Real patient records registered in H.A.R.D · search by name, Health ID, CNIC, phone or email</div>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input !pl-9 !text-[10px]"
                placeholder="Search by name, Health ID, CNIC, phone or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="card-body">
            {filteredPatients.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No patients found. Open <strong>Register patient</strong> to register a patient.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Health ID</th>
                      <th>Full name</th>
                      <th>CNIC</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Blood group</th>
                      <th>Registered</th>
                      <th className="text-right">Portal account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono font-bold text-emerald-800">{p.healthId}</td>
                        <td><strong>{p.fullName}</strong></td>
                        <td className="font-mono text-xs text-slate-600">{p.cnic ? `${p.cnic.slice(0, 5)}-${p.cnic.slice(5, 12)}-${p.cnic.slice(12)}` : <span className="text-slate-300">Not recorded</span>}</td>
                        <td className="text-slate-600">{p.phone ? formatPakistaniPhone(p.phone) : <span className="text-slate-300">Not recorded</span>}</td>
                        <td className="text-slate-600">{p.email || <span className="text-slate-300">Not recorded</span>}</td>
                        <td>{p.bloodGroup || "O+"}</td>
                        <td className="text-slate-400" suppressHydrationWarning>{dateLabel(p.createdAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td className="text-right">
                          {p.hasAccount ? (
                            <Badge type="verified">Linked</Badge>
                          ) : (
                            <Badge type="pending">Not linked</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="content-grid wide-side">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Front desk quick actions</h2>
                  <div className="card-caption">Registration, directory and today's ledger</div>
                </div>
              </div>
              <div className="card-body space-y-2">
                <a href="/front-desk/patients/new" className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <UserPlus size={16} className="text-emerald-700" />
                    <span>
                      <span className="block text-xs font-bold text-emerald-900">Register a new patient</span>
                      <span className="block text-[10px] text-emerald-800/80">{pkr(regFee)} receipt · Health ID issued instantly</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">Open →</span>
                </a>
                <a href="/front-desk/patients" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <UsersRound size={16} className="text-slate-600" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Patient directory</span>
                      <span className="block text-[10px] text-slate-500">{patients.length} patients · {linkedCount} with portal accounts</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Open →</span>
                </a>
                <a href="/front-desk/collections" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <WalletCards size={16} className="text-slate-600" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Daily collections &amp; ledger</span>
                      <span className="block text-[10px] text-slate-500">{pkr(collectedToday)} collected today · {collections.length} receipts</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Open →</span>
                </a>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Latest registrations</h2>
                  <div className="card-caption">Newest patients at this desk</div>
                </div>
                <Badge type="verified">{patients.length} total</Badge>
              </div>
              <div className="card-body space-y-2">
                {patients.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                    <div>
                      <span className="font-mono font-bold text-emerald-800">{p.healthId}</span>
                      <span className="text-slate-600"> — {p.fullName}</span>
                      <div className="text-[10px] text-slate-400">
                        {p.phone ? formatPakistaniPhone(p.phone) : "no phone"} · {p.email || "no email"}
                      </div>
                    </div>
                    {p.hasAccount ? <Badge type="verified">Linked</Badge> : <Badge type="pending">Not linked</Badge>}
                  </div>
                ))}
                {patients.length === 0 && (
                  <div className="rounded-xl bg-slate-50 p-5 text-center text-[10px] text-slate-400">
                    No patients registered yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
