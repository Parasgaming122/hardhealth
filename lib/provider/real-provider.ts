import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { DoctorTemplateSummary, PrescriptionItemDraft, RealPatientSummary } from "@/lib/provider/types";

export type { RealPatientSummary } from "@/lib/provider/types";

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
  // Degrade gracefully before migration 20261119100000 lands (cnic column absent):
  // retry without cnic instead of 500-ing the whole front desk.
  let { data, error } = await admin
    .from("patients")
    .select("id, health_id, full_name, cnic, date_of_birth, blood_group, created_at")
    .order("created_at", { ascending: false });
  if (error && /cnic/i.test(error.message)) {
    const fallback = await admin
      .from("patients")
      .select("id, health_id, full_name, date_of_birth, blood_group, created_at")
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
