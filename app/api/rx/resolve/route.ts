import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Code parameter is required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: rx, error } = await admin
    .from("prescriptions")
    .select("id, prescription_code, status, expires_at, max_fills, fills_used, patients(full_name), prescription_items(*)")
    .or(`prescription_code.ilike.${code},id.eq.${code}`)
    .maybeSingle();

  if (error || !rx) {
    return NextResponse.json({ error: "Prescription not found or invalid code." }, { status: 404 });
  }

  const patientObj = (Array.isArray(rx.patients) ? rx.patients[0] : rx.patients) as unknown as Record<string, unknown> | null;
  const patientFullName = String(patientObj?.full_name ?? "");
  const firstName = patientFullName.split(" ")[0] || "Patient";

  return NextResponse.json({
    prescription: {
      id: rx.id,
      prescription_code: rx.prescription_code,
      status: rx.status,
      expires_at: rx.expires_at,
      max_fills: rx.max_fills,
      fills_used: rx.fills_used,
      patient_name: firstName,
      prescription_items: rx.prescription_items,
    },
  });
}
