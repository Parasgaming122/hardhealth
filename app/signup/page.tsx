import Link from "next/link";
import { SecureSignupForm } from "@/components/secure-signup-form";

export const metadata = { title: "Create a patient account", robots: { index: false, follow: false } };

type SignupPageProps = { searchParams: Promise<{ error?: string | string[] }> };

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { error } = await searchParams;
  const oauthError = error === "google";
  return <main className="secure-auth-page">
    <section className="secure-auth-brand">
      <Link href="/" className="brand inline-flex no-underline"><img className="brand-mark" src="/hard-mark.svg" alt="" /><span><span className="brand-name block">H.A.R.D</span><span className="brand-caption block">CARE · COST · CLARITY</span></span></Link>
      <span className="secure-badge mt-10"><span className="secure-dot" /> Patient registration</span>
      <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">Start with a<br /><span className="text-teal-700">clearer record.</span></h1>
      <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">Create a Patient account to review healthcare costs and linked records. Providers and staff roles are assigned only by a H.A.R.D platform administrator.</p>
      <p className="mt-12 text-xs text-slate-500">Development preview · use synthetic data only</p>
    </section>
    <section className="secure-auth-card">
      <div className="flex items-start gap-3"><span className="secure-icon"><img src="/hard-mark.svg" alt="" /></span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-teal-700">Patient access</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">Create your account</h2></div></div>
      <p className="my-6 text-sm leading-6 text-slate-600">Confirm your email before signing in. Your signup cannot grant clinical or provider staff roles.</p>
      <SecureSignupForm oauthError={oauthError} />
      <div className="secure-notice mt-6"><span>Prototype boundary</span><p>This preview uses synthetic data. Do not enter real patient information.</p></div>
      <Link href="/demo" className="mt-6 inline-flex text-sm font-semibold text-teal-800 underline-offset-4 hover:underline">Explore fictional demo instead</Link>
    </section>
  </main>;
}
