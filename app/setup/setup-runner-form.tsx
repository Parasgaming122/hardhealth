"use client";

import { useActionState } from "react";
import { DatabaseZap, LoaderCircle } from "lucide-react";
import { runSetupAction, type SetupActionState } from "@/app/setup/actions";

const initialState: SetupActionState = { ok: true, message: "" };

export function SetupRunnerForm({ needsToken }: { needsToken: boolean }) {
  const [state, formAction, pending] = useActionState(runSetupAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {needsToken && (
        <div className="field">
          <label htmlFor="setup-token">SETUP_TOKEN</label>
          <input
            id="setup-token"
            name="token"
            type="password"
            className="input"
            placeholder="Value of SETUP_TOKEN from the server environment"
            autoComplete="off"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <LoaderCircle size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
          {pending ? "Running setup…" : "Run database setup now"}
        </button>
        <span className="text-[10px] text-slate-500">
          Applies every pending migration in order, inside transactions.
        </span>
      </div>

      {state.message && (
        <div className={`notice ${state.ok ? "" : "coral"}`}>
          <div>
            <strong>{state.ok ? "Done" : "Failed"}</strong>
            <div>{state.message}</div>
            {state.hint && <div className="mt-1 opacity-80">{state.hint}</div>}
          </div>
        </div>
      )}
    </form>
  );
}
