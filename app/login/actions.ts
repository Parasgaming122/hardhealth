"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homePathForRoles, type WorkspacePayload } from "@/lib/auth/roles";
import { validateSignupInput } from "@/lib/auth/signup-validation";
import { requestAppOriginCandidatesFromHeaders, trustedAppOriginFrom } from "@/lib/auth/trusted-origin";

async function currentRequestOrigins(): Promise<string[]> {
  const headerBag = await headers();
  return requestAppOriginCandidatesFromHeaders((name) => headerBag.get(name));
}

export type LoginActionState = { error: string | null };
export type SignupActionState = { error: string | null; success: string | null };

export async function signInAction(_previous: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Sign-in failed. Check your details or contact your H.A.R.D administrator." };

  const { data, error: workspaceError } = await supabase.rpc("get_my_workspace");
  if (workspaceError) return { error: "Your session was created, but workspace access could not be loaded. Contact your administrator." };
  const destination = homePathForRoles((data as WorkspacePayload).roles);
  if (!destination) redirect("/access-pending");
  redirect(destination);
}

export async function signUpAction(_previous: SignupActionState, formData: FormData): Promise<SignupActionState> {
  const validation = validateSignupInput({
    fullName: formData.get("full_name"), email: formData.get("email"),
    password: formData.get("password"), confirmPassword: formData.get("confirm_password"),
  });
  if (!validation.ok) return { error: validation.error, success: null };

  const origin = trustedAppOriginFrom(String(formData.get("origin") ?? ""), await currentRequestOrigins());
  if (!origin) return { error: "This site origin is not configured for secure account confirmation. Open the approved H.A.R.D site or ask the administrator to configure its public URL.", success: null };

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { error: "Sign-up is temporarily unavailable. Please try again later.", success: null };
  }

  const { data, error } = await supabase.auth.signUp({
    email: validation.value.email,
    password: validation.value.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: validation.value.fullName },
    },
  });
  if (error) return { error: "We could not create that account. Check the details or try again later.", success: null };

  if (data.session) {
    const { data: workspaceData, error: workspaceError } = await supabase.rpc("get_my_workspace");
    if (workspaceError) redirect("/access-pending");
    const destination = homePathForRoles((workspaceData as WorkspacePayload).roles);
    if (!destination) redirect("/access-pending");
    redirect(destination);
  }

  return {
    error: null,
    success: "If this address is eligible for a new account, check its inbox for the confirmation link. New registrations begin in the Patient workspace; other roles require a H.A.R.D administrator.",
  };
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  const source = formData.get("source") === "signup" ? "/signup" : "/login";
  const origin = trustedAppOriginFrom(String(formData.get("origin") ?? ""), await currentRequestOrigins());
  if (!origin) redirect(`${source}?error=google`);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error || !data.url) redirect(`${source}?error=google`);
    redirect(data.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${source}?error=google`);
  }
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
