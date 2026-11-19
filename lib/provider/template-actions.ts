"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PrescriptionItemDraft } from "@/lib/provider/types";

// Migration hint for databases that predate the templates table (D15 convention:
// name the migration so the owner knows exactly what to apply — or let the auto
// DB setup apply it once DATABASE_URL is configured).
const TEMPLATES_MIGRATION = "20261119200000_doctor_prescription_templates.sql";

function isMissingRpcError(message: string) {
  return /does not exist|could not find the function/i.test(message);
}

function revalidateDoctorPaths() {
  revalidatePath("/doctor/prescriptions/new");
  revalidatePath("/doctor/overview");
}

function normalizeItems(items: PrescriptionItemDraft[]): PrescriptionItemDraft[] {
  return items
    .filter((it) => typeof it?.medicine === "string" && it.medicine.trim().length > 0)
    .slice(0, 25)
    .map((it) => ({
      medicine: it.medicine.trim().slice(0, 200),
      strength: (it.strength ?? "").slice(0, 120),
      dose: (it.dose ?? "").slice(0, 120),
      frequency: (it.frequency ?? "").slice(0, 120),
      duration: (it.duration ?? "").slice(0, 120),
      quantity: Math.min(1000, Math.max(1, Math.round(Number(it.quantity) || 1))),
    }));
}

export async function saveDoctorTemplateAction(input: {
  templateId?: string;
  name: string;
  items: PrescriptionItemDraft[];
}): Promise<{ id: string; name: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Template name must be 1-80 characters.");
  }
  const items = normalizeItems(input.items);
  if (items.length === 0) {
    throw new Error("Add at least one medicine before saving a template.");
  }

  const { data, error } = await supabase.rpc("doctor_save_template", {
    p_template_id: input.templateId ?? null,
    p_name: name,
    p_items: items,
  });

  if (error || !data) {
    // Renaming onto another of this doctor's template names.
    if (error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message ?? "")) {
      throw new Error(`You already have a template named "${name}" with different medicines. Pick another name.`);
    }
    if (isMissingRpcError(error?.message ?? "")) {
      throw new Error(
        `Prescription templates are not set up on this database yet — apply migration ${TEMPLATES_MIGRATION} in the Supabase SQL editor (or connect DATABASE_URL and let the automatic database setup run).`
      );
    }
    throw new Error(`Could not save template: ${error?.message ?? "unknown error"}`);
  }

  revalidateDoctorPaths();
  return { id: data as string, name };
}

export async function deleteDoctorTemplateAction(templateId: string): Promise<{ name: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase.rpc("doctor_delete_template", {
    p_template_id: templateId,
  });

  if (error || data == null) {
    if (isMissingRpcError(error?.message ?? "")) {
      throw new Error(
        `Prescription templates are not set up on this database yet — apply migration ${TEMPLATES_MIGRATION} in the Supabase SQL editor (or connect DATABASE_URL and let the automatic database setup run).`
      );
    }
    throw new Error(`Could not delete template: ${error?.message ?? "unknown error"}`);
  }

  revalidateDoctorPaths();
  return { name: data as string };
}
