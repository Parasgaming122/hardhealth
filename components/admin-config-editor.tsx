"use client";

import { useEffect, useState } from "react";
import { Save, Settings2, Shield } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CONFIG_LABELS } from "@/lib/admin/config-defaults";
import type { PlatformConfig } from "@/lib/admin/config-defaults";

/**
 * P2-8 (brief 8.7): the REAL platform config editor — reads and writes the
 * `config` table through audited SECURITY DEFINER RPCs. Fees, plan prices,
 * quotas, provider share, prescription validity and fills are editable here;
 * the front desk, prescription issuing and the storage meter consume the same
 * values (brief Rule 1: never hard-coded).
 */
export function AdminConfigEditor({ initialConfig }: { initialConfig: PlatformConfig }) {
  const [config, setConfig] = useState<PlatformConfig>(initialConfig);
  useEffect(() => setConfig(initialConfig), [initialConfig]);

  const [saved, setSaved] = useState<PlatformConfig>(initialConfig);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const dirtyKeys = Object.keys(config).filter((k) => Number(config[k]) !== Number(saved[k]));

  const handleSave = async () => {
    if (dirtyKeys.length === 0) {
      setError("");
      setStatus("No changes to save.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { updatePlatformConfigAction } = await import("@/lib/admin/config-actions");
      const res = await updatePlatformConfigAction(
        dirtyKeys.map((key) => ({ key, value: Number(config[key]) }))
      );
      if (res.error) {
        setError(res.error);
      } else {
        setSaved(config);
        const summary = res.updated
          .map((u) => `${CONFIG_LABELS[u.key] ?? u.key}: ${u.oldValue ?? "—"} → ${u.value}`)
          .join(" · ");
        setStatus(`Saved ${res.updated.length} value${res.updated.length === 1 ? "" : "s"} (each change is written to the audit log). ${summary}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Business configuration</h2>
          <div className="card-caption">
            Live `config` table · fees, plans, quotas and shares used by registration, prescribing
            and storage (brief Rule 1)
          </div>
        </div>
        <Settings2 size={15} className="text-slate-300" />
      </div>
      <div className="card-body space-y-4">
        <div className="form-grid three">
          {Object.keys(CONFIG_LABELS).map((key) => (
            <div className="field" key={key}>
              <label>{CONFIG_LABELS[key]}</label>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                aria-label={CONFIG_LABELS[key]}
                value={config[key]}
                onChange={(e) => setConfig((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Badge type={dirtyKeys.length ? "pending" : "verified"}>
            {dirtyKeys.length ? `${dirtyKeys.length} unsaved change${dirtyKeys.length === 1 ? "" : "s"}` : "In sync with database"}
          </Badge>
          <Button size="small" disabled={busy || dirtyKeys.length === 0} onClick={handleSave}>
            <Save size={12} /> {busy ? "Saving…" : "Save configuration"}
          </Button>
        </div>

        {error && <div className="notice coral">{error}</div>}
        {status && <div className="notice">{status}</div>}

        <div className="notice amber">
          <Shield size={13} className="mt-0.5 shrink-0" />
          <span>
            Changes apply to future actions — existing ledger splits keep the percentage used at
            payment time (brief Rule 4). Every change is recorded as a `config_update` audit event
            with the old and new value.
          </span>
        </div>
      </div>
    </section>
  );
}
