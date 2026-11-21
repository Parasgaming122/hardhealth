"use client";

import { useState } from "react";
import { BadgeCheck, Check, Clock, LockKeyhole, Pill, Receipt, ScanLine, Search, ShieldCheck, WalletCards } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { pkr, dateLabel } from "@/lib/domain";
import { dispenseRealPrescription } from "@/lib/provider/actions";
import type { PharmacyActivity } from "@/lib/provider/types";

/**
 * Owner feedback 2026-11-21: the pharmacy workspace had four sidebar pages but
 * they all rendered the same "Resolve prescription" card (a section-string
 * mismatch — the panel compared against section names that were never passed).
 * Now each page is distinct and data-backed:
 *   Overview → dashboard + quick links + own recent dispenses
 *   Resolve  → the full code-resolve + OTP dispense flow
 *   Dispenses→ the pharmacist's OWN dispense records (narrow scope, brief §4)
 *   Bills    → the bills their dispenses attached to patient cost records
 */
export function RealPharmacyPanel({
  section = "Resolve",
  activity,
}: {
  section?: string;
  activity?: PharmacyActivity;
}) {
  const dispenses = activity?.dispenses ?? [];
  const bills = activity?.bills ?? [];
  const billsTotal = bills.reduce((sum, b) => sum + b.amount, 0);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [rx, setRx] = useState<any | null>(null);
  const [otp, setOtp] = useState("4812");
  const [billNumber, setBillNumber] = useState(`PH-${Math.floor(1000 + Math.random() * 9000)}`);
  const [billTotal, setBillTotal] = useState("3200");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  const handleLookup = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setCompleted(false);

    try {
      const res = await fetch(`/api/rx/resolve?code=${encodeURIComponent(code.trim())}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "No matching prescription found.");
        setRx(null);
      } else {
        setRx(json.prescription);
      }
    } catch {
      setError("Failed to resolve prescription code.");
    } finally {
      setLoading(false);
    }
  };

  const handleDispense = async () => {
    if (!rx) return;
    setSubmitting(true);
    setError("");
    try {
      await dispenseRealPrescription({
        prescriptionId: rx.id,
        otp: otp.trim(),
        billNumber: billNumber.trim(),
        billTotal: Number(billTotal) || 0,
      });
      setCompleted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Dispense failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {section === "Overview" ? (
        <>
          <div className="kpi-grid">
            <div className="card kpi">
              <div className="kpi-label"><ScanLine size={15} /> Resolution scope</div>
              <div className="kpi-value">Single document</div>
              <div className="kpi-foot">Zero access to patient history</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label"><LockKeyhole size={15} /> Patient verification</div>
              <div className="kpi-value">Counter OTP</div>
              <div className="kpi-foot">Prototype OTP: 4812</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label"><Pill size={15} /> My dispenses</div>
              <div className="kpi-value">{dispenses.length}</div>
              <div className="kpi-foot">Fills I verified at this counter</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label"><WalletCards size={15} /> Bills I attached</div>
              <div className="kpi-value">{bills.length}</div>
              <div className="kpi-foot">{pkr(billsTotal)} posted to patient costs</div>
            </div>
          </div>

          <div className="content-grid wide-side">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Pharmacy quick actions</h2>
                  <div className="card-caption">Strict narrow scope · no patient search, ever</div>
                </div>
                <Badge type="neutral">Brief §4 rules</Badge>
              </div>
              <div className="card-body space-y-2">
                <a href="/pharmacy/resolve" className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <ScanLine size={16} className="text-emerald-700" />
                    <span>
                      <span className="block text-xs font-bold text-emerald-900">Resolve one prescription</span>
                      <span className="block text-[10px] text-emerald-800/80">Enter the code or scan the QR the patient presents</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">Open →</span>
                </a>
                <a href="/pharmacy/dispenses" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <Pill size={16} className="text-slate-600" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">My dispenses</span>
                      <span className="block text-[10px] text-slate-500">{dispenses.length} OTP-verified fills recorded</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Open →</span>
                </a>
                <a href="/pharmacy/bills" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <Receipt size={16} className="text-slate-600" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Attached bills</span>
                      <span className="block text-[10px] text-slate-500">{bills.length} receipts · {pkr(billsTotal)}</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Open →</span>
                </a>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Latest dispenses at this counter</h2>
                  <div className="card-caption">Your own records only</div>
                </div>
                <Badge type="verified">Audit locked</Badge>
              </div>
              <div className="card-body space-y-2">
                {dispenses.slice(0, 4).map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                    <div>
                      <span className="font-mono font-bold text-emerald-800">{d.prescriptionCode}</span>
                      <span className="text-slate-500"> — fill {d.fillNumber}</span>
                      <div className="text-[10px] text-slate-400">{dateLabel(d.dispensedAt)} · {d.patientHealthId}</div>
                    </div>
                    <Badge type="verified">OTP verified</Badge>
                  </div>
                ))}
                {dispenses.length === 0 && (
                  <div className="rounded-xl bg-slate-50 p-5 text-center text-[10px] text-slate-400">
                    No dispenses yet. Resolve a prescription code to start.
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : section === "Dispenses" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Dispensed prescriptions</h2>
              <div className="card-caption">Fills you verified with the patient OTP · narrow scope, own records only</div>
            </div>
            <Badge type="verified">Audit locked</Badge>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Prescription</th>
                    <th>Patient (as presented)</th>
                    <th>Fill</th>
                    <th>Dispensed</th>
                    <th className="text-right">Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {dispenses.map((d) => (
                    <tr key={d.id}>
                      <td className="mono font-bold text-emerald-800">{d.prescriptionCode}</td>
                      <td><strong>{d.patientName}</strong> <span className="text-slate-400 font-mono text-[10px]">({d.patientHealthId})</span></td>
                      <td>#{d.fillNumber}</td>
                      <td className="text-slate-500" suppressHydrationWarning>{dateLabel(d.dispensedAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                      <td className="text-right"><Badge type="verified">OTP verified</Badge></td>
                    </tr>
                  ))}
                  {dispenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center p-6 text-slate-400 text-xs">
                        Nothing dispensed yet — resolve a prescription code to record your first fill.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : section === "Bills" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Attached pharmacy bills</h2>
              <div className="card-caption">Receipts your dispenses posted to patient cost records · {pkr(billsTotal)} total</div>
            </div>
            <Badge type="verified">Immutable cost items</Badge>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bill / Ref No.</th>
                    <th>Prescription</th>
                    <th>Patient (as presented)</th>
                    <th>Amount</th>
                    <th className="text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id}>
                      <td className="mono font-bold">{b.title.replace(/^Pharmacy bill · /, "") || "—"}</td>
                      <td className="mono font-bold text-emerald-800">{b.prescriptionCode}</td>
                      <td><strong>{b.patientName}</strong> <span className="text-slate-400 font-mono text-[10px]">({b.patientHealthId})</span></td>
                      <td className="font-bold">{pkr(b.amount)}</td>
                      <td className="text-right text-slate-500" suppressHydrationWarning>{dateLabel(b.date, { day: "numeric", month: "short" })}</td>
                    </tr>
                  ))}
                  {bills.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center p-6 text-slate-400 text-xs">
                        No bills attached yet — attach the receipt while dispensing.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <div className="content-grid wide-side">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Resolve prescription</h2>
                <div className="card-caption">Type prescription code (e.g. RX-...) or paste token</div>
              </div>
              <Badge type="neutral">No patient search allowed</Badge>
            </div>
            <div className="card-body">
              <div className="flex gap-2">
                <input
                  className="input !text-xs font-mono"
                  placeholder="Enter prescription code or ID (e.g. RX-7F3K-92QD)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLookup(); } }}
                />
                <Button disabled={loading || !code.trim()} onClick={handleLookup}>
                  <Search size={13} /> {loading ? "Checking…" : "Resolve"}
                </Button>
              </div>

              {error && <div className="notice coral mt-3">{error}</div>}

              {rx && (
                <div className="mt-5 space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <div className="font-mono text-sm font-extrabold text-emerald-800">{rx.prescription_code}</div>
                      <div className="text-[10px] text-slate-500">Patient: <strong>{rx.patient_name || "Verified patient"}</strong></div>
                    </div>
                    <Badge type={rx.status === "active" ? "verified" : "alert"}>{rx.status}</Badge>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prescribed medicines</div>
                    <div className="mt-2 space-y-1.5">
                      {rx.prescription_items?.map((it: any) => (
                        <div key={it.id} className="flex justify-between rounded-lg bg-white p-2.5 text-xs shadow-sm">
                          <div>
                            <strong>{it.medicine}</strong>
                            <div className="text-[9px] text-slate-400">{it.strength} · {it.dose} · {it.frequency}</div>
                          </div>
                          <span className="font-bold text-slate-700">Qty {it.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {completed ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                      <Check className="mx-auto text-emerald-800" size={24} />
                      <h4 className="mt-2 text-sm font-bold text-emerald-900">Dispensed &amp; Billed</h4>
                      <p className="mt-1 text-[10px] text-slate-600">Prescription marked dispensed. Cost item linked to patient's live dashboard.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="form-grid">
                        <div className="field">
                          <label>Patient OTP confirmation *</label>
                          <input className="input font-mono" placeholder="4812" value={otp} onChange={(e) => setOtp(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Pharmacy bill total (PKR)</label>
                          <input className="input" type="number" value={billTotal} onChange={(e) => setBillTotal(e.target.value)} />
                        </div>
                      </div>
                      <div className="field">
                        <label>Pharmacy bill reference / invoice #</label>
                        <input className="input" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button disabled={submitting || !otp.trim()} onClick={handleDispense}>
                          {submitting ? "Processing…" : "Confirm OTP, dispense & attach bill"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Pharmacy privacy matrix</h2>
                <div className="card-caption">Rules from Section 4 of brief</div>
              </div>
              <ShieldCheck size={16} className="text-emerald-700" />
            </div>
            <div className="card-body space-y-3 text-[10px] leading-5 text-slate-600">
              <p><strong>Strict narrow scope:</strong> Pharmacies have no patient directory or history access. A pharmacist may only resolve a prescription when presented with a valid token or code.</p>
              <p><strong>Dispensing OTP:</strong> Dispensing requires the patient's authorization code to prevent fraudulent fills.</p>
              <p><strong>Bill attachment:</strong> When a pharmacy attaches its receipt, an immutable cost entry is created for the patient's expense tracking.</p>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-[9px] text-slate-500">
                <Clock size={12} className="shrink-0" />
                Every resolution is rate-limited (20/min) and audited as an immutable pharmacy_resolve event.
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
