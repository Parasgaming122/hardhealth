"use client";

import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, ArrowUpRightFromSquare, BadgeCheck, Bell, Building2, CalendarDays, Check, ChartNoAxesCombined, ChevronRight, Clock3, Download, Eye, FileCheck2, FileClock, FileImage, FileText, Filter, HeartPulse, Link2, LockKeyhole, Pill, Plus, Printer, QrCode, ScanLine, Settings2, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PatientOverview } from "@/components/patient-overview";
import { useDemo } from "@/components/demo-provider";
import { Badge, Button, Modal, ProvenanceBadge } from "@/components/ui";
import { ageRange, compactPkr, dateLabel, pkr, relativeDate, yearsOld, type CostItem } from "@/lib/domain";
import type { Patient } from "@/lib/domain";
import { getPatientCosts, getPatientPrescriptions, getPatientVisits } from "@/lib/mock-data";

const defaultPatientId = "p-1001";
const tabItems = ["Overview", "Timeline", "Prescriptions", "Reports", "Expenses", "Providers & Access", "Billing", "Settings"];

function AIUploadReview({ patient, open, onClose }: { patient: Patient; open: boolean; onClose: () => void }) {
  const { data, saveConfirmedIngestion, showToast } = useDemo();
  const [fileName, setFileName] = useState("");
  const [extracted, setExtracted] = useState(false);
  const [title, setTitle] = useState("Community clinic · CBC result");
  const [amount, setAmount] = useState("1800");
  const [date, setDate] = useState(new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10));
  const [confirmed, setConfirmed] = useState(false);
  const duplicate = data.costs.some((item) => item.patientId === patient.id && item.title.trim().toLowerCase() === title.trim().toLowerCase() && item.amount === Number(amount) && item.date.slice(0, 10) === date);
  const readMock = () => {
    if (!fileName) { showToast("Choose a fictional PDF or image first"); return; }
    setExtracted(true);
    showToast("Sample extraction prepared · review each field");
  };
  return <Modal open={open} onOpenChange={(value) => { if (!value) onClose(); }} title="Add an older document" description="A mocked extraction helps organize a patient-provided file. It does not verify authenticity." width="max-w-2xl">
    {!extracted ? <div className="space-y-4">
      <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-5 text-center transition hover:bg-emerald-50"><FileImage className="mb-2 text-emerald-700" size={22} /><span className="text-[11px] font-bold text-slate-700">Choose a PDF or photo</span><span className="mt-1 text-[9px] text-slate-400">Stored as a local filename placeholder only</span><input className="hidden" type="file" accept="application/pdf,image/*" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} /></label>
      {fileName && <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600"><FileText size={14} />{fileName}</div>}
      <div className="notice amber"><Sparkles size={15} className="mt-0.5 shrink-0" /><span>Prototype mode: no AI service is called and no uploaded file is sent. The sample fields appear only after you select a fake document.</span></div>
      <div className="flex justify-end"><Button onClick={readMock}><Sparkles size={13} /> Read sample fields</Button></div>
    </div> : confirmed ? <div className="py-5 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check size={22} /></div><h3 className="mt-3 text-sm font-bold">Saved to your timeline</h3><p className="mt-1 text-[10px] text-slate-500">Tagged AI-read · patient-confirmed.</p><div className="mt-5"><Button variant="secondary" onClick={onClose}>Done</Button></div></div> : <div className="space-y-4">
      <div className="notice"><Eye size={15} className="mt-0.5 shrink-0" /><span>Review and edit the extracted fields. Nothing is saved until you confirm.</span></div>
      <div className="form-grid"><div className="field"><label>Document / test</label><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="field"><label>Provider name</label><input className="input" defaultValue="Community clinic" /></div><div className="field"><label>Document date</label><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="field"><label>Extracted total (PKR)</label><input className="input" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div>
      <div className="rounded-xl border border-slate-100 p-3"><div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Extracted items · confidence 86%</div><div className="flex justify-between border-b border-slate-50 py-2 text-[10px]"><span>Complete blood count</span><span>{pkr(Number(amount) || 0)}</span></div><div className="mt-2 flex items-center gap-2 text-[9px] text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Handwritten and Urdu documents may contain extraction errors.</div></div>
      <div className="notice amber"><LockKeyhole size={14} className="mt-0.5 shrink-0" /><span>This entry is patient-confirmed, not medically or cryptographically verified.</span></div>{duplicate && <div className="notice coral"><AlertTriangle size={13} /><span>A record with the same title, amount and date already exists. Review the existing item before adding a duplicate.</span></div>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setExtracted(false)}>Back</Button><Button disabled={!title || Number(amount) <= 0 || duplicate} onClick={() => { saveConfirmedIngestion({ patientId: patient.id, title, amount: Number(amount), date: new Date(date).toISOString(), fileName }); setConfirmed(true); }}>Confirm and save</Button></div>
    </div>}
  </Modal>;
}

function PrescriptionQrModal({ prescription, open, onClose }: { prescription: ReturnType<typeof getPatientPrescriptions>[number] | null; open: boolean; onClose: () => void }) {
  if (!prescription) return null;
  const qrValue = `/rx/resolve?token=${encodeURIComponent(prescription.token)}`;
  return <Modal open={open} onOpenChange={(value) => { if (!value) onClose(); }} title="Your digital prescription" description="This QR holds an opaque demo token only. It does not contain your name, CNIC, Health ID or clinical details." width="max-w-md">
    <div className="flex flex-col items-center text-center">
      <div className="mb-4"><Badge type={prescription.status === "active" ? "verified" : "neutral"}>{prescription.status.replace("_", " ")}</Badge></div>
      <div className="qr-frame"><QRCodeSVG value={qrValue} size={178} level="M" includeMargin /></div>
      <div className="mono mt-4 text-lg font-extrabold tracking-wider text-emerald-800">{prescription.code}</div>
      <div className="mt-1 text-[9px] text-slate-400">Short code · <span className="mono font-bold text-slate-600">{prescription.shortCode}</span></div>
      <div className="mt-4 w-full rounded-xl bg-slate-50 p-3 text-left text-[9px] leading-5 text-slate-500"><div className="flex justify-between"><span>Issued by</span><strong className="text-slate-700">{prescription.doctor}</strong></div><div className="flex justify-between"><span>Valid until</span><strong className="text-slate-700">{dateLabel(prescription.expiresAt)}</strong></div><div className="flex justify-between"><span>Fills remaining</span><strong className="text-slate-700">{Math.max(0, prescription.maxFills - prescription.fillsUsed)}</strong></div></div>
      <div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => window.print()}><Printer size={13} /> Print / Save PDF</Button><Button variant="quiet" onClick={onClose}>Done</Button></div>
    </div>
  </Modal>;
}

export function PatientDashboard({ section, onSectionChange }: { section: string; onSectionChange: (section: string) => void }) {
  const { data, addExpense, markInvoicePaid, upgradeStoragePlan, revokeProviderLink, addAccessLog, showToast } = useDemo();
  const patient = data.patients.find((item) => item.id === defaultPatientId) ?? data.patients[0];
  const patientCosts = useMemo(() => patient ? getPatientCosts(patient.id, data) : [], [data, patient]);
  const prescriptions = useMemo(() => patient ? getPatientPrescriptions(patient.id, data) : [], [data, patient]);
  const visits = useMemo(() => patient ? getPatientVisits(patient.id, data) : [], [data, patient]);
  const [filter, setFilter] = useState("All activity");
  const [qrItem, setQrItem] = useState<typeof prescriptions[number] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<CostItem["category"]>("Other");
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineProvider, setTimelineProvider] = useState("All providers");
  const [timelinePeriod, setTimelinePeriod] = useState("Any date");

  if (!patient) return <div className="card p-8 text-center text-xs text-slate-500">No patient demo data is available.</div>;

  const now = Date.now();
  const allSpent = patientCosts.reduce((sum, item) => sum + item.amount, 0);
  const topExpenses = [...patientCosts].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const patientInvoices = data.invoices.filter((invoice) => invoice.patientId === patient.id);
  const patientLogs = data.accessLogs.filter((log) => log.patientId === patient.id);
  const patientReports = data.labReports.filter((report) => report.patientId === patient.id);
  const timeline = [
    ...patientCosts.map((item) => ({ id: item.id, date: item.date, title: item.title, subtitle: `${item.provider} · ${item.category}`, amount: item.amount, provenance: item.provenance, kind: item.linkedType === "bill" ? "bill" : item.category === "Test" ? "report" : item.category === "Consultation" ? "visit" : "cost" })),
    ...prescriptions.map((rx) => ({ id: rx.id, date: rx.date, title: `Prescription ${rx.code}`, subtitle: `${rx.items.length} medicines · ${rx.doctor}`, amount: 0, provenance: "verified" as const, kind: "prescription" })),
    ...visits.map((visit) => ({ id: visit.id, date: visit.date, title: visit.diagnosis, subtitle: `${visit.provider} · ${visit.doctor}`, amount: 0, provenance: visit.provenance, kind: "visit" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const timelineProviders = [...new Set(timeline.map((item) => item.subtitle.split(" · ")[0]))].sort();
  const timelineCutoff = timelinePeriod === "Last 30 days" ? now - 30 * 86400000 : timelinePeriod === "Last 6 months" ? now - 183 * 86400000 : 0;
  const filteredTimeline = timeline.filter((item) => (filter === "All activity" || (filter === "Prescriptions" && item.kind === "prescription") || (filter === "Visits" && item.kind === "visit") || (filter === "Bills & costs" && ["bill", "cost"].includes(item.kind)) || (filter === "Reports" && item.kind === "report")) && (timelineProvider === "All providers" || item.subtitle.split(" · ")[0] === timelineProvider) && new Date(item.date).getTime() >= timelineCutoff && (!timelineSearch || `${item.title} ${item.subtitle}`.toLowerCase().includes(timelineSearch.trim().toLowerCase())));

  const addPatientExpense = () => {
    if (!expenseTitle.trim() || Number(expenseAmount) <= 0) return;
    addExpense({ patientId: patient.id, title: expenseTitle, amount: Number(expenseAmount), category: expenseCategory });
    setExpenseTitle(""); setExpenseAmount(""); setExpenseOpen(false);
  };
  const exportCsv = () => {
    const rows = [["Date", "Description", "Provider", "Category", "Amount PKR", "Source"], ...patientCosts.map((item) => [new Date(item.date).toISOString().slice(0, 10), item.title, item.provider, item.category, String(item.amount), item.source])];
    const blob = new Blob([rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "hard-expense-statement.csv"; anchor.click(); URL.revokeObjectURL(url); showToast("Expense statement exported as CSV");
  };

  const overview = <PatientOverview
    patient={patient}
    patientCosts={patientCosts}
    prescriptions={prescriptions}
    visits={visits}
    patientReports={patientReports}
    patientInvoices={patientInvoices}
    onSectionChange={onSectionChange}
    onShowQr={setQrItem}
  />;

  const timelineView = <section className="card"><div className="card-head !items-start !flex-wrap"><div><h2 className="card-title">Your health and spending timeline</h2><div className="card-caption">Visits, prescriptions, reports and every tracked rupee</div></div><div className="flex flex-wrap items-center gap-2"><Filter size={13} className="text-slate-400" /><input className="input !min-h-[30px] !w-36 !px-2 !text-[9px]" placeholder="Search timeline" value={timelineSearch} onChange={(event) => setTimelineSearch(event.target.value)} /><select aria-label="Filter by provider" className="select !min-h-[30px] !w-auto !py-1 !text-[9px]" value={timelineProvider} onChange={(event) => setTimelineProvider(event.target.value)}><option>All providers</option>{timelineProviders.map((provider) => <option key={provider}>{provider}</option>)}</select><select aria-label="Filter by date" className="select !min-h-[30px] !w-auto !py-1 !text-[9px]" value={timelinePeriod} onChange={(event) => setTimelinePeriod(event.target.value)}><option>Any date</option><option>Last 30 days</option><option>Last 6 months</option></select><select aria-label="Filter by activity type" className="select !min-h-[30px] !w-auto !py-1 !text-[9px]" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All activity</option><option>Prescriptions</option><option>Visits</option><option>Reports</option><option>Bills & costs</option></select></div></div><div className="card-body"><ActivityList items={filteredTimeline} onPrescription={(itemId) => setQrItem(prescriptions.find((rx) => rx.id === itemId) ?? null)} /></div></section>;

  const prescriptionsView = <div className="space-y-4">{prescriptions.length === 0 ? <Empty text="No prescriptions yet." /> : prescriptions.map((rx) => <section className="card p-4 sm:p-5" key={rx.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="mono text-sm font-extrabold text-emerald-800">{rx.code}</span><Badge type={rx.status === "active" ? "verified" : rx.status === "partly_filled" ? "pending" : "neutral"}>{rx.status.replace("_", " ")}</Badge></div><div className="mt-2 text-[10px] text-slate-500">{rx.doctor} · {rx.provider} · {dateLabel(rx.date)}</div><div className="mt-1 text-[9px] text-slate-400">Expires {dateLabel(rx.expiresAt)} · {Math.max(0, rx.maxFills - rx.fillsUsed)} fill(s) remaining</div></div><Button variant="secondary" size="small" onClick={() => setQrItem(rx)}><QrCode size={13} /> Show QR</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{rx.items.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold text-slate-700">{item.medicine}</div><div className="mt-1 text-[9px] text-slate-500">{item.strength} · {item.dose} · {item.frequency}</div><div className="mt-1 text-[9px] text-slate-400">{item.duration} · Qty {item.quantity}</div></div>)}</div><div className="mt-3"><ProvenanceBadge provenance="verified" /></div></section>)}</div>;

  const reportsView = <div className="space-y-4"><section className="card"><div className="card-head"><div><h2 className="card-title">Lab reports</h2><div className="card-caption">Digitally issued, with public verification links</div></div><Button size="small" disabled={patient.storageUsedMb >= patient.storageQuotaMb} title={patient.storageUsedMb >= patient.storageQuotaMb ? "Storage is full; upgrade to upload more" : undefined} onClick={() => setUploadOpen(true)}><Plus size={13} /> Add older document</Button></div><div className="card-body"><div className="space-y-3">{patientReports.map((report) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileCheck2 size={16} /></span><div><div className="text-[10px] font-bold">{report.testType}</div><div className="mt-1 text-[9px] text-slate-400">{report.lab} · {dateLabel(report.date)}</div></div></div><div className="flex items-center gap-2"><Badge type="verified">Verified</Badge><a className="btn btn-secondary btn-small" href={`/verify/lab?token=${encodeURIComponent(report.token)}`} target="_blank" rel="noreferrer"><ArrowUpRightFromSquare size={12} /> Verify</a></div></div>)}{patientCosts.filter((cost) => cost.provenance === "ai-confirmed").map((cost) => <div key={cost.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><Sparkles size={16} /></span><div><div className="text-[10px] font-bold">{cost.title}</div><div className="mt-1 text-[9px] text-slate-400">Patient reviewed · {dateLabel(cost.date)}</div></div></div><ProvenanceBadge provenance="ai-confirmed" /></div>)}</div><div className="notice amber mt-4"><Sparkles size={14} className="mt-0.5 shrink-0" /><span>Older PDF/photo documents can be reviewed and confirmed. Extraction is a demo only and does not prove authenticity.</span></div></div></section></div>;

  const expensesView = <section className="card"><div className="card-head"><div><h2 className="card-title">Your expenses</h2><div className="card-caption">Linked bills and self-reported costs · {pkr(allSpent)} total</div></div><div className="flex gap-2"><Button variant="secondary" size="small" onClick={exportCsv}><Download size={12} /> CSV</Button><Button variant="secondary" size="small" onClick={() => window.print()}><Printer size={12} /> PDF</Button><Button size="small" onClick={() => setExpenseOpen(true)}><Plus size={12} /> Add expense</Button></div></div><div className="grid gap-2 p-4 pb-0 sm:grid-cols-3">{topExpenses.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Largest expense</div><div className="mt-1 truncate text-[9px] font-bold text-slate-600">{item.title}</div><div className="mt-1 text-[8px] text-slate-400">{item.category} · {dateLabel(item.date, { day: "numeric", month: "short" })}</div><div className="mt-2 text-[11px] font-extrabold text-slate-700">{pkr(item.amount)}</div></div>)}</div><div className="table-wrap card-body !pt-3"><table className="table"><thead><tr><th>Date</th><th>Description</th><th>Provider</th><th>Category</th><th>Source</th><th className="text-right">Amount</th></tr></thead><tbody>{patientCosts.map((cost) => <tr key={cost.id}><td>{dateLabel(cost.date, { day: "numeric", month: "short" })}</td><td><strong>{cost.title}</strong></td><td>{cost.provider}</td><td>{cost.category}</td><td><ProvenanceBadge provenance={cost.provenance} /></td><td className="text-right font-bold">{pkr(cost.amount)}</td></tr>)}</tbody></table></div></section>;

  const accessView = <div className="content-grid"><section className="card"><div className="card-head"><div><h2 className="card-title">Linked providers</h2><div className="card-caption">Only active links can access your record</div></div></div><div className="card-body space-y-2">{data.providers.filter((provider) => provider.status === "approved").map((provider) => <div key={provider.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Building2Mini /></span><div className="min-w-0 flex-1"><div className="text-[10px] font-bold">{provider.name}</div><div className="mt-1 text-[9px] text-slate-400">{provider.type} · {provider.location}</div></div><Badge type={patient.providerLink === "active" ? "verified" : "alert"}>{patient.providerLink === "active" ? "Active link" : "Revoked"}</Badge>{provider.id === "clinic-1" && patient.providerLink === "active" && <Button variant="danger" size="small" onClick={() => revokeProviderLink(patient.id)}>Revoke</Button>}</div>)}<div className="notice mt-3"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>Pharmacies do not have a provider link to your record. They can resolve one prescription by its token or short code only.</span></div></div></section><section className="card"><div className="card-head"><div><h2 className="card-title">Access history</h2><div className="card-caption">Every non-patient read is logged</div></div><Badge type="neutral">{patientLogs.length} events</Badge></div><div className="card-body"><ActivityList items={patientLogs.map((log) => ({ id: log.id, date: log.date, title: log.action, subtitle: `${log.actor} · ${log.entity}`, amount: 0, provenance: "verified" as const, kind: log.kind }))} /></div></section></div>;

  const billingView = <div className="content-grid"><section className="card"><div className="card-head"><div><h2 className="card-title">Invoices & subscription</h2><div className="card-caption">Your renewal never blocks access to existing records</div></div><Badge type="verified">{patient.storagePlan} plan</Badge></div><div className="card-body space-y-3">{patientInvoices.length === 0 ? <Empty text="No invoices yet." /> : patientInvoices.map((invoice) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3" key={invoice.id}><div><div className="text-[10px] font-bold capitalize">{invoice.type} invoice</div><div className="mt-1 text-[9px] text-slate-400">{invoice.receiptNo ?? invoice.id} · {dateLabel(invoice.date)}</div></div><div className="flex items-center gap-3"><strong className="text-[11px]">{pkr(invoice.amount)}</strong>{invoice.status === "paid" ? <Badge type="verified">Paid</Badge> : <><Badge type="pending">Outstanding</Badge><Button size="small" onClick={() => markInvoicePaid(invoice.id, "Wallet", "Patient")}>Mark paid · demo</Button></>}</div></div>)}</div></section><section className="card"><div className="card-head"><div><h2 className="card-title">Storage plans</h2><div className="card-caption">Upgrade when you need more room</div></div></div><div className="card-body space-y-3">{data.config.plans.map((plan) => <div className={`rounded-xl border p-3 ${plan.name === patient.storagePlan ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100"}`} key={plan.name}><div className="flex items-center justify-between"><div className="text-[10px] font-bold">{plan.name}</div><div className="text-[10px] font-bold">{pkr(plan.yearlyPrice)}<span className="text-[8px] font-normal text-slate-400"> / year</span></div></div><div className="mt-1 text-[9px] text-slate-400">{plan.quotaMb / 1024} GB storage</div>{plan.name === patient.storagePlan ? <Badge type="verified">Current plan</Badge> : plan.quotaMb > patient.storageQuotaMb ? <Button size="small" className="mt-3" onClick={() => upgradeStoragePlan(patient.id, plan.name)}>Create upgrade invoice</Button> : <span className="mt-3 inline-block text-[8px] text-slate-400">Included below current quota</span>}</div>)}<div className="notice amber"><LockKeyhole size={14} className="mt-0.5 shrink-0" /><span>At 100% quota, new uploads are blocked. Reading remains available, including when a renewal is unpaid.</span></div></div></section></div>;

  const settingsView = <div className="content-grid"><section className="card"><div className="card-head"><div><h2 className="card-title">Your health profile</h2><div className="card-caption">Basic profile details and emergency contact</div></div><Badge type="neutral">Desk-checked ID</Badge></div><div className="card-body"><div className="form-grid">{[["Health ID", patient.healthId], ["Blood group", patient.bloodGroup], ["Age", `${yearsOld(patient.dob)} years`], ["Height / weight", `${patient.heightCm} cm / ${patient.weightKg} kg`], ["BMI", (patient.weightKg / ((patient.heightCm / 100) ** 2)).toFixed(1)], ["Emergency contact", patient.emergencyContact]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1.5 text-[10px] font-bold">{value}</div></div>)}</div><div className="divider" /><div className="text-[10px] font-bold">Allergies</div><div className="mt-2 flex gap-2">{patient.allergies.map((allergy) => <Badge key={allergy} type="alert">{allergy}</Badge>)}</div></div></section><section className="card"><div className="card-head"><div><h2 className="card-title">Prototype & privacy</h2><div className="card-caption">Understand this demonstration boundary</div></div></div><div className="card-body space-y-3"><div className="notice amber"><LockKeyhole size={14} className="mt-0.5 shrink-0" /><span>Do not enter real medical or identity data. Demo state is kept in this browser only.</span></div><div className="text-[9px] leading-5 text-slate-500">Production needs server-side access controls, secure record storage, signed links, append-only audit and a legal review. The role switcher and access events here are illustrative UI only.</div><Button variant="secondary" size="small" onClick={() => showToast("This prototype does not store or verify real credentials.")}>About demo access</Button></div></section></div>;

  return <>
    {section !== "Overview" && <div className="page-heading"><div><div className="page-eyebrow">Patient account · {patient.healthId}</div><h1 className="page-title">Good morning, {patient.fullName.split(" ")[0]}</h1><p className="page-subtitle">Your care, costs and records—together in one place.</p></div><div className="flex gap-2"><Button variant="secondary" className="hidden sm:inline-flex" onClick={() => { exportCsv(); }}><Download size={13} /> Export statement</Button><Button onClick={() => onSectionChange("Timeline")}><Activity size={13} /> View timeline</Button></div></div>}
    <Tabs.Root value={section} onValueChange={onSectionChange}>
      <Tabs.List className={`section-tabs ${section === "Overview" ? "patient-overview-tabs" : ""}`} aria-label="Patient account sections">{tabItems.map((tab) => <Tabs.Trigger key={tab} value={tab} className={`section-tab ${section === tab ? "active" : ""}`}>{tab}</Tabs.Trigger>)}</Tabs.List>
      <Tabs.Content value="Overview" className="outline-none">{overview}</Tabs.Content>
      <Tabs.Content value="Timeline" className="outline-none">{timelineView}</Tabs.Content>
      <Tabs.Content value="Prescriptions" className="outline-none">{prescriptionsView}</Tabs.Content>
      <Tabs.Content value="Reports" className="outline-none">{reportsView}</Tabs.Content>
      <Tabs.Content value="Expenses" className="outline-none">{expensesView}</Tabs.Content>
      <Tabs.Content value="Providers & Access" className="outline-none">{accessView}</Tabs.Content>
      <Tabs.Content value="Billing" className="outline-none">{billingView}</Tabs.Content>
      <Tabs.Content value="Settings" className="outline-none">{settingsView}</Tabs.Content>
    </Tabs.Root>
    <PrescriptionQrModal prescription={qrItem} open={!!qrItem} onClose={() => setQrItem(null)} />
    <AIUploadReview patient={patient} open={uploadOpen} onClose={() => setUploadOpen(false)} />
    <Modal open={expenseOpen} onOpenChange={setExpenseOpen} title="Add a self-reported expense" description="This entry is not verified by a provider and will be tagged Self-reported." width="max-w-md"><div className="space-y-3"><div className="field"><label>Description</label><input className="input" placeholder="e.g. Travel to appointment" value={expenseTitle} onChange={(event) => setExpenseTitle(event.target.value)} /></div><div className="form-grid"><div className="field"><label>Amount (PKR)</label><input className="input" type="number" min="1" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} /></div><div className="field"><label>Category</label><select className="select" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value as CostItem["category"])}>{["Consultation", "Test", "Medicine", "Procedure", "Admission", "Other"].map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="flex justify-end"><Button disabled={!expenseTitle.trim() || Number(expenseAmount) <= 0} onClick={addPatientExpense}>Add expense</Button></div></div></Modal>
  </>;
}

function ActivityList({ items, onPrescription }: { items: { id: string; date: string; title: string; subtitle: string; amount: number; provenance: CostItem["provenance"]; kind: string }[]; onPrescription?: (id: string) => void }) {
  const icons: Record<string, typeof Activity> = { prescription: QrCode, bill: Wallet, report: FileCheck2, visit: HeartPulse, cost: Wallet, normal_read: Eye, pharmacy_resolve: ScanLine, dispense: Pill, write: FileText };
  if (!items.length) return <Empty text="No activity yet." />;
  return <div className="activity-list">{items.map((item) => { const Icon = icons[item.kind] ?? Activity; return <div key={item.id} className="activity-item"><span className="activity-marker"><Icon size={13} /></span><div className="activity-text"><div className="activity-title">{item.title}</div><div className="activity-sub">{item.subtitle} · {relativeDate(item.date)}</div><div className="mt-2"><ProvenanceBadge provenance={item.provenance} /></div></div>{item.amount > 0 ? <span className="activity-amount">{pkr(item.amount)}</span> : item.kind === "prescription" && onPrescription ? <button className="btn-icon" aria-label="Show prescription QR" onClick={() => onPrescription(item.id)}><QrCode size={13} /></button> : null}</div>; })}</div>;
}

function PrescriptionSummary({ rx, onQr }: { rx: NonNullable<ReturnType<typeof getPatientPrescriptions>[number]>; onQr: () => void }) {
  return <div className="rx-card"><div className="flex items-start justify-between gap-3"><div><div className="mono rx-code">{rx.code}</div><div className="mt-1 text-[9px] text-slate-400">{rx.doctor} · {dateLabel(rx.date)}</div></div><Badge type="verified">Verified</Badge></div><div className="mt-3">{rx.items.slice(0, 2).map((item) => <div className="rx-medicine" key={item.id}><div className="rx-medicine-name">{item.medicine}</div><div className="rx-medicine-sub">{item.strength} · {item.dose} · {item.frequency}</div></div>)}</div><div className="mt-3 flex items-center justify-between"><span className="text-[8px] text-slate-400">{Math.max(0, rx.maxFills - rx.fillsUsed)} fill(s) available</span><Button size="small" onClick={onQr}><QrCode size={12} /> Show QR</Button></div></div>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 p-7 text-center text-[10px] text-slate-400">{text}</div>; }
function Settings2Mini() { return <Settings2Icon />; }
function Settings2Icon() { return <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-400"><Settings2 size={13} /></span>; }
function Building2Mini() { return <Building2 size={14} />; }
