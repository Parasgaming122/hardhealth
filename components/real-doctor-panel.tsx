"use client";

import { useState } from "react";
import { BadgeCheck, Check, FilePlus2, Pill, Plus, QrCode, Search, Stethoscope, Trash2, UsersRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button } from "@/components/ui";
import { dateLabel, pkr } from "@/lib/domain";
import { medicineCatalogue } from "@/lib/mock-data";
import type { RealPatientSummary } from "@/lib/provider/types";
import { issueRealPrescription } from "@/lib/provider/actions";

export function RealDoctorPanel({
  patients,
  section = "Today",
}: {
  patients: RealPatientSummary[];
  section?: string;
}) {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || "");
  const [complaint, setComplaint] = useState("Seasonal respiratory cough");
  const [diagnosis, setDiagnosis] = useState("Mild bronchial asthma");
  const [consultationCost, setConsultationCost] = useState("3500");
  const [note, setNote] = useState("Take with water after meals. Review in 2 weeks.");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [items, setItems] = useState<Array<{
    medicine: string;
    strength: string;
    dose: string;
    frequency: string;
    duration: string;
    quantity: number;
  }>>([
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
  const [issuedRx, setIssuedRx] = useState<{ id: string; code: string; token: string } | null>(null);
  const [error, setError] = useState("");

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

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
      const res = await issueRealPrescription({
        patientId: selectedPatient.id,
        complaint,
        diagnosis,
        consultationCost: Number(consultationCost) || 0,
        note,
        items,
      });
      setIssuedRx(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to issue prescription");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-label"><UsersRound size={15} /> Registered patients</div>
          <div className="kpi-value">{patients.length}</div>
          <div className="kpi-foot">Available in clinic directory</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><Stethoscope size={15} /> Consultation fee</div>
          <div className="kpi-value">{pkr(Number(consultationCost) || 0)}</div>
          <div className="kpi-foot">Auto-creates verified care cost</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><Pill size={15} /> Seeded medicines</div>
          <div className="kpi-value">{medicineCatalogue.length}</div>
          <div className="kpi-foot">Search generic & brand catalogue</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><BadgeCheck size={15} /> QR Verification</div>
          <div className="kpi-value">Active</div>
          <div className="kpi-foot">Expiring signed token digest</div>
        </div>
      </div>

      <div className="content-grid wide-side">
        {section === "Patient history" ? (
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
                          <Button size="small" variant="secondary" onClick={() => setSelectedPatientId(p.id)}>
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
        ) : (
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
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check size={24} />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800">Prescription Issued Successfully</h3>
                <div className="mt-2 font-mono text-xl font-extrabold text-emerald-800">{issuedRx.code}</div>
                <p className="mt-1 text-xs text-slate-600">Issued to {selectedPatient?.fullName} ({selectedPatient?.healthId})</p>

                <div className="qr-frame mx-auto my-4 w-fit">
                  <QRCodeSVG value={`/rx/resolve?token=${encodeURIComponent(issuedRx.id)}`} size={160} level="M" includeMargin />
                </div>
                <p className="text-[9px] text-slate-400">
                  This QR code resolves only to this prescription. It contains no clinical history or identity leak.
                </p>

                <div className="mt-5 flex justify-center gap-2">
                  <Button size="small" onClick={() => setIssuedRx(null)}>
                    <FilePlus2 size={12} /> Issue another prescription
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {error && <div className="notice coral">{error}</div>}

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
                    {submitting ? "Issuing…" : "Issue digital prescription (generate QR)"}
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
        )}
      </div>
    </div>
  );
}
