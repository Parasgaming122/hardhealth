"use client";

import { useActionState } from "react";
import { BadgeCheck, FileSearch, LockKeyhole } from "lucide-react";
import { resolvePrescriptionAction, type ResolveActionState } from "@/app/pharmacy/actions";

const initialState: ResolveActionState = { error: null, result: null };

export function PharmacyTokenResolver() {
  const [state, formAction, pending] = useActionState(resolvePrescriptionAction, initialState);
  const result = state.result;
  return (
    <div className="pharmacy-resolver">
      <div className="pharmacy-resolver-intro"><span className="secure-record-icon"><FileSearch size={18}/></span><div><h3>Resolve one prescription</h3><p>Enter the token from the patient-presented QR or fallback code. The database returns only the minimum dispensing details for this prescription.</p></div></div>
      <form action={formAction} className="pharmacy-token-form">
        <label htmlFor="prescription-token">Prescription token or short code</label>
        <div><input id="prescription-token" name="token" type="password" required minLength={10} maxLength={200} autoComplete="off" spellCheck={false} placeholder="Paste or scan the one-time code"/><button className="secure-primary" type="submit" disabled={pending}>{pending ? "Checking…" : "Resolve token"}</button></div>
      </form>
      {state.error && <p role="alert" className="secure-error mt-4">{state.error}</p>}
      {result && <section aria-live="polite" className={`pharmacy-result ${result.status === "active" || result.status === "partly_filled" ? "is-active" : ""}`}>
        <div className="pharmacy-result-head"><div><span className="secure-eyebrow">Result status</span><h3>{result.status.replaceAll("_", " ")}</h3></div>{(result.status === "active" || result.status === "partly_filled") && <span className="verified-chip"><BadgeCheck size={13}/> Verified token</span>}</div>
        {(result.status === "active" || result.status === "partly_filled") ? <>
          <div className="pharmacy-result-grid"><div><span>Doctor</span><strong>{result.doctor_name || "Verified prescriber"}</strong></div><div><span>Clinic</span><strong>{result.provider_name || "Verified provider"}</strong></div><div><span>Patient</span><strong>{result.patient_first_name || "Patient"}{result.patient_age_range ? ` · ${result.patient_age_range}` : ""}</strong></div><div><span>Fills remaining</span><strong>{result.fills_remaining ?? 0}</strong></div></div>
          <div className="pharmacy-medicines"><span className="secure-eyebrow">Prescription items</span>{(result.medicines ?? []).map((item,index)=><div key={`${item.medicine}-${index}`}><strong>{item.medicine} {item.strength}</strong><span>{item.dose} · {item.frequency} · {item.duration} · Qty {item.quantity}</span></div>)}</div>
          <p className="pharmacy-scope-foot"><LockKeyhole size={13}/> No Health ID, other prescriptions, or patient history was returned.</p>
        </> : result.status === "rate_limited" ? <p className="mt-4 text-sm text-slate-600">Too many lookup attempts. Wait 60 seconds before trying again.</p> : <p className="mt-4 text-sm text-slate-600">No prescription details are available for this token status.</p>}
      </section>}
    </div>
  );
}
