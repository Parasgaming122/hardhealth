"use server";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { readPlatformConfig } from "@/lib/admin/config";
import { insertPatientWithUniqueHealthId } from "@/lib/patient/health-id";

/**
 * Resolve the caller's provider organization from their ACTIVE staff role
 * (doctor / pharmacist / lab_tech). prescriptions, pharmacy_dispenses and
 * lab_reports all carry a NOT NULL provider_id — the runtime verification in
 * Session 8 caught that all three actions omitted it (every real insert failed
 * with a not-null violation), so this is now mandatory for each of them.
 */
async function requireActiveProviderId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  role: "doctor" | "pharmacist" | "lab_tech"
): Promise<string> {
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("provider_id")
    .eq("user_id", userId)
    .eq("role", role)
    .eq("is_active", true)
    .not("provider_id", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!roleRow?.provider_id) {
    throw new Error(
      `Your account has no active ${role.replace("_", " ")} role attached to a provider organization. Ask a provider admin or platform admin to assign one.`
    );
  }
  return roleRow.provider_id as string;
}

export async function registerRealPatient(input: {
  fullName: string;
  cnic: string;
  phone: string;
  dob?: string;
  gender?: string;
  bloodGroup?: string;
  paymentMethod?: "cash" | "card" | "wallet";
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  // Brief Rule 1: fees and the provider share come from the config table —
  // never hard-coded. Falls back to the brief-22 defaults pre-migration.
  const config = await readPlatformConfig();
  const regFee = Math.max(0, Math.round(config.registration_fee));
  const providerSharePercent = Math.min(100, Math.max(0, Math.round(config.provider_share_percent)));
  // Brief Rule 4: "every paid invoice COLLECTED BY A PROVIDER creates one
  // revenue split" — the collecting desk's provider org is stamped onto the
  // invoice and the provider-side ledger entry so the provider admin's
  // earnings ledger can find it (Phase 3 verification caught this omission).
  const { data: deskRole } = await admin
    .from("user_roles")
    .select("provider_id")
    .eq("user_id", user.id)
    .eq("role", "front_desk")
    .eq("is_active", true)
    .not("provider_id", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!deskRole?.provider_id) {
    throw new Error(
      "Your account has no active front desk role attached to a provider organization. Ask a provider admin or platform admin to assign one before registering patients."
    );
  }
  const deskProviderId = deskRole.provider_id as string;
  // CNIC identity (brief 5.2 / 11.10): normalize to 13 digits so formatting
  // variants of the same card collide on the DB unique index, and reject
  // duplicates BEFORE creating any invoice/ledger/audit rows.
  const cnicDigits = (input.cnic ?? "").replace(/[^0-9]/g, "");
  if (cnicDigits.length !== 13) {
    throw new Error("CNIC must contain exactly 13 digits (format: 42101-1234567-1).");
  }

  // Duplicate pre-check (brief 5.2). A missing-column error here means the
  // migration has not been applied yet — fall through to the insert, which
  // produces the actionable migration-hint message.
  const { data: existingByCnic, error: cnicCheckError } = await admin
    .from("patients")
    .select("health_id, full_name")
    .eq("cnic", cnicDigits)
    .maybeSingle();
  if (!cnicCheckError && existingByCnic) {
    throw new Error(
      `This CNIC is already registered to ${existingByCnic.full_name} (${existingByCnic.health_id}). One patient, one Health ID — search the directory instead of re-registering.`
    );
  }

  // 1. Insert patient. D16/D20: Health ID from max(health_id) with a fresh
  // re-read on every retry — never count(*), which collides with an existing
  // health_id as soon as any patient row has been deleted.
  const outcome = await insertPatientWithUniqueHealthId(admin, {
    full_name: input.fullName.trim(),
    cnic: cnicDigits,
    date_of_birth: input.dob ? input.dob : null,
    gender: input.gender || null,
    blood_group: input.bloodGroup || "O+",
    created_by: user.id,
  });

  if (!outcome.ok) {
    const pError = outcome.error;
    // Unique-violation (23505) = a concurrent desk registered the same CNIC between
    // our pre-check and the insert — the DB index is the source of truth.
    if (pError.code === "23505" && /cnic/i.test(pError.message)) {
      throw new Error("This CNIC was just registered by another desk. Reload the directory and search by CNIC.");
    }
    if (/cnic/i.test(pError.message) && /could not find|does not exist/i.test(pError.message)) {
      throw new Error(
        "Could not register patient: the patients table is missing the cnic column — apply migration 20261119100000_cnic_unique_atomic_status.sql in the Supabase SQL editor."
      );
    }
    throw new Error(`Could not register patient: ${pError.message}`);
  }
  const newPatient = outcome.row;
  const serial = Number.parseInt(newPatient.health_id.replace(/\D/g, ""), 10);
  const healthId = newPatient.health_id;
  const receiptNo = `HARD-R-${String(serial).padStart(5, "0")}`;

  // 2. Insert registration invoice (brief 22: registration_fee from config, default PKR 500)
  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      patient_id: newPatient.id,
      provider_id: deskProviderId,
      invoice_type: "registration",
      total_amount: regFee,
      status: "paid",
      payment_method: input.paymentMethod || "cash",
      receipt_number: receiptNo,
      collected_by: user.id,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();

  // 3. Post revenue split to ledger (brief Rule 4: shares sum to the invoice;
  // provider share percent from config, platform share is the remainder)
  if (invoice) {
    const providerShare = Math.round((regFee * providerSharePercent) / 100);
    const platformShare = regFee - providerShare;

    await admin.from("ledger_entries").insert([
      {
        invoice_id: invoice.id,
        ledger_side: "platform",
        amount: platformShare,
        payout_status: "settled",
      },
      {
        invoice_id: invoice.id,
        ledger_side: "provider",
        provider_id: deskProviderId,
        amount: providerShare,
        payout_status: "pending",
      },
    ]);
  }

  // 4. Audit log
  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: newPatient.id,
    provider_id: deskProviderId,
    event_type: "write",
    resource_type: "patient_registration",
    metadata: { health_id: healthId, receipt_no: receiptNo, fee: regFee, provider_share_percent: providerSharePercent },
  });

  revalidatePath("/front-desk/patients");
  revalidatePath("/front-desk/overview");
  revalidatePath("/admin/overview");

  return {
    patient: {
      id: newPatient.id,
      healthId: newPatient.health_id,
      fullName: newPatient.full_name,
    },
    receiptNo,
  };
}

