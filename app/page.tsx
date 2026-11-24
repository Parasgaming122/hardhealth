import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, Building2, ChartNoAxesCombined, FileCheck2, LockKeyhole, Pill, ShieldCheck, UsersRound } from "lucide-react";

const workspaces = [
  { href: "/patient/overview", label: "Patient", text: "Costs, records and provider access", icon: Activity, accent: "mint" },
  { href: "/doctor/overview", label: "Doctor", text: "Linked care and prescriptions", icon: FileCheck2, accent: "rose" },
  { href: "/front-desk/overview", label: "Front desk", text: "Registration and collections", icon: UsersRound, accent: "amber" },
  { href: "/pharmacy/overview", label: "Pharmacy", text: "Resolve one prescription by token", icon: Pill, accent: "aqua" },
  { href: "/lab/overview", label: "Laboratory", text: "Reports and verification", icon: BadgeCheck, accent: "mint" },
  { href: "/provider-admin/overview", label: "Provider admin", text: "Team and provider ledger", icon: Building2, accent: "amber" },
  { href: "/admin/overview", label: "Platform admin", text: "Approvals and aggregate finance", icon: ShieldCheck, accent: "rose" },
];

export default function HomePage() {
  return (
    <main className="hard-home">
      <header className="hard-home-nav"><Link href="/" className="brand no-underline"><img src="/hard-mark.svg" alt="" className="brand-mark" /><span><span className="brand-name block">H.A.R.D</span><span className="brand-caption block">CARE · COST · CLARITY</span></span></Link><nav aria-label="Primary"><Link href="#workspaces">Workspaces</Link><Link href="/demo">Explore demo</Link><Link href="/signup" className="secure-secondary">Patient sign up</Link><Link href="/login" className="secure-primary">Member sign in <ArrowRight size={15} /></Link></nav></header>

      <section className="hard-home-hero">
        <div className="hard-home-copy"><span className="secure-badge"><span className="secure-dot" /> Healthcare accounting & record keeping</span><h1>Your care,<br /><span>accounted for.</span></h1><p>One clearer view of healthcare costs and provider-issued records. Track where spending goes, keep documents together, and verify what was issued.</p><div className="hard-home-actions"><Link href="/demo" className="secure-primary">Explore the fictional demo <ArrowRight size={16} /></Link><Link href="/signup" className="secure-secondary">Create a patient account</Link></div><div className="hard-home-footnote"><LockKeyhole size={14} /> Demo uses fictional sample records. Do not enter real patient information.</div></div>
        <div className="hard-home-preview" aria-label="Illustrative healthcare finance overview">
          <div className="preview-topline"><div><span className="secure-eyebrow">H.A.R.D overview</span><strong>Healthcare, in view.</strong></div><span className="verified-chip"><BadgeCheck size={13} /> Source marked</span></div>
          <div className="preview-metrics"><div className="preview-card amber"><span>Care costs</span><strong>PKR 12,500</strong><small>This month · demo figure</small><div className="preview-spark amber-spark" /></div><div className="preview-card rose"><span>Verified records</span><strong>12</strong><small>Provider-issued · demo</small><div className="preview-spark rose-spark" /></div><div className="preview-card aqua"><span>Active providers</span><strong>3</strong><small>Access is revocable</small><div className="preview-spark aqua-spark" /></div></div>
          <div className="preview-chart"><div><span className="secure-eyebrow">Spending history</span><span className="preview-chart-note">Illustrative only</span></div><div className="preview-bars" aria-hidden="true">{[42,67,49,78,58,88,61,74,52,95,70,82].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div><div className="preview-chart-axis"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span></div></div>
          <div className="preview-bottom"><span className="preview-badge"><BadgeCheck size={14} /> Verified source</span><span>PKR-first cost clarity</span><span>Access stays in scope</span></div>
        </div>
      </section>

      <section id="workspaces" className="hard-home-workspaces"><div className="hard-home-section-head"><div><span className="secure-eyebrow">Choose your path</span><h2>One platform. Clear boundaries.</h2></div><p>New self-registrations start as Patient accounts. Other roles require administrator assignment; opening a link does not grant access.</p></div><div className="workspace-card-grid">{workspaces.map(({href,label,text,icon:Icon,accent})=><Link href={href} key={href} className={`workspace-entry ${accent}`}><span className="workspace-entry-icon"><Icon size={18}/></span><span><strong>{label}</strong><small>{text}</small></span><ArrowRight size={16} className="workspace-entry-arrow"/></Link>)}</div></section>

      <section className="hard-home-bottom"><div><span className="secure-eyebrow">Built for trust, not data sprawl</span><h2>Records are private.<br />Costs are visible.</h2><p>Role checks happen in the application and database. Pharmacy access is token-scoped. Platform administration is limited to non-clinical user/provider metadata and aggregate finance.</p></div><div className="hard-home-bottom-card"><ChartNoAxesCombined size={21}/><strong>A prototype, clearly labeled.</strong><p>Real sign-in and role-scoped Supabase summaries are separate from the fictional interactive demo. This preview is not for clinical decisions or real patient data.</p><Link href="/demo">Open demo workspace <ArrowRight size={14}/></Link></div></section>
      <footer className="hard-home-footer"><span>H.A.R.D · FinTech Expo Fall 2026</span><span>Healthcare costs, made clearer.</span></footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "H.A.R.D",
          description: "Healthcare accounting and record keeping prototype.",
        }) }}
      />
    </main>
  );
}
