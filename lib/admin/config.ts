import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CONFIG_DEFAULTS, type PlatformConfig } from "@/lib/admin/config-defaults";

export { CONFIG_DEFAULTS, CONFIG_LABELS } from "@/lib/admin/config-defaults";
export type { PlatformConfig } from "@/lib/admin/config-defaults";

/**
 * P2-8 (brief 8.7 / 22 / Rule 1): platform business configuration lives in the
 * `config` table — never hard-coded. SERVER-ONLY module (imports the admin
 * client); client components must use lib/admin/config-defaults instead.
 *
 * Server-side consumers (front-desk registration fee + split, prescription
 * validity/fills, storage quota) read through the service-role admin client
 * with these defaults as fallback, so a database without migration
 * 20261121000000 keeps working exactly as before.
 */

/**
 * Read the live config map with the service-role client. Degrades to the
 * brief-22 defaults when the table is missing (pre-migration) so every
 * dependent flow keeps working without a hard failure (D10 pattern).
 */
export async function readPlatformConfig(): Promise<PlatformConfig> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("config").select("key, value");
  if (error || !data) {
    if (error) console.error("[config] unavailable, using brief-22 defaults:", error.message);
    return { ...CONFIG_DEFAULTS };
  }
  const map: PlatformConfig = { ...CONFIG_DEFAULTS };
  for (const row of data as Array<{ key: string; value: string }>) {
    const n = Number(row.value);
    if (row.key in CONFIG_DEFAULTS && Number.isFinite(n) && n >= 0) map[row.key] = n;
  }
  return map;
}
