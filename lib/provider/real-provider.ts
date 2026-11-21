import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DoctorRecentPrescription,
  DoctorTemplateSummary,
  FrontDeskCollectionRow,
  LabReportSummary,
  PharmacyActivity,
  PharmacyBillRow,
  PharmacyDispenseRow,
  PrescriptionItemDraft,
  RealPatientSummary,
} from "@/lib/provider/types";

export type {
  FrontDeskCollectionRow,
  LabReportSummary,
  PharmacyActivity,
  PharmacyBillRow,
  PharmacyDispenseRow,
  RealPatientSummary,
} from "@/lib/provider/types";

function normalizeTemplateItems(raw: unknown): PrescriptionItemDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => ({
      medicine: typeof it.medicine === "string" ? it.medicine : "",
      strength: typeof it.strength === "string" ? it.strength : "",
      dose: typeof it.dose === "string" ? it.dose : "",
      frequency: typeof it.frequency === "string" ? it.frequency : "",
      duration: typeof it.duration === "string" ? it.duration : "",
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    }))
    .filter((it) => it.medicine.length > 0);
}

export async function listRealPatients(): Promise<RealPatientSummary[]> {
  const admin = createSupabaseAdminClient();
  // Degrade gracefully before migration 20261119100000 lands (cnic column absent)
  // or before 20261121100000 lands (phone/email columns absent): retry without
  // the newest columns instead of 500-ing the whole front desk (D10 pattern).
  let { data, error } = await admin
    .from("patients")
    .select("id, health_id, full_name, cnic, date_of_birth, blood_group, created_at, phone, email, user_id")
    .order("created_at", { ascending: false });
  if (error && /cnic/i.test(error.message)) {
    const fallback = await admin
      .from("patients")
      .select("id, health_id, full_name, date_of_birth, blood_group, created_at, phone, email, user_id")
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(`Could not load patients: ${fallback.error.message}`);
    data = fallback.data as typeof data;
    error = null;
  }
  if (error && /phone|email|user_id/i.test(error.message)) {
    const fallback = await admin
      .from("patients")
      .select("id, health_id, full_name, cnic, date_of_birth, blood_group, created_at")
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(`Could not load patients: ${fallback.error.message}`);
    data = fallback.data as typeof data;
    error = null;
  }
  if (error) throw new Error(`Could not load patients: ${error.message}`);

  return (data ?? []).map((p) => ({
    id: p.id,
    healthId: p.health_id,
    fullName: p.full_name,
    cnic: (p as { cnic?: string | null }).cnic ?? null,
    dob: p.date_of_birth,
    bloodGroup: p.blood_group,
    createdAt: p.created_at,
    phone: (p as { phone?: string | null }).phone ?? null,
    email: (p as { email?: string | null }).email ?? null,
    hasAccount: Boolean((p as { user_id?: string | null }).user_id),
  }));
}

/**
 * The calling doctor's saved prescription templates (brief 7.2).
 * Called with the USER's client so hard_private.assert_doctor() sees auth.uid().
 * Degrades to [] when the migration has not been applied yet (D10 pattern) so
 * the doctor workspace never 500s — the panel simply shows "no templates yet".
 */
export async function listDoctorTemplates(): Promise<DoctorTemplateSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("doctor_list_templates");
  if (error) {
    console.error("[doctor] prescription templates unavailable:", error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      id: typeof t.id === "string" ? t.id : "",
      name: typeof t.name === "string" ? t.name : "",
      items: normalizeTemplateItems(t.items),
      updatedAt: typeof t.updated_at === "string" ? t.updated_at : "",
    }))
    .filter((t) => t.id && t.name);
}

/**
 * The calling doctor's recent prescriptions with their items, for one-tap
 * repeat-last-prescription (brief 7.2). `userId` MUST be the authenticated
 * user id resolved server-side from `auth.getUser()` — the query is strictly
 * self-scoped to `doctor_user_id = userId`, so a doctor only ever sees their
 * own issuing history. Uses the admin client because RLS + revoked grants block
 * direct `authenticated` reads of clinical tables (the same trust model as the
 * doctor workspace patient directory and `issueRealPrescription`).
 * Degrades to [] on any read failure (D10 pattern) so the workspace never 500s.
 */