export async function issueRealPrescription(input: {
  patientId: string;
  complaint?: string;
  diagnosis?: string;
  consultationCost?: number;
  note?: string;
  items: Array<{
    medicine: string;
    strength?: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    quantity: number;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const providerId = await requireActiveProviderId(admin, user.id, "doctor");

  // Generate prescription code and token. Brief Rule 1: validity and fills
  // come from the config table (brief 22), never hard-coded.
  const config = await readPlatformConfig();
  const validDays = Math.min(365, Math.max(1, Math.round(config.prescription_valid_days)));
  const maxFills = Math.min(20, Math.max(1, Math.round(config.prescription_max_fills)));
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const randomSuffix2 = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prescriptionCode = `RX-${randomSuffix}-${randomSuffix2}`;
  const rawToken = crypto.randomBytes(16).toString("hex");
  const tokenDigest = crypto.createHash("sha256").update(rawToken).digest();

  // 1. Insert prescription
  const { data: rx, error: rxError } = await admin
    .from("prescriptions")
    .insert({
      patient_id: input.patientId,
      provider_id: providerId,
      doctor_user_id: user.id,
      prescription_code: prescriptionCode,
      token_digest: tokenDigest,
      consultation_cost: input.consultationCost || 0,
      note: input.note || null,
      status: "active",
      max_fills: maxFills,
      fills_used: 0,
      expires_at: new Date(Date.now() + validDays * 86400000).toISOString(),
    })
    .select()
    .single();

  if (rxError || !rx) throw new Error(`Could not issue prescription: ${rxError?.message}`);

  // 2. Insert items
  if (input.items && input.items.length > 0) {
    const itemRows = input.items.map((it) => ({
      prescription_id: rx.id,
      medicine: it.medicine,
      strength: it.strength || "",
      dose: it.dose || "",
      frequency: it.frequency || "",
      duration: it.duration || "",
      quantity: Math.max(1, it.quantity || 1),
    }));
    await admin.from("prescription_items").insert(itemRows);
  }

  // 3. Insert consultation cost item if > 0
  if (input.consultationCost && input.consultationCost > 0) {
    await admin.from("cost_items").insert({
      patient_id: input.patientId,
      title: `Doctor consultation · ${input.diagnosis || "General care"}`,
      category: "Consultation",
      amount: input.consultationCost,
      provenance: "verified",
      payment_status: "paid",
      linked_type: "prescription",
      linked_id: rx.id,
      incurred_at: new Date().toISOString(),
    });
  }

  // 4. Audit event
  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: input.patientId,
    provider_id: providerId,
    event_type: "write",
    resource_type: "prescription",
    metadata: { prescription_code: prescriptionCode, items_count: input.items.length },
  });

  revalidatePath("/doctor/prescriptions");
  revalidatePath("/doctor/prescriptions/new");
  revalidatePath("/doctor/overview");
  revalidatePath("/patient/prescriptions");
  revalidatePath("/patient/overview");

  return {
    id: rx.id,
    code: prescriptionCode,
    token: rawToken,
  };
}

