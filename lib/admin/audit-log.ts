import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * The platform-admin audit page (owner feedback 2026-11-21: /admin/audit
 * rendered the offline demo's fake event list). REAL audit_events rows,
 * metadata only — actor display name, event type, resource, patient Health ID
 * reference and time. No clinical content (prescription text, notes, hashes of
 * reports, etc.) is exposed: the brief keeps platform administration
 * non-clinical. Degrades to [] so the workspace never 500s (D10).
 */
export interface AuditEventRow {
  id: string;
  date: string;
  actorName: string;
  eventType: string;
  resourceType: string;
  patientRef: string | null;
  providerRef: string | null;
}

export async function listRecentAuditEvents(limit = 100): Promise<AuditEventRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("audit_events")
    .select("id, event_type, resource_type, created_at, actor_user_id, provider_id, patients(health_id), provider_organizations(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin] audit log unavailable:", error.message);
    return [];
  }

  type EventRow = {
    id: unknown;
    event_type: unknown;
    resource_type: unknown;
    created_at: unknown;
    actor_user_id: unknown;
    provider_id: unknown;
    patients: { health_id: unknown } | null;
    provider_organizations: { name: unknown } | null;
  };
  const rows = (data ?? []) as unknown as EventRow[];

  // Resolve actor display names in one query (audit_events has no FK to
  // profiles, so the embed is impossible; a second .in() query is the
  // PostgREST-friendly way).
  const actorIds = [...new Set(rows.map((r) => (typeof r.actor_user_id === "string" ? r.actor_user_id : "")).filter(Boolean))];
  const nameByActor = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", actorIds);
    ((profileRows ?? []) as unknown as Array<{ user_id: unknown; display_name: unknown }>).forEach((p) => {
      if (typeof p.user_id === "string") {
        nameByActor.set(p.user_id, typeof p.display_name === "string" ? p.display_name : "");
      }
    });
  }

  return rows
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      date: typeof r.created_at === "string" ? r.created_at : "",
      actorName:
        (typeof r.actor_user_id === "string" ? nameByActor.get(r.actor_user_id) : undefined) ||
        (r.actor_user_id ? "System account" : "System"),
      eventType: typeof r.event_type === "string" ? r.event_type : "",
      resourceType: typeof r.resource_type === "string" ? r.resource_type : "",
      patientRef: typeof r.patients?.health_id === "string" ? r.patients.health_id : null,
      providerRef: typeof r.provider_organizations?.name === "string" ? r.provider_organizations.name : null,
    }))
    .filter((r) => r.id);
}