export async function listDoctorRecentPrescriptions(
  userId: string,
  limit = 8
): Promise<DoctorRecentPrescription[]> {
  if (!userId) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("prescriptions")
    .select(
      "id, prescription_code, status, issued_at, consultation_cost, note, patient_id, version, supersedes_id, " +
        "patients(full_name, health_id), " +
        "prescription_items(medicine, strength, dose, frequency, duration, quantity)"
    )
    .eq("doctor_user_id", userId)
    .order("issued_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[doctor] recent prescriptions unavailable:", error.message);
    return [];
  }

  // supabase-js types embedded resources as a union with an inner-error shape;
  // the runtime shape is plain rows, so assert it explicitly and normalize defensively.
  type RxRow = {
    id: unknown;
    prescription_code: unknown;
    status: unknown;
    issued_at: unknown;
    consultation_cost: unknown;
    note: unknown;
    patient_id: unknown;
    version: unknown;
    supersedes_id: unknown;
    patients: { full_name: unknown; health_id: unknown } | null;
    prescription_items: unknown;
  };
  const rows = (data ?? []) as unknown as RxRow[];

  // Brief Section 6: amendments chain versions via supersedes_id — resolve the
  // superseded codes in one query so the doctor list can show "replaces RX-…".
  const supersedesIds = rows
    .map((rx) => (typeof rx.supersedes_id === "string" ? rx.supersedes_id : null))
    .filter((id): id is string => Boolean(id));
  const codeById = new Map<string, string>();
  if (supersedesIds.length > 0) {
    const { data: supersededRows } = await admin
      .from("prescriptions")
      .select("id, prescription_code")
      .in("id", supersedesIds);
    ((supersededRows ?? []) as unknown as Array<{ id: unknown; prescription_code: unknown }>).forEach((row) => {
      if (typeof row.id === "string" && typeof row.prescription_code === "string") {
        codeById.set(row.id, row.prescription_code);
      }
    });
  }

  return rows
    .map((rx) => ({
      id: typeof rx.id === "string" ? rx.id : "",
      code: typeof rx.prescription_code === "string" ? rx.prescription_code : "",
      status: typeof rx.status === "string" ? rx.status : "",
      issuedAt: typeof rx.issued_at === "string" ? rx.issued_at : "",
      consultationCost: Math.max(0, Number(rx.consultation_cost) || 0),
      note: typeof rx.note === "string" ? rx.note : null,
      patientId: typeof rx.patient_id === "string" ? rx.patient_id : "",
      patientName: typeof rx.patients?.full_name === "string" ? rx.patients.full_name : "",
      patientHealthId: typeof rx.patients?.health_id === "string" ? rx.patients.health_id : "",
      version: Math.max(1, Number(rx.version) || 1),
      supersedesCode:
        typeof rx.supersedes_id === "string" ? codeById.get(rx.supersedes_id) ?? null : null,
      items: normalizeTemplateItems(rx.prescription_items),
    }))
    .filter((rx) => rx.id && rx.code && rx.patientId);
}

/**
 * The lab workspace "Reports issued" page (owner feedback 2026-11-21: it showed
 * the same card as the overview and listed hard-coded demo rows). Real reports
 * from the DB, newest first, each with its public verification link. Admin
 * client (RLS + revoked grants block direct reads); degrades to [] (D10).
 */
export async function listRecentLabReports(limit = 50): Promise<LabReportSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lab_reports")
    .select("id, test_type, report_hash, tested_at, patients(full_name, health_id)")
    .order("tested_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[lab] recent reports unavailable:", error.message);
    return [];
  }

  type ReportRow = {
    id: unknown;
    test_type: unknown;
    report_hash: unknown;
    tested_at: unknown;
    patients: { full_name: unknown; health_id: unknown } | null;
  };
  return ((data ?? []) as unknown as ReportRow[])
    .map((rep) => ({
      id: typeof rep.id === "string" ? rep.id : "",
      testType: typeof rep.test_type === "string" ? rep.test_type : "",
      hash: typeof rep.report_hash === "string" ? rep.report_hash : "",
      fee: 0,
      patientName: typeof rep.patients?.full_name === "string" ? rep.patients.full_name : "",
      patientHealthId: typeof rep.patients?.health_id === "string" ? rep.patients.health_id : "",
      testedAt: typeof rep.tested_at === "string" ? rep.tested_at : "",
      verifiedUrl: typeof rep.id === "string" ? `/verify/lab/${rep.id}` : "",
    }))
    .filter((rep) => rep.id && rep.testType);
}

/**
 * The pharmacy dispenses/bills pages (owner feedback 2026-11-21: all four
 * pharmacy pages rendered the same resolve card). Brief Section 4 keeps the
 * pharmacist's scope NARROW — no patient directory, no history browsing — so
 * these lists are strictly the pharmacist's OWN recorded actions
 * (pharmacy_dispenses.pharmacist_user_id = the authenticated user), exactly
 * the rows they created at the counter. Bills are the cost items their
 * dispenses attached. Degrades to empty lists (D10).
 */
