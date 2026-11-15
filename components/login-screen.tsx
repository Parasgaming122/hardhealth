"use client";

import { Activity, ArrowRight, BadgeCheck, ChartNoAxesCombined, Eye, FileCheck2, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/domain";
import { useDemo } from "@/components/demo-provider";

const icons: Record<Role, typeof UsersRound> = {
  patient: UsersRound,
  doctor: Activity,
  frontDesk: BadgeCheck,
  pharmacy: FileCheck2,
  lab: ShieldCheck,
  providerAdmin: ChartNoAxesCombined,
  platformAdmin: LockKeyhole,
};

export function LoginScreen() {
  const { loginAs } = useDemo();
  const roles = Object.keys(ROLE_LABELS) as Role[];
  return <main className="login-wrap">
    <section className="login-hero">
      <div className="brand"><img className="brand-mark" src="/hard-mark.svg" alt="" /><div><div className="brand-name">H.A.R.D</div><div className="brand-caption">HEALTHCARE ACCOUNTING & RECORD KEEPING</div></div></div>
      <span className="demo-pill mt-7 w-fit"><span className="demo-dot" /> FinTech Expo · Prototype</span>
      <h1 className="login-title">Your care,<br /><span>accounted for.</span></h1>
      <p className="login-copy">Every prescription, verified. Every cost, in view. H.A.R.D brings your health records and healthcare spending together in one clear timeline.</p>
      <div className="mt-6 space-y-3">
        <div className="login-feature"><ChartNoAxesCombined size={15} />See where your healthcare budget goes</div>
        <div className="login-feature"><FileCheck2 size={15} />Verify digital prescriptions with a unique QR</div>
        <div className="login-feature"><Eye size={15} />Stay in control of who sees your record</div>
      </div>
      <div className="mt-12 flex items-center gap-3 text-[9px] text-slate-400"><span className="h-px w-9 bg-slate-300" />A FinTech Expo Fall 2026 prototype by Asees Mehtab</div>
    </section>
    <section className="login-card-wrap">
      <div className="login-card">
        <div className="flex items-center justify-between"><div><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-emerald-700">Demo workspace</p><h2 className="mt-1 text-lg font-bold tracking-tight text-slate-800">Choose a role to explore</h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UsersRound size={19} /></span></div>
        <p className="mb-5 mt-2 text-[10px] leading-5 text-slate-500">No account or password needed. Each option opens a fictional sample workspace.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {roles.map((role) => {
            const Icon = icons[role];
            return <button key={role} type="button" onClick={() => loginAs(role)} className="role-card">
              <span className="role-icon"><Icon size={15} /></span>
              <span className="min-w-0 flex-1"><span className="role-title block">{ROLE_LABELS[role]}</span><span className="role-description block truncate">{ROLE_DESCRIPTIONS[role]}</span></span>
              <ArrowRight size={12} className="text-slate-300" />
            </button>;
          })}
        </div>
        <div className="notice amber mt-5"><LockKeyhole size={15} className="mt-0.5 shrink-0" /><span>Demo only: fake data, simulated sign-in and local browser state. Not for real patient information.</span></div>
      </div>
    </section>
  </main>;
}
