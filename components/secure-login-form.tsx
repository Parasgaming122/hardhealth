"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { googleSignInAction, signInAction, type LoginActionState } from "@/app/login/actions";
import { AuthOriginField } from "@/components/auth-origin-field";

const initialState: LoginActionState = { error: null };

export function SecureLoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  return <div className="space-y-5">
    <form action={formAction} className="space-y-4">
      <label className="secure-field"><span>Email</span><input type="email" name="email" required maxLength={254} autoComplete="username" inputMode="email" /></label>
      <label className="secure-field"><span>Password</span><input type="password" name="password" required minLength={8} maxLength={256} autoComplete="current-password" /></label>
      {state.error && <p role="alert" className="secure-error">{state.error}</p>}
      <button type="submit" className="secure-primary w-full" disabled={pending}><LockKeyhole size={16} />{pending ? "Signing in…" : "Sign in securely"}<ArrowRight size={15} className="ml-auto" /></button>
    </form>
    <div className="secure-auth-divider"><span>or</span></div>
    <form action={googleSignInAction}>
      <AuthOriginField source="login" />
      <button type="submit" className="secure-google-button w-full"><span aria-hidden="true" className="google-mark">G</span>Continue with Google</button>
    </form>
    <p className="text-sm text-slate-600">New patient? <Link href="/signup" className="font-semibold text-teal-800 underline-offset-4 hover:underline">Create a patient account</Link></p>
    <p className="text-xs leading-5 text-slate-500">Patient registration cannot grant any provider or administrator role. Additional access requires an authorized H.A.R.D platform administrator.</p>
  </div>;
}
