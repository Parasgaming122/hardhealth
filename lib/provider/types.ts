export interface RealPatientSummary {
  id: string;
  healthId: string;
  fullName: string;
  cnic: string | null;
  dob: string | null;
  bloodGroup: string | null;
  createdAt: string;
}

/** One medicine line of a prescription draft or saved template (brief 5.4 / 15). */
export interface PrescriptionItemDraft {
  medicine: string;
  strength?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity: number;
}

/** A doctor-owned saved set of common prescriptions (brief 7.2 / 15). */
export interface DoctorTemplateSummary {
  id: string;
  name: string;
  items: PrescriptionItemDraft[];
  updatedAt: string;
}

/** One of the calling doctor's recent prescriptions, for one-tap repeat (brief 7.2). */
export interface DoctorRecentPrescription {
  id: string;
  code: string;
  status: string;
  issuedAt: string;
  consultationCost: number;
  note: string | null;
  patientId: string;
  patientName: string;
  patientHealthId: string;
  items: PrescriptionItemDraft[];
}
