"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type MedicineResult = { medicine: string; strength: string; dose: string; frequency: string; duration: string; quantity: number };
export type PrescriptionResolution = {
  status: string;
  prescription_code?: string;
  prescribed_at?: string;
  expires_at?: string;
  doctor_name?: string | null;
  provider_name?: string | null;
  patient_first_name?: string;
  patient_age_range?: string | null;
  fills_remaining?: number;
  medicines?: MedicineResult[];
};
export type ResolveActionState = { error: string | null; result: PrescriptionResolution | null };

export async function resolvePrescriptionAction(_previous: ResolveActionState, formData: FormData): Promise<ResolveActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (token.length < 10 || token.length > 200 || /\s/.test(token)) {
    return { error: "Enter the valid one-time prescription token or short code.", result: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_prescription", { p_token: token });
  if (error) return { error: "This token could not be resolved for the signed-in pharmacy account.", result: null };
  return { error: null, result: data as PrescriptionResolution };
}
