import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "./migrations-manifest";
import {
  computeMigrationStatuses,
  exampleDatabaseUrl,
  getEnvRequirements,
  isTransactionPoolerUrl,
  recordSetupRun,
  readSetupRun,
  shouldBaseline,
  supabaseProjectRef,
} from "./setup-state";
import { runAutoSetup, type PgClientLike, type PgPoolLike } from "./auto-setup";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface FakeOptions {
  appliedRows?: { version: string }[];
  schemaExists?: boolean;
  failOnSqlOf?: string; // migration version whose SQL should throw
}

function makeFakePool(opts: FakeOptions = {}) {
  const log: string[] = [];
  const insertedVersions: string[] = [];

  const client: PgClientLike = {
    async query(sql: string, values?: unknown[]) {
      log.push(sql);
      if (opts.failOnSqlOf && MIGRATIONS.some((m) => m.version === opts.failOnSqlOf && m.sql === sql)) {
        throw new Error('relation "auth.users" does not exist');
      }
      if (/^select pg_advisory_(un)?lock/.test(sql)) return { rows: [] };
      if (/create schema if not exists hard_setup/.test(sql)) return { rows: [] };
      if (/from hard_setup\.schema_migrations\s*$/.test(sql)) {
        return { rows: (opts.appliedRows ?? []).map((r) => ({ version: r.version, applied_at: "2026-01-01", note: null })) };
      }
      if (/to_regclass\('public\.patients'\)/.test(sql)) {
        return { rows: [{ exists: opts.schemaExists ?? false }] };
      }
      if (/^insert into hard_setup\.schema_migrations/.test(sql)) {
        insertedVersions.push(String(values?.[0]));
        return { rows: [] };
      }
      if (/^(begin|commit|rollback)$/i.test(sql)) return { rows: [] };
      // anything else = a migration file body (must be a known one)
      if (!MIGRATIONS.some((m) => m.sql === sql)) {
        throw new Error("unexpected query in test: " + sql.slice(0, 80));
      }
      return { rows: [] };
    },
    release() {},
  };

  const pool: PgPoolLike = {
    async connect() {
      return client;
    },
    async end() {},
  };
  return { pool, log, insertedVersions };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  return Promise.resolve()
    .then(() => {
      for (const [k, v] of Object.entries(vars)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    })
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

const LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/postgres";

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

describe("migrations manifest", () => {
  it("embeds the shipped migrations in chronological order", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([
      "20261110130000",
      "20261110140000",
      "20261111192154",
      "20261119000000",
      "20261119100000",
      "20261119200000",
    ]);
  });

  it("carries non-empty sql and unique versions/filenames", () => {
    const versions = new Set(MIGRATIONS.map((m) => m.version));
    const filenames = new Set(MIGRATIONS.map((m) => m.filename));
    expect(versions.size).toBe(MIGRATIONS.length);
    expect(filenames.size).toBe(MIGRATIONS.length);
    for (const m of MIGRATIONS) {
      expect(m.sql.trim().length).toBeGreaterThan(100);
      expect(m.filename).toBe(`${m.version}_${m.name}.sql`);
    }
  });
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe("setup-state helpers", () => {
  it("computes per-migration applied/pending status", () => {
    const statuses = computeMigrationStatuses(MIGRATIONS, [{ version: "20261110130000" }]);
    expect(statuses[0].applied).toBe(true);
    expect(statuses.slice(1).every((s) => !s.applied)).toBe(true);
  });

  it("baselines only an empty bookkeeping table on top of an existing schema", () => {
    expect(shouldBaseline(0, true)).toBe(true);
    expect(shouldBaseline(0, false)).toBe(false);
    expect(shouldBaseline(2, true)).toBe(false);
  });

  it("flags the transaction-mode pooler", () => {
    expect(isTransactionPoolerUrl("postgresql://x@host.supabase.com:6543/postgres")).toBe(true);
    expect(isTransactionPoolerUrl("postgresql://x@host.supabase.com:5432/postgres")).toBe(false);
  });

  it("derives the project ref and prefilled example URL", () => {
    return withEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co" }, async () => {
      expect(supabaseProjectRef()).toBe("abc123");
      expect(exampleDatabaseUrl()).toContain("postgres.abc123:");
      expect(exampleDatabaseUrl()).toContain(":5432/postgres");
    });
  });

  it("reports env requirements by name only, reflecting presence", () => {
    return withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
        DATABASE_URL: undefined,
      },
      async () => {
        const reqs = getEnvRequirements();
        const byKey = Object.fromEntries(reqs.map((r) => [r.key, r]));
        expect(byKey.NEXT_PUBLIC_SUPABASE_URL.present).toBe(true);
        expect(byKey.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.present).toBe(false);
        expect(byKey.DATABASE_URL.present).toBe(false);
        // never leak values
        expect(JSON.stringify(reqs)).not.toContain("https://x.supabase.co");
      }
    );
  });

  it("round-trips the globalThis run record", () => {
    recordSetupRun({
      trigger: "boot",
      startedAt: "2026-01-01T00:00:00Z",
      ok: true,
      mode: "up-to-date",
      appliedVersions: [],
    });
    expect(readSetupRun()?.mode).toBe("up-to-date");
  });
});

// ---------------------------------------------------------------------------
// runner (fake pg pool)
// ---------------------------------------------------------------------------

