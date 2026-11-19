"use client";

import { useState } from "react";
import { BadgeCheck, Check, FileCheck2, FilePlus2, Link2, QrCode, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button } from "@/components/ui";
import { pkr } from "@/lib/domain";
import type { RealPatientSummary } from "@/lib/provider/types";
import { issueRealLabReport } from "@/lib/provider/actions";

export function RealLabPanel({
  patients,
  section = "New report",
}: {
  patients: RealPatientSummary[];
  section?: string;
}) {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || "");
  const [testType, setTestType] = useState("Complete Blood Count (CBC)");
  const [amount, setAmount] = useState("2400");
  const [notes, setNotes] = useState("All parameters within normal clinical range.");
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<{ id: string; token: string; hash: string } | null>(null);
  const [error, setError] = useState("");

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  const handleIssue = async () => {
    if (!selectedPatient) {
      setError("Please select a registered patient.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await issueRealLabReport({
        patientId: selectedPatient.id,
        testType,
        amount: Number(amount) || 0,
        notes,
      });
      setIssued(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to issue lab report");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyUrl = issued ? `/verify/lab/${issued.id}` : "";

  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-label"><FileCheck2 size={15} /> Lab diagnostics</div>
          <div className="kpi-value">Digital</div>
          <div className="kpi-foot">Cryptographic verification hash</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><QrCode size={15} /> Verification QR</div>
          <div className="kpi-value">Auto-issued</div>
          <div className="kpi-foot">Public verification link</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><BadgeCheck size={15} /> Audit badge</div>
          <div className="kpi-value">Verified</div>
          <div className="kpi-foot">System-assigned provenance</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><ShieldCheck size={15} /> Scope</div>
          <div className="kpi-value">Linked only</div>
          <div className="kpi-foot">Reports & own costs only</div>
        </div>
      </div>

      {section === "Reports issued" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Diagnostic reports issued</h2>
              <div className="card-caption">All verified reports issued with SHA-256 cryptographic hashes</div>
            </div>
            <Badge type="verified">Lab records</Badge>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Report Ref</th>
                    <th>Patient</th>
                    <th>Test Type</th>
                    <th>Fee</th>
                    <th>Tamper Hash</th>
                    <th className="text-right">Public Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono font-bold">LAB-9481</td>
                    <td><strong>Amna Siddiqui</strong> <span className="text-slate-400 font-mono text-[10px]">(HARD-000101)</span></td>
                    <td>Complete Blood Count (CBC)</td>
                    <td>PKR 2,400</td>
                    <td className="mono text-[9px] text-slate-400">88c6b02b...49f1</td>
                    <td className="text-right"><Badge type="verified">Verified QR</Badge></td>
                  </tr>
                  <tr>
                    <td className="mono font-bold">LAB-9482</td>
                    <td><strong>Bilal Ahmed</strong> <span className="text-slate-400 font-mono text-[10px]">(HARD-000102)</span></td>
                    <td>Lipid Profile &amp; HbA1c</td>
                    <td>PKR 3,800</td>
                    <td className="mono text-[9px] text-slate-400">7a3f91cc...b802</td>
                    <td className="text-right"><Badge type="verified">Verified QR</Badge></td>
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
              <h2 className="card-title">Issue verified diagnostic report</h2>
              <div className="card-caption">Issued digitally with tamper-evident cryptographic hash</div>
            </div>
            <Badge type="verified">Lab authorized</Badge>
          </div>
          <div className="card-body">
            {issued ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check size={24} />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800">Diagnostic Report Issued & Verified</h3>
                <div className="mt-2 text-base font-extrabold text-slate-800">{testType}</div>
                <p className="mt-1 text-xs text-slate-500">Issued to {selectedPatient?.fullName} ({selectedPatient?.healthId})</p>
                <div className="my-2 font-mono text-[9px] text-slate-400">{issued.hash}</div>

                <div className="qr-frame mx-auto my-3 w-fit">
                  <QRCodeSVG value={verifyUrl} size={150} level="M" includeMargin />
                </div>

                <div className="mt-4 flex justify-center gap-2">
                  <Button size="small" onClick={() => setIssued(null)}>
                    <FilePlus2 size={12} /> Issue another report
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {error && <div className="notice coral">{error}</div>}

                <div className="field">
                  <label>Select registered patient *</label>
                  {patients.length === 0 ? (
                    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                      No patients registered in the database yet.
                    </div>
                  ) : (
                    <select
                      aria-label="Select registered patient"
                      className="select"
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                    >
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} · {p.healthId}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Test type</label>
                    <input className="input" value={testType} onChange={(e) => setTestType(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Test fee (PKR)</label>
                    <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>Lab notes & observations</label>
                  <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>

                <div className="flex justify-end pt-2">
                  <Button disabled={submitting || !selectedPatient} onClick={handleIssue}>
                    {submitting ? "Issuing…" : "Issue verified lab report"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Laboratory protocol</h2>
              <div className="card-caption">Tamper-evident verification</div>
            </div>
          </div>
          <div className="card-body space-y-3 text-[10px] leading-5 text-slate-600">
            <p><strong>Digital issuing:</strong> Reports are issued digitally in H.A.R.D and automatically linked to the patient's record with a <strong>Verified</strong> badge.</p>
            <p><strong>Verification QR:</strong> Anyone (insurer, patient, doctor) scanning the QR can confirm the report was genuinely issued by an accredited laboratory and has not been altered.</p>
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
