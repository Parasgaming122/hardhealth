"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, BadgeCheck, BookmarkPlus, Check, FileClock, FilePen, FilePlus2, History, LayoutTemplate, Pill, Plus, QrCode, Repeat, Search, Stethoscope, Trash2, UsersRound, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button } from "@/components/ui";
import { dateLabel, pkr } from "@/lib/domain";
import { medicineCatalogue } from "@/lib/mock-data";
import type { DoctorRecentPrescription, DoctorTemplateSummary, PrescriptionItemDraft, RealPatientSummary } from "@/lib/provider/types";
import { amendRealPrescription, issueRealPrescription } from "@/lib/provider/actions";
import { deleteDoctorTemplateAction, saveDoctorTemplateAction } from "@/lib/provider/template-actions";

export function RealDoctorPanel({
  patients,
  templates: initialTemplates = [],
  recentPrescriptions: initialRecentPrescriptions = [],
  doctorName = "Treating physician",
  providerName = "H.A.R.D Clinic",
  section = "Today",
}: {
  patients: RealPatientSummary[];
  templates?: DoctorTemplateSummary[];
  recentPrescriptions?: DoctorRecentPrescription[];
  doctorName?: string;
  providerName?: string;
  section?: string;
}) {
  const router = useRouter();
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || "");
  const [complaint, setComplaint] = useState("Seasonal respiratory cough");
  const [diagnosis, setDiagnosis] = useState("Mild bronchial asthma");
  const [consultationCost, setConsultationCost] = useState("3500");
  const [note, setNote] = useState("Take with water after meals. Review in 2 weeks.");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [items, setItems] = useState<PrescriptionItemDraft[]>([
    {
      medicine: "Montelukast · Singulair",
      strength: "10 mg tablet",
      dose: "1 tablet",
      frequency: "Once daily at night",
      duration: "14 days",
      quantity: 14,
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [issuedRx, setIssuedRx] = useState<{ id: string; code: string; token: string; version?: number; supersedesCode?: string } | null>(null);
  const [error, setError] = useState("");

  // Amendment mode (brief Section 6: editing an issued prescription creates a
  // new version and cancels the old QR; the old record is kept). When set, the
  // Issue button submits amendRealPrescription instead of a fresh issue.
  const [amending, setAmending] = useState<DoctorRecentPrescription | null>(null);
  const [amendStatus, setAmendStatus] = useState("");
  const [amendError, setAmendError] = useState("");

  // Saved templates (brief 7.2: saved sets of common prescriptions). Props sync
  // after revalidatePath per the D14 convention so saves/deletes refresh the chips.
  const [templates, setTemplates] = useState<DoctorTemplateSummary[]>(initialTemplates);
  useEffect(() => setTemplates(initialTemplates), [initialTemplates]);
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateStatus, setTemplateStatus] = useState("");
  const [templateError, setTemplateError] = useState("");

  // Recent prescriptions (brief 7.2: repeat-last-prescription). Props sync after
  // revalidatePath per the D14 convention so newly issued prescriptions appear here.
  const [recentPrescriptions, setRecentPrescriptions] = useState<DoctorRecentPrescription[]>(initialRecentPrescriptions);
  useEffect(() => setRecentPrescriptions(initialRecentPrescriptions), [initialRecentPrescriptions]);
  const [repeatStatus, setRepeatStatus] = useState("");
  const [repeatError, setRepeatError] = useState("");

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  // Brief 7.2: the selected patient's most recent prescription — surfaced as a
  // one-tap "repeat last" button above the full recent list.
  const lastForPatient = recentPrescriptions.find((rx) => rx.patientId === selectedPatientId);

  const handleAddMedicine = () => {
    if (!medicineQuery.trim()) return;
    const match = medicineCatalogue.find(
      (m) =>
        `${m.genericName} · ${m.brandName}`.toLowerCase().includes(medicineQuery.toLowerCase()) ||
        m.brandName.toLowerCase().includes(medicineQuery.toLowerCase())
    );

    const name = match ? `${match.genericName} · ${match.brandName}` : medicineQuery.trim();
    const strength = match ? match.strength : "1 tablet";

    setItems((prev) => [
      ...prev,
      {
        medicine: name,
        strength,
        dose: "1 tablet",
        frequency: "Twice daily",
        duration: "7 days",
        quantity: 14,
      },
    ]);
    setMedicineQuery("");
  };

  const handleIssue = async () => {
    if (!selectedPatient) {
      setError("Please select a registered patient.");
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one prescription item.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      if (amending) {
        const res = await amendRealPrescription({
          originalId: amending.id,
          patientId: selectedPatient.id,
          consultationCost: Number(consultationCost) || 0,
          note,
          items,
        });
        setIssuedRx(res);
      } else {
        const res = await issueRealPrescription({
          patientId: selectedPatient.id,
          complaint,
          diagnosis,
          consultationCost: Number(consultationCost) || 0,
          note,
          items,
        });
        setIssuedRx(res);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to issue prescription");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Template actions (brief 7.2: prescribe in under 30 seconds) ----

  const applyTemplate = (template: DoctorTemplateSummary) => {
    if (template.items.length === 0) {
      setTemplateError(`Template "${template.name}" has no usable medicines.`);
      setTemplateStatus("");
      return;
    }
    setItems(template.items.map((it) => ({ ...it })));
    setTemplateError("");
    setTemplateStatus(`Applied "${template.name}" — ${template.items.length} medicine${template.items.length === 1 ? "" : "s"} loaded. Review and issue.`);
  };

  // ---- Repeat-last-prescription (brief 7.2: prescribe in under 30 seconds) ----

  const applyRepeat = (rx: DoctorRecentPrescription) => {
    if (rx.items.length === 0) {
      setRepeatError(`"${rx.code}" has no medicine lines to repeat.`);
      setRepeatStatus("");
      return;
    }
    const switchedPatient = rx.patientId !== selectedPatientId;
    setSelectedPatientId(rx.patientId);
    setItems(rx.items.map((it) => ({ ...it })));
    if (rx.note) setNote(rx.note);
    if (rx.consultationCost > 0) setConsultationCost(String(rx.consultationCost));
    setAmending(null);
    setAmendStatus("");
    setAmendError("");
    setRepeatError("");
    setRepeatStatus(
      `Repeated ${rx.code} for ${rx.patientName} — ${rx.items.length} medicine${rx.items.length === 1 ? "" : "s"} loaded${switchedPatient ? " (patient switched)" : ""}. Complaint and diagnosis are not stored on the original — update them, then issue.`
    );
    // Owner feedback 2026-11-21: Repeat lives on the prescriptions pages — jump
    // to the composer so the loaded medicines are immediately visible.
    router.push("/doctor/prescriptions/new");
  };

  // ---- Amendments (brief Section 6: new version + cancel the old QR) ----

  const amendable = (rx: DoctorRecentPrescription) =>
    rx.status === "active" || rx.status === "partly_filled" || rx.status === "expired";

  const applyAmend = (rx: DoctorRecentPrescription) => {
    if (rx.items.length === 0) {
      setAmendError(`"${rx.code}" has no medicine lines to carry into an amendment.`);
      setAmendStatus("");
      return;
    }
    setSelectedPatientId(rx.patientId);
    setItems(rx.items.map((it) => ({ ...it })));
    if (rx.note) setNote(rx.note);
    if (rx.consultationCost > 0) setConsultationCost(String(rx.consultationCost));
    setAmending(rx);
    setRepeatError("");
    setRepeatStatus("");
    setAmendError("");
    setAmendStatus(
      `Amending ${rx.code} (v${rx.version}) for ${rx.patientName} — ${rx.items.length} medicine${rx.items.length === 1 ? "" : "s"} loaded. Issuing will cancel the original QR and issue v${rx.version + 1}; the old record stays in the history. The consultation fee is not re-charged.`
    );
    // Owner feedback 2026-11-21: Amend lives on the prescriptions pages — jump
    // to the composer where the amber amendment banner shows.
    router.push("/doctor/prescriptions/new");
  };

  const cancelAmend = () => {
    setAmending(null);
    setAmendStatus("");
    setAmendError("");
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      setTemplateError("Give the template a name first (e.g. \"Asthma follow-up\").");
      setTemplateStatus("");
      return;
    }
    if (items.length === 0) {
      setTemplateError("Add at least one medicine before saving a template.");
      setTemplateStatus("");
      return;
    }
    setTemplateError("");
    setTemplateStatus("");
    setTemplateBusy(true);
    try {
      const res = await saveDoctorTemplateAction({ name, items });
      setTemplateName("");
      setTemplateStatus(`Saved template "${res.name}". Saving again with the same name overwrites it.`);
    } catch (err: unknown) {
      setTemplateError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleDeleteTemplate = async (template: DoctorTemplateSummary) => {
    setTemplateError("");
    setTemplateStatus("");
    setTemplateBusy(true);
    try {
      const res = await deleteDoctorTemplateAction(template.id);
      setTemplateStatus(`Deleted template "${res.name}".`);
    } catch (err: unknown) {
      setTemplateError(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setTemplateBusy(false);
    }
  };

  // Owner feedback 2026-11-21: the doctor workspace's overview, new-prescription
  // and prescriptions pages all rendered the SAME "Digital prescription tool"
  // card. Each page now renders distinct content; the composer lives only on
  // "New prescription".
  const isOverview = section === "Today";
  const isDirectory = section === "Patient history";
  const isRxHistory = section === "Recent prescriptions";

  /** The recent-prescriptions list — reused by the composer (repeat strip),
   *  the prescriptions page (full) and the overview (top few, read-only). */
  const renderRecentPrescriptions = (limit?: number, readOnly = false) => {
    const rxs = typeof limit === "number" ? recentPrescriptions.slice(0, limit) : recentPrescriptions;
    return (
      <div className="pt-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">Recent prescriptions ({recentPrescriptions.length})</div>
          <div className="text-[10px] text-slate-400">Repeat loads the same medicines onto a new prescription</div>
        </div>

        {recentPrescriptions.length === 0 ? (
          <div className="text-[10px] text-slate-400">
            Nothing to repeat yet — prescriptions you issue appear in this list for one-tap reuse.
          </div>
        ) : (
          <div className="space-y-1.5">
            {lastForPatient && !readOnly && (
              <button
                type="button"
                title={`Repeat ${lastForPatient.code} for ${lastForPatient.patientName}`}
                className="flex w-full items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-left transition-colors hover:bg-emerald-100"
                onClick={() => applyRepeat(lastForPatient)}
              >
                <span className="flex items-center gap-2">
                  <History size={13} className="shrink-0 text-emerald-700" />
                  <span>
                    <span className="block text-xs font-bold text-emerald-900">
                      Repeat last prescription for {lastForPatient.patientName}
                    </span>
                    <span className="block text-[10px] text-emerald-800/80">
                      {lastForPatient.code} · {dateLabel(lastForPatient.issuedAt)} · {lastForPatient.items.length} medicine{lastForPatient.items.length === 1 ? "" : "s"} · {pkr(lastForPatient.consultationCost)}
                    </span>
                  </span>
                </span>
                <Repeat size={14} className="shrink-0 text-emerald-700" />
              </button>
            )}

            {rxs.map((rx) => (
              <div key={rx.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-800">{rx.code}</span>
                  <span className="text-slate-500"> — {rx.patientName} ({rx.patientHealthId})</span>
                  <div className="text-[10px] text-slate-400">
                    {dateLabel(rx.issuedAt)} · v{rx.version}{rx.supersedesCode ? ` · replaces ${rx.supersedesCode}` : ""} · {rx.items.length} medicine{rx.items.length === 1 ? "" : "s"} · status {rx.status} · {pkr(rx.consultationCost)}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="small"
                      variant="secondary"
                      title={
                        amendable(rx)
                          ? `Amend ${rx.code}: cancel its QR and issue a corrected version`
                          : rx.status === "cancelled"
                            ? "Already superseded by an amendment — amend the newest version instead"
                            : "Already fully dispensed — issue a new prescription instead"
                      }
                      disabled={!amendable(rx)}
                      onClick={() => applyAmend(rx)}
                    >
                      <FilePen size={11} /> Amend
                    </Button>
                    <Button size="small" variant="secondary" onClick={() => applyRepeat(rx)}>
                      <Repeat size={11} /> Repeat
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && repeatError && <div className="notice coral mt-2">{repeatError}</div>}
        {!readOnly && repeatStatus && <div className="notice mt-2">{repeatStatus}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {isOverview && (
        <div className="kpi-grid">
          <div className="card kpi">
            <div className="kpi-label"><UsersRound size={15} /> Registered patients</div>
            <div className="kpi-value">{patients.length}</div>
            <div className="kpi-foot">Available in clinic directory</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label"><Pill size={15} /> Prescriptions issued</div>
            <div className="kpi-value">{recentPrescriptions.length}</div>
            <div className="kpi-foot">Your recent issuing history</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label"><BadgeCheck size={15} /> Saved templates</div>
            <div className="kpi-value">{templates.length}</div>
            <div className="kpi-foot">One-tap repeat prescribing</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label"><Stethoscope size={15} /> Default fee</div>
            <div className="kpi-value">{pkr(Number(consultationCost) || 0)}</div>
            <div className="kpi-foot">Posted to the patient cost record</div>
          </div>
        </div>
      )}

      {isOverview ? (
        <div className="content-grid wide-side">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Doctor quick actions</h2>
                <div className="card-caption">Prescribe in under 30 seconds with templates and repeats</div>
              </div>
            </div>
            <div className="card-body space-y-2">
              <a href="/doctor/prescriptions/new" className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 no-underline">
                <span className="flex items-center gap-2.5">
                  <FilePlus2 size={16} className="text-emerald-700" />
                  <span>
                    <span className="block text-xs font-bold text-emerald-900">Write a new prescription</span>
                    <span className="block text-[10px] text-emerald-800/80">Digital issuing with QR · printable sheet</span>
                  </span>
                </span>
                <span className="text-[10px] font-bold text-emerald-700">Open →</span>
              </a>
              <a href="/doctor/patients" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                <span className="flex items-center gap-2.5">
                  <UsersRound size={16} className="text-slate-600" />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Patient clinical directory</span>
                    <span className="block text-[10px] text-slate-500">{patients.length} patients · search by Health ID, CNIC or name</span>
                  </span>
                </span>
                <span className="text-[10px] font-bold text-slate-500">Open →</span>
              </a>
              <a href="/doctor/prescriptions" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 no-underline">
                <span className="flex items-center gap-2.5">
                  <FileClock size={16} className="text-slate-600" />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Recent prescriptions</span>
                    <span className="block text-[10px] text-slate-500">{recentPrescriptions.length} issued · repeat or amend any of them</span>
                  </span>
                </span>
                <span className="text-[10px] font-bold text-slate-500">Open →</span>
              </a>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Latest prescriptions</h2>
                <div className="card-caption">Newest from your issuing history</div>
              </div>
              <Badge type="verified">Audit locked</Badge>
            </div>
            <div className="card-body">
              {renderRecentPrescriptions(4, true)}
            </div>
          </section>
        </div>
      ) : isDirectory ? (
        <div className="content-grid wide-side">
          <section className="card col-span-full">
            <div className="card-head">
              <div>
                <h2 className="card-title">Patient clinical directory</h2>
                <div className="card-caption">Search linked patients by Health ID, CNIC or name</div>
              </div>
              <Badge type="verified">{patients.length} linked patients</Badge>
            </div>
            <div className="card-body">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Health ID</th>
                      <th>Patient Name</th>
                      <th>Blood Group</th>
                      <th>Registered</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr key={p.id}>
                        <td className="mono font-bold text-emerald-800">{p.healthId}</td>
                        <td><strong>{p.fullName}</strong></td>
                        <td>{p.bloodGroup || "O+"}</td>
                        <td className="text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td>
                          <Button size="small" variant="secondary" onClick={() => { setSelectedPatientId(p.id); router.push("/doctor/prescriptions/new"); }}>
                            Select for prescription
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {patients.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center p-6 text-slate-400 text-xs">No registered patients found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : isRxHistory ? (
        <div className="content-grid wide-side">
          <section className="card col-span-full">
            <div className="card-head">
              <div>
                <h2 className="card-title">Recent prescriptions</h2>
                <div className="card-caption">Your issuing history — repeat loads the medicines onto a new prescription, amend cancels the old QR and issues a corrected version</div>
              </div>
              <Badge type="verified">{recentPrescriptions.length} issued</Badge>
            </div>
            <div className="card-body">
              {renderRecentPrescriptions()}
            </div>
          </section>
        </div>
      ) : (
        <div className="content-grid wide-side">
          <>
            {/* Prescription Form / Issued Screen */}
            <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Digital prescription tool</h2>
              <div className="card-caption">Legible digital issuing with unique QR code</div>
            </div>
          </div>
          <div className="card-body">
            {issuedRx ? (
              <div>
                {/* P2-6 (brief 5.4.4 / 6): printable prescription with QR — rendered
                    only when printing; the on-screen success card stays interactive. */}
                <div className="print-sheet" aria-hidden="true">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f766e", paddingBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{providerName}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>Verified digital prescription · H.A.R.D (Healthcare Accounting &amp; Record Keeping)</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: "#0f766e" }}>
                        {issuedRx.code}{issuedRx.version && issuedRx.version > 1 ? ` · v${issuedRx.version}` : ""}
                      </div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>Issued {dateLabel(new Date().toISOString())}</div>
                      {issuedRx.version && issuedRx.version > 1 && issuedRx.supersedesCode ? (
                        <div style={{ fontSize: 9, color: "#b45309", marginTop: 2 }}>Supersedes {issuedRx.supersedesCode} (QR cancelled)</div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 24, marginTop: 14, fontSize: 11, color: "#0f172a" }}>
                    <div><strong>Patient:</strong> {selectedPatient?.fullName} ({selectedPatient?.healthId})</div>
                    <div><strong>Doctor:</strong> {doctorName}</div>
                    <div><strong>Complaint:</strong> {complaint}</div>
                    <div><strong>Diagnosis:</strong> {diagnosis}</div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, fontSize: 11 }}>
                    <thead>
                      <tr>
                        {["Medicine", "Strength", "Dose", "Frequency", "Duration", "Qty"].map((h) => (
                          <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "6px 8px", background: "#f8fafc", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "#475569" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px", fontWeight: 700 }}>{it.medicine}</td>
                          <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{it.strength}</td>
                          <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{it.dose}</td>
                          <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{it.frequency}</td>
                          <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{it.duration}</td>
                          <td style={{ borderBottom: "1px solid #e2e8f0", padding: "6px 8px" }}>{it.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
                    <div style={{ fontSize: 11, color: "#334155", maxWidth: 420 }}>
                      {note && <div><strong>Notes:</strong> {note}</div>}
                      {Number(consultationCost) > 0 && <div style={{ marginTop: 4 }}><strong>Consultation fee:</strong> {pkr(Number(consultationCost))} (posted to the patient's cost record)</div>}
                      <div style={{ marginTop: 6, fontSize: 9, color: "#64748b" }}>
                        Verify this prescription by scanning the QR or entering the code at any H.A.R.D pharmacy.
                        The QR carries no personal or medical data — it resolves only to this prescription.
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <QRCodeSVG value={`/rx/resolve?token=${encodeURIComponent(issuedRx.id)}`} size={110} level="M" />
                      <div style={{ fontSize: 9, color: "#64748b", marginTop: 4 }}>Scan to verify</div>
                    </div>
                    <div style={{ textAlign: "center", marginTop: 56 }}>
                      <div style={{ width: 180, borderTop: "1px solid #94a3b8", paddingTop: 4, fontSize: 10, color: "#475569" }}>{doctorName}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                    <Check size={24} />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-slate-800">Prescription Issued Successfully</h3>
                  <div className="mt-2 font-mono text-xl font-extrabold text-emerald-800">{issuedRx.code}</div>
                  {issuedRx.version && issuedRx.version > 1 ? (
                    <p className="mt-1 text-[11px] font-semibold text-amber-700">
                      Version {issuedRx.version} — replaces {issuedRx.supersedesCode} (its QR is now cancelled; the old record remains in the history)
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-600">Issued to {selectedPatient?.fullName} ({selectedPatient?.healthId})</p>

                  <div className="qr-frame mx-auto my-4 w-fit">
                    <QRCodeSVG value={`/rx/resolve?token=${encodeURIComponent(issuedRx.id)}`} size={160} level="M" includeMargin />
                  </div>
                  <p className="text-[9px] text-slate-400">
                    This QR code resolves only to this prescription. It contains no clinical history or identity leak.
                  </p>

                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button size="small" onClick={() => { setAmending(null); setAmendStatus(""); setAmendError(""); setIssuedRx(null); }}>
                      <FilePlus2 size={12} /> Issue another prescription
                    </Button>
                    <Button size="small" variant="secondary" onClick={() => window.print()}>
                      <Printer size={12} /> Print prescription (PDF)
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {error && <div className="notice coral">{error}</div>}

                {/* Amendment banner (brief Section 6) — the composer is correcting
                    an issued prescription; issuing will cancel the old QR. */}
                {amending && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <FilePen size={15} className="mt-0.5 shrink-0 text-amber-700" />
                        <div className="text-xs leading-5 text-amber-900">
                          <strong>Amending {amending.code} (v{amending.version}) for {amending.patientName}.</strong>{" "}
                          Issuing will cancel the original QR/code and issue <strong>v{amending.version + 1}</strong> — the old record
                          stays in the history and the consultation fee is not re-charged.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                        onClick={cancelAmend}
                      >
                        Cancel amendment
                      </button>
                    </div>
                    {amendStatus && <div className="notice mt-2">{amendStatus}</div>}
                    {amendError && <div className="notice coral mt-2">{amendError}</div>}
                  </div>
                )}

                {/* Patient Selector */}
                <div className="field">
                  <label>Select registered patient *</label>
                  {patients.length === 0 ? (
                    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                      No patients registered in the database yet. Use Front Desk to register a patient first.
                    </div>
                  ) : (
                    <select
                      aria-label="Select registered patient"
                      className="select"
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                    >
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} · {p.healthId} ({p.bloodGroup || "O+"})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Chief complaint</label>
                    <input className="input" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Diagnosis</label>
                    <input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Consultation fee (PKR)</label>
                    <input className="input" type="number" value={consultationCost} onChange={(e) => setConsultationCost(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Clinical notes</label>
                    <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </div>

                {/* Saved templates (brief 7.2 — prescribe in under 30 seconds) */}
                <div className="pt-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800">Saved templates ({templates.length})</div>
                    <div className="text-[10px] text-slate-400">Tap to load · one tap, full prescription</div>
                  </div>

                  {templates.length === 0 ? (
                    <div className="text-[10px] text-slate-400">
                      No templates saved yet. Build a prescription below and save it as a named template —
                      next time the same case walks in, one tap refills the medicines.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {templates.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center overflow-hidden rounded-full border border-emerald-100 bg-emerald-50 text-emerald-900"
                        >
                          <button
                            type="button"
                            disabled={templateBusy}
                            title={`Load ${t.items.length} medicine${t.items.length === 1 ? "" : "s"} into this prescription`}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
                            onClick={() => applyTemplate(t)}
                          >
                            <LayoutTemplate size={11} />
                            {t.name} · {t.items.length} med{t.items.length === 1 ? "" : "s"}
                          </button>
                          <button
                            type="button"
                            disabled={templateBusy}
                            aria-label={`Delete template ${t.name}`}
                            className="border-l border-emerald-100 px-2 py-1.5 text-emerald-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            onClick={() => handleDeleteTemplate(t)}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex gap-2">
                    <input
                      className="input !text-xs"
                      placeholder="Template name (e.g. Asthma follow-up)"
                      value={templateName}
                      maxLength={80}
                      onChange={(e) => setTemplateName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveTemplate(); } }}
                    />
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={templateBusy || items.length === 0}
                      onClick={handleSaveTemplate}
                    >
                      <BookmarkPlus size={12} /> {templateBusy ? "Working…" : "Save current items as template"}
                    </Button>
                  </div>

                  {templateError && <div className="notice coral mt-2">{templateError}</div>}
                  {templateStatus && <div className="notice mt-2">{templateStatus}</div>}
                </div>

                {/* Repeat-last-prescription (brief 7.2 — prescribe in under 30 seconds) */}
                {renderRecentPrescriptions()}

                {/* Medicine Items */}
                <div className="pt-2">
                  <div className="mb-2 text-xs font-bold text-slate-800">Prescription medicines ({items.length})</div>
                  <div className="flex gap-2">
                    <input
                      className="input !text-xs"
                      placeholder="Search medicine (e.g. Paracetamol, Augmentin, Ventolin)"
                      value={medicineQuery}
                      onChange={(e) => setMedicineQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddMedicine(); } }}
                    />
                    <Button variant="secondary" onClick={handleAddMedicine}>
                      <Plus size={13} /> Add
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs">
                        <div>
                          <strong>{it.medicine}</strong>
                          <div className="text-[10px] text-slate-500">{it.strength} · {it.dose} · {it.frequency} ({it.duration})</div>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Button disabled={submitting || !selectedPatient || items.length === 0} onClick={handleIssue}>
                    {submitting
                      ? "Issuing…"
                      : amending
                        ? `Issue amended prescription v${amending.version + 1} (cancels ${amending.code})`
                        : "Issue digital prescription (generate QR)"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Selected Patient Information Card */}
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Patient file</h2>
              <div className="card-caption">Real database account identity</div>
            </div>
            <Badge type="verified">Verified link</Badge>
          </div>
          <div className="card-body space-y-3">
            {selectedPatient ? (
              <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                <div className="font-mono text-sm font-extrabold text-emerald-800">{selectedPatient.healthId}</div>
                <div className="text-base font-bold text-slate-800">{selectedPatient.fullName}</div>
                <div className="text-[10px] text-slate-500">Blood group: <strong>{selectedPatient.bloodGroup || "O+"}</strong></div>
                <div className="text-[9px] text-slate-400">Registered on {new Date(selectedPatient.createdAt).toLocaleDateString()}</div>
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-400">No patient selected.</div>
            )}
            <div className="notice mt-4">
              <Stethoscope size={14} className="shrink-0" />
              <span>Prescriptions issued here are cryptographically hashed and instantly visible in the patient's personal portal.</span>
            </div>
          </div>
        </section>
          </>
        </div>
      )}
    </div>
  );
}
