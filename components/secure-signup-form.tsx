"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, LockKeyhole, UserPlus } from "lucide-react";
import { googleSignInAction, signUpAction, type SignupActionState } from "@/app/login/actions";
import { AuthOriginField } from "@/components/auth-origin-field";

const initialState: SignupActionState = { error: null, success: null };

export function SecureSignupForm({ oauthError = false }: { oauthError?: boolean }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  return <div className="space-y-5">
    {oauthError && <p role="alert" className="secure-error">Google sign-in is not ready for this site. Ask the administrator to add this site's URL to Supabase Auth → URL Configuration → Redirect URLs and to check the Google provider.</p>}
    <form action={formAction} className="space-y-4">
      <label className="secure-field"><span>Full name</span><input type="text" name="full_name" required minLength={2} maxLength={100} autoComplete="name" /></label>
      <label className="secure-field"><span>Email</span><input type="email" name="email" required maxLength={254} autoComplete="email" inputMode="email" /></label>
      <label className="secure-field"><span>Password</span><input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /><small>Use at least 12 characters.</small></label>
      <label className="secure-field"><span>Confirm password</span><input type="password" name="confirm_password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <AuthOriginField source="signup" />
      {state.error && <p role="alert" className="secure-error">{state.error}</p>}
      {state.success && <p role="status" className="secure-success">{state.success}</p>}
      <button type="submit" className="secure-primary w-full" disabled={pending}>
        <UserPlus size={16} />{pending ? "Creating account…" : "Create patient account"}<ArrowRight size={15} className="ml-auto" />
      </button>
      <p className="text-xs leading-5 text-slate-500">New email accounts start with Patient access. A H.A.R.D platform administrator must assign every other role.</p>
    </form>

    <div className="secure-auth-divider"><span>or</span></div>
    <form action={googleSignInAction}>
      <AuthOriginField source="signup" />
      <button type="submit" className="secure-google-button w-full"><span aria-hidden="true" className="google-mark">G</span>Continue with Google</button>
    </form>
    <p className="text-sm text-slate-600">Already registered? <Link href="/login" className="font-semibold text-teal-800 underline-offset-4 hover:underline">Sign in</Link></p>
    <p className="text-xs leading-5 text-slate-500"><LockKeyhole size={13} className="mr-1 inline" />The form never accepts a role choice. Do not use real patient details in this prototype.</p>
  </div>;
}
