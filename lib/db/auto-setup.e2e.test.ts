// REAL end-to-end test of the auto DB setup against a throwaway local Postgres.
// Skipped unless HARD_E2E_PG is set, so the normal `pnpm test` gate is unaffected.
//
//   HARD_E2E_PG=postgresql://postgres@127.0.0.1:54329/postgres npx vitest run lib/db/auto-setup.e2e.test.ts
//
// The local cluster needs the pgcrypto STUB extension (see scripts/e2e notes in
// docs/ARCHITECTURE.md) because the zonky embedded postgres ships without contrib.
// Scenarios:
//   1. non-Supabase database (no auth schema) -> setup fails with the Supabase hint
//   2. fresh Supabase-like database -> all migrations applied, objects exist, idempotent
//   3. partially-migrated database (3 of 5 recorded) -> only the 2 pending applied
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { MIGRATIONS } from "./migrations-manifest";
import { runAutoSetup, checkDatabaseStatus } from "./auto-setup";
import { readSetupRun } from "./setup-state";

const MAINTENANCE_URL = process.env.HARD_E2E_PG;
const d = describe.skipIf(!MAINTENANCE_URL);

const DBS = {
  noSupa: "hard_e2e_nosupa",
  fresh: "hard_e2e_fresh",
  partial: "hard_e2e_partial",
  baseline: "hard_e2e_baseline",
};

function urlFor(db: string) {
  return MAINTENANCE_URL!.replace(/\/[^/?]*$/, `/${db}`);
}

