"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { HardRole } from "@/lib/auth/roles";
import { staffRoles, type ProviderAdminData, type ProviderStaffMember, type ProviderLedgerRow, type StaffRole } from "@/lib/provider-admin/types";

/**
 * P2-9 / P2-10 (brief 8.6, 7.5, 11.3): the REAL provider-admin workspace —
 * staff sub-role management within the caller's own organization, and the
 * provider earnings ledger with payout status. Every action authenticates the
 * caller, resolves their ACTIVE provider_admin role, and hard-scopes every
 * statement to that one organization — a provider admin can never touch
 * another org's staff or ledger. Every mutation writes an audit event.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireProviderAdmin(): Promise<{ actorId: string; providerId: string; admin: ReturnType<typeof createSupabaseAdminClient> }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("provider_id")
    .eq("user_id", user.id)
    .eq("role", "provider_admin")
    .eq("is_active", true)
    .not("provider_id", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!roleRow?.provider_id) {
    throw new Error(
      "Your account has no active provider admin role attached to a provider organization. Ask a platform admin to assign one."
    );
  }
  return { actorId: user.id, providerId: roleRow.provider_id as string, admin };
}

async function writeAudit(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  actorId: string,
  providerId: string,
  eventType: "role_assignment" | "payout_update",
  metadata: Record<string, unknown>
) {
  const { error } = await admin.from("audit_events").insert({
    actor_user_id: actorId,
    provider_id: providerId,
    event_type: eventType,
    resource_type: eventType === "role_assignment" ? "user_role" : "ledger_entry",
    metadata,
  });
  if (error) {
    // The config migration extends the audit CHECK with 'payout_update'; until it
    // is applied this surfaces the constraint failure instead of swallowing it.
    throw new Error(`Could not write the audit event: ${error.message}`);
  }
}

export async function getProviderAdminData(): Promise<ProviderAdminData> {
  const empty: ProviderAdminData = {
    providerId: "",
    providerName: "",
    providerType: "",
    staff: [],
    ledger: [],
    kpis: { patientsRegistered: 0, documentsIssued: 0, feesCollected: 0, shareEarned: 0, sharePending: 0, outstandingInvoices: 0, activeStaff: 0 },
  };
  let actorId: string;
  let providerId: string;
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    ({ actorId, providerId, admin } = await requireProviderAdmin());
  } catch (err) {
    // Workspace renders with the "no organization" notice instead of a 500 (D10).
    console.error("[provider-admin] no active provider org:", err instanceof Error ? err.message : err);
    return empty;
  }

  const ledgerRes = await admin
    .from("ledger_entries")
    .select("id, invoice_id, amount, payout_status, created_at, invoices(total_amount, receipt_number)")
    .eq("provider_id", providerId)
    .eq("ledger_side", "provider")
    .order("created_at", { ascending: false })
    .limit(50);

  const [
    orgRes,
    rolesRes,
    profilesRes,
    authRes,
    platformLedgerRes,
    linksRes,
    rxCountRes,
    reportCountRes,
    collectedRes,
    outstandingRes,
  ] = await Promise.all([
    admin.from("provider_organizations").select("name, provider_type").eq("id", providerId).maybeSingle(),
    admin.from("user_roles").select("user_id, role, is_active").eq("provider_id", providerId).in("role", staffRoles),
    admin.from("profiles").select("user_id, display_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin
      .from("ledger_entries")
      .select("invoice_id, amount")
      .eq("ledger_side", "platform")
      .in("invoice_id", (ledgerRes.data ?? []).map((l) => String((l as Record<string, unknown>).invoice_id))),
    admin.from("patient_provider_links").select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("status", "active"),
    admin.from("prescriptions").select("id", { count: "exact", head: true }).eq("provider_id", providerId),
    admin.from("lab_reports").select("id", { count: "exact", head: true }).eq("provider_id", providerId),
    admin.from("invoices").select("total_amount").eq("provider_id", providerId).eq("status", "paid"),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("status", "outstanding"),
  ]);

  const profileMap = new Map(
    ((profilesRes.data as Array<{ user_id: string; display_name: string }>) ?? []).map((p) => [p.user_id, p.display_name])
  );
  const emailMap = new Map(
    (authRes.data?.users ?? []).filter((u) => !!u.email).map((u) => [u.id, u.email as string])
  );

  const staff: ProviderStaffMember[] = ((rolesRes.data as Array<Record<string, unknown>>) ?? [])
    .map((r) => ({
      userId: String(r.user_id),
      role: String(r.role) as StaffRole,
      isActive: Boolean(r.is_active),
    }))
    .filter((r) => staffRoles.includes(r.role))
    .map((r) => ({
      userId: r.userId,
      role: r.role,
      isActive: r.isActive,
      email: emailMap.get(r.userId) || "Email unavailable",
      displayName: profileMap.get(r.userId) || (emailMap.get(r.userId) || "staff").split("@")[0],
      isSelf: r.userId === actorId,
    }))
    .sort((a, b) => (a.isActive === b.isActive ? a.displayName.localeCompare(b.displayName) : a.isActive ? -1 : 1));

  const platformByInvoice = new Map<string, number>();
  for (const row of ((platformLedgerRes.data as Array<Record<string, unknown>>) ?? [])) {
    platformByInvoice.set(String(row.invoice_id), Number(row.amount) || 0);
  }

  const ledger: ProviderLedgerRow[] = ((ledgerRes.data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const inv = (row.invoices ?? {}) as Record<string, unknown>;
    const providerAmount = Number(row.amount) || 0;
    const invoiceTotal = Number(inv.total_amount) || providerAmount;
    return {
      id: String(row.id),
      invoiceId: String(row.invoice_id),
      receiptNo: typeof inv.receipt_number === "string" ? inv.receipt_number : null,
      invoiceTotal,
      providerAmount,
      platformAmount: platformByInvoice.get(String(row.invoice_id)) ?? Math.max(0, invoiceTotal - providerAmount),
      payoutStatus: row.payout_status === "settled" ? "settled" : "pending",
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    };
  });

  const shareEarned = ledger.reduce((sum, l) => sum + l.providerAmount, 0);
  const sharePending = ledger.filter((l) => l.payoutStatus === "pending").reduce((sum, l) => sum + l.providerAmount, 0);

  return {
    providerId,
    providerName: String(orgRes.data?.name ?? "Provider organization"),
    providerType: String(orgRes.data?.provider_type ?? "clinic"),
    staff,
    ledger,
    kpis: {
      patientsRegistered: linksRes.count ?? 0,
      documentsIssued: (rxCountRes.count ?? 0) + (reportCountRes.count ?? 0),
      feesCollected: ((collectedRes.data as Array<{ total_amount: number }>) ?? []).reduce((s, i) => s + Number(i.total_amount || 0), 0),
      shareEarned,
      sharePending,
      outstandingInvoices: outstandingRes.count ?? 0,
      activeStaff: staff.filter((s) => s.isActive).length,
    },
  };
}

export async function addProviderStaffAction(input: { email: string; role: string }): Promise<{ email: string; role: StaffRole }> {
  const { actorId, providerId, admin } = await requireProviderAdmin();

  const email = (input.email ?? "").trim().toLowerCase();
  const role = (input.role ?? "") as StaffRole;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid account email address.");
  }
  if (!staffRoles.includes(role)) {
    throw new Error("Choose a provider staff role (doctor, front desk, pharmacist, lab tech or provider admin).");
  }

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const target = (list?.users || []).find((u) => (u.email || "").toLowerCase() === email);
  if (!target) {
    throw new Error(`No registered account found for ${email}. Ask them to sign up first, then add them here.`);
  }

  const { error: roleError } = await admin.from("user_roles").upsert(
    { user_id: target.id, role, provider_id: providerId, is_active: true, created_by: actorId },
    { onConflict: "user_id,role,provider_id" }
  );
  if (roleError) throw new Error(`Could not assign the role: ${roleError.message}`);

  const { error: memError } = await admin.from("provider_memberships").upsert(
    { provider_id: providerId, user_id: target.id, role, is_active: true },
    { onConflict: "provider_id,user_id,role" }
  );
  if (memError) console.error("[provider-admin] membership upsert skipped:", memError.message);

  await writeAudit(admin, actorId, providerId, "role_assignment", {
    operation: "grant",
    granted_by: "provider_admin",
    target_user_id: target.id,
    target_email: email,
    assigned_role: role as HardRole,
    provider_id: providerId,
  });

  revalidatePath("/provider-admin/staff");
  revalidatePath("/provider-admin/overview");
  return { email, role };
}

export async function setStaffActiveAction(input: { userId: string; role: string; active: boolean }): Promise<{ userId: string; role: StaffRole; active: boolean }> {
  const { actorId, providerId, admin } = await requireProviderAdmin();

  const role = (input.role ?? "") as StaffRole;
  if (!uuidPattern.test(input.userId ?? "") || !staffRoles.includes(role)) {
    throw new Error("Invalid staff member or role.");
  }
  if (input.userId === actorId && !input.active) {
    throw new Error("You cannot deactivate your own provider admin account.");
  }
  if (!input.active && role === "provider_admin") {
    const { count } = await admin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("role", "provider_admin")
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      throw new Error("The last active provider admin of this organization cannot be deactivated.");
    }
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .update({ is_active: input.active })
    .eq("user_id", input.userId)
    .eq("role", role)
    .eq("provider_id", providerId);
  if (roleError) throw new Error(`Could not update the staff role: ${roleError.message}`);

  await admin
    .from("provider_memberships")
    .update({ is_active: input.active })
    .eq("provider_id", providerId)
    .eq("user_id", input.userId)
    .eq("role", role);

  await writeAudit(admin, actorId, providerId, "role_assignment", {
    operation: input.active ? "reactivate" : "deactivate",
    granted_by: "provider_admin",
    target_user_id: input.userId,
    assigned_role: role as HardRole,
    provider_id: providerId,
  });

  revalidatePath("/provider-admin/staff");
  revalidatePath("/provider-admin/overview");
  return { userId: input.userId, role, active: input.active };
}

export async function setPayoutStatusAction(input: { entryId: string; status: "pending" | "settled" }): Promise<{ entryId: string; status: "pending" | "settled" }> {
  const { actorId, providerId, admin } = await requireProviderAdmin();

  if (!uuidPattern.test(input.entryId ?? "") || !["pending", "settled"].includes(input.status)) {
    throw new Error("Invalid ledger entry or payout status.");
  }

  const { data: current } = await admin
    .from("ledger_entries")
    .select("payout_status")
    .eq("id", input.entryId)
    .eq("provider_id", providerId)
    .eq("ledger_side", "provider")
    .maybeSingle();
  if (!current) {
    throw new Error("Ledger entry not found in your organization's ledger.");
  }

  const { error } = await admin
    .from("ledger_entries")
    .update({ payout_status: input.status })
    .eq("id", input.entryId)
    .eq("provider_id", providerId)
    .eq("ledger_side", "provider");
  if (error) throw new Error(`Could not update the payout status: ${error.message}`);

  // The audit write is part of the action: if it fails (pre-migration the audit
  // CHECK does not know the payout_update event type yet), roll the ledger
  // change back so state and audit trail never diverge.
  try {
    await writeAudit(admin, actorId, providerId, "payout_update", {
      ledger_entry_id: input.entryId,
      old_status: current.payout_status,
      new_status: input.status,
      provider_id: providerId,
    });
  } catch (auditErr) {
    await admin
      .from("ledger_entries")
      .update({ payout_status: current.payout_status })
      .eq("id", input.entryId)
      .eq("provider_id", providerId)
      .eq("ledger_side", "provider");
    throw new Error(
      /payout_update|check constraint/i.test(auditErr instanceof Error ? auditErr.message : "")
        ? "Payout update rolled back: the audit log is not ready for payout events yet — apply migration 20261121000000_platform_config.sql in the Supabase SQL editor (or connect DATABASE_URL and let the automatic database setup run)."
        : auditErr instanceof Error
          ? auditErr.message
          : "Could not record the payout audit event."
    );
  }

  revalidatePath("/provider-admin/ledger");
  revalidatePath("/provider-admin/overview");
  return { entryId: input.entryId, status: input.status };
}
