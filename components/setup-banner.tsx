import Link from "next/link";
import { AlertTriangle, DatabaseZap } from "lucide-react";
import { hasPublicEnv, readSetupRun } from "@/lib/db/setup-state";

/**
 * Quiet status strip rendered by the root layout. Shows ONLY when something
 * genuinely needs the owner's attention:
 *  - the required public env is missing (deployment not configured), or
 *  - the last automatic database setup FAILED (e.g. a migration error).
 * A healthy app, or one that merely lacks DATABASE_URL (auto-setup optional),
 * renders no banner at all — /setup stays available for details.
 */
export function SetupBanner() {
  const run = readSetupRun();

  const brokenEnv = !hasPublicEnv();
  const failedRun = run !== null && !run.ok;

  if (!brokenEnv && !failedRun) return null;

  if (brokenEnv) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-[11px] font-semibold text-amber-900">
        <AlertTriangle size={13} />
        <span>Setup needed: required environment variables are missing.</span>
        <Link href="/setup" className="inline-flex items-center gap-1 underline underline-offset-2">
          <DatabaseZap size={12} /> Open the setup page
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 bg-rose-100 px-4 py-2 text-[11px] font-semibold text-rose-900">
      <AlertTriangle size={13} />
      <span>
        Automatic database setup failed
        {run?.error?.version ? ` (migration ${run.error.version})` : ""}: {run?.error?.message}
      </span>
      <Link href="/setup" className="inline-flex items-center gap-1 underline underline-offset-2">
        <DatabaseZap size={12} /> Fix it on the setup page
      </Link>
    </div>
  );
}