/**
 * P2-13 (brief Section 6 / acceptance criteria): amending an issued
 * prescription cancels the old QR and issues a NEW VERSION; the old record is
 * kept (Rule 3 — issued records are never deleted). The new row carries
 * version = old.version + 1 and supersedes_id = old.id; the old row flips to
 * status 'cancelled', after which the pharmacy resolve paths (the
 * resolve_prescription RPC and /api/rx/resolve) return a clear status with no
 * medicine details (Rule 6). The consultation fee is NOT re-charged — the
 * amendment corrects the record, it is not a new visit.
 */
export async function amendRealPrescription(input: {
  originalId: string;
  patientId: string;
  consultationCost?: number;
  note?: string;
  items: Array<{
    medicine: string;
    strength?: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    quantity: number;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const providerId = await requireActiveProviderId(admin, user.id, "doctor");

  // Load the prescription being amended.
  const { data: original, error: originalError } = await admin
    .from("prescriptions")
    .select("id, patient_id, status, version, prescription_code")
    .eq("id", input.originalId)
    .single();

  if (originalError || !original) {
    throw new Error("The prescription you are amending could not be found. Reload the workspace and try again.");
  }
  if (original.patient_id !== input.patientId) {
    throw new Error("This prescription belongs to a different patient. Select the patient it was issued to.");
  }
  if (original.status === "cancelled") {
    throw new Error(`${original.prescription_code} is already cancelled — it was superseded by an amendment. Amend the newest version instead.`);
  }
  if (original.status === "dispensed") {
    throw new Error(`${original.prescription_code} has already been fully dispensed and cannot be amended. Issue a new prescription instead.`);
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("An amendment needs at least one medicine line.");
  }

  // Brief Rule 1: validity and fills come from the config table (brief 22).
  const config = await readPlatformConfig();
  const validDays = Math.min(365, Math.max(1, Math.round(config.prescription_valid_days)));
  const maxFills = Math.min(20, Math.max(1, Math.round(config.prescription_max_fills)));
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const randomSuffix2 = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prescriptionCode = `RX-${randomSuffix}-${randomSuffix2}`;
  const rawToken = crypto.randomBytes(16).toString("hex");
  const tokenDigest = crypto.createHash("sha256").update(rawToken).digest();
  const newVersion = (original.version ?? 1) + 1;

  // 1. Cancel the original — its QR/code dies immediately (resolve paths return
  // a clear 'cancelled' status with no medicines); the row itself is kept.
  const { error: cancelError } = await admin
    .from("prescriptions")
    .update({ status: "cancelled" })
    .eq("id", original.id);
  if (cancelError) {
    throw new Error(`Could not cancel the original prescription: ${cancelError.message}`);
  }

  // 2. Insert the new version, linked back to the original.
  const { data: rx, error: rxError } = await admin
    .from("prescriptions")
    .insert({
      patient_id: input.patientId,
      provider_id: providerId,
      doctor_user_id: user.id,
      prescription_code: prescriptionCode,
      token_digest: tokenDigest,
      consultation_cost: input.consultationCost || 0,
      note: input.note || null,
      status: "active",
      max_fills: maxFills,
      fills_used: 0,
      expires_at: new Date(Date.now() + validDays * 86400000).toISOString(),
      version: newVersion,
      supersedes_id: original.id,
    })
    .select()
    .single();

  if (rxError || !rx) {
    throw new Error(`Could not issue the amended prescription: ${rxError?.message}`);
  }

  // 3. Insert the amended items.
  const itemRows = input.items.map((it) => ({
    prescription_id: rx.id,
    medicine: it.medicine,
    strength: it.strength || "",
    dose: it.dose || "",
    frequency: it.frequency || "",
    duration: it.duration || "",
    quantity: Math.max(1, it.quantity || 1),
  }));
  await admin.from("prescription_items").insert(itemRows);

  // 4. Audit the amendment (event_type 'write', matching issueRealPrescription;
  //    the amendment details live in metadata so no new CHECK value is needed).
  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: input.patientId,
    provider_id: providerId,
    event_type: "write",
    resource_type: "prescription",
    resource_id: rx.id,
    metadata: {
      action: "prescription_amended",
      original_code: original.prescription_code,
      new_code: prescriptionCode,
      version: newVersion,
      items_count: input.items.length,
    },
  });

  revalidatePath("/doctor/prescriptions");
  revalidatePath("/doctor/prescriptions/new");
  revalidatePath("/doctor/overview");
  revalidatePath("/patient/prescriptions");
  revalidatePath("/patient/overview");

  return {
    id: rx.id,
    code: prescriptionCode,
    token: rawToken,
    version: newVersion,
    supersedesCode: original.prescription_code as string,
  };
}

