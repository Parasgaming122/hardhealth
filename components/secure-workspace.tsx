"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, Building2, ClipboardList, Database, FileClock, FilePlus2, FileText, LayoutDashboard, LogOut, Pill, Play, ScanLine, Settings2, Shield, Sparkles, Stethoscope, UsersRound, WalletCards } from "lucide-react";
import { AdminUserManager } from "@/components/admin-user-manager";
import { AdminProvidersManager } from "@/components/admin-providers-manager";
import { SecureMobileNav } from "@/components/secure-mobile-nav";
import { RealPatientPortal } from "@/components/real-patient-portal";
import { RealFrontDeskPanel } from "@/components/real-front-desk-panel";
import { RealDoctorPanel } from "@/components/real-doctor-panel";
import { RealPharmacyPanel } from "@/components/real-pharmacy-panel";
import { RealLabPanel } from "@/components/real-lab-panel";
import { ProviderAdminPanel } from "@/components/panels/provider-admin-panel";
import { PlatformAdminPanel } from "@/components/panels/platform-admin-panel";
import { signOutAction } from "@/app/login/actions";
import { workspaceConfig, workspaceSlugs, isPlatformAdmin, type WorkspacePayload, type WorkspaceSlug } from "@/lib/auth/roles";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";
import type { ProviderRecord } from "@/lib/admin/provider-actions";
import type { RealPatientPortalData } from "@/lib/patient/real-patient";
import type { RealPatientSummary } from "@/lib/provider/real-provider";
import { pkr } from "@/lib/domain";

const icons = { overview: LayoutDashboard, timeline: Activity, prescriptions: Pill, reports: FileText, expenses: WalletCards, providers: Shield, billing: FileClock, settings: Settings2, patients: UsersRound, collections: WalletCards, resolve: ScanLine, dispenses: Pill, bills: FileClock, staff: UsersRound, ledger: WalletCards, config: Settings2, audit: ClipboardList, users: UsersRound } as const;

function pageHref(workspace: WorkspaceSlug, key: string) { return `/${workspace}/${key}`; }

function metricValue(key: string, value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (key.includes("cost") || key.includes("collected") || key.includes("ledger") || key.includes("total")) return pkr(Number(value));
  return new Intl.NumberFormat("en-PK").format(Number(value));
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    cost_this_month: "Care costs this month", active_prescriptions: "Active prescriptions", reports: "Lab reports", linked_providers: "Linked providers",
    linked_patients: "Linked patients", visits_today: "Visits today", prescriptions_issued: "Prescriptions issued", outstanding_invoices: "Outstanding invoices",
    collected_this_month: "Collected this month", dispenses: "Dispenses", reports_issued: "Reports issued", provider_ledger_pending: "Provider share pending",
    providers_pending: "Providers pending", providers_approved: "Approved providers", invoices_paid_total: "Invoices collected", platform_ledger_total: "Platform ledger",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}

function mapSectionForPanel(workspace: WorkspaceSlug, sections: string[]): string {
  const key = sections.length ? sections.join("/") : "overview";
  if (workspace === "patient") {
    const map: Record<string, string> = {
      overview: "Overview", timeline: "Timeline", prescriptions: "Prescriptions", reports: "Reports",
      expenses: "Expenses", providers: "Providers & Access", billing: "Billing", settings: "Settings",
    };
    return map[key] ?? "Overview";
  }
  if (workspace === "doctor") {
    const map: Record<string, string> = {
      overview: "Today", patients: "Patient history", "prescriptions/new": "New prescription", prescriptions: "Recent prescriptions",
    };
    return map[key] ?? "Today";
  }
  if (workspace === "front-desk") {
    const map: Record<string, string> = {
      overview: "Overview", "patients/new": "Register patient", patients: "Register patient", collections: "Daily collections",
    };
    return map[key] ?? "Overview";
  }
  if (workspace === "pharmacy") {
    const map: Record<string, string> = {
      overview: "Scan / resolve", resolve: "Scan / resolve", dispenses: "Recent dispenses", bills: "Recent dispenses",
    };
    return map[key] ?? "Scan / resolve";
  }
  if (workspace === "lab") {
    const map: Record<string, string> = {
      overview: "New report", "reports/new": "New report", reports: "Reports issued",
    };
    return map[key] ?? "New report";
  }
  if (workspace === "provider-admin") {
    const map: Record<string, string> = {
      overview: "Overview", staff: "Staff", ledger: "Earnings ledger",
    };
    return map[key] ?? "Overview";
  }
  if (workspace === "admin") {
    const map: Record<string, string> = {
      overview: "Overview", providers: "Provider approvals", config: "Configuration", audit: "Audit log", users: "users",
    };
    return map[key] ?? "Overview";
  }
  return "Overview";
}

