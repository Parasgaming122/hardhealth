"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell, Building2, ChartNoAxesCombined, ClipboardList, FileClock, FilePlus2, FileText, HeartPulse, Home, LayoutDashboard, LogOut, Pill, Plus, QrCode, ScanLine, Settings2, Shield, Stethoscope, UsersRound, WalletCards, X } from "lucide-react";
import { LoginScreen } from "@/components/login-screen";
import { PatientDashboard } from "@/components/patient-dashboard";
import { FrontDeskPanel } from "@/components/panels/front-desk-panel";
import { DoctorPanel } from "@/components/panels/doctor-panel";
import { PharmacyPanel } from "@/components/panels/pharmacy-panel";
import { LabPanel } from "@/components/panels/lab-panel";
import { ProviderAdminPanel } from "@/components/panels/provider-admin-panel";
import { PlatformAdminPanel } from "@/components/panels/platform-admin-panel";
import { useDemo } from "@/components/demo-provider";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { RolePicker } from "@/components/ui";

const defaultSection: Record<Role, string> = {
  patient: "Overview", doctor: "Today", frontDesk: "Overview", pharmacy: "Scan / resolve", lab: "New report", providerAdmin: "Overview", platformAdmin: "Overview",
};
const navItems: Record<Role, { label: string; icon: typeof Home }[]> = {
  patient: [{ label: "Overview", icon: LayoutDashboard }, { label: "Timeline", icon: Activity }, { label: "Prescriptions", icon: Pill }, { label: "Reports", icon: FileText }, { label: "Expenses", icon: WalletCards }, { label: "Providers & Access", icon: Shield }, { label: "Billing", icon: FileClock }, { label: "Settings", icon: Settings2 }],
  doctor: [{ label: "Today", icon: LayoutDashboard }, { label: "Patient history", icon: UsersRound }, { label: "New prescription", icon: FilePlus2 }, { label: "Recent prescriptions", icon: Pill }],
  frontDesk: [{ label: "Overview", icon: LayoutDashboard }, { label: "Register patient", icon: Plus }, { label: "Outstanding invoices", icon: FileClock }, { label: "Daily collections", icon: WalletCards }],
  pharmacy: [{ label: "Scan / resolve", icon: ScanLine }, { label: "Recent dispenses", icon: Pill }],
  lab: [{ label: "New report", icon: FilePlus2 }, { label: "Reports issued", icon: FileText }, { label: "Verification link", icon: QrCode }],
  providerAdmin: [{ label: "Overview", icon: LayoutDashboard }, { label: "Earnings ledger", icon: WalletCards }, { label: "Cost view", icon: ChartNoAxesCombined }, { label: "Staff", icon: UsersRound }],
  platformAdmin: [{ label: "Overview", icon: LayoutDashboard }, { label: "Provider approvals", icon: Building2 }, { label: "Configuration", icon: Settings2 }, { label: "Finance & ledgers", icon: WalletCards }, { label: "Audit log", icon: ClipboardList }],
};

const panelTitle: Record<Role, string> = {
  patient: "Patient workspace", doctor: "Doctor workspace", frontDesk: "Front desk", pharmacy: "Pharmacy workspace", lab: "Lab workspace", providerAdmin: "Provider operations", platformAdmin: "Platform console",
};

