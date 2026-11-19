import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { RealPatientSummary } from "@/lib/provider/types";

export type { RealPatientSummary } from "@/lib/provider/types";

export async function listRealPatients(): Promise<RealPatientSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("patients")
    .select("id, health_id, full_name, date_of_birth, blood_group, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    healthId: p.health_id,
    fullName: p.full_name,
    dob: p.date_of_birth,
    bloodGroup: p.blood_group,
    createdAt: p.created_at,
  }));
}