describe("runAutoSetup", () => {
  beforeEach(() => {
    recordSetupRun({
      trigger: "boot",
      startedAt: "2026-01-01T00:00:00Z",
      ok: true,
      mode: "up-to-date",
      appliedVersions: [],
    });
  });

  it("skips (not errors) when DATABASE_URL is absent", async () => {
    return withEnv({ DATABASE_URL: undefined, AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup();
      expect(outcome.ok).toBe(true);
      expect(outcome.mode).toBe("env-missing");
    });
  });

  it("ignores AUTO_DB_SETUP=false — the flag gates the boot hook, not the runner (manual /setup runs still work)", async () => {
    const fake = makeFakePool({ schemaExists: false });
    return withEnv({ DATABASE_URL: LOCAL_URL, AUTO_DB_SETUP: "false" }, async () => {
      const outcome = await runAutoSetup({ pool: fake.pool });
      expect(outcome.ok).toBe(true);
      expect(outcome.mode).toBe("applied");
    });
  });

  it("refuses the transaction-mode pooler with an actionable hint", async () => {
    return withEnv({ DATABASE_URL: "postgresql://x@h.supabase.com:6543/postgres", AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup();
      expect(outcome.ok).toBe(false);
      expect(outcome.mode).toBe("error");
      expect(outcome.error?.hint).toContain("Session pooler");
    });
  });

  it("refuses a non-postgres DATABASE_URL (e.g. sqlite-style file:) before pg can crash", async () => {
    return withEnv({ DATABASE_URL: "file:/home/z/db/custom.db", AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup();
      expect(outcome.ok).toBe(false);
      expect(outcome.mode).toBe("error");
      expect(outcome.error?.message).toContain("not a Postgres connection string");
      expect(outcome.error?.message).toContain("file:");
      expect(outcome.error?.message).not.toContain("/home/z/db/custom.db"); // no path leak
      expect(outcome.error?.hint).toContain("postgresql://");
    });
  });

  it("applies all migrations to a fresh database inside transactions", async () => {
    const fake = makeFakePool({ schemaExists: false });
    return withEnv({ DATABASE_URL: LOCAL_URL, AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup({ pool: fake.pool });
      expect(outcome.ok).toBe(true);
      expect(outcome.mode).toBe("applied");
      expect(outcome.appliedVersions).toEqual(MIGRATIONS.map((m) => m.version));
      // every migration ran inside begin/commit, and each landed a version-row insert
      for (let i = 0; i < MIGRATIONS.length; i++) {
        const beginAt = fake.log.indexOf("begin", i === 0 ? 0 : fake.log.indexOf("commit", 0) + 1);
        expect(beginAt).toBeGreaterThan(-1);
      }
      expect(fake.log.filter((s) => s === "begin").length).toBe(MIGRATIONS.length);
      expect(fake.log.filter((s) => s === "commit").length).toBe(MIGRATIONS.length);
      expect(fake.insertedVersions).toEqual(MIGRATIONS.map((m) => m.version));
      // advisory lock held around the whole run
      expect(fake.log.some((s) => /pg_advisory_lock/.test(s))).toBe(true);
      expect(fake.log.some((s) => /pg_advisory_unlock/.test(s))).toBe(true);
      // the run record is readable by /setup
      expect(readSetupRun()?.mode).toBe("applied");
    });
  });

  it("baselines a manually-migrated schema instead of re-running DDL", async () => {
    const fake = makeFakePool({ schemaExists: true });
    return withEnv({ DATABASE_URL: LOCAL_URL, AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup({ pool: fake.pool });
      expect(outcome.ok).toBe(true);
      expect(outcome.mode).toBe("baselined");
      expect(outcome.appliedVersions).toEqual([]);
      // no migration file body was executed
      expect(fake.log.some((s) => MIGRATIONS.some((m) => m.sql === s))).toBe(false);
      // but every version got recorded
      expect(fake.insertedVersions).toEqual(MIGRATIONS.map((m) => m.version));
    });
  });

  it("is a no-op when everything is applied", async () => {
    const fake = makeFakePool({ appliedRows: MIGRATIONS.map((m) => ({ version: m.version })), schemaExists: true });
    return withEnv({ DATABASE_URL: LOCAL_URL, AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup({ pool: fake.pool });
      expect(outcome.ok).toBe(true);
      expect(outcome.mode).toBe("up-to-date");
      expect(fake.insertedVersions).toEqual([]);
    });
  });

  it("applies only pending migrations and keeps order", async () => {
    const fake = makeFakePool({
      appliedRows: [
        { version: "20261110130000" },
        { version: "20261110140000" },
        { version: "20261111192154" },
      ],
      schemaExists: true,
    });
    return withEnv({ DATABASE_URL: LOCAL_URL, AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup({ pool: fake.pool });
      expect(outcome.appliedVersions).toEqual(["20261119000000", "20261119100000", "20261119200000"]);
    });
  });

  it("rolls back and reports the failing migration with a hint", async () => {
    const fake = makeFakePool({ schemaExists: false, failOnSqlOf: "20261110130000" });
    return withEnv({ DATABASE_URL: LOCAL_URL, AUTO_DB_SETUP: undefined }, async () => {
      const outcome = await runAutoSetup({ pool: fake.pool });
      expect(outcome.ok).toBe(false);
      expect(outcome.mode).toBe("error");
      expect(outcome.error?.version).toBe("20261110130000");
      expect(outcome.error?.message).toContain("auth.users");
      expect(outcome.error?.hint).toContain("Supabase");
      expect(fake.log).toContain("rollback");
      // failed migration did not land a version row
      expect(fake.insertedVersions).toEqual([]);
      expect(readSetupRun()?.ok).toBe(false);
    });
  });
});
