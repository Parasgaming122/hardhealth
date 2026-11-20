import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** A row of `public.patients` in the shape the app maps to RealPatientRecord. */
export interface PatientRow {
  id: string;
  user_id: string | null;
  health_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
}

/** Columns `insertPatientWithUniqueHealthId` accepts besides the generated ones. */
export interface PatientInsertInput {
  user_id?: string | null;
  full_name: string;
  cnic?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  created_by?: string | null;
}

export type PatientInsertOutcome =
  | { ok: true; row: PatientRow }
  | { ok: false; error: { code: string; message: string } };

/**
 * D16/D20 (brief 5.2): Health IDs are generated from max(health_id), never
 * count(*). A count-based serial breaks as soon as any patient row is deleted
 * (the count then maps onto an existing health_id and EVERY subsequent signup
 * violates patients_health_id_key — reproduced live in Session 6 and again in
 * Session 11 on the owner's admin account). max(health_id) is monotonic
 * regardless of deletions, provided health_id stays zero-padded 6-digit
 * (`HARD-XXXXXX`) so lexicographic max equals numeric max.
 *
 * D20 hardening over the original D16 fix: every retry re-reads max(health_id)
 * FRESH (the request that won our serial has committed by the time our insert
 * failed, so the next max read is strictly higher — the old `serial += 1`
 * without a re-read could walk into a contiguous run of taken serials), and a
 * unique violation on a column OTHER than health_id (CNIC, user_id) is returned
 * immediately so the caller can handle it (friendly CNIC message / same-user
 * re-select) instead of burning retries that cannot succeed.
 */
const HEALTH_ID_MIN_SERIAL = 100;
const MAX_ATTEMPTS = 5;

export async function insertPatientWithUniqueHealthId(
  admin: SupabaseAdminClient,
  input: PatientInsertInput
): Promise<PatientInsertOutcome> {
  let lastError: { code: string; message: string } = { code: "", message: "insert failed" };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Fresh max read on EVERY attempt (not just the first).
    const { data: lastByHealthId } = await admin
      .from("patients")
      .select("health_id")
      .order("health_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSerial = Number.parseInt((lastByHealthId?.health_id ?? "").replace(/\D/g, ""), 10);
    const serial = (Number.isFinite(lastSerial) && lastSerial >= HEALTH_ID_MIN_SERIAL ? lastSerial : HEALTH_ID_MIN_SERIAL) + 1;

    const { data, error } = await admin
      .from("patients")
      .insert({
        ...input,
        health_id: `HARD-${String(serial).padStart(6, "0")}`,
      })
      .select()
      .single();

    if (!error && data) {
      return { ok: true, row: data as unknown as PatientRow };
    }
    lastError = { code: error?.code ?? "", message: error?.message ?? "insert failed" };

    // Only a health_id race is worth retrying (another signup took this serial
    // between our max-read and the insert — re-read max and try again). Any
    // other failure (CNIC/user_id unique violation, not-null, network) is
    // deterministic on retry and belongs to the caller.
    if (error?.code !== "23505" || !/health_id/i.test(error.message ?? "")) {
      return { ok: false, error: lastError };
    }
  }

  return { ok: false, error: lastError };
}