export function AppShell() {
  const { currentRole, hydrated, logout, loginAs, data, toastMessage } = useDemo();
  const [section, setSection] = useState("Overview");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (currentRole) setSection(defaultSection[currentRole]);
  }, [currentRole]);

  if (!hydrated) return <div className="grid min-h-screen place-items-center text-xs text-slate-400">Preparing demo workspace…</div>;
  if (!currentRole) return <LoginScreen />;

  const items = navItems[currentRole];
  const unseen = data.notifications.filter((item) => !item.read).length;
  const patient = data.patients[0];

  return <div className={`shell ${currentRole === "patient" ? "shell-patient" : ""}`}>
    <aside className={`sidebar ${currentRole === "patient" ? "sidebar-patient" : ""}`}>
      <div className="brand"><img className="brand-mark" src="/hard-mark.svg" alt="" /><div><div className="brand-name">H.A.R.D</div><div className="brand-caption">CARE · COST · CLARITY</div></div></div>
      <div className="nav-label">Workspace</div>
      <nav className="space-y-1" aria-label="Workspace navigation">
        {items.map(({ label, icon: Icon }) => <button key={label} type="button" title={currentRole === "patient" ? label : undefined} aria-label={label} onClick={() => setSection(label)} className={`nav-link ${section === label ? "active" : ""}`}><Icon className="nav-icon" strokeWidth={1.8} /><span>{label}</span>{label === "Provider approvals" && <span className="nav-count">1</span>}</button>)}
      </nav>
      <div className="side-bottom">
        {currentRole === "patient" && <div className="storage-mini"><div className="storage-mini-head"><span>Record storage</span><span>{Math.round(patient.storageUsedMb / patient.storageQuotaMb * 100)}%</span></div><div className="storage-mini-sub">{(patient.storageUsedMb / 1024).toFixed(1)} GB of {(patient.storageQuotaMb / 1024).toFixed(0)} GB · {patient.storagePlan}</div><div className="storage-track"><div className="storage-fill" style={{ width: `${Math.min(100, patient.storageUsedMb / patient.storageQuotaMb * 100)}%` }} /></div></div>}
        {currentRole === "pharmacy" && <div className="storage-mini"><div className="flex items-center gap-2 text-[10px] font-bold text-emerald-800"><Shield size={14} /> Narrow access by design</div><div className="storage-mini-sub">A code opens one prescription. No patient search.</div></div>}
        <div className="sidebar-foot"><span className="demo-dot" /> Fake seed data · no live records</div>
        <button type="button" title={currentRole === "patient" ? "Exit demo" : undefined} aria-label="Exit demo" className="nav-link mt-3" onClick={logout}><LogOut className="nav-icon" /><span>Exit demo</span></button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left"><div className="crumb">H.A.R.D <span className="mx-1 text-slate-300">/</span> <strong>{panelTitle[currentRole]}</strong></div><span className="demo-pill"><span className="demo-dot" /> Demo prototype</span></div>
        <div className="topbar-right"><button className="btn-icon relative" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}><Bell size={15} />{unseen > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-600 px-1 text-[8px] font-bold text-white">{unseen}</span>}</button><RolePicker role={currentRole} onChange={(role) => { setSection(defaultSection[role]); loginAs(role); }} /><span className="avatar hidden sm:grid">{currentRole === "patient" ? "AS" : ROLE_LABELS[currentRole].slice(0, 2).toUpperCase()}</span></div>
      </header>
      {showNotifications && <div className="fixed right-20 top-[58px] z-40 w-[min(350px,calc(100vw-24px))] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl"><div className="mb-3 flex items-center justify-between"><div className="text-xs font-bold">Notifications</div><button onClick={() => setShowNotifications(false)} className="text-slate-400"><X size={14} /></button></div>{data.notifications.slice(0, 5).map((item) => <div key={item.id} className="border-t border-slate-50 py-3"><div className="flex items-center gap-2 text-[10px] font-bold">{!item.read && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}{item.title}</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{item.body}</div></div>)}{data.notifications.length === 0 && <p className="py-4 text-[10px] text-slate-400">No notifications yet.</p>}</div>}
      <main className="content">
        {currentRole === "patient" && <PatientDashboard section={section} onSectionChange={setSection} />}
        {currentRole === "frontDesk" && <FrontDeskPanel section={section} onSectionChange={setSection} />}
        {currentRole === "doctor" && <DoctorPanel section={section} onSectionChange={setSection} />}
        {currentRole === "pharmacy" && <PharmacyPanel section={section} />}
        {currentRole === "lab" && <LabPanel section={section} />}
        {currentRole === "providerAdmin" && <ProviderAdminPanel section={section} />}
        {currentRole === "platformAdmin" && <PlatformAdminPanel section={section} />}
      </main>
      <nav className="mobile-nav" aria-label="Mobile workspace navigation">{items.slice(0, 5).map(({ label, icon: Icon }) => <button key={label} onClick={() => setSection(label)} className={section === label ? "active" : ""}><Icon size={17} /><span>{label.split(" ")[0]}</span></button>)}</nav>
    </div>
    {toastMessage && <div role="status" className="toast">{toastMessage}</div>}
  </div>;

}
