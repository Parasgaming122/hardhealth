"use server";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

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

  // Find next Health ID
  const { count } = await admin.from("patients").select("*", { count: "exact", head: true });
  const serial = (count ?? 0) + 101;
  const healthId = `HARD-${String(serial).padStart(6, "0")}`;
  const receiptNo = `HARD-R-${String(serial).padStart(5, "0")}`;

  // 1. Insert patient
  const { data: newPatient, error: pError } = await admin
    .from("patients")
    .insert({
      health_id: healthId,
      full_name: input.fullName.trim(),
      date_of_birth: input.dob ? input.dob : null,
      gender: input.gender || null,
      blood_group: input.bloodGroup || "O+",
      created_by: user.id,
    })
    .select()
    .single();

  if (pError || !newPatient) throw new Error(`Could not register patient: ${pError?.message}`);

  // 2. Insert registration invoice (PKR 500)
  const regFee = 500;
  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      patient_id: newPatient.id,
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

  // 3. Post revenue split to ledger (30% provider PKR 150, 70% platform PKR 350)
  if (invoice) {
    const providerShare = Math.round(regFee * 0.3);
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
        amount: providerShare,
        payout_status: "pending",
      },
    ]);
  }

  // 4. Audit log
  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: newPatient.id,
    event_type: "write",
    resource_type: "patient_registration",
    metadata: { health_id: healthId, receipt_no: receiptNo, fee: regFee },
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

  // Generate prescription code and token
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
      doctor_user_id: user.id,
      prescription_code: prescriptionCode,
      token_digest: tokenDigest,
      consultation_cost: input.consultationCost || 0,
      note: input.note || null,
      status: "active",
      max_fills: 1,
      fills_used: 0,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
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
    event_type: "write",
    resource_type: "prescription",
    metadata: { prescription_code: prescriptionCode, items_count: input.items.length },
  });

  revalidatePath("/doctor/prescriptions");
  revalidatePath("/patient/prescriptions");
  revalidatePath("/patient/overview");

  return {
    id: rx.id,
    code: prescriptionCode,
    token: rawToken,
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

  const rawToken = crypto.randomBytes(16).toString("hex");
  const tokenDigest = crypto.createHash("sha256").update(rawToken).digest();
  const reportHash = `SHA256:${crypto.createHash("sha256").update(`${input.patientId}:${input.testType}:${Date.now()}`).digest("hex").slice(0, 16)}`;

  // 1. Insert lab report
  const { data: rep, error: rError } = await admin
    .from("lab_reports")
    .insert({
      patient_id: input.patientId,
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
