"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";

export type ProviderRecord = {
  id: string;
  name: string;
  provider_type: "clinic" | "hospital" | "lab" | "pharmacy";
  license_number: string | null;
  status: "approved" | "pending" | "rejected" | "suspended";
  created_at: string;
  approved_at: string | null;
  staff_count?: number;
  last_note?: string;
};

export type ProviderActionState = {
  error: string | null;
  success: string | null;
};

async function verifyAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const admin = createSupabaseAdminClient();
  const { data: adminRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRole) throw new Error("Active platform administrator required.");
  return { user, admin };
}

export async function listAllAdminProviders(): Promise<ProviderRecord[]> {
  const { admin } = await verifyAdmin();

  const [orgsRes, staffRes, auditRes] = await Promise.all([
    admin.from("provider_organizations").select("*").order("created_at", { ascending: false }),
    admin.from("provider_memberships").select("provider_id").eq("is_active", true),
    admin.from("audit_events").select("provider_id, metadata, created_at").eq("event_type", "provider_status_change").order("created_at", { ascending: false }),
  ]);

  const staffCountMap = new Map<string, number>();
  for (const s of staffRes.data || []) {
    staffCountMap.set(s.provider_id, (staffCountMap.get(s.provider_id) || 0) + 1);
  }

  const noteMap = new Map<string, { note: string; action: string }>();
  for (const a of auditRes.data || []) {
    if (a.provider_id && !noteMap.has(a.provider_id)) {
      const meta = a.metadata as Record<string, unknown> | null;
      noteMap.set(a.provider_id, {
        note: String(meta?.note || meta?.reason || ""),
        action: String(meta?.action || ""),
      });
    }
  }

  const records: ProviderRecord[] = (orgsRes.data || []).map((o) => {
    const auditInfo = noteMap.get(o.id);
    let resolvedStatus: ProviderRecord["status"] = o.status as ProviderRecord["status"];
    if (o.status === "rejected" && auditInfo?.action === "suspend") {
      resolvedStatus = "suspended";
    }

    return {
      id: o.id,
      name: o.name,
      provider_type: o.provider_type as ProviderRecord["provider_type"],
      license_number: o.license_number,
      status: resolvedStatus,
      created_at: o.created_at,
      approved_at: o.approved_at,
      staff_count: staffCountMap.get(o.id) || 0,
      last_note: auditInfo?.note || undefined,
    };
  });

  return records;
}

export async function updateProviderStatusAction(
  _previous: ProviderActionState,
  formData: FormData
): Promise<ProviderActionState> {
  const providerId = String(formData.get("provider_id") ?? "");
  const action = String(formData.get("action") ?? ""); // "approve" | "reject" | "suspend" | "reinstate"
  const note = String(formData.get("note") ?? "").trim();

  if (!providerId) return { error: "Provider ID is required.", success: null };

  try {
    const { user, admin } = await verifyAdmin();

    let newDbStatus = "approved";
    let auditAction = action;

    if (action === "approve" || action === "reinstate") {
      newDbStatus = "approved";
      auditAction = action === "reinstate" ? "reinstate" : "approve";
    } else if (action === "reject") {
      newDbStatus = "rejected";
      auditAction = "reject";
    } else if (action === "suspend") {
      newDbStatus = "rejected"; // DB constraint prevents unapproved actions
      auditAction = "suspend";
    } else {
      return { error: `Unsupported provider action "${action}".`, success: null };
    }

    const { error: updateErr } = await admin
      .from("provider_organizations")
      .update({
        status: newDbStatus,
        approved_at: newDbStatus === "approved" ? new Date().toISOString() : null,
        approved_by: newDbStatus === "approved" ? user.id : null,
      })
      .eq("id", providerId);

    if (updateErr) return { error: `Status update failed: ${updateErr.message}`, success: null };

    // Record audit log
    await admin.from("audit_events").insert({
      actor_user_id: user.id,
      provider_id: providerId,
      event_type: "provider_status_change",
      resource_type: "provider_organization",
      resource_id: providerId,
      metadata: { action: auditAction, status: newDbStatus, note, timestamp: new Date().toISOString() },
    });

    revalidatePath("/admin/providers");
    revalidatePath("/admin/overview");
    return { error: null, success: `Provider status successfully updated to ${auditAction}d.` };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Provider update failed.", success: null };
  }
}

export async function editProviderDetailsAction(
  _previous: ProviderActionState,
  formData: FormData
): Promise<ProviderActionState> {
  const providerId = String(formData.get("provider_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const licenseNumber = String(formData.get("license_number") ?? "").trim();
  const providerType = String(formData.get("provider_type") ?? "").trim();

  if (!providerId || !name) {
    return { error: "Organization name is required.", success: null };
  }

  try {
    const { user, admin } = await verifyAdmin();

    const { error: editErr } = await admin
      .from("provider_organizations")
      .update({
        name,
        license_number: licenseNumber || null,
        provider_type: providerType || "clinic",
      })
      .eq("id", providerId);

    if (editErr) return { error: `Edit failed: ${editErr.message}`, success: null };

    await admin.from("audit_events").insert({
      actor_user_id: user.id,
      provider_id: providerId,
      event_type: "write",
      resource_type: "provider_organization",
      resource_id: providerId,
      metadata: { name, license_number: licenseNumber, provider_type: providerType },
    });

    revalidatePath("/admin/providers");
    revalidatePath("/admin/overview");
    return { error: null, success: `Organization details updated.` };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Provider edit failed.", success: null };
  }
}

export async function createProviderAction(
  _previous: ProviderActionState,
  formData: FormData
): Promise<ProviderActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const providerType = String(formData.get("provider_type") ?? "clinic").trim();
  const licenseNumber = String(formData.get("license_number") ?? "").trim();
  const autoApprove = formData.get("auto_approve") === "on";

  if (!name) return { error: "Organization name is required.", success: null };

  try {
    const { user, admin } = await verifyAdmin();

    const { data: newOrg, error: insertErr } = await admin
      .from("provider_organizations")
      .insert({
        name,
        provider_type: providerType,
        license_number: licenseNumber || null,
        status: autoApprove ? "approved" : "pending",
        approved_at: autoApprove ? new Date().toISOString() : null,
        approved_by: autoApprove ? user.id : null,
      })
      .select()
      .single();

    if (insertErr || !newOrg) {
      return { error: `Failed to create provider: ${insertErr?.message}`, success: null };
    }

    await admin.from("audit_events").insert({
      actor_user_id: user.id,
      provider_id: newOrg.id,
      event_type: "write",
      resource_type: "provider_organization",
      resource_id: newOrg.id,
      metadata: { name, provider_type: providerType, license_number: licenseNumber, status: newOrg.status },
    });

    revalidatePath("/admin/providers");
    revalidatePath("/admin/overview");
    return { error: null, success: `Provider "${name}" registered with status ${newOrg.status}.` };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Create provider failed.", success: null };
  }
}
