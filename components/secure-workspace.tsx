"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, BadgeCheck, Building2, ClipboardList, Database, FileClock, FileText, LayoutDashboard, LogOut, Pill, Play, ScanLine, Settings2, Shield, UsersRound, WalletCards } from "lucide-react";
import { AdminUserManager } from "@/components/admin-user-manager";
import { AdminProvidersManager } from "@/components/admin-providers-manager";
import { SecureMobileNav } from "@/components/secure-mobile-nav";
import { RealPatientPortal } from "@/components/real-patient-portal";
import { RealFrontDeskPanel } from "@/components/real-front-desk-panel";
import { RealDoctorPanel } from "@/components/real-doctor-panel";
import { AdminConfigEditor } from "@/components/admin-config-editor";
import { RealProviderAdminPanel } from "@/components/real-provider-admin-panel";
import { RealPharmacyPanel } from "@/components/real-pharmacy-panel";
import { RealLabPanel } from "@/components/real-lab-panel";
import { signOutAction } from "@/app/login/actions";
import { workspaceConfig, workspaceSlugs, isPlatformAdmin, type WorkspacePayload, type WorkspaceSlug } from "@/lib/auth/roles";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";
import type { ProviderRecord } from "@/lib/admin/provider-actions";
import type { RealPatientPortalData } from "@/lib/patient/real-patient";
import type { FrontDeskCollectionRow, LabReportSummary, PharmacyActivity, RealPatientSummary } from "@/lib/provider/types";
import type { DoctorRecentPrescription, DoctorTemplateSummary } from "@/lib/provider/types";
import type { PlatformConfig } from "@/lib/admin/config";
import type { ProviderAdminData } from "@/lib/provider-admin/types";
import type { AuditEventRow } from "@/lib/admin/audit-log";
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
    // Owner feedback 2026-11-21: /front-desk/patients showed the registration
    // form (same as patients/new) — it is the directory page.
    const map: Record<string, string> = {
      overview: "Overview", "patients/new": "Register patient", patients: "Patient directory", collections: "Daily collections",
    };
    return map[key] ?? "Overview";
  }
  if (workspace === "pharmacy") {
    // Owner feedback 2026-11-21: every pharmacy page rendered the same card —
    // the old map collapsed all four routes into two labels that the panel
    // never matched. Distinct labels, distinct pages.
    const map: Record<string, string> = {
      overview: "Overview", resolve: "Resolve", dispenses: "Dispenses", bills: "Bills",
    };
    return map[key] ?? "Overview";
  }
  if (workspace === "lab") {
    // Owner feedback 2026-11-21: the overview duplicated the issue-report form.
    const map: Record<string, string> = {
      overview: "Overview", "reports/new": "New report", reports: "Reports issued",
    };
    return map[key] ?? "Overview";
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
      "Patient directory": "/front-desk/patients", "Outstanding invoices": "/front-desk/collections", "Daily collections": "/front-desk/collections",
    };
    return map[section] ?? "/front-desk/overview";
  }
  if (workspace === "pharmacy") {
    const map: Record<string, string> = {
      Overview: "/pharmacy/overview", Resolve: "/pharmacy/resolve", Dispenses: "/pharmacy/dispenses", Bills: "/pharmacy/bills",
    };
    return map[section] ?? "/pharmacy/overview";
  }
  if (workspace === "lab") {
    const map: Record<string, string> = {
      Overview: "/lab/overview", "New report": "/lab/reports/new", "Reports issued": "/lab/reports",
    };
    return map[section] ?? "/lab/overview";
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
  adminAuditEvents,
  patientPortalData,
  realPatients = [],
  doctorTemplates = [],
  doctorRecentPrescriptions = [],
  platformConfig,
  frontDeskConfig,
  frontDeskCollections,
  providerAdminData,
  labReports,
  pharmacyActivity,
}: {
  workspace: WorkspaceSlug;
  sections: string[];
  pageTitle: string;
  access: WorkspacePayload;
  adminUsers?: AdminDirectoryUser[];
  adminProviders?: AdminApprovedProvider[];
  allAdminProviders?: ProviderRecord[];
  adminAuditEvents?: AuditEventRow[];
  patientPortalData?: RealPatientPortalData;
  realPatients?: RealPatientSummary[];
  doctorTemplates?: DoctorTemplateSummary[];
  doctorRecentPrescriptions?: DoctorRecentPrescription[];
  platformConfig?: PlatformConfig;
  frontDeskConfig?: PlatformConfig;
  frontDeskCollections?: FrontDeskCollectionRow[];
  providerAdminData?: ProviderAdminData;
  labReports?: LabReportSummary[];
  pharmacyActivity?: PharmacyActivity;
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
        {/* Owner feedback 2026-11-21: the admin overview duplicated the Users
            (role assignment) and Business configuration modules that have their
            own pages, and the audit page rendered the offline demo's fake event
            list. The overview is now a real aggregate dashboard with quick
            links, and every page carries distinct, live-DB content. */}
        {workspace === "admin" ? (
          currentKey === "users" ? (
            <AdminUserManager initialUsers={adminUsers ?? []} providers={adminProviders ?? []} />
          ) : currentKey === "providers" ? (
            <div className="space-y-6">
              <AdminProvidersManager initialProviders={allAdminProviders ?? []} />
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
            <div className="space-y-6">
              {/* P2-8: the REAL config editor — reads/writes the live config table (brief Rule 1). */}
              <AdminConfigEditor initialConfig={platformConfig ?? {}} />
            </div>
          ) : currentKey === "audit" ? (
            <section className="secure-panel">
              <div className="secure-panel-head">
                <div>
                  <p className="secure-eyebrow">Platform audit trail</p>
                  <h2>Access audit — latest {(adminAuditEvents ?? []).length} events</h2>
                </div>
                <span className="verified-chip"><ClipboardList size={13} className="mr-1 inline" />Metadata only</span>
              </div>
              <div className="admin-directory-table-wrap mt-4">
                <table className="admin-directory-table">
                  <thead>
                    <tr>
                      <th scope="col">Actor</th>
                      <th scope="col">Event</th>
                      <th scope="col">Resource</th>
                      <th scope="col">Patient ref.</th>
                      <th scope="col">Provider ref.</th>
                      <th scope="col">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adminAuditEvents ?? []).map((e) => (
                      <tr key={e.id}>
                        <td><strong>{e.actorName}</strong></td>
                        <td><span className="admin-role-chip">{e.eventType.replaceAll("_", " ")}</span></td>
                        <td>{e.resourceType.replaceAll("_", " ")}</td>
                        <td className="mono">{e.patientRef ?? "—"}</td>
                        <td>{e.providerRef ?? "—"}</td>
                        <td suppressHydrationWarning>{new Date(e.date).toLocaleString()}</td>
                      </tr>
                    ))}
                    {!(adminAuditEvents ?? []).length && (
                      <tr>
                        <td colSpan={6} className="admin-directory-empty">No audit events recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] leading-5 text-slate-500">
                Metadata only — patient and clinical fields are never exposed to platform administration.
              </p>
            </section>
          ) : (
            <div className="space-y-6">
              {/* Real aggregate dashboard (admin_platform_summary RPC) — the
                  overview no longer embeds the role-assignment or configuration
                  editors; each has its own page. */}
              <div className="kpi-grid">
                <div className="card kpi">
                  <div className="kpi-label"><Building2 size={15} /> Approved providers</div>
                  <div className="kpi-value">{metricValue("providers_approved", access.summary?.providers_approved)}</div>
                  <div className="kpi-foot">{metricValue("providers_pending", access.summary?.providers_pending)} pending review</div>
                </div>
                <div className="card kpi">
                  <div className="kpi-label"><Database size={15} /> Invoices collected</div>
                  <div className="kpi-value">{metricValue("invoices_paid_total", access.summary?.invoices_paid_total)}</div>
                  <div className="kpi-foot">Paid invoices, all desks</div>
                </div>
                <div className="card kpi">
                  <div className="kpi-label"><WalletCards size={15} /> Platform ledger</div>
                  <div className="kpi-value">{metricValue("platform_ledger_total", access.summary?.platform_ledger_total)}</div>
                  <div className="kpi-foot">Platform share of every split</div>
                </div>
                <div className="card kpi">
                  <div className="kpi-label"><UsersRound size={15} /> Registered users</div>
                  <div className="kpi-value">{(adminUsers ?? []).length}</div>
                  <div className="kpi-foot">Directory accounts with roles</div>
                </div>
              </div>

              <div className="content-grid wide-side">
                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2 className="card-title">Platform administration</h2>
                      <div className="card-caption">Aggregates only · clinical content stays hidden</div>
                    </div>
                    <span className="demo-pill"><span className="demo-dot" /> Clinical data hidden</span>
                  </div>
                  <div className="card-body space-y-2">
                    <Link href="/admin/users" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                      <span className="flex items-center gap-2.5">
                        <UsersRound size={16} className="text-slate-600" />
                        <span>
                          <span className="block text-xs font-bold text-slate-800">Users &amp; role assignment</span>
                          <span className="block text-[10px] text-slate-500">{(adminUsers ?? []).length} accounts · grant or revoke workspace roles</span>
                        </span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">Open →</span>
                    </Link>
                    <Link href="/admin/providers" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                      <span className="flex items-center gap-2.5">
                        <Shield size={16} className="text-slate-600" />
                        <span>
                          <span className="block text-xs font-bold text-slate-800">Provider approvals</span>
                          <span className="block text-[10px] text-slate-500">{metricValue("providers_pending", access.summary?.providers_pending)} pending · full lifecycle manager</span>
                        </span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">Open →</span>
                    </Link>
                    <Link href="/admin/config" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                      <span className="flex items-center gap-2.5">
                        <Settings2 size={16} className="text-slate-600" />
                        <span>
                          <span className="block text-xs font-bold text-slate-800">Business configuration</span>
                          <span className="block text-[10px] text-slate-500">Fees, shares, plan quotas · audited writes</span>
                        </span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">Open →</span>
                    </Link>
                    <Link href="/admin/audit" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                      <span className="flex items-center gap-2.5">
                        <ClipboardList size={16} className="text-slate-600" />
                        <span>
                          <span className="block text-xs font-bold text-slate-800">Audit log</span>
                          <span className="block text-[10px] text-slate-500">Latest {(adminAuditEvents ?? []).length} events · metadata only</span>
                        </span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">Open →</span>
                    </Link>
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2 className="card-title">Provider registry</h2>
                      <div className="card-caption">Organization name, status and licensing metadata</div>
                    </div>
                    <span className="verified-chip">{(adminProviders ?? []).length} approved</span>
                  </div>
                  <div className="card-body space-y-2">
                    {(adminProviders ?? []).slice(0, 6).map((p) => (
                      <div key={p.provider_id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                        <div>
                          <strong>{p.provider_name}</strong>
                          <div className="text-[10px] text-slate-400 capitalize">{p.provider_type}</div>
                        </div>
                        <span className="admin-role-chip active">Approved</span>
                      </div>
                    ))}
                    {!(adminProviders ?? []).length && (
                      <div className="rounded-xl bg-slate-50 p-5 text-center text-[10px] text-slate-400">No approved providers yet.</div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )
        ) : workspace === "patient" && patientPortalData ? (
          <RealPatientPortal data={patientPortalData} initialSection={panelSection} onSectionChange={handleSectionChange} />
        ) : workspace === "doctor" ? (
          <RealDoctorPanel
            patients={realPatients}
            templates={doctorTemplates}
            recentPrescriptions={doctorRecentPrescriptions}
            doctorName={displayName}
            providerName={roles.find((r) => r.role === "doctor")?.provider_name || "H.A.R.D Clinic"}
            section={panelSection}
          />
        ) : workspace === "front-desk" ? (
          <RealFrontDeskPanel
            patients={realPatients}
            collections={frontDeskCollections ?? []}
            config={frontDeskConfig ? { registrationFee: frontDeskConfig.registration_fee, providerSharePercent: frontDeskConfig.provider_share_percent } : undefined}
            section={panelSection}
          />
        ) : workspace === "pharmacy" ? (
          <RealPharmacyPanel section={panelSection} activity={pharmacyActivity} />
        ) : workspace === "lab" ? (
          <RealLabPanel patients={realPatients} section={panelSection} reports={labReports ?? []} />
        ) : workspace === "provider-admin" ? (
          // P2-9/P2-10: the real provider-admin workspace (staff + ledger + payout).
          <RealProviderAdminPanel data={providerAdminData ?? { providerId: "", providerName: "", providerType: "", staff: [], ledger: [], kpis: { patientsRegistered: 0, documentsIssued: 0, feesCollected: 0, shareEarned: 0, sharePending: 0, outstandingInvoices: 0, activeStaff: 0 } }} section={panelSection} />
        ) : null}

        <p className="secure-footer-note"><Shield size={14} /> Connected to H.A.R.D Supabase database. Real account records only.</p>
      </main>
      <SecureMobileNav workspace={workspace} sections={sections} />
    </div>
  </div>;
}
