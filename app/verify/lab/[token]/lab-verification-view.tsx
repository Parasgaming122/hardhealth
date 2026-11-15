"use client";

import { useEffect } from "react";
import { BadgeCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui";
import { useDemo } from "@/components/demo-provider";
import { dateLabel } from "@/lib/domain";

export default function LabVerificationView({ token }: { token: string }) {
  const { data, addAccessLog } = useDemo();
  const report = data.labReports.find((item) => item.token === token);

  useEffect(() => {
    if (report) {
      addAccessLog({
        patientId: report.patientId,
        actor: "Public verification link",
        role: "Public",
        action: "Viewed lab report authenticity metadata",
        entity: report.testType,
        kind: "normal_read",
      });
    }
  }, [report?.id, addAccessLog]);

  return (
    <main className="verify-page">
      <div className="verify-shell">
        <div className="brand">
          <img className="brand-mark" src="/hard-mark.svg" alt="" />
          <div>
            <div className="brand-name">H.A.R.D</div>
            <div className="brand-caption">DOCUMENT VERIFICATION</div>
          </div>
        </div>
        {report ? (
          <>
            <div className="verify-status">
              <span className="verify-icon"><BadgeCheck size={25} /></span>
              <Badge type="verified">Verified document</Badge>
            </div>
            <div className="page-eyebrow mt-7">LAB REPORT · {report.lab}</div>
            <h1 className="page-title !text-2xl">This report is verified</h1>
            <p className="page-subtitle">
              The record matches a report issued by the named lab. This page confirms the report is genuine and unchanged; it does not authenticate the patient&apos;s identity.
            </p>
            <section className="card mt-6">
              <div className="card-body">
                <div className="verify-row"><span>Issuing provider</span><strong>{report.lab}</strong></div>
                <div className="verify-row"><span>Provider type</span><strong>Diagnostic laboratory</strong></div>
                <div className="verify-row"><span>Report</span><strong>{report.testType}</strong></div>
                <div className="verify-row"><span>Date issued</span><strong>{dateLabel(report.date)}</strong></div>
                <div className="verify-row"><span>Status</span><ProvenanceBadge provenance="verified" /></div>
                <div className="verify-row !items-start"><span>Integrity reference</span><code className="mono break-all text-right text-[8px]">{report.hash}</code></div>
              </div>
            </section>
            <div className="notice mt-4">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              <span>Only issuing lab, document type, date and integrity reference are shown. Patient names, Health ID, CNIC, clinical values and timeline are withheld from this public link.</span>
            </div>
          </>
        ) : (
          <div className="card mt-10 p-6">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-600"><LockKeyhole size={19} /></div>
            <h1 className="mt-4 text-lg font-bold">Report not found</h1>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">This token does not match a seeded demo report. No patient data is disclosed.</p>
          </div>
        )}
        <div className="mt-6 text-[8px] text-slate-400">H.A.R.D · Verification prototype · No external certificate authority</div>
      </div>
    </main>
  );
}
