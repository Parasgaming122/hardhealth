"use server";

import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { checkDatabaseStatus, runAutoSetup } from "@/lib/db/auto-setup";

export interface SetupActionState {
  ok: boolean;
  message: string;
  hint?: string;
}

function tokenMatches(submitted: string): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function isPlatformAdmin(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return false;
    // Re-verify the ACTIVE platform_admin row via the admin client (D4 pattern).
    const admin = createSupabaseAdminClient();
    const { data: role } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("role", "platform_admin")
      .eq("is_active", true)
      .maybeSingle();
    return Boolean(role);
  } catch {
    // env missing / DB unreachable — the caller is simply not a verified admin
    return false;
  }
}

/**
 * Access rules for manually triggering the database setup:
 *  1. correct SETUP_TOKEN (when the env var is configured), OR
 *  2. signed in as an active platform_admin, OR
 *  3. virgin database (nothing applied, no app schema) — the WordPress
 *     install.php rule: anyone can install an uninstalled app.
 */
async function evaluateAccess(submittedToken: string): Promise<{ allowed: boolean; reason: string }> {
  if (process.env.SETUP_TOKEN && tokenMatches(submittedToken)) {
    return { allowed: true, reason: "token" };
  }
  if (await isPlatformAdmin()) {
    return { allowed: true, reason: "admin" };
  }
  const status = await checkDatabaseStatus().catch(() => null);
  if (status?.canConnect && status.appliedCount === 0 && status.schemaExists === false) {
    return { allowed: true, reason: "fresh-install" };
  }
  return {
    allowed: false,
    reason:
      "Not allowed. Sign in as a platform admin, or provide the SETUP_TOKEN value from the server environment, to run setup actions on an installed database.",
  };
}

export async function runSetupAction(
  _prev: SetupActionState,
  formData: FormData
): Promise<SetupActionState> {
  const submittedToken = String(formData.get("token") ?? "");

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      message: "DATABASE_URL is not set yet — add it to your environment first (see Step 1 below).",
      hint: "Supabase Dashboard → Connect → Connection string → Session pooler. Redeploy / restart after adding it.",
    };
  }

  const access = await evaluateAccess(submittedToken);
  if (!access.allowed) {
    return { ok: false, message: access.reason };
  }

  const outcome = await runAutoSetup({ trigger: "manual" });

  if (outcome.ok) {
    if (outcome.mode === "applied") {
      return {
        ok: true,
        message: `Setup complete — applied ${outcome.appliedVersions.length} migration(s): ${outcome.appliedVersions.join(", ")}.`,
      };
    }
    if (outcome.mode === "baselined") {
      return {
        ok: true,
        message: "Existing schema recorded (baseline). Future migrations will now be applied automatically.",
      };
    }
    if (outcome.mode === "up-to-date") {
      return { ok: true, message: "Database schema is already up to date — nothing to apply." };
    }
    return { ok: true, message: `Setup finished (${outcome.mode}).` };
  }

  return {
    ok: false,
    message: `Setup failed${outcome.error?.version ? ` at migration ${outcome.error.version}` : ""}: ${outcome.error?.message}`,
    hint: outcome.error?.hint,
  };
}
