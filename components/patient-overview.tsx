"use client";

import { useState } from "react";
import { Activity, ArrowUpRight, CalendarDays, ChartNoAxesCombined, ChevronRight, Clock3, FileClock, FileCheck2, HeartPulse, Pill, QrCode, ShieldCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CategoryDonut, MonthlyTrend, ProviderBars } from "@/components/finance-charts";
import { useDemo } from "@/components/demo-provider";
import { Badge, Button, ProvenanceBadge } from "@/components/ui";
import { ageRange, dateLabel, pkr, relativeDate, yearsOld, type CostItem, type Invoice, type LabReport, type Patient, type Prescription, type Visit } from "@/lib/domain";

interface PatientOverviewProps {
  patient: Patient;
  patientCosts: CostItem[];
  prescriptions: Prescription[];
  visits: Visit[];
  patientReports: LabReport[];
  patientInvoices: Invoice[];
  onSectionChange: (section: string) => void;
  onShowQr: (prescription: Prescription) => void;
}

export function PatientOverview({ patient, patientCosts, prescriptions, visits, patientReports, patientInvoices, onSectionChange, onShowQr }: PatientOverviewProps) {
  const { data } = useDemo();
  const [activePeriod, setActivePeriod] = useState("6 months");
  const now = new Date();
  const monthSpent = patientCosts.filter((item) => new Date(item.date).getTime() >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()).reduce((sum, item) => sum + item.amount, 0);
  const yearSpent = patientCosts.filter((item) => new Date(item.date).getFullYear() === now.getFullYear()).reduce((sum, item) => sum + item.amount, 0);
  const allSpent = patientCosts.reduce((sum, item) => sum + item.amount, 0);
  const budgetRemaining = Math.max(0, patient.monthlyBudget - monthSpent);
  const budgetPercent = Math.min(100, monthSpent / Math.max(1, patient.monthlyBudget) * 100);
  const storagePercent = Math.min(100, patient.storageUsedMb / Math.max(1, patient.storageQuotaMb) * 100);
  const monthlySpend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return patientCosts.filter((cost) => {
      const date = new Date(cost.date);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    }).reduce((sum, cost) => sum + cost.amount, 0);
  });
  const activePrescription = prescriptions.find((rx) => rx.status === "active");
  const latestVisit = [...visits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const averageVisit = Math.round(allSpent / Math.max(1, visits.length));
  const overviewDate = now.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" });
  const timeline = [
    ...patientCosts.map((item) => ({ id: item.id, date: item.date, title: item.title, subtitle: `${item.provider} · ${item.category}`, amount: item.amount, provenance: item.provenance, kind: item.linkedType === "bill" ? "bill" : item.category === "Test" ? "report" : item.category === "Consultation" ? "visit" : "cost" })),
    ...prescriptions.map((rx) => ({ id: rx.id, date: rx.date, title: `Prescription ${rx.code}`, subtitle: `${rx.items.length} medicines · ${rx.doctor}`, amount: 0, provenance: "verified" as const, kind: "prescription" })),
    ...visits.map((visit) => ({ id: visit.id, date: visit.date, title: visit.diagnosis, subtitle: `${visit.provider} · ${visit.doctor}`, amount: 0, provenance: visit.provenance, kind: "visit" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 4);

  return (
    <div className="patient-overview-layout">
      <section className="patient-overview-main" aria-label="Healthcare spending overview">
        <header className="patient-overview-heading">
          <div>
            <div className="page-eyebrow">Patient account · {patient.healthId}</div>
            <h1 className="patient-overview-title">Health Overview</h1>
            <p className="patient-overview-date">{overviewDate} <span>·</span> Your care, costs and records at a glance.</p>
          </div>
          <div className="patient-overview-actions">
            <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => onSectionChange("Expenses")}><ChartNoAxesCombined size={13} /> All expenses</Button>
            <Button onClick={() => onSectionChange("Timeline")}><Activity size={13} /> View timeline</Button>
          </div>
        </header>

        {budgetPercent >= 80 && <div className={`notice ${budgetPercent >= 100 ? "coral" : "amber"} mb-3`}><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span><strong>{budgetPercent >= 100 ? "Monthly budget reached" : "Budget alert · 80%"}</strong> You have spent {Math.round(budgetPercent)}% of your monthly budget. Your records stay available.</span></div>}
        {patientInvoices.some((invoice) => invoice.status === "outstanding") && <div className="notice amber mb-3"><FileClock size={14} className="mt-0.5 shrink-0" /><span>One renewal invoice is outstanding. This will not block access to your records.</span><button className="ml-auto whitespace-nowrap font-bold underline" onClick={() => onSectionChange("Billing")}>View invoice</button></div>}

        <div className="patient-metric-grid">
          <PatientMetric label="Spent this month" value={pkr(monthSpent)} note="Across linked providers" icon={CalendarDays} tone="gold" values={monthlySpend} />
          <PatientMetric label="Spent this year" value={pkr(yearSpent)} note={`${patientCosts.length} tracked care items`} icon={ChartNoAxesCombined} tone="rose" values={monthlySpend} />
          <PatientMetric label="Budget remaining" value={pkr(budgetRemaining)} note={`${Math.round(budgetPercent)}% of monthly limit used`} icon={ShieldCheck} tone="aqua" values={monthlySpend.map((value) => Math.max(0, patient.monthlyBudget - value))} />
        </div>

        <section className="card patient-trend-card">
          <div className="card-head">
            <div><h2 className="card-title">Activity Growth</h2><div className="card-caption">Healthcare spending by month</div></div>
            <div className="patient-chart-period" aria-label="Chart period">{["6 months", "Year"].map((period) => <button key={period} type="button" className={activePeriod === period ? "active" : ""} onClick={() => setActivePeriod(period)}>{period === "Year" ? "Year" : "6 months"}</button>)}</div>
          </div>
          <div className="card-body pt-1">
            <div className="chart-wrap patient-trend-wrap"><MonthlyTrend costs={patientCosts} period={activePeriod} /></div>
            <div className="legend-row"><span><span className="legend-dot" style={{ background: "#4f9690" }} />Verified and reported care spend</span><span className="ml-auto">Average per visit <strong className="text-slate-600">{pkr(averageVisit)}</strong></span></div>
          </div>
        </section>

        <div className="patient-overview-support-grid">
          <section className="card"><div className="card-head"><div><h2 className="card-title">Spending by category</h2><div className="card-caption">See where your care costs go</div></div><button className="btn-icon" aria-label="View all expenses" onClick={() => onSectionChange("Expenses")}><ChevronRight size={15} /></button></div><div className="card-body pt-1"><CategoryDonut costs={patientCosts} /></div></section>
          <section className="card"><div className="card-head"><div><h2 className="card-title">Spending by provider</h2><div className="card-caption">Your linked care providers</div></div></div><div className="card-body"><ProviderBars costs={patientCosts} /></div></section>
        </div>

        <section className="card patient-recent-card">
          <div className="card-head"><div><h2 className="card-title">Recent activity</h2><div className="card-caption">Your latest care records and costs</div></div><button className="text-[9px] font-bold text-emerald-700" onClick={() => onSectionChange("Timeline")}>Full timeline <ChevronRight className="ml-1 inline" size={12} /></button></div>
          <div className="card-body"><div className="activity-list">{timeline.length ? timeline.map((item) => {
            const Icon = item.kind === "prescription" ? Pill : item.kind === "visit" ? HeartPulse : item.kind === "report" ? FileCheck2 : Wallet;
            return <div className="activity-item" key={item.id}><span className="activity-marker"><Icon size={13} /></span><div className="activity-text"><div className="activity-title">{item.title}</div><div className="activity-sub">{item.subtitle} · {relativeDate(item.date)}</div><div className="mt-2"><ProvenanceBadge provenance={item.provenance} /></div></div>{item.amount > 0 && <span className="activity-amount">{pkr(item.amount)}</span>}</div>;
          }) : <div className="py-4 text-center text-[10px] text-slate-400">No activity yet.</div>}</div></div>
        </section>
      </section>

      <aside className="patient-overview-aside" aria-label="Patient health and account summary">
        <header className="patient-aside-heading"><div><div className="patient-aside-eyebrow">CARE · COST · CLARITY</div><h2>Health at a glance</h2></div><span className="patient-aside-period">THIS MONTH</span></header>

        <section className="patient-dark-block patient-profile-block">
          <div className="patient-profile-row"><span className="patient-profile-avatar">{patient.initials}</span><div className="patient-profile-copy"><strong>{patient.fullName}</strong><span>{ageRange(yearsOld(patient.dob))} · {patient.gender}</span><small className="mono">{patient.healthId}</small></div><Badge type={patient.identityCheck === "desk_checked" ? "verified" : "pending"}>{patient.identityCheck === "desk_checked" ? "Desk-checked" : "ID pending"}</Badge></div>
          <div className="patient-profile-facts"><div><span>HEIGHT</span><strong>{patient.heightCm} <small>cm</small></strong></div><div><span>WEIGHT</span><strong>{patient.weightKg} <small>kg</small></strong></div><div><span>BMI</span><strong>{(patient.weightKg / ((patient.heightCm / 100) ** 2)).toFixed(1)}</strong></div></div>
          <p className="patient-profile-note">Profile details for your reference · not a diagnosis</p>
        </section>

        <section className="patient-dark-block">
          <div className="patient-dark-block-head"><div><span className="patient-dark-label">MONTHLY CARE BUDGET</span><h3>{pkr(monthSpent)} <small>spent</small></h3></div><span className="patient-budget-percent">{Math.round(budgetPercent)}%</span></div>
          <div className="progress-track patient-dark-progress"><div className="progress-bar" style={{ width: `${budgetPercent}%`, background: budgetPercent >= 100 ? "var(--coral)" : undefined }} /></div>
          <div className="patient-dark-foot"><span>{pkr(budgetRemaining)} remaining</span><span>of {pkr(patient.monthlyBudget)}</span></div>
        </section>

        <section className="patient-dark-block">
          <div className="patient-dark-block-head"><div><span className="patient-dark-label">RECORD STORAGE</span><h3>{(patient.storageUsedMb / 1024).toFixed(1)} <small>GB used</small></h3></div><span className={`patient-storage-pill ${storagePercent >= 100 ? "full" : ""}`}>{Math.round(storagePercent)}%</span></div>
          <div className="progress-track patient-dark-progress"><div className="progress-bar" style={{ width: `${storagePercent}%`, background: storagePercent >= 100 ? "var(--coral)" : undefined }} /></div>
          <div className="patient-dark-foot"><span>{patient.storagePlan} plan</span><span>{(patient.storageQuotaMb / 1024).toFixed(0)} GB total</span></div>
          {storagePercent >= data.config.storageAlertPercent && <p className="patient-storage-alert">{storagePercent >= 100 ? "Storage is full. New uploads are paused; reading remains available." : "Storage is nearing its limit. You can upgrade without losing access."}</p>}
          <Button variant="secondary" size="small" className="mt-3 w-full" onClick={() => onSectionChange("Billing")}>Manage storage plan <ChevronRight size={12} /></Button>
        </section>

        <section className="patient-dark-block patient-prescription-block">
          <div className="patient-dark-block-head"><div><span className="patient-dark-label">ACTIVE PRESCRIPTION</span><h3>{activePrescription ? activePrescription.code : "No active prescription"}</h3></div><Badge type={activePrescription ? "verified" : "neutral"}>{activePrescription ? "Verified" : "—"}</Badge></div>
          {activePrescription ? <><p className="patient-prescription-copy">{activePrescription.items.map((item) => item.medicine).join(" · ")}<br />{activePrescription.doctor} · {Math.max(0, activePrescription.maxFills - activePrescription.fillsUsed)} fill(s) available</p><Button variant="secondary" size="small" className="mt-3 w-full" onClick={() => onShowQr(activePrescription)}><QrCode size={13} /> Show pharmacy QR</Button></> : <p className="patient-prescription-copy">A verified pharmacy QR will appear here when your doctor issues a prescription.</p>}
        </section>

        <div className="patient-aside-bottom"><div className="patient-total-copy"><span>All-time tracked</span><strong>{pkr(allSpent)}</strong><small>{prescriptions.length} prescriptions · {patientReports.length} reports</small></div><button className="patient-last-visit" onClick={() => onSectionChange("Timeline")}><span><Clock3 size={13} /> {latestVisit ? "LATEST VISIT" : "CARE TIMELINE"}</span><strong>{latestVisit ? latestVisit.diagnosis : "No visits recorded"}</strong><small>{latestVisit ? `${latestVisit.doctor} · ${dateLabel(latestVisit.date)}` : "Open your full timeline"}<ChevronRight size={12} /></small></button></div>
      </aside>
    </div>
  );
}

function PatientMetric({ label, value, note, icon: Icon, tone, values }: { label: string; value: string; note: string; icon: LucideIcon; tone: "gold" | "rose" | "aqua"; values: number[] }) {
  return <article className={`patient-metric patient-metric-${tone}`}>
    <div className="patient-metric-top"><span className="patient-metric-icon"><Icon size={16} /></span><span className="patient-metric-label">{label}</span><ArrowUpRight size={13} className="patient-metric-arrow" /></div>
    <strong className="patient-metric-value">{value}</strong>
    <div className="patient-metric-bottom"><span>{note}</span><Sparkline values={values} /></div>
  </article>;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${values.length > 1 ? (index / (values.length - 1)) * 100 : 50},${34 - (value / max) * 27}`).join(" ");
  return <svg className="patient-sparkline" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>;
}
