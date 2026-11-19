// WordPress-style automatic database setup (node-only: imports pg).
// Applied by instrumentation.ts on every server boot (unless AUTO_DB_SETUP=false
// or DATABASE_URL is absent) and by the /setup page's manual action.
//
// Behavior:
//  1. connect with DATABASE_URL (Supabase session pooler / direct connection)
//  2. take a session advisory lock so concurrent cold starts serialize
//  3. ensure the hard_setup.schema_migrations bookkeeping table
//  4. BASELINE: if the bookkeeping table is empty but public.patients exists,
//     the schema was applied manually before — record every manifest entry as
//     applied instead of re-running DDL that would fail with "already exists"
//  5. apply every pending migration in filename order, each inside one
//     transaction (BEGIN; <file sql>; INSERT version row; COMMIT)
//  6. record the run on globalThis (read by /setup + the layout banner)
//
// The runner NEVER throws to its caller: every failure is returned as a
// structured report, because an unconfigured database must degrade to a
// friendly /setup page, not a crashed server.
import pg from "pg";
import { MIGRATIONS, type MigrationFile } from "@/lib/db/migrations-manifest";
import {
  computeMigrationStatuses,
  databaseUrlScheme,
  isTransactionPoolerUrl,
  isValidDatabaseUrl,
  recordSetupRun,
  shouldBaseline,
  type MigrationStatus,
  type SetupRunMode,
  type SetupRunRecord,
} from "@/lib/db/setup-state";

// Fixed advisory-lock key for "hard auto setup". Any constant bigint works;
// it just must be stable across releases and unique to this app.
const ADVISORY_LOCK_KEY = 780423901284;

export interface SetupRunOutcome {
  ok: boolean;
  mode: SetupRunMode;
  appliedVersions: string[];
  error?: { version?: string; message: string; hint?: string };
  /** wall-clock ms of the run (excl. lock wait) */
  durationMs: number;
}

export interface DatabaseStatusReport {
  canConnect: boolean;
  connectionError?: string;
  schemaExists?: boolean;
  authUsersCount?: number;
  migrations: MigrationStatus[];
  appliedCount: number;
  pendingCount: number;
  /** null when DATABASE_URL is absent (auto-setup simply not possible) */
  databaseUrlPresent: boolean;
  rawError?: string;
}

// ---------------------------------------------------------------------------
// pg plumbing
// ---------------------------------------------------------------------------

interface PgClientLike {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface PgPoolLike {
  connect(): Promise<PgClientLike>;
  end(): Promise<void>;
}
export type { PgClientLike };

export function createSetupPool(connectionString: string): PgPoolLike {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
  const hasSslMode = /sslmode=/i.test(connectionString);
  return new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 2000,
    ssl: isLocal || hasSslMode ? undefined : { rejectUnauthorized: false },
  }) as unknown as PgPoolLike;
}

function translateError(message: string): { message: string; hint?: string } {
  if (/(relation "auth\.users"|schema "auth") does not exist/i.test(message)) {
    return {
      message,
      hint: "The database is missing Supabase's auth schema. DATABASE_URL must point at a Supabase project database (Dashboard → Connect → Connection string).",
    };
  }
  if (/password authentication failed/i.test(message)) {
    return {
      message,
      hint: "Check the database password in DATABASE_URL (Supabase Dashboard → Project Settings → Database → Reset database password).",
    };
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
    return {
      message,
      hint: "Could not reach the database host. Copy the connection string again from Supabase Dashboard → Connect (Session pooler works from Vercel).",
    };
  }
  if (/already exists/i.test(message)) {
    return {
      message,
      hint: "An object in the migration already exists. If you applied migrations manually before, click 'Re-check' on /setup so the baseline can record them, then retry.",
    };
  }
  return { message };
}

async function withAdvisoryLock<T>(
  pool: PgPoolLike,
  fn: (client: PgClientLike) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`);
    return await fn(client);
  } finally {
    try {
      await client.query(`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    } catch {
      // connection already broken; the lock dies with the session anyway
    }
    client.release();
  }
}

async function schemaExists(client: PgClientLike): Promise<boolean> {
  const res = await client.query("select to_regclass('public.patients') is not null as exists");
  return res.rows[0]?.exists === true;
}

