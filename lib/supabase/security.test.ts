import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookie-options";

const migration = readFileSync(new URL("../../supabase/migrations/20261110130000_initial_hard_schema.sql", import.meta.url), "utf8");
const rateLimitMigration = readFileSync(new URL("../../supabase/migrations/20261110140000_pharmacy_resolve_rate_limit.sql", import.meta.url), "utf8");
const cnicAtomicMigration = readFileSync(new URL("../../supabase/migrations/20261119100000_cnic_unique_atomic_status.sql", import.meta.url), "utf8");
const templatesMigration = readFileSync(new URL("../../supabase/migrations/20261119200000_doctor_prescription_templates.sql", import.meta.url), "utf8");
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

  it("enforces CNIC uniqueness in the database while allowing NULL for self-signups", () => {
    expect(cnicAtomicMigration).toContain("alter table public.patients add column if not exists cnic text");
    expect(cnicAtomicMigration).toContain("patients_cnic_format_check");
    expect(cnicAtomicMigration).toContain("check (cnic is null or cnic ~ '^[0-9]{13}$')");
    expect(cnicAtomicMigration).toContain("create unique index if not exists patients_cnic_unique_idx");
    // Partial index: patients without a desk identity check (NULL cnic) never collide.
    expect(cnicAtomicMigration).toContain("where cnic is not null");
  });

  it("makes provider status changes atomic and exposes only the audited RPC wrapper", () => {
    expect(cnicAtomicMigration).toContain("hard_private.admin_set_provider_status");
    expect(cnicAtomicMigration).toContain("security definer");
    expect(cnicAtomicMigration).toContain("hard_private.assert_platform_admin()");
    // Update + audit insert happen in one function (one transaction).
    expect(cnicAtomicMigration).toContain("'provider_status_change'");
    // Hard-private implementation revoked from everyone; only the public wrapper is granted.
    expect(cnicAtomicMigration).toContain(
      "revoke all on function hard_private.admin_set_provider_status(uuid, text, text) from public, anon, authenticated, service_role"
    );
    expect(cnicAtomicMigration).toContain(
      "grant execute on function public.admin_set_provider_status(uuid, text, text) to authenticated"
    );
    expect(cnicAtomicMigration).not.toMatch(
      /grant execute on function public\.admin_set_provider_status[^;]*to (public|anon)/i
    );
  });

  it("gives doctors DB-owned prescription templates behind role-gated, self-scoped RPCs", () => {
    expect(templatesMigration).toContain("create table if not exists public.prescription_templates");
    expect(templatesMigration).toContain("alter table public.prescription_templates enable row level security");
    // No direct API access — RLS has no policies AND table grants are revoked.
    expect(templatesMigration).toContain("revoke all on public.prescription_templates from anon, authenticated");
    expect(templatesMigration).not.toMatch(/create policy[^;]*on public\.prescription_templates/i);
    // Every RPC asserts an active doctor role and scopes to the caller's own rows.
    expect(templatesMigration).toContain("hard_private.assert_doctor()");
    expect((templatesMigration.match(/doctor_user_id = v_actor/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Hard-private implementations revoked from everyone; public wrappers granted to authenticated only.
    expect(templatesMigration).toContain(
      "revoke all on function hard_private.doctor_save_template(text, jsonb, uuid) from public, anon, authenticated, service_role"
    );
    expect(templatesMigration).toContain(
      "grant execute on function public.doctor_save_template(text, jsonb, uuid) to authenticated"
    );
    expect(templatesMigration).not.toMatch(/grant execute on function public\.doctor_[a-z_]+\([^)]*\) to (public|anon)/i);
    // Templates are doctor-unique by name and saving the same name overwrites (the <30s repeat flow).
    expect(templatesMigration).toContain("unique (doctor_user_id, name)");
    expect(templatesMigration).toContain("on conflict (doctor_user_id, name) do update");
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
