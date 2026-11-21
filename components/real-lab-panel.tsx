"use client";

import { useState } from "react";
import { BadgeCheck, Check, FileCheck2, FilePlus2, QrCode, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button } from "@/components/ui";
import { dateLabel } from "@/lib/domain";
import type { LabReportSummary, RealPatientSummary } from "@/lib/provider/types";
import { issueRealLabReport } from "@/lib/provider/actions";

/**
 * Owner feedback 2026-11-21: "Issue verified diagnostic report" appeared on
 * BOTH the overview and the issue-report page, and the reports page listed
 * hard-coded demo rows. Now each page is distinct and real:
 *   Overview       → dashboard + quick links + own recent reports
 *   New report     → the issue form (this page only)
 *   Reports issued → REAL reports from the database with verification links
 */
export function RealLabPanel({
  patients,
  section = "New report",
  reports = [],
}: {
  patients: RealPatientSummary[];
  section?: string;
  reports?: LabReportSummary[];
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
      {section === "Overview" ? (
        <>
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
              <div className="kpi-label"><FilePlus2 size={15} /> Reports issued</div>
              <div className="kpi-value">{reports.length}</div>
              <div className="kpi-foot">Latest {Math.min(reports.length, 50)} in the registry</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label"><BadgeCheck size={15} /> Audit badge</div>
              <div className="kpi-value">Verified</div>
              <div className="kpi-foot">System-assigned provenance</div>
            </div>
          </div>

          <div className="content-grid wide-side">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Laboratory quick actions</h2>
                  <div className="card-caption">Reports &amp; own costs only · linked patients</div>
                </div>
              </div>
              <div className="card-body space-y-2">
                <a href="/lab/reports/new" className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <FilePlus2 size={16} className="text-emerald-700" />
                    <span>
                      <span className="block text-xs font-bold text-emerald-900">Issue a new verified report</span>
                      <span className="block text-[10px] text-emerald-800/80">Digital issuing with tamper-evident hash + QR</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">Open →</span>
                </a>
                <a href="/lab/reports" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                  <span className="flex items-center gap-2.5">
                    <FileCheck2 size={16} className="text-slate-600" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Reports issued</span>
                      <span className="block text-[10px] text-slate-500">{reports.length} verified reports in the registry</span>
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Open →</span>
                </a>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Recently issued reports</h2>
                  <div className="card-caption">Newest first · from the live database</div>
                </div>
                <Badge type="verified">Lab records</Badge>
              </div>
              <div className="card-body space-y-2">
                {reports.slice(0, 4).map((rep) => (
                  <div key={rep.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                    <div>
                      <strong>{rep.testType}</strong>
                      <div className="text-[10px] text-slate-400">{rep.patientName} ({rep.patientHealthId}) · {dateLabel(rep.testedAt)}</div>
                    </div>
                    <Badge type="verified">Verified QR</Badge>
                  </div>
                ))}
                {reports.length === 0 && (
                  <div className="rounded-xl bg-slate-50 p-5 text-center text-[10px] text-slate-400">
                    No reports issued yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : section === "Reports issued" ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Diagnostic reports issued</h2>
              <div className="card-caption">All verified reports from the live database · SHA-256 cryptographic hashes</div>
            </div>
            <Badge type="verified">{reports.length} reports</Badge>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Test Type</th>
                    <th>Issued</th>
                    <th>Tamper Hash</th>
                    <th className="text-right">Public Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((rep) => (
                    <tr key={rep.id}>
                      <td><strong>{rep.patientName}</strong> <span className="text-slate-400 font-mono text-[10px]">({rep.patientHealthId})</span></td>
                      <td>{rep.testType}</td>
                      <td className="text-slate-500" suppressHydrationWarning>{dateLabel(rep.testedAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                      <td className="mono text-[9px] text-slate-400">{rep.hash.length > 20 ? `${rep.hash.slice(0, 12)}…${rep.hash.slice(-4)}` : rep.hash}</td>
                      <td className="text-right">
                        <a href={rep.verifiedUrl} className="no-underline" title="Public verification page">
                          <Badge type="verified">Verified QR</Badge>
                        </a>
                      </td>
                    </tr>
                  ))}
                  {reports.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center p-6 text-slate-400 text-xs">
                        No reports issued yet — issue the first one from “Issue report”.
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
                  <h3 className="mt-3 text-sm font-bold text-slate-800">Diagnostic Report Issued &amp; Verified</h3>
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
                    <label>Lab notes &amp; observations</label>
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
              <ShieldCheck size={16} className="text-emerald-700" />
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
