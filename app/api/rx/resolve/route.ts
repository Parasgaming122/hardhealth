import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Public prescription resolver (brief Section 6: "GET /rx/resolve?token=…").
 * Scope: ONE prescription by token/code, nothing else — no patient search, no
 * history.
 *
 * Rule 6: "Expired, cancelled or fully dispensed prescriptions return a clear
 * status and no medicine details beyond status." This gate is what makes the
 * amendment flow (brief Section 6 / acceptance criteria) meaningful: once a
 * prescription is superseded, its QR/code resolves to a bare "cancelled"
 * status with no medicines and no patient identifier.
 *
 * Brief Section 6/16: "Every resolve ... is logged and visible to the patient"
 * and "Rate-limit prescription resolve ... attempts". Lookups are rate-limited
 * per IP (in-memory; single-instance prototype) and every resolution writes a
 * pharmacy_resolve audit event so it appears in the patient's access log.
 */

const WINDOW_MS = 60_000;
const MAX_LOOKUPS_PER_WINDOW = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_LOOKUPS_PER_WINDOW;
}

// Periodic sweep so the map cannot grow without bound across a long session.
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(ip);
    }
  }, WINDOW_MS);
  // Do not hold the event loop open in serverless/edge builds.
  (timer as unknown as { unref?: () => void }).unref?.();
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() || request.nextUrl.searchParams.get("token")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Code parameter is required." }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many lookup attempts. Wait a minute and try again." },
      { status: 429 }
    );
  }

  const admin = createSupabaseAdminClient();
  // Look up by prescription code, or by id when the caller scanned the QR
  // (the QR encodes the prescription id). The two must NOT go into one .or()
  // filter: PostgREST casts the value to uuid for id.eq and rejects any
  // RX-code with "invalid input syntax for type uuid", 404-ing every typed
  // code lookup (latent bug found while verifying the amendment flow).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
  const baseSelect = "id, prescription_code, status, expires_at, max_fills, fills_used, patient_id, patients(full_name), prescription_items(*)";
  const lookup = isUuid
    ? admin.from("prescriptions").select(baseSelect).or(`prescription_code.ilike.${code},id.eq.${code}`)
    : admin.from("prescriptions").select(baseSelect).ilike("prescription_code", code);
  const { data: rx, error } = await lookup.maybeSingle();

  if (error || !rx) {
    return NextResponse.json({ error: "Prescription not found or invalid code." }, { status: 404 });
  }

  // Audit every resolution (visible in the patient's access log). Public
  // (unauthenticated) lookups carry a null actor; the authenticated pharmacist
  // RPC path logs with the acting user. A logging failure must not block the
  // lookup itself.
  try {
    await admin.from("audit_events").insert({
      patient_id: typeof rx.patient_id === "string" ? rx.patient_id : null,
      event_type: "pharmacy_resolve",
      resource_type: "prescription",
      resource_id: typeof rx.id === "string" ? rx.id : null,
      metadata: { via: "public_api", status: rx.status ?? null },
    });
  } catch {
    // audit write failed — the resolve still returns
  }

  // Rule 6 gate — mirror the resolve_prescription RPC: anything that is not
  // active/partly_filled, or is expired, or has no fills left, gets a clear
  // status and NO medicine details and NO patient identifier.
  const notDispensable =
    (rx.status !== "active" && rx.status !== "partly_filled") ||
    new Date(rx.expires_at ?? 0).getTime() <= Date.now() ||
    (rx.fills_used ?? 0) >= (rx.max_fills ?? 1);

  if (notDispensable) {
    const status =
      rx.status === "active" || rx.status === "partly_filled"
        ? new Date(rx.expires_at ?? 0).getTime() <= Date.now()
          ? "expired"
          : "dispensed"
        : rx.status;
    return NextResponse.json({
      prescription: {
        id: rx.id,
        prescription_code: rx.prescription_code,
        status,
      },
    });
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
