import Link from "next/link";
import { Activity, BadgeCheck, Building2, ClipboardList, FileClock, FileText, LayoutDashboard, Pill, ScanLine, Settings2, Shield, Stethoscope, UsersRound, WalletCards } from "lucide-react";
import { workspaceConfig, type WorkspaceSlug } from "@/lib/auth/roles";

const icons = { overview: LayoutDashboard, timeline: Activity, prescriptions: Pill, reports: FileText, expenses: WalletCards, providers: Shield, billing: FileClock, settings: Settings2, patients: UsersRound, collections: WalletCards, resolve: ScanLine, dispenses: Pill, bills: FileClock, staff: UsersRound, ledger: WalletCards, config: Settings2, audit: ClipboardList, providersAdmin: Building2, users: UsersRound } as const;

export function SecureMobileNav({ workspace, sections }: { workspace: WorkspaceSlug; sections: string[] }) {
  const pages = workspaceConfig[workspace].pages;
  const activePath = sections.length ? sections.join("/") : "overview";
  return <nav className="mobile-nav secure-mobile-nav" aria-label={`${workspaceConfig[workspace].label} mobile navigation`}>
    {pages.map((page) => {
      const iconKey = page.key.split("/")[0] as keyof typeof icons;
      const Icon = icons[iconKey] ?? BadgeCheck;
      const active = activePath === page.key || (page.key === "patients" && activePath.startsWith("patients/")) || (page.key === "prescriptions" && activePath.startsWith("prescriptions/")) || (page.key === "reports" && activePath.startsWith("reports/"));
      return <Link key={page.key} href={`/${workspace}/${page.key}`} title={page.label} aria-current={active ? "page" : undefined} className={active ? "active" : undefined}><Icon size={17} /><span>{page.label}</span></Link>;
    })}
  </nav>;
}
