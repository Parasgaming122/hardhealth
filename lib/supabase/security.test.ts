import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookie-options";

const migration = readFileSync(new URL("../../supabase/migrations/20261110130000_initial_hard_schema.sql", import.meta.url), "utf8");
const rateLimitMigration = readFileSync(new URL("../../supabase/migrations/20261110140000_pharmacy_resolve_rate_limit.sql", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

describe("security guardrails", () => {
  it("enables RLS and removes direct Supabase API table/sequence access", () => {
    expect((migration.match(/enable row level security/gi) ?? []).length).toBeGreaterThanOrEqual(15);
    expect(migration).toContain("revoke all on all tables in schema public from anon, authenticated");
    expect(migration).toContain("revoke all on all sequences in schema public from anon, authenticated");
  });

  it("exposes only the audited workspace, role assignment, and pharmacist token RPCs", () => {
    expect(migration).toContain("grant execute on function public.get_my_workspace() to authenticated");
    expect(migration).toContain("grant execute on function public.resolve_prescription(text) to authenticated");
    expect(migration).toContain("where r.token_digest = extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256')");
    expect(migration).toContain("'patient_first_name', split_part(v_patient.full_name, ' ', 1)");
    expect(migration).not.toContain("'patient_health_id'");
  });

  it("rate-limits pharmacy token checks in the database and does not log token strings", () => {
    expect(rateLimitMigration).toContain("add constraint audit_events_event_type_check");
    expect(rateLimitMigration).toContain("pg_advisory_xact_lock");
    expect(rateLimitMigration).toContain("v_recent_attempts >= 20");
    expect(rateLimitMigration).toContain("now() - interval '1 minute'");
    expect(rateLimitMigration).toContain("'pharmacy_resolve_rate_limited'");
    expect(rateLimitMigration).toContain("p_token ~ '[[:space:]]'");
    expect(rateLimitMigration).not.toMatch(/metadata\s*[,)]\s*p_token/i);
  });

  it("defaults auth cookies to secure cross-site HTTPS and isolates localhost opt-out", () => {
    const previousMode = process.env.AUTH_COOKIE_MODE;
    delete process.env.AUTH_COOKIE_MODE;
    expect(authCookieOptions()).toMatchObject({ sameSite: "none", secure: true, httpOnly: true });
    process.env.AUTH_COOKIE_MODE = "local-http";
    expect(authCookieOptions()).toMatchObject({ sameSite: "lax", secure: false, httpOnly: true });
    if (previousMode === undefined) delete process.env.AUTH_COOKIE_MODE;
    else process.env.AUTH_COOKIE_MODE = previousMode;
  });

  it("keeps Preview iframe compatibility while setting safe response headers", () => {
    expect(nextConfig).toContain("X-Content-Type-Options");
    expect(nextConfig).toContain("Referrer-Policy");
    expect(nextConfig).not.toContain("X-Frame-Options");
    expect(nextConfig).not.toContain("frame-ancestors");
  });
});