export async function dispenseRealPrescription(input: {
  prescriptionId: string;
  otp: string;
  billNumber?: string;
  billTotal?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const pharmacyProviderId = await requireActiveProviderId(admin, user.id, "pharmacist");

  // Find prescription
  const { data: rx, error: rxErr } = await admin
    .from("prescriptions")
    .select("*, patients(*)")
    .eq("id", input.prescriptionId)
    .single();

  if (rxErr || !rx) throw new Error("Prescription not found.");
  if (rx.status === "dispensed" || rx.fills_used >= rx.max_fills) {
    throw new Error("Prescription has already been fully dispensed.");
  }

  if (input.otp !== "4812" && input.otp.length !== 4) {
    throw new Error("Invalid patient OTP. Use 4812 for prototype verification.");
  }

  // 1. Update prescription status
  const nextFills = rx.fills_used + 1;
  await admin
    .from("prescriptions")
    .update({
      fills_used: nextFills,
      status: nextFills >= rx.max_fills ? "dispensed" : "partly_filled",
    })
    .eq("id", rx.id);

  // 2. Insert pharmacy dispense record
  await admin.from("pharmacy_dispenses").insert({
    prescription_id: rx.id,
    provider_id: pharmacyProviderId,
    pharmacist_user_id: user.id,
    fill_number: nextFills,
    otp_verified: true,
    dispensed_at: new Date().toISOString(),
  });

  // 3. Attach bill if provided
  if (input.billTotal && input.billTotal > 0) {
    await admin.from("cost_items").insert({
      patient_id: rx.patient_id,
      title: `Pharmacy bill · ${input.billNumber || rx.prescription_code}`,
      category: "Medicine",
      amount: input.billTotal,
      provenance: "verified",
      payment_status: "paid",
      linked_type: "bill",
      linked_id: rx.id,
      incurred_at: new Date().toISOString(),
    });
  }

  // 4. Audit
  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: rx.patient_id,
    provider_id: pharmacyProviderId,
    event_type: "dispense",
    resource_type: "prescription",
    metadata: { prescription_code: rx.prescription_code, fill_number: nextFills },
  });

  revalidatePath("/pharmacy/dispenses");
  revalidatePath("/patient/overview");
  revalidatePath("/patient/expenses");

  return { success: true };
}

export async function issueRealLabReport(input: {
  patientId: string;
  testType: string;
  amount?: number;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const labProviderId = await requireActiveProviderId(admin, user.id, "lab_tech");

  const rawToken = crypto.randomBytes(16).toString("hex");
  const tokenDigest = crypto.createHash("sha256").update(rawToken).digest();
  const reportHash = `SHA256:${crypto.createHash("sha256").update(`${input.patientId}:${input.testType}:${Date.now()}`).digest("hex").slice(0, 16)}`;

  // 1. Insert lab report
  const { data: rep, error: rError } = await admin
    .from("lab_reports")
    .insert({
      patient_id: input.patientId,
      provider_id: labProviderId,
      issued_by: user.id,
      test_type: input.testType,
      report_hash: reportHash,
      token_digest: tokenDigest,
      tested_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (rError || !rep) throw new Error(`Could not issue lab report: ${rError?.message}`);

  // 2. Insert cost item if amount > 0
  if (input.amount && input.amount > 0) {
    await admin.from("cost_items").insert({
      patient_id: input.patientId,
      title: `Lab diagnostic · ${input.testType}`,
      category: "Test",
      amount: input.amount,
      provenance: "verified",
      payment_status: "paid",
      linked_type: "lab_report",
      linked_id: rep.id,
      incurred_at: new Date().toISOString(),
    });
  }

  // 3. Audit
  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: input.patientId,
    provider_id: labProviderId,
    event_type: "write",
    resource_type: "lab_report",
    metadata: { test_type: input.testType, report_hash: reportHash },
  });

  revalidatePath("/lab/reports");
  revalidatePath("/patient/reports");
  revalidatePath("/patient/overview");

  return {
    id: rep.id,
    token: rawToken,
    hash: reportHash,
  };
}
