"use client";

import { useState } from "react";
import { BadgeCheck, Check, LockKeyhole, Pill, ScanLine, Search, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { pkr, dateLabel } from "@/lib/domain";
import { dispenseRealPrescription } from "@/lib/provider/actions";

export function RealPharmacyPanel({ section = "Scan / resolve" }: { section?: string }) {
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
          <div className="kpi-label"><Pill size={15} /> Billing integration</div>
          <div className="kpi-value">Attach bill</div>
          <div className="kpi-foot">Auto-creates patient cost item</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><BadgeCheck size={15} /> Audit status</div>
          <div className="kpi-value">Logged</div>
          <div className="kpi-foot">Every resolution logged immutably</div>
        </div>
      </div>

      {section === "Dispenses" || section === "Bills" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">{section === "Bills" ? "Attached pharmacy bills" : "Dispensed prescriptions"}</h2>
              <div className="card-caption">Pharmacy-scoped ledger records · OTP-verified fills only</div>
            </div>
            <Badge type="verified">Audit locked</Badge>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bill / Ref No.</th>
                    <th>Prescription</th>
                    <th>Patient (Scoped)</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono font-bold">PH-7182</td>
                    <td className="mono font-bold text-emerald-800">RX-DEMO-001</td>
                    <td>Amna S. (Age 32)</td>
                    <td>PKR 3,200</td>
                    <td><Badge type="verified">Dispensed</Badge></td>
                    <td><span className="text-[10px] text-slate-500 font-mono">OTP 4812 Verified</span></td>
                  </tr>
                  <tr>
                    <td className="mono font-bold">PH-9024</td>
                    <td className="mono font-bold text-emerald-800">RX-DEMO-002</td>
                    <td>Bilal A. (Age 45)</td>
                    <td>PKR 1,850</td>
                    <td><Badge type="verified">Dispensed</Badge></td>
                    <td><span className="text-[10px] text-slate-500 font-mono">OTP 2931 Verified</span></td>
                  </tr>
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
                    <h4 className="mt-2 text-sm font-bold text-emerald-900">Dispensed & Billed</h4>
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
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
