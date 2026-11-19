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
    // Friendly early precheck (auth + active platform admin). The RPC re-asserts
    // the role internally as the authoritative gate.
    await verifyAdmin();

    // Past-tense labels for the success toast. The DB stores suspensions as
    // 'rejected' (the CHECK constraint has no 'suspended' value), but the user
    // intent is "suspended", so label it accordingly.
    const pastTense: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      suspend: "suspended",
      reinstate: "reinstated",
    };
    if (!pastTense[action]) {
      return { error: `Unsupported provider action "${action}".`, success: null };
    }

    // Atomic status change (P2-11): one SECURITY DEFINER RPC performs the
    // provider update AND the audit_events insert in a single transaction, so
    // a half-committed status change (mutation without audit trail) is
    // impossible. The RPC asserts the platform-admin role itself; it is called
    // with the USER's client so auth.uid() resolves (see DECISIONS.md D13/D15).
    const supabase = await createSupabaseServerClient();
    const { data: auditAction, error: rpcError } = await supabase.rpc(
      "admin_set_provider_status",
      { p_provider_id: providerId, p_action: action, p_note: note }
    );

    if (rpcError || !auditAction) {
      const msg = rpcError?.message ?? "";
      const migrationHint =
        /admin_set_provider_status/i.test(msg) && /could not find|does not exist|not exist/i.test(msg)
          ? " This database is missing migration 20261119100000_cnic_unique_atomic_status.sql — apply it in the Supabase SQL editor to enable atomic status changes."
          : "";
      return {
        error: `Status change failed: ${msg || "no result returned"}.${migrationHint}`,
        success: null,
      };
    }

    revalidatePath("/admin/providers");
    revalidatePath("/admin/overview");
    return { error: null, success: `Provider status successfully updated to ${pastTense[auditAction] ?? auditAction}.` };
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
