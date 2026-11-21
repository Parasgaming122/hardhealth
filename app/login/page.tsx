import Link from "next/link";
import { SecureLoginForm } from "@/components/secure-login-form";

export const metadata = { title: "Sign in · H.A.R.D", robots: { index: false, follow: false } };
type LoginPageProps = { searchParams: Promise<{ error?: string | string[] }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const oauthError = error === "google";
  return (
    <main className="secure-auth-page">
      <section className="secure-auth-brand">
        <Link href="/" className="brand inline-flex no-underline"><img className="brand-mark" src="/hard-mark.svg" alt="" /><span><span className="brand-name block">H.A.R.D</span><span className="brand-caption block">CARE · COST · CLARITY</span></span></Link>
        <span className="secure-badge mt-10"><span className="secure-dot" /> Private workspace</span>
        <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">Your care,<br /><span className="text-teal-700">accounted for.</span></h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">A role-based workspace for healthcare records and costs. Access is assigned by your organization and enforced by the database.</p>
        <p className="mt-12 text-xs text-slate-500">Development preview · use synthetic data only</p>
      </section>
      <section className="secure-auth-card">
        <div className="flex items-start gap-3"><span className="secure-icon"><img src="/hard-mark.svg" alt="" /></span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-teal-700">Member access</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">Sign in to H.A.R.D</h2></div></div>
        <p className="my-6 text-sm leading-6 text-slate-600">Patient accounts can be created here. Provider and staff access is assigned by an authorized H.A.R.D administrator.</p>
        {oauthError && <p role="alert" className="secure-error mb-4">Google sign-in is not ready for this site. Ask the administrator to add this site's URL to Supabase Auth → URL Configuration → Redirect URLs and to check the Google provider.</p>}
        <SecureLoginForm />
        <div className="secure-notice mt-6"><span>Prototype boundary</span><p>This preview uses synthetic data. Do not enter real patient information.</p></div>
        <Link href="/demo" className="mt-6 inline-flex text-sm font-semibold text-teal-800 underline-offset-4 hover:underline">Explore fictional demo instead</Link>
      </section>
    </main>
  );
}
