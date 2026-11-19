import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { RealPatientRecord, RealPatientPortalData, RealCostItem, RealPrescription, RealLabReport, RealInvoice, RealAccessLog } from "@/lib/patient/types";

export type { RealPatientRecord, RealPatientPortalData, RealCostItem, RealPrescription, RealLabReport, RealInvoice, RealAccessLog } from "@/lib/patient/types";

export async function ensurePatientRecord(userId: string, displayName?: string): Promise<RealPatientRecord> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("patients")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      healthId: existing.health_id,
      fullName: existing.full_name,
      dob: existing.date_of_birth,
      gender: existing.gender,
      bloodGroup: existing.blood_group,
      storagePlan: "Base",
      storageUsedMb: 0,
      storageQuotaMb: 1024,
    };
  }

  // Generate next Health ID
  const { count } = await admin.from("patients").select("*", { count: "exact", head: true });
  const serial = (count ?? 0) + 101;
  const healthId = `HARD-${String(serial).padStart(6, "0")}`;
  const fullName = displayName && displayName !== "H.A.R.D user" ? displayName : "H.A.R.D Patient";

  const { data: inserted, error } = await admin
    .from("patients")
    .insert({
      user_id: userId,
      health_id: healthId,
      full_name: fullName,
      blood_group: "O+",
    })
    .select()
    .single();

  if (error || !inserted) {
    throw new Error(`Could not ensure patient profile: ${error?.message}`);
  }

  return {
    id: inserted.id,
    userId: inserted.user_id,
    healthId: inserted.health_id,
    fullName: inserted.full_name,
    dob: inserted.date_of_birth,
    gender: inserted.gender,
    bloodGroup: inserted.blood_group,
    storagePlan: "Base",
    storageUsedMb: 0,
    storageQuotaMb: 1024,
  };
}

export async function getRealPatientPortalData(userId: string): Promise<RealPatientPortalData> {
  const admin = createSupabaseAdminClient();
  const patient = await ensurePatientRecord(userId);

  const [
    { data: costs },
    { data: prescriptions },
    { data: labReports },
    { data: invoices },
    { data: logs },
    { data: links },
  ] = await Promise.all([
    admin.from("cost_items").select("*").eq("patient_id", patient.id).order("incurred_at", { ascending: false }),
    admin.from("prescriptions").select("*, prescription_items(*)").eq("patient_id", patient.id).order("issued_at", { ascending: false }),
    admin.from("lab_reports").select("*").eq("patient_id", patient.id).order("tested_at", { ascending: false }),
    admin.from("invoices").select("*").eq("patient_id", patient.id).order("created_at", { ascending: false }),
    admin.from("audit_events").select("*").eq("patient_id", patient.id).order("created_at", { ascending: false }),
    admin.from("patient_provider_links").select("*, provider_organizations(*)").eq("patient_id", patient.id),
  ]);

  const mappedCosts: RealCostItem[] = (costs ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    amount: Number(item.amount),
    provenance: item.provenance,
    date: item.incurred_at,
    provider: item.provider_id ? "Linked Clinic" : "Self-reported",
    paymentStatus: item.payment_status,
  }));

  const mappedPrescriptions: RealPrescription[] = (prescriptions ?? []).map((rx) => ({
    id: rx.id,
    code: rx.prescription_code,
    doctor: "Dr. Treating Physician",
    provider: "Linked Provider",
    status: rx.status,
    date: rx.issued_at,
    expiresAt: rx.expires_at,
    maxFills: rx.max_fills,
    fillsUsed: rx.fills_used,
    consultationCost: Number(rx.consultation_cost),
    items: ((rx.prescription_items as Array<Record<string, unknown>>) ?? []).map((item) => ({
      id: String(item.id),
      medicine: String(item.medicine),
      strength: String(item.strength ?? ""),
      dose: String(item.dose ?? ""),
      frequency: String(item.frequency ?? ""),
      duration: String(item.duration ?? ""),
      quantity: Number(item.quantity ?? 1),
    })),
  }));

  const mappedReports: RealLabReport[] = (labReports ?? []).map((rep) => ({
    id: rep.id,
    testType: rep.test_type,
    date: rep.tested_at,
    lab: "Certified Diagnostic Lab",
    hash: rep.report_hash,
    token: rep.id,
  }));

  const mappedInvoices: RealInvoice[] = (invoices ?? []).map((inv) => ({
    id: inv.id,
    type: inv.invoice_type,
    amount: Number(inv.total_amount),
    status: inv.status,
    receiptNo: inv.receipt_number,
    date: inv.created_at,
  }));

  const mappedLogs: RealAccessLog[] = (logs ?? []).map((log) => ({
    id: log.id,
    date: log.created_at,
    actor: "Medical System",
    role: "System",
    action: log.event_type.replaceAll("_", " "),
    entity: log.resource_type,
    kind: log.event_type,
  }));

  const mappedProviders = (links ?? []).map((link) => {
    const org = link.provider_organizations as Record<string, unknown> | null;
    return {
      id: link.provider_id,
      name: String(org?.name ?? "Provider Organization"),
      type: String(org?.provider_type ?? "clinic"),
      location: String(org?.address ?? "Pakistan"),
      status: link.status,
    };
  });

  return {
    patient,
    costs: mappedCosts,
    prescriptions: mappedPrescriptions,
    labReports: mappedReports,
    invoices: mappedInvoices,
    accessLogs: mappedLogs,
    providers: mappedProviders,
  };
}
