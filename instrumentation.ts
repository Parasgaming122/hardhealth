// Next.js instrumentation hook: runs once per server process (dev + prod,
// including Vercel cold starts) BEFORE requests are served. This is where the
// WordPress-style database setup happens: point the app at a fresh Supabase
// project (with DATABASE_URL set) and the schema builds itself on first boot.
//
// Hard rules:
//  - never throw: a failed/unconfigured setup must not crash the server; the
//    state is recorded on globalThis and surfaced by /setup + the layout banner
//  - node runtime only (pg cannot load on the edge)
//  - AUTO_DB_SETUP=false opts out entirely
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { runAutoSetup } = await import("@/lib/db/auto-setup");
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.log(
        "[hard-setup] DATABASE_URL is not set — automatic database setup skipped. " +
          "The app still runs; open /setup for the exact list of environment values to add."
      );
      return; // runAutoSetup also records env-missing, but skip the pg import noise
    }

    if (process.env.AUTO_DB_SETUP === "false") {
      console.log("[hard-setup] AUTO_DB_SETUP=false — boot-time setup disabled (use /setup to run it manually).");
      const { recordSetupRun } = await import("@/lib/db/setup-state");
      recordSetupRun({
        trigger: "boot",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        ok: true,
        mode: "disabled",
        appliedVersions: [],
      });
      return;
    }

    const outcome = await runAutoSetup({ trigger: "boot" });

    if (outcome.ok) {
      if (outcome.mode === "applied") {
        console.log(
          `[hard-setup] database setup complete: applied ${outcome.appliedVersions.length} migration(s) ` +
            `(${outcome.appliedVersions.join(", ")}) in ${outcome.durationMs}ms.`
        );
      } else if (outcome.mode === "baselined") {
        console.log(
          "[hard-setup] existing schema detected — recorded all migrations as applied (baseline). " +
            "Future migrations will be applied automatically."
        );
      } else if (outcome.mode === "up-to-date") {
        console.log("[hard-setup] database schema is up to date.");
      }
    } else {
      console.error(
        `[hard-setup] database setup FAILED${outcome.error?.version ? ` at migration ${outcome.error.version}` : ""}: ` +
          `${outcome.error?.message}${outcome.error?.hint ? ` — ${outcome.error.hint}` : ""} ` +
          "Open /setup for details."
      );
    }
  } catch (err) {
    // absolute last resort: the setup must never take the server down
    console.error(
      "[hard-setup] unexpected error (server continues):",
      err instanceof Error ? err.message : String(err)
    );
  }
}
