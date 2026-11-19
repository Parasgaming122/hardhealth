"use server";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ensurePatientRecord } from "@/lib/patient/real-patient";

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
    metadata: { title: input.title, fileName: input.fileName, provenance: "ai-confirmed" },
  });

  revalidatePath("/patient/overview");
  revalidatePath("/patient/reports");
  revalidatePath("/patient/timeline");
  return { success: true };
}
