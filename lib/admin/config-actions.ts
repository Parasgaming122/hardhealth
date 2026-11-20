"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONFIG_DEFAULTS, type PlatformConfig } from "@/lib/admin/config";

/**
 * P2-8 server actions (brief 8.7): the platform admin's audited config editor.
 * Writes go through hard_private.platform_set_config (SECURITY DEFINER) which
 * asserts an ACTIVE platform_admin role and writes a `config_update` audit
 * event per changed key.
 */
export async function getPlatformConfigForAdmin(): Promise<PlatformConfig> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_get_config");
  if (error || !data) {
    console.error("[config] admin config read unavailable:", error?.message ?? "no data");
    return { ...CONFIG_DEFAULTS };
  }
  const map: PlatformConfig = { ...CONFIG_DEFAULTS };
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const n = Number(value);
    if (key in CONFIG_DEFAULTS && Number.isFinite(n) && n >= 0) map[key] = n;
  }
  return map;
}

export type ConfigUpdateResult = { key: string; value: number; oldValue: number | null };

export async function updatePlatformConfigAction(
  updates: Array<{ key: string; value: number }>
): Promise<{ updated: ConfigUpdateResult[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 20) {
    return { updated: [], error: "No configuration changes to save." };
  }
  for (const u of updates) {
    if (!(u.key in CONFIG_DEFAULTS) || !Number.isFinite(u.value) || u.value < 0 || !Number.isInteger(u.value)) {
      return { updated: [], error: `"${u.key}" is not a valid configuration key or value.` };
    }
  }

  const updated: ConfigUpdateResult[] = [];
  for (const u of updates) {
    const { data, error } = await supabase.rpc("platform_set_config", {
      p_key: u.key,
      p_value: String(Math.round(u.value)),
    });
    if (error || !data) {
      return {
        updated,
        error: /permission|platform admin/i.test(error?.message ?? "")
          ? "Only active platform administrators can change the platform configuration."
          : `Could not save "${u.key}": ${error?.message ?? "unknown error"}. If the config migration (20261121000000) is missing, apply it in the Supabase SQL editor or connect DATABASE_URL and let the automatic database setup run.`,
      };
    }
    const row = data as { key: string; value: string; old_value: string | null };
    updated.push({
      key: row.key,
      value: Number(row.value),
      oldValue: row.old_value === null ? null : Number(row.old_value),
    });
  }

  revalidatePath("/admin/config");
  revalidatePath("/admin/overview");
  return { updated, error: null };
}