async function appliedRows(client: PgClientLike) {
  const res = await client.query(
    "select version, applied_at, note from hard_setup.schema_migrations"
  );
  return res.rows as { version: string; applied_at?: string | null; note?: string | null }[];
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export async function runAutoSetup(options?: {
  trigger?: "boot" | "manual";
  pool?: PgPoolLike;
}): Promise<SetupRunOutcome> {
  const trigger = options?.trigger ?? "boot";
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const finish = (outcome: SetupRunOutcome): SetupRunOutcome => {
    const record: SetupRunRecord = {
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: outcome.ok,
      mode: outcome.mode,
      appliedVersions: outcome.appliedVersions,
      error: outcome.error,
    };
    recordSetupRun(record);
    return outcome;
  };

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Not an error: the app still runs; /setup explains what is missing.
    return finish({ ok: true, mode: "env-missing", appliedVersions: [], durationMs: 0 });
  }

  if (isTransactionPoolerUrl(databaseUrl)) {
    return finish({
      ok: false,
      mode: "error",
      appliedVersions: [],
      durationMs: 0,
      error: {
        message: "DATABASE_URL uses the transaction-mode pooler (port 6543).",
        hint: "Transaction pooling cannot run the multi-statement migration files. Use the Session pooler string (port 5432) or the direct connection from Supabase Dashboard → Connect.",
      },
    });
  }

  if (!isValidDatabaseUrl(databaseUrl)) {
    return finish({
      ok: false,
      mode: "error",
      appliedVersions: [],
      durationMs: 0,
      error: {
        message: `DATABASE_URL is not a Postgres connection string (it starts with ${databaseUrlScheme(databaseUrl)}).`,
        hint: "Use a postgresql:// connection string from Supabase Dashboard → Connect → Connection string → Session pooler.",
      },
    });
  }

  const pool = options?.pool ?? createSetupPool(databaseUrl);
  const applied: string[] = [];

  try {
    return await withAdvisoryLock(pool, async (client) => {
      // 1. bookkeeping table
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

      const existing = await appliedRows(client);

      // 2. baseline a manually-migrated schema
      if (shouldBaseline(existing.length, await schemaExists(client))) {
        for (const m of MIGRATIONS) {
          await client.query(
            `insert into hard_setup.schema_migrations (version, name, note)
             values ($1, $2, 'baselined: schema existed before auto-setup')
             on conflict (version) do nothing`,
            [m.version, m.name]
          );
        }
        return finish({
          ok: true,
          mode: "baselined",
          appliedVersions: [],
          durationMs: Date.now() - t0,
        });
      }

      // 3. apply pending migrations in order
      const done = new Set(existing.map((r) => r.version));
      for (const m of MIGRATIONS) {
        if (done.has(m.version)) continue;
        const mt0 = Date.now();
        try {
          await client.query("begin");
          await client.query(m.sql);
          await client.query(
            `insert into hard_setup.schema_migrations (version, name, duration_ms, note)
             values ($1, $2, $3, $4)`,
            [m.version, m.name, Date.now() - mt0, `applied via auto-setup (${trigger})`]
          );
          await client.query("commit");
          applied.push(m.version);
        } catch (err) {
          await client.query("rollback").catch(() => {});
          const translated = translateError(err instanceof Error ? err.message : String(err));
          return finish({
            ok: false,
            mode: "error",
            appliedVersions: applied,
            durationMs: Date.now() - t0,
            error: { version: m.version, ...translated },
          });
        }
      }

      return finish({
        ok: true,
        mode: applied.length > 0 ? "applied" : "up-to-date",
        appliedVersions: applied,
        durationMs: Date.now() - t0,
      });
    });
  } catch (err) {
    const translated = translateError(err instanceof Error ? err.message : String(err));
    return finish({
      ok: false,
      mode: "error",
      appliedVersions: applied,
      durationMs: Date.now() - t0,
      error: translated,
    });
  } finally {
    // only close pools we created; injected test pools stay owned by the test
    if (!options?.pool) await pool.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Read-only status (for /setup)
// ---------------------------------------------------------------------------

export async function checkDatabaseStatus(options?: {
  pool?: PgPoolLike;
}): Promise<DatabaseStatusReport> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      canConnect: false,
      databaseUrlPresent: false,
      migrations: computeMigrationStatuses(MIGRATIONS, []),
      appliedCount: 0,
      pendingCount: MIGRATIONS.length,
    };
  }

  // Refuse malformed values BEFORE handing them to pg — a non-postgres URL
  // (e.g. a sqlite-style file: value) crashes inside pg with a cryptic
  // AggregateError that can escape as an uncaughtException.
  if (!isValidDatabaseUrl(databaseUrl)) {
    return {
      canConnect: false,
      databaseUrlPresent: true,
      connectionError: `DATABASE_URL is not a Postgres connection string (it starts with ${databaseUrlScheme(databaseUrl)}).`,
      rawError: "Use a postgresql:// connection string from Supabase Dashboard → Connect → Connection string → Session pooler.",
      migrations: computeMigrationStatuses(MIGRATIONS, []),
      appliedCount: 0,
      pendingCount: MIGRATIONS.length,
    };
  }

  if (isTransactionPoolerUrl(databaseUrl)) {
    return {
      canConnect: false,
      databaseUrlPresent: true,
      connectionError: "DATABASE_URL uses the transaction-mode pooler (port 6543).",
      rawError: "Transaction pooling cannot run the multi-statement migration files. Use the Session pooler string (port 5432) or the direct connection.",
      migrations: computeMigrationStatuses(MIGRATIONS, []),
      appliedCount: 0,
      pendingCount: MIGRATIONS.length,
    };
  }

  const pool = options?.pool ?? createSetupPool(databaseUrl);
  try {
    const client = await pool.connect();
    try {
      const bookkeeping = await client.query(
        `select exists (
           select 1 from information_schema.tables
           where table_schema = 'hard_setup' and table_name = 'schema_migrations'
         ) as has_table`
      );
      const rows =
        bookkeeping.rows[0]?.has_table === true
          ? await appliedRows(client)
          : [];

      const exists = await schemaExists(client);
      let authUsersCount: number | undefined;
      try {
        const users = await client.query("select count(*)::int as n from auth.users");
        authUsersCount = Number(users.rows[0]?.n ?? 0);
      } catch {
        authUsersCount = undefined; // auth schema unreadable — fine for status
      }

      const migrations = computeMigrationStatuses(MIGRATIONS, rows);
      return {
        canConnect: true,
        schemaExists: exists,
        authUsersCount,
        migrations,
        appliedCount: migrations.filter((m) => m.applied).length,
        pendingCount: migrations.filter((m) => !m.applied).length,
        databaseUrlPresent: true,
      };
    } finally {
      client.release();
    }
  } catch (err) {
    const translated = translateError(err instanceof Error ? err.message : String(err));
    return {
      canConnect: false,
      connectionError: translated.message,
      rawError: translated.hint,
      migrations: computeMigrationStatuses(MIGRATIONS, []),
      appliedCount: 0,
      pendingCount: MIGRATIONS.length,
      databaseUrlPresent: true,
    };
  } finally {
    if (!options?.pool) await pool.end().catch(() => {});
  }
}

export type { MigrationFile };