function panelSectionToHref(workspace: WorkspaceSlug, section: string): string {
  if (workspace === "patient") {
    const map: Record<string, string> = {
      Overview: "/patient/overview", Timeline: "/patient/timeline", Prescriptions: "/patient/prescriptions",
      Reports: "/patient/reports", Expenses: "/patient/expenses", "Providers & Access": "/patient/providers",
      Billing: "/patient/billing", Settings: "/patient/settings",
    };
    return map[section] ?? "/patient/overview";
  }
  if (workspace === "doctor") {
    const map: Record<string, string> = {
      Today: "/doctor/overview", "Patient history": "/doctor/patients",
      "New prescription": "/doctor/prescriptions/new", "Recent prescriptions": "/doctor/prescriptions",
    };
    return map[section] ?? "/doctor/overview";
  }
  if (workspace === "front-desk") {
    const map: Record<string, string> = {
      Overview: "/front-desk/overview", "Register patient": "/front-desk/patients/new",
      "Outstanding invoices": "/front-desk/collections", "Daily collections": "/front-desk/collections",
    };
    return map[section] ?? "/front-desk/overview";
  }
  return `/${workspace}/overview`;
}

export function SecureWorkspace({
  workspace,
  sections,
  pageTitle,
  access,
  adminUsers,
  adminProviders,
  allAdminProviders,
  patientPortalData,
  realPatients = [],
}: {
  workspace: WorkspaceSlug;
  sections: string[];
  pageTitle: string;
  access: WorkspacePayload;
  adminUsers?: AdminDirectoryUser[];
  adminProviders?: AdminApprovedProvider[];
  allAdminProviders?: ProviderRecord[];
  patientPortalData?: RealPatientPortalData;
  realPatients?: RealPatientSummary[];
}) {
  const router = useRouter();
  const config = workspaceConfig[workspace];
  const roles = access.roles ?? [];
  const hasAdminRole = isPlatformAdmin(roles);
  const hasRequestedRole = roles.some((entry) => entry.role === config.role);
  const adminOverride = hasAdminRole && workspace !== "admin" && !hasRequestedRole;
  const isPatient = workspace === "patient";
  const isPharmacy = workspace === "pharmacy";
  const isAdminWorkspace = workspace === "admin";
  const identity = isPatient && !adminOverride ? access.patient : undefined;
  const displayName = access.profile?.display_name || config.label;
  const currentKey = sections.length ? sections.join("/") : "overview";
  const showAdminUsers = isAdminWorkspace && currentKey === "users";

  const panelSection = mapSectionForPanel(workspace, sections);

  const handleSectionChange = useCallback((nextSection: string) => {
    const href = panelSectionToHref(workspace, nextSection);
    router.push(href);
  }, [router, workspace]);

  return <div className={`shell secure-shell ${isPatient ? "shell-patient" : ""}`}>
    <aside className={`sidebar ${isPatient ? "sidebar-patient" : ""}`}>
      <Link href="/" className="brand no-underline"><img className="brand-mark" src="/hard-mark.svg" alt="" /><span><span className="brand-name block">H.A.R.D</span><span className="brand-caption block">CARE · COST · CLARITY</span></span></Link>
      <div className="nav-label">{config.label} workspace</div>
      <nav className="space-y-1" aria-label={`${config.label} workspace navigation`}>
        {config.pages.map((page) => {
          const Icon = icons[page.key.split("/")[0] as keyof typeof icons] ?? LayoutDashboard;
          const active = currentKey === page.key || (page.key === "patients" && currentKey.startsWith("patients/")) || (page.key === "prescriptions" && currentKey.startsWith("prescriptions/")) || (page.key === "reports" && currentKey.startsWith("reports/"));
          return <Link key={page.key} href={pageHref(workspace, page.key)} aria-current={active ? "page" : undefined} className={`nav-link ${active ? "active" : ""}`}><Icon className="nav-icon" strokeWidth={1.8} /><span>{page.label}</span></Link>;
        })}
      </nav>
      <div className="side-bottom">
        <div className="secure-scope-note"><span className="secure-dot" />{isPharmacy ? "Single-prescription scope" : isAdminWorkspace ? "Non-clinical administration" : adminOverride ? "Admin route · records remain scoped" : "Role-scoped access"}</div>
        <div className="sidebar-foot"><BadgeCheck size={13} /> Supabase-authenticated session</div>
        <form action={signOutAction}><button type="submit" className="nav-link mt-3 w-full text-left"><LogOut className="nav-icon" /><span>Sign out</span></button></form>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <div className="crumb"><Link href="/" className="text-slate-500 no-underline">H.A.R.D</Link><span className="mx-1 text-slate-300">/</span><strong>{config.label}</strong></div>
          <span className="secure-badge"><span className="secure-dot" /> Authenticated account</span>
          <Link href="/demo" className="demo-pill inline-flex items-center gap-1.5 no-underline ml-2" title="Switch roles instantly and run the 5-7 minute prototype demo loop"><Play size={10} fill="currentColor" /> Explore Offline Demo</Link>
        </div>
        <div className="topbar-right">
          {hasAdminRole && <details className="secure-admin-switcher"><summary><Shield size={14} /> Workspaces</summary><div className="secure-admin-switcher-menu">{workspaceSlugs.map((slug) => <Link key={slug} href={`/${slug}/overview`}>{workspaceConfig[slug].label}</Link>)}</div></details>}
          <span className="avatar" aria-label={`Signed in as ${displayName}`}>{displayName.trim().slice(0, 2).toUpperCase()}</span>
          <form action={signOutAction}><button type="submit" className="btn-icon secure-mobile-signout" aria-label="Sign out"><LogOut size={15} /></button></form>
        </div>
      </header>

      <main className="content secure-content">
        <div className="secure-page-heading">
          <div>
            <p className="secure-eyebrow">{config.label} · {pageTitle}</p>
            <h1>{isPatient ? "Your care, accounted for." : `${config.label} workspace`}</h1>
            <p>{isPatient ? `Signed in as ${displayName} (${patientPortalData?.patient.healthId || "H.A.R.D Patient"}). A private view of your costs and records.` : `Role-authorized tools and summaries for ${config.label.toLowerCase()} work.`}</p>
          </div>
          <span className="verified-chip"><BadgeCheck size={14} />{adminOverride ? "Admin route access" : "Database verified"}</span>
        </div>

        {adminOverride && <div className="secure-override-note" role="status"><Shield size={15} /><span><strong>Platform Admin route access.</strong> You may open this H.A.R.D workspace, but clinical-record policies remain in effect.</span></div>}

        {/* Real Workspace Content */}
        {workspace === "admin" ? (
          currentKey === "users" ? (
            <AdminUserManager initialUsers={adminUsers ?? []} providers={adminProviders ?? []} />
          ) : currentKey === "providers" ? (
            <div className="space-y-6">
              <AdminProvidersManager initialProviders={allAdminProviders ?? []} />
              <PlatformAdminPanel section="Provider approvals" />
              <section className="secure-panel">
                <div className="secure-panel-head">
                  <div>
                    <p className="secure-eyebrow">Approved organizations</p>
                    <h2>Registered healthcare providers</h2>
                  </div>
                  <span className="verified-chip">{(adminProviders ?? []).length} approved</span>
                </div>
                <div className="admin-directory-table-wrap mt-4">
                  <table className="admin-directory-table">
                    <thead>
                      <tr>
                        <th scope="col">Organization</th>
                        <th scope="col">Type</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(adminProviders ?? []).map((p) => (
                        <tr key={p.provider_id}>
                          <td><strong>{p.provider_name}</strong></td>
                          <td className="capitalize">{p.provider_type}</td>
                          <td><span className="admin-role-chip active">Approved</span></td>
                        </tr>
                      ))}
                      {!(adminProviders ?? []).length && (
                        <tr>
                          <td colSpan={3} className="admin-directory-empty">No approved providers configured yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : currentKey === "config" ? (
            <PlatformAdminPanel section="Configuration" />
          ) : currentKey === "audit" ? (
            <PlatformAdminPanel section="Audit log" />
          ) : (
            <div className="space-y-6">
              <AdminUserManager initialUsers={adminUsers ?? []} providers={adminProviders ?? []} />
              <PlatformAdminPanel section="Overview" />
            </div>
          )
        ) : workspace === "patient" && patientPortalData ? (
          <RealPatientPortal data={patientPortalData} initialSection={panelSection} onSectionChange={handleSectionChange} />
        ) : workspace === "doctor" ? (
          <RealDoctorPanel patients={realPatients} section={panelSection} />
        ) : workspace === "front-desk" ? (
          <RealFrontDeskPanel patients={realPatients} section={panelSection} />
        ) : workspace === "pharmacy" ? (
          <RealPharmacyPanel section={panelSection} />
        ) : workspace === "lab" ? (
          <RealLabPanel patients={realPatients} section={panelSection} />
        ) : workspace === "provider-admin" ? (
          <ProviderAdminPanel section={panelSection} />
        ) : null}

        <p className="secure-footer-note"><Shield size={14} /> Connected to H.A.R.D Supabase database. Real account records only.</p>
      </main>
      <SecureMobileNav workspace={workspace} sections={sections} />
    </div>
  </div>;
}
