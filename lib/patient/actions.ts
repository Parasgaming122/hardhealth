"use server";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ensurePatientRecord, getPatientStorage, SIMULATED_DOCUMENT_MB } from "@/lib/patient/real-patient";
import { readPlatformConfig } from "@/lib/admin/config";

export async function addPatientSelfExpense(input: {
  title: string;
  amount: number;
  category: "Consultation" | "Test" | "Medicine" | "Procedure" | "Admission" | "Other";
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const patient = await ensurePatientRecord(user.id);

  const { error } = await admin.from("cost_items").insert({
    patient_id: patient.id,
    title: input.title.trim(),
    amount: input.amount,
    category: input.category,
    provenance: "self-reported",
    payment_status: "paid",
    incurred_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: patient.id,
    event_type: "write",
    resource_type: "cost_item",
    metadata: { title: input.title, amount: input.amount, provenance: "self-reported" },
  });

  revalidatePath("/patient/overview");
  revalidatePath("/patient/expenses");
  revalidatePath("/patient/timeline");
  return { success: true };
}

export async function savePatientIngestion(input: {
  title: string;
  amount: number;
  date: string;
  fileName: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const patient = await ensurePatientRecord(user.id);

  // P2-7 (brief 5.8 / Rule 5 / acceptance): at 100% storage, new uploads are
  // blocked while reading stays allowed. The quota comes from the config
  // table (brief Rule 1); each ingested document is accounted at its
  // simulated size so the meter and the block behave like the real flow.
  const config = await readPlatformConfig();
  const alertPercent = Math.min(100, Math.max(1, Math.round(config.storage_alert_percent)));
  const storage = await getPatientStorage(patient.id);
  const projectedMb = storage.usedMb + SIMULATED_DOCUMENT_MB;
  if (projectedMb > storage.quotaMb) {
    throw new Error(
      `Upload blocked: your record storage is full (${storage.usedMb} of ${storage.quotaMb} MB, 100% of the Base plan). Reading your existing records is always available — upgrade your plan at the front desk to add more documents.`
    );
  }
  const willCrossAlert = Math.round((projectedMb / storage.quotaMb) * 100) >= alertPercent;

  const { error } = await admin.from("cost_items").insert({
    patient_id: patient.id,
    title: input.title.trim(),
    amount: input.amount,
    category: "Test",
    provenance: "ai-confirmed",
    payment_status: "paid",
    incurred_at: new Date(input.date).toISOString(),
  });

  if (error) throw new Error(error.message);

  await admin.from("audit_events").insert({
    actor_user_id: user.id,
    patient_id: patient.id,
    event_type: "write",
    resource_type: "ai_document_ingestion",
    metadata: {
      title: input.title,
      fileName: input.fileName,
      provenance: "ai-confirmed",
      size_mb: SIMULATED_DOCUMENT_MB,
    },
  });

  revalidatePath("/patient/overview");
  revalidatePath("/patient/reports");
  revalidatePath("/patient/timeline");
  return {
    success: true,
    storageUsedMb: projectedMb,
    storageQuotaMb: storage.quotaMb,
    storagePct: Math.min(100, Math.round((projectedMb / storage.quotaMb) * 100)),
    warning: willCrossAlert
      ? `Storage is now at ${Math.round((projectedMb / storage.quotaMb) * 100)}% of your Base plan — you will not be able to add more documents once it reaches 100%.`
      : "",
  };
}
