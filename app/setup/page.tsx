import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Database,
  KeyRound,
  MinusCircle,
  ServerCog,
  ShieldAlert,
} from "lucide-react";
import { checkDatabaseStatus, type DatabaseStatusReport } from "@/lib/db/auto-setup";
import {
  exampleDatabaseUrl,
  getEnvRequirements,
  readSetupRun,
  supabaseProjectRef,
} from "@/lib/db/setup-state";
import { SetupRunnerForm } from "@/app/setup/setup-runner-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Database setup",
  robots: { index: false, follow: false },
};

function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : tone === "bad"
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${cls}`}>
      {children}
    </span>
  );
}

export default async function SetupPage() {
  const requirements = getEnvRequirements();
  const missingRequired = requirements.filter((r) => r.level === "required" && !r.present);
  const hasDatabaseUrl = requirements.some((r) => r.key === "DATABASE_URL" && r.present);

  const status: DatabaseStatusReport | null = hasDatabaseUrl
    ? await checkDatabaseStatus().catch(() => null)
    : null;

  const lastRun = readSetupRun();
  const virginInstall =
    status?.canConnect === true && status.appliedCount === 0 && status.schemaExists === false;
  const hasPending = (status?.pendingCount ?? 0) > 0 || virginInstall;
  const needsToken = Boolean(process.env.SETUP_TOKEN);

  const ref = supabaseProjectRef();

  const overall =
    missingRequired.length > 0
      ? { tone: "bad" as const, label: "Environment incomplete — see Step 1" }
      : !hasDatabaseUrl
        ? { tone: "warn" as const, label: "App runs, automatic DB setup not configured" }
        : status && !status.canConnect
          ? { tone: "bad" as const, label: "Cannot connect to the database" }
          : status && status.pendingCount > 0
            ? { tone: "warn" as const, label: `${status.pendingCount} migration(s) pending` }
            : status && !status.schemaExists
              ? { tone: "bad" as const, label: "Database reachable but schema missing" }
              : lastRun && !lastRun.ok
                ? { tone: "warn" as const, label: "Last setup run failed — see below" }
                : { tone: "ok" as const, label: "Everything configured and up to date" };

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-slate-800">
      <div className="mx-auto w-full max-w-3xl space-y-5">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="brand no-underline">
            <span className="brand-name block">H.A.R.D</span>
            <span className="brand-caption block">CARE · COST · CLARITY</span>
          </Link>
          <div className="flex items-center gap-3">
            <StatusPill tone={overall.tone}>{overall.label}</StatusPill>
            <Link href="/" className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800">
              <ArrowLeft size={13} /> Back to app
            </Link>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-base font-extrabold">Database setup</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            H.A.R.D sets up its own database, WordPress-style: add the environment values below,
            and on the next start the app creates the schema and applies every pending migration
            file from <code className="mono">supabase/migrations/</code> automatically — no manual
            SQL editor runs. This page always tells you exactly what is missing; nothing errors
            with a crash.
          </p>
        </div>

        {/* Step 1: environment */}
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title flex items-center gap-1.5"><KeyRound size={14} /> Step 1 — Environment</h2>
              <div className="card-caption">Only variable names and presence are shown, never values.</div>
            </div>
          </div>
          <div className="card-body space-y-2.5">
            {requirements.map((r) => (
              <div key={r.key} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                {r.present ? (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : r.level === "required" ? (
                  <ShieldAlert size={15} className="mt-0.5 shrink-0 text-rose-600" />
                ) : (
                  <MinusCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="mono text-[11px] font-bold">{r.key}</code>
                    <StatusPill tone={r.present ? "ok" : r.level === "required" ? "bad" : "warn"}>
                      {r.present ? "set" : r.level === "required" ? "MISSING — required" : "not set"}
                    </StatusPill>
                    <StatusPill tone="info">{r.level}</StatusPill>
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-slate-600">{r.what}</div>
                  {!r.present && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      <strong>Where:</strong> {r.where}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {missingRequired.length > 0 && (
              <div className="notice coral">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  Add {missingRequired.map((r) => r.key).join(", ")} to your environment
                  {process.env.VERCEL ? " (Vercel → Project → Settings → Environment Variables) then redeploy" : " (.env.local locally, then restart the dev server)"}. The
                  app cannot sign in or read data until the required values exist.
                </div>
              </div>
            )}

            {!hasDatabaseUrl && (
              <div className="rounded-xl border border-slate-200 bg-slate-900 p-3.5">
                <div className="text-[10px] font-bold text-slate-300">To enable automatic database setup, add:</div>
                <pre className="mono mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-emerald-300">
{`DATABASE_URL=${exampleDatabaseUrl()}`}
                </pre>
                <div className="mt-2 text-[10px] leading-relaxed text-slate-400">
                  Get it from <strong>Supabase Dashboard → Connect → Connection string → Session pooler</strong>
                  {ref ? <> (project <code className="mono">{ref}</code>)</> : null}; use your database password — it is
                  not the service_role key. Use port <strong>5432</strong> (Session pooler), not 6543.
                  Without DATABASE_URL the app still runs, but migrations must be applied manually in the SQL editor.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Step 2: database status */}
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title flex items-center gap-1.5"><Database size={14} /> Step 2 — Database status</h2>
              <div className="card-caption">Live connection check + migration bookkeeping (hard_setup.schema_migrations).</div>
            </div>
          </div>
          <div className="card-body space-y-3">
            {!hasDatabaseUrl ? (
              <div className="notice amber">
                <ServerCog size={14} className="mt-0.5 shrink-0" />
                <div>Automatic setup is not configured yet — add <code className="mono">DATABASE_URL</code> (Step 1) and restart. Nothing is wrong with the app itself.</div>
              </div>
            ) : status === null ? (
              <div className="notice coral">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>Status check failed unexpectedly. Verify DATABASE_URL points at the Supabase session pooler or direct connection.</div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={status.canConnect ? "ok" : "bad"}>
                    {status.canConnect ? "Connection OK" : "Connection failed"}
                  </StatusPill>
                  {status.schemaExists !== undefined && (
                    <StatusPill tone={status.schemaExists ? "ok" : "warn"}>
                      {status.schemaExists ? "App schema present" : "App schema missing"}
                    </StatusPill>
                  )}
                  {typeof status.authUsersCount === "number" && (
                    <StatusPill tone="info">{status.authUsersCount} auth user(s)</StatusPill>
                  )}
                  <StatusPill tone={status.pendingCount === 0 ? "ok" : "warn"}>
                    {status.appliedCount}/{status.migrations.length} migrations applied
                  </StatusPill>
                </div>

                {status.connectionError && (
                  <div className="notice coral">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <strong>{status.connectionError}</strong>
                      {status.rawError && <div className="mt-1">{status.rawError}</div>}
                    </div>
                  </div>
                )}

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Migration</th>
                        <th>Status</th>
                        <th>Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.migrations.map((m) => (
                        <tr key={m.version}>
                          <td className="mono text-[10px]">{m.version}</td>
                          <td className="text-[10px] font-semibold">{m.name}</td>
                          <td>
                            {m.applied ? (
                              <span className="badge badge-verified">applied</span>
                            ) : (
                              <span className="badge badge-pending">pending</span>
                            )}
                          </td>
                          <td className="text-[10px] text-slate-500">
                            {m.appliedAt ? new Date(m.appliedAt).toLocaleString() : m.note ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Step 3: run now */}
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title flex items-center gap-1.5"><ServerCog size={14} /> Step 3 — Run setup now</h2>
              <div className="card-caption">
                Normally runs by itself on server start. Use this button to trigger it without a restart.
              </div>
            </div>
          </div>
          <div className="card-body space-y-3">
            {!hasDatabaseUrl ? (
              <div className="text-[11px] text-slate-500">Add DATABASE_URL first — see Step 1.</div>
            ) : !hasPending ? (
              <div className="notice">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <div>Nothing to do — the schema is installed and every migration is applied. Future migration files are picked up automatically on the next server start.</div>
              </div>
            ) : (
              <>
                <SetupRunnerForm needsToken={needsToken && !virginInstall} />
                {!virginInstall && (
                  <div className="text-[10px] leading-relaxed text-slate-500">
                    This database is already installed, so running setup requires either a signed-in
                    platform admin session or the <code className="mono">SETUP_TOKEN</code> value from the
                    server environment. On a brand-new, empty database this button is open to anyone
                    (WordPress install-page behavior) and closes as soon as the schema exists.
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Last boot run */}
        {lastRun && (
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Last setup run</h2>
                <div className="card-caption">
                  Trigger: {lastRun.trigger} · started {new Date(lastRun.startedAt).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="card-body">
              {lastRun.ok ? (
                <div className="notice">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <strong>{lastRun.mode}</strong>
                    {lastRun.appliedVersions.length > 0 && (
                      <div className="mono mt-1 text-[10px]">{lastRun.appliedVersions.join(" → ")}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="notice coral">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <strong>{lastRun.error?.version ? `Migration ${lastRun.error.version} failed` : "Setup failed"}</strong>
                    <div>{lastRun.error?.message}</div>
                    {lastRun.error?.hint && <div className="mt-1 opacity-80">{lastRun.error.hint}</div>}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Switching to a new database</h2>
              <div className="card-caption">The full “start from scratch” recipe.</div>
            </div>
          </div>
          <div className="card-body text-[10.5px] leading-relaxed text-slate-600">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Create a fresh Supabase project.</li>
              <li>Set <code className="mono">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="mono">DATABASE_URL</code> (session pooler string) in your environment.</li>
              <li>Deploy / restart. On boot the app creates <code className="mono">hard_setup.schema_migrations</code>, applies all <code className="mono">supabase/migrations/*.sql</code> files in order, and creates the first platform admin via the README snippet (one time).</li>
              <li>If you had applied migrations manually before, the runner baselines them instead of re-running.</li>
            </ol>
            <div className="mt-2 flex items-center gap-1.5 text-slate-500">
              <CircleDashed size={12} />
              Opt out any time with <code className="mono">AUTO_DB_SETUP=false</code>; keep control with <code className="mono">SETUP_TOKEN</code>.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
