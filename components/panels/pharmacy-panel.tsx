"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Check, ClipboardList, FileCheck2, FilePlus2, LockKeyhole, Pill, QrCode, ScanLine, Search, ShieldCheck, Smartphone, WalletCards, X } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { QrScanner } from "@/components/qr-scanner";
import { Badge, Button, ProvenanceBadge } from "@/components/ui";
import { ageRange, dateLabel, pkr, type Prescription } from "@/lib/domain";
import { findDemoRx } from "@/lib/mock-data";

export function PharmacyPanel({ section }: { section: string }) {
  const { data, addAccessLog, markDispensed, attachBill, showToast } = useDemo();
  const [code, setCode] = useState("");
  const [rx, setRx] = useState<Prescription | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [scanner, setScanner] = useState(false);
  const [billNumber, setBillNumber] = useState("GC-2026-1842");
  const [billTotal, setBillTotal] = useState("6250");
  const [billLines, setBillLines] = useState("Montelukast 10 mg · 14 tablets\nSalbutamol inhaler · 1");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) setCode(token);
  }, []);

  const extractToken = useCallback((raw: string) => {
    try { return new URL(raw, window.location.origin).searchParams.get("token") ?? raw; } catch { return raw; }
  }, []);
  const handleScan = useCallback((value: string) => setCode(extractToken(value)), [extractToken]);
  const resolve = () => {
    setOtpError(""); setComplete(false);
    const found = findDemoRx(extractToken(code), data);
    if (!found) { setRx(null); showToast("No matching demo prescription · check the short code"); return; }
    setRx(found);
    addAccessLog({ patientId: found.patientId, actor: "Green Cross Pharmacy", role: "Pharmacist", action: "Resolved one prescription by token or code", entity: found.code, kind: "pharmacy_resolve" });
    showToast("Prescription resolved · only this document is in scope");
  };
  const dispense = () => {
    if (!rx) return;
    const success = markDispensed(rx.id, otp);
    if (!success) { setOtpError("OTP did not match or this prescription is not eligible for dispensing."); return; }
    const nextFills = rx.fillsUsed + 1;
    setRx({ ...rx, fillsUsed: nextFills, status: nextFills >= rx.maxFills ? "dispensed" : "partly_filled" });
    setOtpError(""); showToast("Patient OTP confirmed · fill recorded");
  };
  const expired = rx ? new Date(rx.expiresAt).getTime() < Date.now() || rx.status === "expired" : false;
  const unavailable = rx ? expired || rx.status === "cancelled" || rx.status === "dispensed" || rx.fillsUsed >= rx.maxFills : false;
  const attach = () => {
    if (!rx || Number(billTotal) <= 0) return;
    if (attachBill({ prescriptionId: rx.id, billNumber, total: Number(billTotal), lines: billLines })) { setComplete(true); }
  };

  return <>
    <div className="page-heading"><div><div className="page-eyebrow">Green Cross Pharmacy · Counter</div><h1 className="page-title">Scan. Verify. Dispense.</h1><p className="page-subtitle">A prescription code opens one document only. No patient search or record access.</p></div><span className="demo-pill"><span className="demo-dot" /> OTP demo · 4812</span></div>
    <div className="content-grid wide-side">
      <section className="card"><div className="card-head"><div><h2 className="card-title">Resolve a prescription</h2><div className="card-caption">Scan its QR or type the human-readable short code</div></div><Badge type="neutral">Single-document scope</Badge></div><div className="card-body">
        <div className="notice mb-4"><LockKeyhole size={15} className="mt-0.5 shrink-0" /><span>This workspace has no patient list, CNIC/Health ID search, or access to patient history. Resolution is recorded in the patient access log.</span></div>
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-6 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm"><ScanLine size={22} /></div><div className="mt-3 text-[11px] font-bold">Scan prescription QR</div><div className="mt-1 text-[9px] text-slate-400">Camera permission is requested only after you start the scanner.</div><Button variant="secondary" className="mt-3" onClick={() => setScanner((value) => !value)}><QrCode size={13} /> {scanner ? "Close camera" : "Open camera scanner"}</Button><QrScanner active={scanner} onCode={handleScan} onClose={() => setScanner(false)} /></div>
        <div className="my-4 flex items-center gap-3 text-[8px] uppercase tracking-widest text-slate-300"><span className="h-px flex-1 bg-slate-100" />or enter code<span className="h-px flex-1 bg-slate-100" /></div>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input mono !pl-9 uppercase tracking-wider" placeholder="RX code or 10-character short code" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") resolve(); }} /></div><Button onClick={resolve} disabled={!code.trim()}><ScanLine size={13} /> Resolve one prescription</Button></div>
        <div className="mt-2 text-[8px] text-slate-400">Try the seeded demo code: <button className="mono font-bold text-emerald-700 underline" onClick={() => setCode("7F3K92QD1A")}>7F3K92QD1A</button></div>
      </div></section>
      <section className="card"><div className="card-head"><div><h2 className="card-title">One prescription at a time</h2><div className="card-caption">Codes are never browsable or listed here</div></div><Badge type="verified">Scoped access</Badge></div><div className="card-body space-y-3"><div className="notice"><LockKeyhole size={15} className="mt-0.5 shrink-0" /><span>Only resolve a code presented by the patient. This demo does not retain or expose a pharmacy-wide history of prescription codes.</span></div><div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="text-[9px] font-bold text-slate-600">Counter workflow</div><ol className="mt-3 space-y-3 text-[8px] leading-4 text-slate-500"><li><strong className="text-slate-700">01 · Scan or enter</strong><br/>Use the patient's opaque QR or 10-character fallback code.</li><li><strong className="text-slate-700">02 · Verify one item</strong><br/>Confirm issuer, status, medicines and fills remaining.</li><li><strong className="text-slate-700">03 · Confirm &amp; attach</strong><br/>Simulate OTP dispense and add your own bill.</li></ol></div><div className="notice amber"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>No patient directory, prior-prescription list, Health ID, CNIC or patient timeline is available in this workspace.</span></div></div></section>
    </div>
    {rx && <section className="card mt-4"><div className="card-head"><div><h2 className="card-title">Resolved prescription · {rx.code}</h2><div className="card-caption">This is the complete pharmacy view for this token—nothing else.</div></div><Button variant="secondary" size="small" onClick={() => { setRx(null); setCode(""); setComplete(false); }}><X size={12} /> Close</Button></div><div className="card-body">
      {unavailable ? <div className="notice amber"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span><strong>Prescription unavailable: {expired ? "expired" : rx.status.replace("_", " ")}.</strong> The protocol returns status only for an expired, cancelled or fully dispensed prescription; medicine details are hidden.</span></div> : <div className="content-grid equal !mt-0">
        <div className="rx-card"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><Badge type="verified"><BadgeCheck size={10} /> Verified prescriber</Badge><span className="mono text-[9px] font-bold">{rx.code}</span></div><div className="mt-2 text-sm font-bold">{rx.provider}</div><div className="mt-1 text-[9px] text-slate-400">{rx.doctor} · {dateLabel(rx.date)}</div></div><Badge type={rx.status === "active" ? "verified" : "pending"}>{rx.status.replace("_", " ")}</Badge></div><div className="mt-3 rounded-lg border border-slate-100 bg-white p-3"><div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Minimal patient identifier</div><div className="mt-1 text-[10px] font-bold">{rx.patientName.split(" ")[0]} · age {ageRange(rx.patientAge)}</div></div><div className="mt-3 text-[8px] text-slate-400">Fills remaining: {Math.max(0, rx.maxFills - rx.fillsUsed)} · Expires {dateLabel(rx.expiresAt)}</div><div className="divider" /><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Prescribed items</div>{rx.items.map((item) => <div className="rx-medicine" key={item.id}><div className="rx-medicine-name">{item.medicine}</div><div className="rx-medicine-sub">{item.strength} · {item.dose} · {item.frequency}</div><div className="rx-medicine-sub">{item.duration} · Quantity {item.quantity}</div></div>)}<div className="mt-3"><ProvenanceBadge provenance="verified" /></div></div>
        <div className="space-y-3">
          {rx.fillsUsed < rx.maxFills && <div className="rounded-xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-[10px] font-bold"><Smartphone size={14} className="text-emerald-700" /> Patient OTP confirmation</div><p className="mt-1 text-[9px] leading-4 text-slate-400">The patient enters the simulated OTP at the counter before dispensing. Demo code: 4812.</p><div className="mt-3 flex gap-2"><input className="input mono !max-w-36 tracking-widest" placeholder="4-digit OTP" value={otp} maxLength={4} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} /><Button disabled={otp.length !== 4} onClick={dispense}><Check size={12} /> Confirm dispense</Button></div>{otpError && <div className="mt-2 text-[9px] text-rose-600">{otpError}</div>}</div>}
          {(rx.fillsUsed > 0 || rx.maxFills === 1) && <div className={`rounded-xl border p-4 ${rx.fillsUsed > 0 ? "border-emerald-100 bg-emerald-50/30" : "border-slate-100"}`}><div className="flex items-center gap-2 text-[10px] font-bold"><WalletCards size={14} className="text-emerald-700" /> Attach your pharmacy bill</div><p className="mt-1 text-[9px] leading-4 text-slate-400">Enter the final bill from your own billing software. It will link to this prescription only.</p>{complete ? <div className="mt-3 notice"><Check size={13} /><span>Bill attached. Patient spending updated; access event logged.</span></div> : <div className="mt-3 space-y-2"><div className="form-grid"><div className="field"><label>Bill number</label><input className="input" value={billNumber} onChange={(event) => setBillNumber(event.target.value)} /></div><div className="field"><label>Total (PKR)</label><input className="input" type="number" value={billTotal} onChange={(event) => setBillTotal(event.target.value)} /></div></div><div className="field"><label>Line items</label><textarea className="textarea !min-h-[66px]" value={billLines} onChange={(event) => setBillLines(event.target.value)} /></div><Button onClick={attach}><FilePlus2 size={12} /> Attach bill & update patient</Button></div>}</div>}
        </div>
      </div>}
    </div></section>}
    <div className="notice mt-4"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>Demo privacy boundary: pharmacy lookup uses a single opaque prescription token. This interface illustrates minimal scope; secure server-side tokens and rate limits are production requirements.</span></div>
  </>;
}
