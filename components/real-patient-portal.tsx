"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, ArrowUpRightFromSquare,
  BadgeCheck, Building2, CalendarDays, Check, ChartNoAxesCombined, Clock3,
  Download, Eye, FileCheck2, FileClock, FileImage, FileText, Filter,
  HeartPulse, LockKeyhole, Pill, Plus, Printer, QrCode, Shield, ShieldCheck,
  Sparkles, Wallet, UsersRound
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button, Modal, ProvenanceBadge } from "@/components/ui";
import { dateLabel, pkr } from "@/lib/domain";
import type { RealPatientPortalData, RealPrescription, RealCostItem } from "@/lib/patient/types";
import { addPatientSelfExpense, savePatientIngestion } from "@/lib/patient/actions";

export function RealPatientPortal({
  data,
  initialSection = "Overview",
  onSectionChange,
}: {
  data: RealPatientPortalData;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
}) {
  const [section, setSection] = useState(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);
  const [qrItem, setQrItem] = useState<RealPrescription | null>(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states for manual expense
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<RealCostItem["category"]>("Medicine");

  // Form states for AI upload
  const [fileName, setFileName] = useState("");
  const [aiExtracted, setAiExtracted] = useState(false);
  const [aiTitle, setAiTitle] = useState("External clinic · CBC report");
  const [aiAmount, setAiAmount] = useState("1800");
  const [aiDate, setAiDate] = useState(new Date().toISOString().slice(0, 10));
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");

  // Filter states
  const [timelineFilter, setTimelineFilter] = useState("All activity");
  const [timelineSearch, setTimelineSearch] = useState("");

  const patient = data.patient;
  const costs = data.costs;
  const prescriptions = data.prescriptions;
  const labReports = data.labReports;
  const invoices = data.invoices;
  const logs = data.accessLogs;
  const providers = data.providers;

  const totalSpent = useMemo(() => costs.reduce((sum, item) => sum + item.amount, 0), [costs]);

  const activePrescriptionsCount = useMemo(
    () => prescriptions.filter((rx) => rx.status === "active" || rx.status === "partly_filled").length,
    [prescriptions]
  );

  const timeline = useMemo(() => {
    const list = [
      ...costs.map((c) => ({
        id: c.id,
        date: c.date,
        title: c.title,
        subtitle: `${c.provider} · ${c.category}`,
        amount: c.amount,
        provenance: c.provenance,
        kind: "cost" as const,
      })),
      ...prescriptions.map((rx) => ({
        id: rx.id,
        date: rx.date,
        title: `Prescription ${rx.code}`,
        subtitle: `${rx.items.length} medicines · ${rx.doctor}`,
        amount: rx.consultationCost,
        provenance: "verified" as const,
        kind: "prescription" as const,
      })),
      ...labReports.map((rep) => ({
        id: rep.id,
        date: rep.date,
        title: rep.testType,
        subtitle: rep.lab,
        amount: 0,
        provenance: "verified" as const,
        kind: "report" as const,
      })),
    ];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [costs, prescriptions, labReports]);

  const filteredTimeline = useMemo(() => {
    return timeline.filter((item) => {
      if (timelineFilter === "Prescriptions" && item.kind !== "prescription") return false;
      if (timelineFilter === "Reports" && item.kind !== "report") return false;
      if (timelineFilter === "Costs" && item.kind !== "cost") return false;
      if (timelineSearch && !`${item.title} ${item.subtitle}`.toLowerCase().includes(timelineSearch.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [timeline, timelineFilter, timelineSearch]);

  const handleAddExpense = async () => {
    if (!expenseTitle.trim() || Number(expenseAmount) <= 0) return;
    setSubmitting(true);
    try {
      await addPatientSelfExpense({
        title: expenseTitle.trim(),
        amount: Number(expenseAmount),
        category: expenseCategory,
      });
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAiUpload = async () => {
    if (!aiTitle.trim() || Number(aiAmount) <= 0) return;
    setSubmitting(true);
    setUploadError("");
    try {
      const res = await savePatientIngestion({
        title: aiTitle.trim(),
        amount: Number(aiAmount),
        date: aiDate,
        fileName: fileName || "uploaded-document.pdf",
      });
      setAiConfirmed(true);
      setStorageWarning(res.warning || "");
    } catch (err: unknown) {
      // P2-7: the 100%-quota upload block lands here with its friendly message.
      setUploadError(err instanceof Error ? err.message : "Could not save the document.");
    } finally {
      setSubmitting(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Description", "Provider", "Category", "Amount PKR", "Source"],
      ...costs.map((item) => [
        new Date(item.date).toISOString().slice(0, 10),
        item.title,
        item.provider,
        item.category,
        String(item.amount),
        item.provenance,
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hard-expenses-${patient.healthId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* KPI Metrics */}
      <section className="kpi-grid" aria-label="Personal health summary">
        <div className="card kpi">
          <div className="kpi-label"><Wallet size={15} /> Care costs recorded</div>
          <div className="kpi-value">{pkr(totalSpent)}</div>
          <div className="kpi-foot">{costs.length} recorded expense{costs.length === 1 ? "" : "s"}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><Pill size={15} /> Active prescriptions</div>
          <div className="kpi-value">{activePrescriptionsCount}</div>
          <div className="kpi-foot">{prescriptions.length} total on record</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><FileCheck2 size={15} /> Lab reports</div>
          <div className="kpi-value">{labReports.length}</div>
          <div className="kpi-foot">Verified diagnostic reports</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><Shield size={15} /> Linked providers</div>
          <div className="kpi-value">{providers.length}</div>
          <div className="kpi-foot">Access revocable anytime</div>
        </div>
      </section>

      {/* Main Content Areas */}
      {section === "Overview" && (
        <div className="content-grid wide-side">
          <div className="space-y-5">
            {/* Recent Care Activity */}
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Recent care activity</h2>
                  <div className="card-caption">Visits, prescriptions and hospital bills</div>
                </div>
                <Button variant="secondary" size="small" onClick={() => setExpenseModalOpen(true)}>
                  <Plus size={13} /> Add expense
                </Button>
              </div>
              <div className="card-body">
                {timeline.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                    <Activity className="mx-auto text-slate-300" size={28} />
                    <p className="mt-3 text-xs font-bold text-slate-700">No care records yet</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      When a linked clinic, doctor or lab issues a record, it will appear here tagged <strong className="text-emerald-700">Verified</strong>.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button size="small" onClick={() => setExpenseModalOpen(true)}>
                        <Plus size={12} /> Record self-reported expense
                      </Button>
                      <Button variant="secondary" size="small" onClick={() => setUploadModalOpen(true)}>
                        <Sparkles size={12} /> Add older document
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {timeline.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                        <div>
                          <div className="text-[11px] font-bold text-slate-800">{item.title}</div>
                          <div className="text-[9px] text-slate-400">{item.subtitle} · {dateLabel(item.date)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.amount > 0 && <strong className="text-[11px] font-extrabold">{pkr(item.amount)}</strong>}
                          <ProvenanceBadge provenance={item.provenance} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Active Prescriptions */}
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Digital prescriptions</h2>
                  <div className="card-caption">Issued by verified doctors · carries unique QR token</div>
                </div>
              </div>
              <div className="card-body">
                {prescriptions.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 p-6 text-center text-[10px] text-slate-400">
                    No prescriptions on file. A doctor can issue a legible prescription to your Health ID (<span className="font-mono font-bold text-slate-600">{patient.healthId}</span>).
                  </div>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map((rx) => (
                      <div key={rx.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-emerald-800">{rx.code}</span>
                            <Badge type={rx.status === "active" ? "verified" : "neutral"}>{rx.status}</Badge>
                          </div>
                          <div className="mt-1 text-[9px] text-slate-400">{rx.items.length} medicines · {rx.doctor} · Expires {dateLabel(rx.expiresAt)}</div>
                        </div>
                        <Button variant="secondary" size="small" onClick={() => setQrItem(rx)}>
                          <QrCode size={13} /> View QR
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Health Identity Card & Storage */}
          <div className="space-y-5">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Health ID card</h2>
                  <div className="card-caption">Your universal H.A.R.D patient identifier</div>
                </div>
                <Badge type="verified">Active</Badge>
              </div>
              <div className="card-body space-y-3">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-teal-50/30 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-800">H.A.R.D Patient Card</span>
                    <BadgeCheck size={16} className="text-emerald-700" />
                  </div>
                  <div className="mt-3 font-mono text-xl font-extrabold tracking-wide text-slate-800">{patient.healthId}</div>
                  <div className="mt-1 text-sm font-bold text-slate-700">{patient.fullName}</div>
                  <div className="mt-3 flex gap-3 text-[9px] text-slate-500">
                    <span>Blood: <strong>{patient.bloodGroup || "—"}</strong></span>
                    <span>Plan: <strong>Base (1 GB)</strong></span>
                  </div>
                </div>
                <p className="text-[9px] leading-4 text-slate-400">
                  Share your Health ID with participating doctors or front desks to link your care records directly to your account.
                </p>
              </div>
            </section>

            {/* Storage Quota (P2-7: real numbers from the config quota + ingestion sizes) */}
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Record storage</h2>
                  <div className="card-caption">{patient.storageUsedMb ?? 0} MB of {patient.storageQuotaMb ?? 1024} MB used · Base plan</div>
                </div>
                <Badge type={data.storagePct >= 100 ? "alert" : data.storagePct >= 80 ? "pending" : "verified"}>{data.storagePct}%</Badge>
              </div>
              <div className="card-body space-y-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all ${data.storagePct >= 100 ? "bg-red-500" : data.storagePct >= 80 ? "bg-amber-500" : "bg-emerald-600"}`}
                    style={{ width: `${Math.max(data.storagePct, 1)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>{data.storagePct >= 100 ? "Storage full — uploads blocked" : `${100 - data.storagePct}% capacity remaining`}</span>
                  <span>1 GB included</span>
                </div>
                {data.storagePct >= 100 && (
                  <div className="notice coral">
                    <LockKeyhole size={13} className="shrink-0" />
                    <span>You have reached 100% of your plan. New document uploads are blocked until you upgrade — reading every existing record stays available.</span>
                  </div>
                )}
                <div className="notice amber mt-2">
                  <LockKeyhole size={13} className="shrink-0" />
                  <span>Unpaid renewals never block reading existing records. Only new uploads are gated at 100% quota.</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Timeline View */}
      {section === "Timeline" && (
        <section className="card">
          <div className="card-head !items-start !flex-wrap">
            <div>
              <h2 className="card-title">Care & expense timeline</h2>
              <div className="card-caption">All visits, prescriptions, lab reports and expenses</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter size={13} className="text-slate-400" />
              <input
                className="input !min-h-[30px] !w-36 !px-2 !text-[9px]"
                placeholder="Search timeline"
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
              />
              <select
                aria-label="Filter activity type"
                className="select !min-h-[30px] !w-auto !py-1 !text-[9px]"
                value={timelineFilter}
                onChange={(e) => setTimelineFilter(e.target.value)}
              >
                <option>All activity</option>
                <option>Prescriptions</option>
                <option>Reports</option>
                <option>Costs</option>
              </select>
              <Button size="small" onClick={() => setExpenseModalOpen(true)}>
                <Plus size={12} /> Add expense
              </Button>
            </div>
          </div>
          <div className="card-body">
            {filteredTimeline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
                No matching records found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTimeline.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{item.title}</div>
                      <div className="mt-0.5 text-[9px] text-slate-400">{item.subtitle} · {dateLabel(item.date)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.amount > 0 && <strong className="text-xs font-bold text-slate-700">{pkr(item.amount)}</strong>}
                      <ProvenanceBadge provenance={item.provenance} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Expenses View */}
      {section === "Expenses" && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Live expense statement</h2>
              <div className="card-caption">Every tracked healthcare rupee · {pkr(totalSpent)} total</div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="small" onClick={exportCsv} disabled={costs.length === 0}>
                <Download size={12} /> CSV
              </Button>
              <Button variant="secondary" size="small" onClick={() => window.print()} disabled={costs.length === 0}>
                <Printer size={12} /> PDF
              </Button>
              <Button size="small" onClick={() => setExpenseModalOpen(true)}>
                <Plus size={12} /> Add expense
              </Button>
            </div>
          </div>
          <div className="card-body">
            {costs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
                No healthcare expenses recorded yet. Click <strong>Add expense</strong> above to log your first medical bill or pharmacy cost.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Provider / Source</th>
                      <th>Category</th>
                      <th>Badge</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((cost) => (
                      <tr key={cost.id}>
                        <td>{dateLabel(cost.date, { day: "numeric", month: "short" })}</td>
                        <td><strong>{cost.title}</strong></td>
                        <td>{cost.provider}</td>
                        <td>{cost.category}</td>
                        <td><ProvenanceBadge provenance={cost.provenance} /></td>
                        <td className="text-right font-bold">{pkr(cost.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Prescriptions Tab */}
      {section === "Prescriptions" && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Prescriptions</h2>
              <div className="card-caption">All digital prescriptions issued to your Health ID</div>
            </div>
          </div>
          <div className="card-body">
            {prescriptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
                No prescriptions issued yet. When a doctor writes a prescription for you, it will appear here with its unique verification QR code.
              </div>
            ) : (
              <div className="space-y-4">
                {prescriptions.map((rx) => (
                  <div key={rx.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-extrabold text-emerald-800">{rx.code}</span>
                          <Badge type={rx.status === "active" ? "verified" : "neutral"}>{rx.status}</Badge>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">{rx.doctor} · {rx.provider} · {dateLabel(rx.date)}</div>
                        <div className="mt-0.5 text-[9px] text-slate-400">Expires {dateLabel(rx.expiresAt)} · {Math.max(0, rx.maxFills - rx.fillsUsed)} fill remaining</div>
                      </div>
                      <Button variant="secondary" size="small" onClick={() => setQrItem(rx)}>
                        <QrCode size={13} /> Show QR code
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {rx.items.map((item) => (
                        <div key={item.id} className="rounded-lg bg-slate-50 p-2.5 text-[10px]">
                          <strong>{item.medicine}</strong>
                          <div className="text-[9px] text-slate-500">{item.strength} · {item.dose} · {item.frequency} · Qty {item.quantity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Reports Tab */}
      {section === "Reports" && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Diagnostic & lab reports</h2>
              <div className="card-caption">Issued digitally by verified labs, with tamper-proof hash checks</div>
            </div>
            <Button size="small" onClick={() => setUploadModalOpen(true)}>
              <Plus size={13} /> Add older document
            </Button>
          </div>
          <div className="card-body">
            {labReports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
                No lab reports yet. You can add older outside or WhatsApp reports using the <strong>Add older document</strong> button.
              </div>
            ) : (
              <div className="space-y-3">
                {labReports.map((report) => (
                  <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                        <FileCheck2 size={16} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{report.testType}</div>
                        <div className="text-[9px] text-slate-400">{report.lab} · {dateLabel(report.date)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge type="verified">Verified</Badge>
                      <a className="btn btn-secondary btn-small" href={`/verify/lab?token=${encodeURIComponent(report.token)}`} target="_blank" rel="noreferrer">
                        <ArrowUpRightFromSquare size={12} /> Verify
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Providers & Access Tab */}
      {section === "Providers & Access" && (
        <div className="content-grid">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Authorized providers</h2>
                <div className="card-caption">Doctors and clinics linked to your patient record</div>
              </div>
            </div>
            <div className="card-body space-y-3">
              {providers.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400">
                  No providers currently linked. When you visit a clinic or hospital, they request a link via your Health ID or OTP.
                </div>
              ) : (
                providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{p.name}</div>
                      <div className="text-[9px] text-slate-400">{p.type} · {p.location}</div>
                    </div>
                    <Badge type="verified">Active link</Badge>
                  </div>
                ))
              )}
              <div className="notice mt-4">
                <ShieldCheck size={14} className="shrink-0" />
                <span>Pharmacies never get linked to your record. They can resolve only the single prescription QR you present.</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Access log</h2>
                <div className="card-caption">Every read and dispense recorded immutably</div>
              </div>
            </div>
            <div className="card-body">
              {logs.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400">
                  No access events recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between border-b border-slate-50 py-2 text-[10px]">
                      <div>
                        <strong>{log.action}</strong>
                        <div className="text-[8px] text-slate-400">{log.entity}</div>
                      </div>
                      <span className="text-[8px] text-slate-400">{dateLabel(log.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Settings Tab */}
      {section === "Settings" && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Patient health profile</h2>
              <div className="card-caption">Account metadata and identity facts</div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              {[
                ["Health ID", patient.healthId],
                ["Full name", patient.fullName],
                ["Blood group", patient.bloodGroup || "O+"],
                ["Date of birth", patient.dob || "—"],
                ["Gender", patient.gender || "—"],
                ["Plan", patient.storagePlan || "Base (1 GB)"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
                  <div className="mt-1 font-mono text-xs font-bold text-slate-800">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Modal: Add Manual Expense */}
      <Modal open={expenseModalOpen} onOpenChange={setExpenseModalOpen} title="Record self-reported healthcare expense" description="Log an out-of-pocket medical cost (e.g. pharmacy, lab, dental) to track on your live dashboard." width="max-w-md">
        <div className="space-y-4">
          <div className="field">
            <label>Description / purpose</label>
            <input className="input" placeholder="e.g. Pharmacy medicine refill" value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Amount (PKR)</label>
            <input className="input" type="number" min="1" placeholder="e.g. 1500" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Category</label>
            <select aria-label="Category" className="select" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value as RealCostItem["category"])}>
              <option value="Medicine">Medicine</option>
              <option value="Consultation">Consultation</option>
              <option value="Test">Test</option>
              <option value="Procedure">Procedure</option>
              <option value="Admission">Admission</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="notice amber">
            <Shield size={14} className="shrink-0" />
            <span>Manual patient expenses are auto-tagged <strong>Self-reported</strong> to preserve audit integrity.</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
            <Button disabled={submitting || !expenseTitle.trim() || Number(expenseAmount) <= 0} onClick={handleAddExpense}>
              {submitting ? "Saving…" : "Save to live statement"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Add Older Document (AI Extraction) */}
      <Modal open={uploadModalOpen} onOpenChange={setUploadModalOpen} title="Add older document" description="Upload an older report or paper prescription. Extracted data requires patient confirmation and is tagged AI-read." width="max-w-lg">
        {!aiExtracted ? (
          <div className="space-y-4">
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-5 text-center transition hover:bg-emerald-50">
              <FileImage className="mb-2 text-emerald-700" size={24} />
              <span className="text-xs font-bold text-slate-700">Select PDF or report photo</span>
              <span className="mt-1 text-[9px] text-slate-400">PDF, PNG, JPG accepted</span>
              <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
            </label>
            {fileName && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-[10px] text-slate-700">
                <FileText size={14} /> {fileName}
              </div>
            )}
            <div className="flex justify-end">
              <Button disabled={!fileName} onClick={() => setAiExtracted(true)}>
                <Sparkles size={13} /> Extract sample fields
              </Button>
            </div>
          </div>
        ) : aiConfirmed ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Check size={22} />
            </div>
            <h3 className="mt-3 text-sm font-bold">Saved to your health record</h3>
            <p className="mt-1 text-[10px] text-slate-500">Tagged AI-read · patient-confirmed.</p>
            {storageWarning && <div className="notice amber mt-3 text-left"><span>{storageWarning}</span></div>}
            <Button className="mt-4" variant="secondary" onClick={() => { setUploadModalOpen(false); setAiExtracted(false); setAiConfirmed(false); }}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="notice">
              <Eye size={14} className="shrink-0" />
              <span>Review and confirm the extracted values before saving to your timeline.</span>
            </div>
            {uploadError && <div className="notice coral"><span>{uploadError}</span></div>}
            <div className="form-grid">
              <div className="field">
                <label>Document title</label>
                <input className="input" value={aiTitle} onChange={(e) => setAiTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>Extracted total (PKR)</label>
                <input className="input" type="number" value={aiAmount} onChange={(e) => setAiAmount(e.target.value)} />
              </div>
              <div className="field">
                <label>Report date</label>
                <input className="input" type="date" value={aiDate} onChange={(e) => setAiDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setAiExtracted(false)}>Back</Button>
              <Button disabled={submitting || !aiTitle.trim() || Number(aiAmount) <= 0} onClick={handleConfirmAiUpload}>
                {submitting ? "Saving…" : "Confirm & save to timeline"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Prescription QR */}
      {qrItem && (
        <Modal open={Boolean(qrItem)} onOpenChange={() => setQrItem(null)} title="Digital prescription QR" description="This QR code resolves only to this specific prescription ID. It contains no name, CNIC or medical history." width="max-w-md">
          <div className="flex flex-col items-center text-center">
            <div className="qr-frame my-3">
              <QRCodeSVG value={`/rx/resolve?token=${encodeURIComponent(qrItem.id)}`} size={170} level="M" includeMargin />
            </div>
            <div className="font-mono text-base font-extrabold text-emerald-800">{qrItem.code}</div>
            <div className="mt-3 w-full rounded-xl bg-slate-50 p-3 text-left text-[9px] space-y-1 text-slate-600">
              <div className="flex justify-between"><span>Doctor</span><strong>{qrItem.doctor}</strong></div>
              <div className="flex justify-between"><span>Provider</span><strong>{qrItem.provider}</strong></div>
              <div className="flex justify-between"><span>Valid until</span><strong>{dateLabel(qrItem.expiresAt)}</strong></div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => window.print()}><Printer size={13} /> Print / PDF</Button>
              <Button variant="quiet" onClick={() => setQrItem(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
