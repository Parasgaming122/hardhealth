"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, ChevronRight, FileClock, Plus, Search, UserPlus, UsersRound, WalletCards } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { pkr } from "@/lib/domain";
import type { RealPatientSummary } from "@/lib/provider/types";
import { registerRealPatient } from "@/lib/provider/actions";

export function RealFrontDeskPanel({
  patients: initialPatients,
  config,
  section = "Overview",
}: {
  patients: RealPatientSummary[];
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
  const [activeTab, setActiveTab] = useState(section === "Register patient" || section === "patients/new" ? "register" : section === "Daily collections" || section === "collections" ? "collections" : "overview");

  useEffect(() => {
    if (section === "Register patient" || section === "patients/new") {
      setActiveTab("register");
    } else if (section === "Daily collections" || section === "collections") {
      setActiveTab("collections");
    } else {
      setActiveTab("overview");
    }
  }, [section]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ healthId: string; fullName: string; receiptNo: string } | null>(null);

  // Registration form
  const [fullName, setFullName] = useState("");
  const [cnic, setCnic] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Female");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("cash");

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    const qDigits = search.replace(/[^0-9]/g, "");
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.healthId.toLowerCase().includes(q) ||
        // CNIC search: digits-only match so "35202" or a full "35202-1234567-1"
        // both find the patient regardless of dash formatting.
        (qDigits.length >= 3 && !!p.cnic && p.cnic.includes(qDigits))
    );
  }, [patients, search]);

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setError("Please enter the patient's full name.");
      return;
    }
    const cnicDigits = cnic.replace(/[^0-9]/g, "");
    if (cnicDigits.length !== 13) {
      setError("CNIC must contain exactly 13 digits (e.g. 42101-1234567-1).");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await registerRealPatient({
        fullName: fullName.trim(),
        cnic: cnicDigits,
        phone: phone.trim(),
        dob: dob || undefined,
        gender,
        bloodGroup,
        paymentMethod,
      });

      setResult({
        healthId: res.patient.healthId,
        fullName: res.patient.fullName,
        receiptNo: res.receiptNo,
      });

      setPatients((prev) => [
        {
          id: res.patient.id,
          healthId: res.patient.healthId,
          fullName: res.patient.fullName,
          cnic: cnicDigits,
          dob: dob || null,
          bloodGroup,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      // Clear form
      setFullName("");
      setCnic("");
      setPhone("");
      setDob("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register patient");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-label"><UsersRound size={15} /> Registered patients</div>
          <div className="kpi-value">{patients.length}</div>
          <div className="kpi-foot">Verified patient accounts in database</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><WalletCards size={15} /> Registration fee</div>
          <div className="kpi-value">{pkr(regFee)}</div>
          <div className="kpi-foot">Includes year 1 storage + card</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><BadgeCheck size={15} /> Provider share</div>
          <div className="kpi-value">{providerSharePct}%</div>
          <div className="kpi-foot">{pkr(providerSharePkr)} posted per patient</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><FileClock size={15} /> Platform share</div>
          <div className="kpi-value">{platformSharePct}%</div>
          <div className="kpi-foot">{pkr(platformSharePkr)} reconciled to ledger</div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => { setActiveTab("overview"); setResult(null); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeTab === "overview" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Patient Directory ({patients.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("register"); setResult(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeTab === "register" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <UserPlus size={13} /> Register New Patient
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("collections"); setResult(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeTab === "collections" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <WalletCards size={13} /> Daily Collections &amp; Ledger
        </button>
      </div>

      {activeTab === "collections" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Front desk collections &amp; revenue split</h2>
              <div className="card-caption">Registration fee from config · {providerSharePct}% provider share, {platformSharePct}% platform share posted to ledger</div>
            </div>
            <Badge type="verified">Balanced</Badge>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Total Collected</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1">{pkr(patients.length * regFee)}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">{patients.length} registration receipts</div>
              </div>
              <div className="rounded-xl bg-emerald-50/60 p-4 border border-emerald-100">
                <div className="text-[10px] text-emerald-800 font-bold uppercase">Provider Earnings ({providerSharePct}%)</div>
                <div className="text-xl font-extrabold text-emerald-800 mt-1">{pkr(patients.length * providerSharePkr)}</div>
                <div className="text-[9px] text-emerald-600 mt-0.5">Retained by clinic</div>
              </div>
              <div className="rounded-xl bg-teal-50/60 p-4 border border-teal-100">
                <div className="text-[10px] text-teal-800 font-bold uppercase">Platform Share ({platformSharePct}%)</div>
                <div className="text-xl font-extrabold text-teal-800 mt-1">{pkr(patients.length * platformSharePkr)}</div>
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
                    <th>Total Fee</th>
                    <th>Clinic (30%)</th>
                    <th>Platform (70%)</th>
                    <th className="text-right">Ledger Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="mono font-bold">REC-{(2048 + idx).toString()}</td>
                      <td><strong>{p.fullName}</strong></td>
                      <td className="mono font-bold text-emerald-800">{p.healthId}</td>
                      <td>PKR 500</td>
                      <td>PKR 150</td>
                      <td>PKR 350</td>
                      <td className="text-right"><Badge type="verified">Split Posted</Badge></td>
                    </tr>
                  ))}
                  {patients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center p-6 text-slate-400 text-xs">No collections recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : activeTab === "register" ? (
        <section className="card max-w-2xl">
          <div className="card-head">
            <div>
              <h2 className="card-title">Patient desk registration</h2>
              <div className="card-caption">Creates patient record, assigns unique Health ID, and posts ledger split</div>
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
                  <span>Receipt No:</span> <strong>{result.receiptNo}</strong> · <span>Fee: PKR 500 Paid</span>
                </div>
                <div className="mt-5 flex justify-center gap-2">
                  <Button size="small" onClick={() => setResult(null)}>
                    <Plus size={12} /> Register another patient
                  </Button>
                  <Button variant="secondary" size="small" onClick={() => setActiveTab("overview")}>
                    View patient directory
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {error && <div className="notice coral">{error}</div>}
                <div className="form-grid">
                  <div className="field">
                    <label>Full name *</label>
                    <input className="input" placeholder="e.g. Zainab Noor" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>CNIC (National ID)</label>
                    <input className="input" placeholder="e.g. 42101-1234567-1" value={cnic} onChange={(e) => setCnic(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Phone number</label>
                    <input className="input" placeholder="e.g. 0300-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Date of birth</label>
                    <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Gender</label>
                    <select aria-label="Gender" className="select" value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Blood group</label>
                    <select aria-label="Blood group" className="select" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
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
                    <label>Registration payment method (PKR 500)</label>
                    <select aria-label="Payment method" className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "cash" | "card" | "wallet")}>
                      <option value="cash">Cash at desk</option>
                      <option value="card">Credit / Debit Card</option>
                      <option value="wallet">Mobile Wallet</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 text-[10px] space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span>Registration & year 1 storage:</span>
                    <strong>PKR 500</strong>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span>Provider share (30%):</span>
                    <strong>+ PKR 150</strong>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Platform share (70%):</span>
                    <strong>PKR 350</strong>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button disabled={submitting || !fullName.trim()} onClick={handleRegister}>
                    {submitting ? "Processing…" : "Issue receipt & register patient"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Registered patients on database</h2>
              <div className="card-caption">Real patient records registered in H.A.R.D</div>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input !pl-9 !text-[10px]"
                placeholder="Search by name, Health ID or CNIC"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="card-body">
            {filteredPatients.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No patients found. Click <strong>Register New Patient</strong> to register a patient.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Health ID</th>
                      <th>Full name</th>
                      <th>CNIC</th>
                      <th>Blood group</th>
                      <th>Registered date</th>
                      <th className="text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono font-bold text-emerald-800">{p.healthId}</td>
                        <td><strong>{p.fullName}</strong></td>
                        <td className="font-mono text-xs text-slate-600">{p.cnic ? `${p.cnic.slice(0, 5)}-${p.cnic.slice(5, 12)}-${p.cnic.slice(12)}` : <span className="text-slate-300">Not recorded</span>}</td>
                        <td>{p.bloodGroup || "O+"}</td>
                        <td className="text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="text-right"><Badge type="verified">Active</Badge></td>
                      </tr>
                    ))}
                    {filteredPatients.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center p-6 text-slate-400 text-xs">No patients match this search.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