export async function listMyPharmacyActivity(userId: string): Promise<PharmacyActivity> {
  if (!userId) return { dispenses: [], bills: [] };
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("pharmacy_dispenses")
    .select(
      "id, fill_number, dispensed_at, prescriptions(id, prescription_code), patients(full_name, health_id)"
    )
    .eq("pharmacist_user_id", userId)
    .order("dispensed_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[pharmacy] dispense history unavailable:", error.message);
    return { dispenses: [], bills: [] };
  }

  type DispenseRow = {
    id: unknown;
    fill_number: unknown;
    dispensed_at: unknown;
    prescriptions: { id: unknown; prescription_code: unknown } | null;
    patients: { full_name: unknown; health_id: unknown } | null;
  };
  const rows = (data ?? []) as unknown as DispenseRow[];
  const dispenses: PharmacyDispenseRow[] = rows
    .map((d) => ({
      id: typeof d.id === "string" ? d.id : "",
      prescriptionId: typeof d.prescriptions?.id === "string" ? d.prescriptions.id : "",
      prescriptionCode:
        typeof d.prescriptions?.prescription_code === "string" ? d.prescriptions.prescription_code : "",
      patientName: typeof d.patients?.full_name === "string" ? d.patients.full_name : "",
      patientHealthId: typeof d.patients?.health_id === "string" ? d.patients.health_id : "",
      fillNumber: Math.max(1, Number(d.fill_number) || 1),
      dispensedAt: typeof d.dispensed_at === "string" ? d.dispensed_at : "",
    }))
    .filter((d) => d.id && d.prescriptionCode);

  const prescriptionIds = [...new Set(dispenses.map((d) => d.prescriptionId).filter(Boolean))];
  if (prescriptionIds.length === 0) return { dispenses, bills: [] };

  // Bills: cost items linked to the prescriptions THIS pharmacist dispensed
  // (linked_type = 'bill' is what dispenseRealPrescription writes).
  const { data: billRows, error: billError } = await admin
    .from("cost_items")
    .select("id, title, amount, incurred_at, linked_id")
    .eq("linked_type", "bill")
    .in("linked_id", prescriptionIds)
    .order("incurred_at", { ascending: false })
    .limit(100);
  if (billError) {
    console.error("[pharmacy] bill history unavailable:", billError.message);
    return { dispenses, bills: [] };
  }

  const codeByPrescriptionId = new Map(dispenses.map((d) => [d.prescriptionId, d.prescriptionCode]));
  const patientByPrescriptionId = new Map(dispenses.map((d) => [d.prescriptionId, d]));
  const bills: PharmacyBillRow[] = ((billRows ?? []) as unknown as Array<{
    id: unknown;
    title: unknown;
    amount: unknown;
    incurred_at: unknown;
    linked_id: unknown;
  }>)
    .map((b) => {
      const prescriptionId = typeof b.linked_id === "string" ? b.linked_id : "";
      const dispense = patientByPrescriptionId.get(prescriptionId);
      return {
        id: typeof b.id === "string" ? b.id : "",
        title: typeof b.title === "string" ? b.title : "",
        amount: Math.max(0, Number(b.amount) || 0),
        prescriptionCode: codeByPrescriptionId.get(prescriptionId) ?? "",
        patientName: dispense?.patientName ?? "",
        patientHealthId: dispense?.patientHealthId ?? "",
        date: typeof b.incurred_at === "string" ? b.incurred_at : "",
      };
    })
    .filter((b) => b.id);

  return { dispenses, bills };
}

/**
 * The front-desk "Daily collections & ledger" page (owner feedback 2026-11-21:
 * it multiplied the patient count by the fee and printed hard-coded PKR
 * 500/150/350 rows). REAL invoices with their ledger splits, newest first.
 * Scoped to the desk's provider organization when one is given; the platform
 * admin (route override) passes undefined and sees every desk's receipts.
 * Degrades to [] (D10).
 */
export async function listFrontDeskCollections(providerId?: string): Promise<FrontDeskCollectionRow[]> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("invoices")
    .select(
      "id, invoice_type, total_amount, status, payment_method, receipt_number, created_at, " +
        "patients(full_name, health_id), ledger_entries(ledger_side, amount)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (providerId) query = query.eq("provider_id", providerId);
  const { data, error } = await query;
  if (error) {
    console.error("[front-desk] collections unavailable:", error.message);
    return [];
  }

  type InvoiceRow = {
    id: unknown;
    invoice_type: unknown;
    total_amount: unknown;
    status: unknown;
    payment_method: unknown;
    receipt_number: unknown;
    created_at: unknown;
    patients: { full_name: unknown; health_id: unknown } | null;
    ledger_entries: Array<{ ledger_side: unknown; amount: unknown }> | null;
  };
  return ((data ?? []) as unknown as InvoiceRow[])
    .map((inv) => {
      const splits = (inv.ledger_entries ?? []) as Array<{ ledger_side: unknown; amount: unknown }>;
      const providerShare = splits.find((s) => s.ledger_side === "provider");
      const platformShare = splits.find((s) => s.ledger_side === "platform");
      return {
        invoiceId: typeof inv.id === "string" ? inv.id : "",
        receiptNo: typeof inv.receipt_number === "string" ? inv.receipt_number : "—",
        patientName: typeof inv.patients?.full_name === "string" ? inv.patients.full_name : "",
        healthId: typeof inv.patients?.health_id === "string" ? inv.patients.health_id : "",
        invoiceType: typeof inv.invoice_type === "string" ? inv.invoice_type : "",
        amount: Math.max(0, Number(inv.total_amount) || 0),
        providerShare: providerShare ? Math.max(0, Number(providerShare.amount) || 0) : null,
        platformShare: platformShare ? Math.max(0, Number(platformShare.amount) || 0) : null,
        paymentMethod: typeof inv.payment_method === "string" ? inv.payment_method : "cash",
        status: typeof inv.status === "string" ? inv.status : "",
        date: typeof inv.created_at === "string" ? inv.created_at : "",
      };
    })
    .filter((inv) => inv.invoiceId);
}
