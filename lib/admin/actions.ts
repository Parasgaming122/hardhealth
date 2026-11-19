"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import type { HardRole } from "@/lib/auth/roles";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";

const assignableRoles: HardRole[] = ["patient", "doctor", "front_desk", "pharmacist", "lab_tech", "provider_admin", "platform_admin"];
const providerRoles = new Set<HardRole>(["doctor", "front_desk", "pharmacist", "lab_tech", "provider_admin"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AdminRoleActionState = { error: string | null; success: string | null };

async function verifyPlatformAdminActor() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const { data: adminRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRole) {
    throw new Error("Active platform administrator required.");
  }

  return { user, admin };
}

export async function grantAdminRoleAction(_previous: AdminRoleActionState, formData: FormData): Promise<AdminRoleActionState> {
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as HardRole;
  const rawProviderId = String(formData.get("provider_id") ?? "");
  const providerId = rawProviderId || null;

  if (!uuidPattern.test(userId) || !assignableRoles.includes(role)) {
    return { error: "Choose a valid account and H.A.R.D role.", success: null };
  }
  if ((providerRoles.has(role) && (!providerId || !uuidPattern.test(providerId))) || (!providerRoles.has(role) && providerId)) {
    return { error: "Choose an approved provider only for a provider-scoped role.", success: null };
  }

  try {
    const { user, admin } = await verifyPlatformAdminActor();

    // 1. Upsert role in public.user_roles
    const { error: roleError } = await admin.from("user_roles").upsert(
      {
        user_id: userId,
        role: role,
        provider_id: providerId,
        is_active: true,
        created_by: user.id,
      },
      { onConflict: "user_id,role,provider_id" }
    );

    if (roleError) {
      return { error: `Failed to grant role: ${roleError.message}`, success: null };
    }

    // 2. If provider-scoped, upsert in provider_memberships
    if (providerRoles.has(role) && providerId) {
      await admin.from("provider_memberships").upsert(
        {
          provider_id: providerId,
          user_id: userId,
          role: role,
          is_active: true,
        },
        { onConflict: "provider_id,user_id,role" }
      );
    }

    // 3. Write immutable audit log
    await admin.from("audit_events").insert({
      actor_user_id: user.id,
      provider_id: providerId,
      event_type: "role_assignment",
      resource_type: "user_role",
      resource_id: userId,
      metadata: { assigned_role: role, provider_id: providerId, operation: "grant" },
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/overview");
    revalidatePath("/admin");
    return { error: null, success: `Role "${role}" successfully granted and saved to database.` };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Role grant is temporarily unavailable.", success: null };
  }
}

export async function revokeAdminRoleAction(_previous: AdminRoleActionState, formData: FormData): Promise<AdminRoleActionState> {
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as HardRole;
  const rawProviderId = String(formData.get("provider_id") ?? "");
  const providerId = rawProviderId || null;

  if (!uuidPattern.test(userId) || !assignableRoles.includes(role)) {
    return { error: "Choose a valid account and H.A.R.D role.", success: null };
  }
  if ((providerRoles.has(role) && (!providerId || !uuidPattern.test(providerId))) || (!providerRoles.has(role) && providerId)) {
    return { error: "The role/provider scope is invalid.", success: null };
  }

  try {
    const { user, admin } = await verifyPlatformAdminActor();

    if (role === "platform_admin") {
      const { count } = await admin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "platform_admin")
        .eq("is_active", true);

      if ((count ?? 0) <= 1) {
        return { error: "The last active platform administrator cannot be removed.", success: null };
      }
    }

    // Deactivate role
    let query = admin
      .from("user_roles")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("role", role);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    } else {
      query = query.is("provider_id", null);
    }

    await query;

    if (providerRoles.has(role) && providerId) {
      await admin
        .from("provider_memberships")
        .update({ is_active: false })
        .eq("provider_id", providerId)
        .eq("user_id", userId)
        .eq("role", role);
    }

    // Audit log
    await admin.from("audit_events").insert({
      actor_user_id: user.id,
      provider_id: providerId,
      event_type: "role_assignment",
      resource_type: "user_role",
      resource_id: userId,
      metadata: { revoked_role: role, provider_id: providerId, operation: "revoke" },
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/overview");
    revalidatePath("/admin");
    return { error: null, success: `Role "${role}" revoked and recorded in audit log.` };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Role revoke is temporarily unavailable.", success: null };
  }
}

export async function searchAdminDirectoryAction(search: string, offset: number): Promise<{ users: AdminDirectoryUser[]; error: string | null }> {
  if (typeof search !== "string" || search.length > 120 || !Number.isInteger(offset) || offset < 0 || offset > 1000000) {
    return { users: [], error: "Search parameters are invalid." };
  }
  try {
    const { admin } = await verifyPlatformAdminActor();

    const [
      authRes,
      profilesRes,
      rolesRes,
    ] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
      admin.from("profiles").select("user_id, display_name"),
      admin.from("user_roles").select("user_id, role, provider_id, is_active, provider_organizations(name)"),
    ]);

    const profileMap = new Map(((profilesRes.data as Array<{ user_id: string; display_name: string }>) ?? []).map((p) => [p.user_id, p.display_name]));
    const roleMap = new Map<string, Array<{ role: HardRole; provider_id: string | null; provider_name: string | null; is_active: boolean }>>();

    for (const r of ((rolesRes.data as Array<Record<string, unknown>>) ?? [])) {
      const uid = String(r.user_id);
      if (!roleMap.has(uid)) roleMap.set(uid, []);
      const org = r.provider_organizations as Record<string, unknown> | null;
      roleMap.get(uid)!.push({
        role: String(r.role) as HardRole,
        provider_id: (r.provider_id as string) || null,
        provider_name: (org?.name as string) || null,
        is_active: Boolean(r.is_active),
      });
    }

    const filter = search.trim().toLowerCase();
    const users: AdminDirectoryUser[] = (authRes.data?.users ?? []).map((u) => {
      const displayName = profileMap.get(u.id) || (u.user_metadata as Record<string, unknown> | undefined)?.full_name as string || (u.email ? u.email.split("@")[0] : "H.A.R.D user");
      return {
        user_id: u.id,
        email: u.email || "Email unavailable",
        display_name: displayName,
        created_at: u.created_at || new Date().toISOString(),
        roles: roleMap.get(u.id) || [],
      };
    }).filter((u) => !filter || (u.email && u.email.toLowerCase().includes(filter)) || u.display_name.toLowerCase().includes(filter));

    return { users, error: null };
  } catch {
    return { users: [], error: "The account directory is temporarily unavailable." };
  }
}

export async function getAdminDirectoryData(): Promise<{ users: AdminDirectoryUser[]; providers: AdminApprovedProvider[] }> {
  try {
    const admin = createSupabaseAdminClient();
    const [
      authRes,
      profilesRes,
      rolesRes,
      provsRes,
    ] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
      admin.from("profiles").select("user_id, display_name"),
      admin.from("user_roles").select("user_id, role, provider_id, is_active, provider_organizations(name)"),
      admin.from("provider_organizations").select("id, name, provider_type, status").eq("status", "approved").order("name"),
    ]);

    const profileMap = new Map(((profilesRes.data as Array<{ user_id: string; display_name: string }>) ?? []).map((p) => [p.user_id, p.display_name]));
    const roleMap = new Map<string, Array<{ role: HardRole; provider_id: string | null; provider_name: string | null; is_active: boolean }>>();

    for (const r of ((rolesRes.data as Array<Record<string, unknown>>) ?? [])) {
      const uid = String(r.user_id);
      if (!roleMap.has(uid)) roleMap.set(uid, []);
      const org = r.provider_organizations as Record<string, unknown> | null;
      roleMap.get(uid)!.push({
        role: String(r.role) as HardRole,
        provider_id: (r.provider_id as string) || null,
        provider_name: (org?.name as string) || null,
        is_active: Boolean(r.is_active),
      });
    }

    const users: AdminDirectoryUser[] = (authRes.data?.users ?? []).map((u) => {
      const displayName = profileMap.get(u.id) || (u.user_metadata as Record<string, unknown> | undefined)?.full_name as string || (u.email ? u.email.split("@")[0] : "H.A.R.D user");
      return {
        user_id: u.id,
        email: u.email || "Email unavailable",
        display_name: displayName,
        created_at: u.created_at || new Date().toISOString(),
        roles: roleMap.get(u.id) || [],
      };
    });

    const providers: AdminApprovedProvider[] = ((provsRes.data as Array<Record<string, unknown>>) ?? []).map((p) => ({
      provider_id: String(p.id),
      provider_name: String(p.name),
      provider_type: String(p.provider_type),
    }));

    return { users, providers };
  } catch {
    return { users: [], providers: [] };
  }
}