async function exec(url: string, sql: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

/** Supabase-like prerequisites: auth schema + auth.users + auth.uid(). */
const SUPA_STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid
  language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

/** Cluster-wide Supabase roles referenced by the migrations' REVOKE/GRANTs. */
const SUPA_ROLES = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls; end if;
  end $$;
`;

function withDbUrl<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  return fn().finally(() => {
    process.env.DATABASE_URL = saved;
  });
}

beforeAll(async () => {
  await exec(MAINTENANCE_URL!, SUPA_ROLES);
  for (const db of Object.values(DBS)) {
    await exec(MAINTENANCE_URL!, `drop database if exists ${db} with (force);`).catch(() => {});
    await exec(MAINTENANCE_URL!, `create database ${db};`);
  }
  await exec(urlFor(DBS.fresh), SUPA_STUBS);
  // baseline db: schema fully applied manually (no bookkeeping) — exactly the
  // state of the live owner database today
  const c = new pg.Client({ connectionString: urlFor(DBS.baseline) });
  await c.connect();
  try {
    await c.query(SUPA_STUBS);
    for (const m of MIGRATIONS) await c.query(m.sql);
  } finally {
    await c.end();
  }
});

afterAll(async () => {
  for (const db of Object.values(DBS)) {
    await exec(MAINTENANCE_URL!, `drop database if exists ${db} with (force);`).catch(() => {});
  }
});

d("auto DB setup — real postgres e2e", () => {
  it("rejects a plain non-Supabase database with the pointed hint", async () => {
    const outcome = await withDbUrl(urlFor(DBS.noSupa), () => runAutoSetup());
    expect(outcome.ok).toBe(false);
    expect(outcome.mode).toBe("error");
    expect(outcome.error?.version).toBe(MIGRATIONS[0].version);
    expect(outcome.error?.hint).toContain("Supabase");
    // nothing recorded, schema untouched
    const status = await withDbUrl(urlFor(DBS.noSupa), () => checkDatabaseStatus());
    expect(status.canConnect).toBe(true);
    expect(status.schemaExists).toBe(false);
  });

  it("builds a fresh Supabase-like database from scratch (the WordPress moment)", async () => {
    const outcome = await withDbUrl(urlFor(DBS.fresh), () => runAutoSetup({ trigger: "boot" }));
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe("applied");
    expect(outcome.appliedVersions).toEqual(MIGRATIONS.map((m) => m.version));

    // the app schema actually exists now
    const probes = await exec(
      urlFor(DBS.fresh),
      `select
         to_regclass('public.patients') is not null as patients,
         to_regclass('public.provider_organizations') is not null as orgs,
         to_regclass('public.audit_events') is not null as audits,
         to_regclass('hard_setup.schema_migrations') is not null as bookkeeping,
         to_regprocedure('public.admin_set_provider_status(uuid, text, text)') is not null as rpc,
         to_regprocedure('public.resolve_prescription(text)') is not null as resolve_rpc,
         (select count(*)::int from hard_setup.schema_migrations) as versions,
         (select count(*)::int from information_schema.tables where table_schema = 'public') as public_tables
       `
    );
    const row = probes.rows[0];
    expect(row.patients).toBe(true);
    expect(row.orgs).toBe(true);
    expect(row.audits).toBe(true);
    expect(row.bookkeeping).toBe(true);
    expect(row.rpc).toBe(true);
    expect(row.resolve_rpc).toBe(true);
    expect(Number(row.versions)).toBe(MIGRATIONS.length);
    expect(Number(row.public_tables)).toBeGreaterThanOrEqual(12);

    // RLS actually enabled on the sensitive table
    const rls = await exec(
      urlFor(DBS.fresh),
      `select relname, relrowsecurity from pg_class join pg_namespace n on n.oid = relnamespace
       where n.nspname = 'public' and relname = 'patients'`
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);

    // second boot: nothing to do
    const second = await withDbUrl(urlFor(DBS.fresh), () => runAutoSetup({ trigger: "boot" }));
    expect(second.ok).toBe(true);
    expect(second.mode).toBe("up-to-date");
    expect(second.appliedVersions).toEqual([]);

    // status report agrees
    const status = await withDbUrl(urlFor(DBS.fresh), () => checkDatabaseStatus());
    expect(status.canConnect).toBe(true);
    expect(status.schemaExists).toBe(true);
    expect(status.pendingCount).toBe(0);
    expect(status.migrations.every((m) => m.applied)).toBe(true);
    expect(readSetupRun()?.mode).toBe("up-to-date");
  });

  it("baselines a fully hand-migrated database instead of re-running DDL", async () => {
    // this is the live owner database situation: every migration was applied
    // manually in the SQL editor, bookkeeping table does not exist yet
    const before = await withDbUrl(urlFor(DBS.baseline), () => checkDatabaseStatus());
    expect(before.canConnect).toBe(true);
    expect(before.schemaExists).toBe(true);
    expect(before.appliedCount).toBe(0); // no bookkeeping yet

    const outcome = await withDbUrl(urlFor(DBS.baseline), () => runAutoSetup({ trigger: "boot" }));
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe("baselined");
    expect(outcome.appliedVersions).toEqual([]);

    const after = await withDbUrl(urlFor(DBS.baseline), () => checkDatabaseStatus());
    expect(after.appliedCount).toBe(MIGRATIONS.length);
    expect(after.pendingCount).toBe(0);
    // spot-check the schema was not clobbered
    const probe = await exec(
      urlFor(DBS.baseline),
      `select to_regclass('public.patients') is not null as patients,
              (select count(*)::int from hard_setup.schema_migrations where note like 'baselined%') as baselined_rows`
    );
    expect(probe.rows[0].patients).toBe(true);
    expect(Number(probe.rows[0].baselined_rows)).toBe(MIGRATIONS.length);
  });

  it("applies only the pending migrations on a partially-migrated database", async () => {
    // simulate an owner who applied the first 3 files manually (and recorded
    // them), then hands the project to the auto-setup
    const client = new pg.Client({ connectionString: urlFor(DBS.partial) });
    await client.connect();
    try {
      await client.query(SUPA_STUBS);
      // bookkeeping table as a previous setup run would have left it
      await client.query(`
        create schema if not exists hard_setup;
        create table if not exists hard_setup.schema_migrations (
          version text primary key,
          name text not null,
          applied_at timestamptz not null default now(),
          duration_ms integer,
          note text
        );
      `);
      for (let i = 0; i < 3; i++) {
        await client.query("begin");
        await client.query(MIGRATIONS[i].sql);
        await client.query(
          `insert into hard_setup.schema_migrations (version, name) values ($1, $2)`,
          [MIGRATIONS[i].version, MIGRATIONS[i].name]
        );
        await client.query("commit");
      }
    } finally {
      await client.end();
    }

    const before = await withDbUrl(urlFor(DBS.partial), () => checkDatabaseStatus());
    expect(before.appliedCount).toBe(3);
    expect(before.pendingCount).toBe(2);

    const outcome = await withDbUrl(urlFor(DBS.partial), () => runAutoSetup({ trigger: "boot" }));
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe("applied");
    expect(outcome.appliedVersions).toEqual(
      MIGRATIONS.slice(3).map((m) => m.version)
    );

    const after = await withDbUrl(urlFor(DBS.partial), () => checkDatabaseStatus());
    expect(after.pendingCount).toBe(0);
    // the CNIC unique index from the last migration actually landed
    const idx = await exec(
      urlFor(DBS.partial),
      `select count(*)::int as n from pg_indexes
       where schemaname = 'public' and indexname = 'patients_cnic_unique_idx'`
    );
    expect(Number(idx.rows[0].n)).toBe(1);
  });
});
