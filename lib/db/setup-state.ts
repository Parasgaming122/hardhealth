// Shared, dependency-free state for the WordPress-style auto DB setup.
// This module MUST stay importable from any runtime (edge proxy, RSC layout,
// node server actions): it only reads process.env and a globalThis cache.
// The actual migration runner lives in lib/db/auto-setup.ts (node-only, pg).
import type { MigrationFile } from "@/lib/db/migrations-manifest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SetupRunMode =
  | "applied" // migrations were applied in this run
  | "up-to-date" // nothing to do, schema current
  | "baselined" // existing manually-migrated schema recorded, nothing applied
  | "env-missing" // DATABASE_URL absent -> auto-setup skipped (not an error)
  | "disabled" // AUTO_DB_SETUP=false
  | "error"; // a migration failed

export interface SetupRunRecord {
  trigger: "boot" | "manual";
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  mode: SetupRunMode;
  /** versions applied in this run, in order */
  appliedVersions: string[];
  error?: { version?: string; message: string; hint?: string };
}

// ---------------------------------------------------------------------------
// globalThis cache (survives per server instance; undefined = never ran)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__hardDbSetupRun";

export function recordSetupRun(record: SetupRunRecord) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = record;
}

export function readSetupRun(): SetupRunRecord | null {
  return ((globalThis as Record<string, unknown>)[GLOBAL_KEY] as SetupRunRecord) ?? null;
}

// ---------------------------------------------------------------------------
// Env requirements (names + presence only — NEVER values)
// ---------------------------------------------------------------------------

export type EnvRequirementLevel = "required" | "recommended" | "optional";

export interface EnvRequirement {
  key: string;
  level: EnvRequirementLevel;
  present: boolean;
  what: string;
  where: string;
}

export function getEnvRequirements(): EnvRequirement[] {
  const has = (key: string) => Boolean((process.env as Record<string, string | undefined>)[key]);
  return [
    {
      key: "NEXT_PUBLIC_SUPABASE_URL",
      level: "required",
      present: has("NEXT_PUBLIC_SUPABASE_URL"),
      what: "Supabase project URL — auth + database for the whole app.",
      where: "Supabase Dashboard → Project Settings → API → Project URL",
    },
    {
      key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      level: "required",
      present: has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      what: "Public (publishable/anon) key used by browser + server auth calls.",
      where: "Supabase Dashboard → Project Settings → API → Project API keys → publishable",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      level: "recommended",
      present: has("SUPABASE_SERVICE_ROLE_KEY"),
      what: "Server-only admin key. Without it, login works but Platform Admin management and directory features degrade to empty states.",
      where: "Supabase Dashboard → Project Settings → API → Project API keys → service_role",
    },
    {
      key: "DATABASE_URL",
      level: "recommended",
      present: has("DATABASE_URL"),
      what: "Postgres connection string. Enables the automatic database setup: on boot the app creates the schema / applies pending migrations by itself (WordPress-style). Without it you must run each file in supabase/migrations manually.",
      where: "Supabase Dashboard → Connect → Connection string → Session pooler",
    },
    {
      key: "AUTO_DB_SETUP",
      level: "optional",
      present: has("AUTO_DB_SETUP"),
      what: "Set to false to disable boot-time auto-setup (manual /setup trigger still possible). Default: enabled.",
      where: "-",
    },
    {
      key: "SETUP_TOKEN",
      level: "optional",
      present: has("SETUP_TOKEN"),
      what: "Secret that allows running /setup actions on an already-installed database without being signed in as platform admin.",
      where: "any random secret you choose",
    },
  ];
}

export function hasPublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function autoSetupEnabled(): boolean {
  return process.env.AUTO_DB_SETUP !== "false";
}

/** e.g. "https://abc123.supabase.co" -> "abc123" (null when unset/malformed) */
export function supabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

/** Example session-pooler string with the project ref filled in when known. */
export function exampleDatabaseUrl(): string {
  const ref = supabaseProjectRef();
  return `postgresql://postgres.${ref ?? "YOUR_PROJECT_REF"}:YOUR_DB_PASSWORD@aws-0-YOUR-REGION.pooler.supabase.com:5432/postgres`;
}

/**
 * Transaction-mode pooler (port 6543) cannot run the multi-statement migration
 * files (session-level advisory locks + multi-statement simple queries).
 * The runner refuses with a pointed message instead of failing mysteriously.
 */
export function isTransactionPoolerUrl(url: string): boolean {
  return /:6543\//.test(url);
}

/**
 * Only postgres:// / postgresql:// strings are usable. Anything else (e.g. a
 * sqlite-style "file:..." value inherited from some other tool) would make pg
 * throw a cryptic AggregateError, potentially as an uncaughtException — so the
 * runner refuses non-postgres values up front with a clean message.
 */
export function isValidDatabaseUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//i.test(url);
}

/** Report only the scheme of a bad URL — never echo credentials. */
export function databaseUrlScheme(url: string): string {
  const m = url.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? `${m[1]}:` : "(no scheme)";
}

// ---------------------------------------------------------------------------
// Pure planning helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Migration status as computed from the version table + manifest. */
export interface MigrationStatus extends Pick<MigrationFile, "version" | "name" | "filename"> {
  applied: boolean;
  appliedAt?: string;
  note?: string;
}

export function computeMigrationStatuses(
  manifest: MigrationFile[],
  appliedRows: { version: string; applied_at?: string | null; note?: string | null }[]
): MigrationStatus[] {
  const byVersion = new Map(appliedRows.map((r) => [r.version, r]));
  return manifest.map((m) => {
    const row = byVersion.get(m.version);
    return {
      version: m.version,
      name: m.name,
      filename: m.filename,
      applied: Boolean(row),
      appliedAt: row?.applied_at ?? undefined,
      note: row?.note ?? undefined,
    };
  });
}

/**
 * Baseline rule: the version bookkeeping table is empty but the app schema
 * already exists (migrations were applied manually, e.g. via the Supabase SQL
 * editor). Record every manifest entry as applied instead of re-running DDL
 * that would fail with "already exists".
 */
export function shouldBaseline(appliedCount: number, schemaExists: boolean): boolean {
  return appliedCount === 0 && schemaExists;
}
