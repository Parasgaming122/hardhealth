"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HardRole } from "@/lib/auth/roles";
import type { AdminDirectoryUser } from "@/lib/admin/types";

const assignableRoles: HardRole[] = ["patient", "doctor", "front_desk", "pharmacist", "lab_tech", "provider_admin", "platform_admin"];
const providerRoles = new Set<HardRole>(["doctor", "front_desk", "pharmacist", "lab_tech", "provider_admin"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AdminRoleActionState = { error: string | null; success: string | null };

export async function grantAdminRoleAction(_previous: AdminRoleActionState, formData: FormData): Promise<AdminRoleActionState> {
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as HardRole;
  const rawProviderId = String(formData.get("provider_id") ?? "");
  const providerId = rawProviderId || null;
  if (!uuidPattern.test(userId) || !assignableRoles.includes(role)) return { error: "Choose a valid account and H.A.R.D role.", success: null };
  if ((providerRoles.has(role) && (!providerId || !uuidPattern.test(providerId))) || (!providerRoles.has(role) && providerId)) {
    return { error: "Choose an approved provider only for a provider-scoped role.", success: null };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("admin_assign_user_role", { p_user_id: userId, p_role: role, p_provider_id: providerId });
    if (error) return { error: "Role grant rejected. Only an active platform admin may do this; provider roles also require an approved provider.", success: null };
    revalidatePath("/admin/users");
    return { error: null, success: "Role granted and recorded in the audit log." };
  } catch {
    return { error: "Role grant is temporarily unavailable.", success: null };
  }
}

export async function revokeAdminRoleAction(_previous: AdminRoleActionState, formData: FormData): Promise<AdminRoleActionState> {
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as HardRole;
  const rawProviderId = String(formData.get("provider_id") ?? "");
  const providerId = rawProviderId || null;
  if (!uuidPattern.test(userId) || !assignableRoles.includes(role)) return { error: "Choose a valid account and H.A.R.D role.", success: null };
  if ((providerRoles.has(role) && (!providerId || !uuidPattern.test(providerId))) || (!providerRoles.has(role) && providerId)) {
    return { error: "The role/provider scope is invalid.", success: null };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("admin_revoke_user_role", { p_user_id: userId, p_role: role, p_provider_id: providerId });
    if (error) return { error: "Role revoke rejected. The last active platform admin cannot be removed.", success: null };
    revalidatePath("/admin/users");
    return { error: null, success: "Role revoked and recorded in the audit log." };
  } catch {
    return { error: "Role revoke is temporarily unavailable.", success: null };
  }
}

export async function searchAdminDirectoryAction(search: string, offset: number): Promise<{ users: AdminDirectoryUser[]; error: string | null }> {
  if (typeof search !== "string" || search.length > 120 || !Number.isInteger(offset) || offset < 0 || offset > 1000000) {
    return { users: [], error: "Search parameters are invalid." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("admin_list_users", { p_search: search.trim() || null, p_limit: 100, p_offset: offset });
    if (error) return { users: [], error: "Only an active platform admin can view the account directory." };
    return { users: (data ?? []) as AdminDirectoryUser[], error: null };
  } catch {
    return { users: [], error: "The account directory is temporarily unavailable." };
  }
}
