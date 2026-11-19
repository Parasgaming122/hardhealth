import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { RealPatientSummary } from "@/lib/provider/types";

export type { RealPatientSummary } from "@/lib/provider/types";

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
