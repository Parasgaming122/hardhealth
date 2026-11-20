import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { RealPatientRecord, RealPatientPortalData, RealCostItem, RealPrescription, RealLabReport, RealInvoice, RealAccessLog } from "@/lib/patient/types";
import { readPlatformConfig } from "@/lib/admin/config";
import { insertPatientWithUniqueHealthId, type PatientRow } from "@/lib/patient/health-id";

export type { RealPatientRecord, RealPatientPortalData, RealCostItem, RealPrescription, RealLabReport, RealInvoice, RealAccessLog } from "@/lib/patient/types";

/**
 * Simulated size of one AI-ingested document (scanned PDF/photo). The prototype
 * stores no real files, so each ingestion is accounted at this size against the
 * patient's plan quota — enough to exercise the 80% alert and the 100% upload
 * block (brief 5.8, acceptance: "a patient at 100% storage cannot upload but
 * can read everything").
 */
export const SIMULATED_DOCUMENT_MB = 340;

/**
 * Real storage accounting for the meter (brief 7.4: "storage meter from file
 * sizes"). Used = sum of the patient's ingestion documents' simulated sizes
 * recorded in their immutable audit events; quota = the plan quota from the
 * config table (brief Rule 1), Base plan in this prototype. Degrades to a
 * 0/1024 meter when the config migration is absent.
 */
export async function getPatientStorage(patientId: string): Promise<{ usedMb: number; quotaMb: number }> {
  const admin = createSupabaseAdminClient();
  const [config, events] = await Promise.all([
    readPlatformConfig(),
    admin
      .from("audit_events")
      .select("metadata")
      .eq("patient_id", patientId)
      .eq("resource_type", "ai_document_ingestion"),
  ]);
  const usedMb = ((events.data as Array<{ metadata: Record<string, unknown> | null }>) ?? []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.metadata?.size_mb) || 0),
    0
  );
  return { usedMb, quotaMb: Math.max(1, Math.round(config.base_plan_quota_mb)) };
}

function toRealPatientRecord(row: PatientRow): RealPatientRecord {
  return {
    id: row.id,
    userId: row.user_id,
    healthId: row.health_id,
    fullName: row.full_name,
    dob: row.date_of_birth,
    gender: row.gender,
    bloodGroup: row.blood_group,
    storagePlan: "Base",
    storageUsedMb: 0,
    storageQuotaMb: 1024,
  };
  // (real storage values are filled in getRealPatientPortalData, which knows
  // the config table and the patient's ingestion history)
}

export async function ensurePatientRecord(userId: string, displayName?: string): Promise<RealPatientRecord> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("patients")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return toRealPatientRecord(existing as unknown as PatientRow);
  }

  const fullName = displayName && displayName !== "H.A.R.D user" ? displayName : "H.A.R.D Patient";
  const outcome = await insertPatientWithUniqueHealthId(admin, {
    user_id: userId,
    full_name: fullName,
    blood_group: "O+",
  });

  if (outcome.ok) {
    return toRealPatientRecord(outcome.row);
  }

  // D20: a concurrent request for the SAME user may have won the insert while
  // we were generating a Health ID (patients_user_id_key violation — e.g. two
  // tabs mounting the portal at once). The winner's row is exactly what this
  // function promises, so re-select by user_id before giving up.
  if (outcome.error.code === "23505") {
    const { data: raced } = await admin
      .from("patients")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (raced) {
      return toRealPatientRecord(raced as unknown as PatientRow);
    }
  }

  throw new Error(`Could not ensure patient profile: ${outcome.error.message}`);
}

export async function getRealPatientPortalData(userId: string): Promise<RealPatientPortalData> {
  const admin = createSupabaseAdminClient();
  const patient = await ensurePatientRecord(userId);
  // P2-7 (brief 5.8/7.4): real meter numbers — config quota + ingestion sizes.
  const storage = await getPatientStorage(patient.id);
  const storagePct = Math.min(100, Math.round((storage.usedMb / storage.quotaMb) * 100));
  const patientWithStorage: RealPatientRecord = {
    ...patient,
    storageUsedMb: storage.usedMb,
    storageQuotaMb: storage.quotaMb,
  };

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

  const mappedPrescriptions: RealPrescription[] = (() => {
    // Brief Section 6: amendments supersede an earlier prescription — map each
    // row's supersedes_id to that row's code (the superseded prescription
    // belongs to the same patient, so it is already in this result set), and
    // the reverse (superseded_id → superseding code) so a cancelled row can
    // show "replaced by RX-…".
    const rxRows = (prescriptions ?? []) as Array<Record<string, unknown>>;
    const codeById = new Map<string, string>();
    const supersederOf = new Map<string, string>();
    rxRows.forEach((row) => {
      if (typeof row.id === "string" && typeof row.prescription_code === "string") {
        codeById.set(row.id, row.prescription_code);
        if (typeof row.supersedes_id === "string") {
          supersederOf.set(row.supersedes_id, row.prescription_code);
        }
      }
    });
    return rxRows.map((rx) => ({
      id: String(rx.id),
      code: String(rx.prescription_code),
      doctor: "Dr. Treating Physician",
      provider: "Linked Provider",
      status: rx.status as RealPrescription["status"],
      date: rx.issued_at as string,
      expiresAt: rx.expires_at as string,
      maxFills: Number(rx.max_fills),
      fillsUsed: Number(rx.fills_used),
      consultationCost: Number(rx.consultation_cost),
      version: Math.max(1, Number(rx.version) || 1),
      supersedesCode:
        typeof rx.supersedes_id === "string" ? codeById.get(rx.supersedes_id) ?? null : null,
      supersededByCode: typeof rx.id === "string" ? supersederOf.get(rx.id) ?? null : null,
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
  })();

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
    patient: patientWithStorage,
    costs: mappedCosts,
    prescriptions: mappedPrescriptions,
    labReports: mappedReports,
    invoices: mappedInvoices,
    accessLogs: mappedLogs,
    providers: mappedProviders,
    storagePct,
  };
}
