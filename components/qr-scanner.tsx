"use client";

import { useEffect, useState } from "react";

export function QrScanner({ active, onCode, onClose }: { active: boolean; onCode: (value: string) => void; onClose: () => void }) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let scanner: { render: (success: (text: string) => void, failure: (error: unknown) => void) => void; clear: () => Promise<void> } | undefined;
    let cancelled = false;
    void import("html5-qrcode").then(({ Html5QrcodeScanner }) => {
      if (cancelled) return;
      const instance = new Html5QrcodeScanner("hard-qr-reader", { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 }, false);
      scanner = instance;
      instance.render((decoded) => { onCode(decoded); onClose(); }, (scanError) => { const text = String(scanError); if (text.includes("NotAllowed") || text.includes("NotFound")) setError("Camera access is unavailable. Enter the short code below instead."); });
    }).catch(() => setError("Camera scanner could not load. Enter the prescription short code instead."));
    return () => { cancelled = true; if (scanner) void scanner.clear().catch(() => undefined); };
  }, [active, onCode, onClose]);
  if (!active) return null;
  return <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><div className="mb-2 text-[10px] font-bold text-emerald-900">Point the camera at a prescription QR</div><div id="hard-qr-reader" className="overflow-hidden rounded-xl bg-white" />{error && <p className="mt-2 text-[9px] text-amber-700">{error}</p>}<button className="mt-3 text-[9px] font-bold text-slate-500 underline" onClick={onClose}>Close camera</button></div>;
}
