import Link from "next/link";
import { signOutAction } from "@/app/login/actions";

export const metadata = { title: "Access pending", robots: { index: false, follow: false } };

export default function AccessPendingPage() {
  return (
    <main className="secure-state-page">
      <section className="secure-state-card">
        <img src="/hard-mark.svg" alt="" className="h-11 w-11" />
        <p className="mt-6 text-xs font-bold uppercase tracking-[.15em] text-amber-700">Access not assigned</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Your account is waiting for a workspace role.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">A H.A.R.D administrator must assign your role and provider access. Signing in does not grant access to patient records.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <form action={signOutAction}><button className="secure-primary" type="submit">Sign out</button></form>
          <Link href="/" className="secure-secondary">Return home</Link>
        </div>
      </section>
    </main>
  );
}
