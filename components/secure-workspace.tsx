import Link from "next/link";
import { Activity, BadgeCheck, Building2, ClipboardList, FileClock, FileText, LayoutDashboard, LogOut, Pill, ScanLine, Settings2, Shield, Stethoscope, UsersRound, WalletCards } from "lucide-react";
import { PharmacyTokenResolver } from "@/components/pharmacy-token-resolver";
import { AdminUserManager } from "@/components/admin-user-manager";
import { SecureMobileNav } from "@/components/secure-mobile-nav";
import { signOutAction } from "@/app/login/actions";
import { workspaceConfig, workspaceSlugs, isPlatformAdmin, type WorkspacePayload, type WorkspaceSlug } from "@/lib/auth/roles";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";
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

export function SecureWorkspace({ workspace, sections, pageTitle, access, adminUsers, adminProviders }: {
  workspace: WorkspaceSlug;
  sections: string[];
  pageTitle: string;
  access: WorkspacePayload;
  adminUsers?: AdminDirectoryUser[];
  adminProviders?: AdminApprovedProvider[];
}) {
  const config = workspaceConfig[workspace];
  const roles = access.roles ?? [];
  const hasAdminRole = isPlatformAdmin(roles);
  const hasRequestedRole = roles.some((entry) => entry.role === config.role);
  const adminOverride = hasAdminRole && workspace !== "admin" && !hasRequestedRole;
  const summary = access.summary ?? {};
  const metrics = Object.entries(summary).slice(0, 4);
  const isPatient = workspace === "patient";
  const isPharmacy = workspace === "pharmacy";
  const isAdminWorkspace = workspace === "admin";
  const identity = isPatient && !adminOverride ? access.patient : undefined;
  const displayName = access.profile?.display_name || config.label;
  const currentKey = sections.length ? sections.join("/") : "overview";
  const showAdminUsers = isAdminWorkspace && currentKey === "users";

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
      {hasAdminRole && <details className="secure-admin-shortcuts"><summary><Shield size={14} /> All H.A.R.D workspaces</summary><nav aria-label="Administrator workspace shortcuts">{workspaceSlugs.map((slug) => <Link key={slug} href={`/${slug}/overview`}>{workspaceConfig[slug].label}</Link>)}</nav></details>}
      <div className="side-bottom">
        <div className="secure-scope-note"><span className="secure-dot" />{isPharmacy ? "Single-prescription scope" : isAdminWorkspace ? "Non-clinical administration" : adminOverride ? "Admin route · records remain scoped" : "Role-scoped access"}</div>
        <div className="sidebar-foot"><BadgeCheck size={13} /> Supabase-authenticated preview</div>
        <form action={signOutAction}><button type="submit" className="nav-link mt-3 w-full text-left"><LogOut className="nav-icon" /><span>Sign out</span></button></form>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left"><div className="crumb"><Link href="/" className="text-slate-500 no-underline">H.A.R.D</Link><span className="mx-1 text-slate-300">/</span><strong>{config.label}</strong></div><span className="secure-badge"><span className="secure-dot" /> Private workspace</span></div>
        <div className="topbar-right">
          {hasAdminRole && <details className="secure-admin-switcher"><summary><Shield size={14} /> Workspaces</summary><div className="secure-admin-switcher-menu">{workspaceSlugs.map((slug) => <Link key={slug} href={`/${slug}/overview`}>{workspaceConfig[slug].label}</Link>)}</div></details>}
          <span className="avatar" aria-label={`Signed in as ${displayName}`}>{displayName.trim().slice(0, 2).toUpperCase()}</span>
          <form action={signOutAction}><button type="submit" className="btn-icon secure-mobile-signout" aria-label="Sign out"><LogOut size={15} /></button></form>
        </div>
      </header>

      <main className="content secure-content">
        <div className="secure-page-heading"><div><p className="secure-eyebrow">{config.label} · {pageTitle}</p><h1>{isPatient ? "Your care, accounted for." : `${config.label} workspace`}</h1><p>{isPatient ? "A private view of your costs, care records and access." : `Role-authorized tools and summaries for ${config.label.toLowerCase()} work.`}</p></div><span className="verified-chip"><BadgeCheck size={14} />{adminOverride ? "Admin route access" : "Access assigned"}</span></div>

        {adminOverride && <div className="secure-override-note" role="status"><Shield size={15} /><span><strong>Platform Admin route access.</strong> You may open this H.A.R.D workspace, but existing patient/provider links and clinical-record policies are unchanged. No clinical-record data is revealed by this override.</span></div>}

        {showAdminUsers ? <AdminUserManager initialUsers={adminUsers ?? []} providers={adminProviders ?? []} /> : <>
          <section className="secure-metrics" aria-label="Workspace summary">
            {metrics.length ? metrics.map(([key, value], index) => <article className={`secure-metric metric-${index}`} key={key}><div className="secure-metric-label">{metricLabel(key)}</div><div className="secure-metric-value">{metricValue(key, value)}</div><div className="secure-metric-foot">{isPatient ? "From your linked records" : "Within the database-authorized scope"}</div></article>) : <article className="secure-empty-metric"><span className="secure-dot" />No records are linked to this account yet.</article>}
          </section>

          <div className="secure-main-grid">
            <section className="secure-panel">
              <div className="secure-panel-head"><div><p className="secure-eyebrow">{pageTitle}</p><h2>{sections.length === 0 || sections[0] === "overview" ? "Workspace overview" : pageTitle}</h2></div><span className="verified-chip"><BadgeCheck size={13} /> Source-controlled</span></div>
              <p className="secure-panel-copy">{adminOverride ? "Platform Admin route access is enabled, but it does not bypass patient-provider links or clinical-record policies. This preview keeps those data boundaries unchanged." : isPatient ? "Your current authenticated account is connected to the H.A.R.D development database. Only records explicitly linked to your patient profile can appear here." : isPharmacy ? "Pharmacy access is intentionally narrow. This workspace has no patient search, directory, Health ID view, or record-history navigation." : isAdminWorkspace ? "Manage H.A.R.D account access, roles, provider metadata and aggregate finance. This screen does not widen identifiable clinical-record access while the privacy scope is pending." : "Only data within your assigned role and active provider membership can be loaded. The database applies authorization independently of these screens."}</p>
              {isPharmacy && sections[0] === "resolve" ? <PharmacyTokenResolver /> : <>
                <div className="secure-record-placeholder"><span className="secure-record-icon">{isPatient ? <Activity size={18} /> : isPharmacy ? <ScanLine size={18} /> : isAdminWorkspace ? <Building2 size={18} /> : <Stethoscope size={18} />}</span><div><strong>{metrics.some(([, value]) => Number(value) > 0) ? "Authorized summary loaded" : "No linked records yet"}</strong><p>{metrics.some(([, value]) => Number(value) > 0) ? "The counts above came from a role-checked database function and the workspace read was logged." : "This development project starts without patient data. Use the separate fictional demo to explore complete sample workflows."}</p></div></div>
                <Link href="/demo" className="secure-secondary mt-6 inline-flex">Open fictional demo</Link>
              </>}
            </section>

            <aside className="secure-profile-panel">
              <div className="secure-profile-top"><span className="secure-avatar">{displayName.trim().slice(0, 1).toUpperCase()}</span><span className="verified-chip"><BadgeCheck size={13} /> Verified session</span></div>
              <p className="secure-eyebrow mt-7">Signed-in profile</p><h2>{displayName}</h2>
              {identity?.health_id ? <p className="secure-health-id">{identity.health_id}</p> : <p className="secure-health-id">{config.label} · restricted scope</p>}
              <div className="secure-divider" />
              <div className="secure-profile-fact"><span>Organization</span><strong>{roles.find((entry) => entry.role === config.role)?.provider_name || (isPatient ? "Patient account" : "Assigned membership")}</strong></div>
              <div className="secure-profile-fact"><span>Data mode</span><strong>Development · synthetic records only</strong></div>
              <div className="secure-profile-fact"><span>Privacy boundary</span><strong>{isPharmacy ? "One prescription per token" : hasAdminRole ? "Clinical scope unchanged" : "Role and link checked"}</strong></div>
            </aside>
          </div>
        </>}

        <p className="secure-footer-note"><Shield size={14} /> This preview is not approved for real patient information or production care decisions.</p>
      </main>
      <SecureMobileNav workspace={workspace} sections={sections} />
    </div>
  </div>;
}
