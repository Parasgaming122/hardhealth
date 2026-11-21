export interface RealPatientSummary {
  id: string;
  healthId: string;
  fullName: string;
  cnic: string | null;
  dob: string | null;
  bloodGroup: string | null;
  createdAt: string;
  /** Normalized 0-prefixed digits (owner feedback 2026-11-21; null pre-migration). */
  phone?: string | null;
  /** Lowercase; when this person signs up with the same email the portal claims this row. */
  email?: string | null;
  /** True once a portal account is linked (user_id stamped). */
  hasAccount?: boolean;
}

/** One issued lab report row for the lab workspace "Reports issued" page. */
export interface LabReportSummary {
  id: string;
  testType: string;
  hash: string;
  fee: number;
  patientName: string;
  patientHealthId: string;
  testedAt: string;
  verifiedUrl: string;
}

/** One dispense the calling pharmacist performed (own actions only — narrow scope). */
export interface PharmacyDispenseRow {
  id: string;
  /** Internal: the dispensed prescription's row id (joins bills to dispenses). */
  prescriptionId?: string;
  prescriptionCode: string;
  patientName: string;
  patientHealthId: string;
  fillNumber: number;
  dispensedAt: string;
}

/** One pharmacy bill attached by the calling pharmacist (cost item the dispense created). */
export interface PharmacyBillRow {
  id: string;
  title: string;
  amount: number;
  prescriptionCode: string;
  patientName: string;
  patientHealthId: string;
  date: string;
}

export interface PharmacyActivity {
  dispenses: PharmacyDispenseRow[];
  bills: PharmacyBillRow[];
}

/** One registration/care receipt on the front-desk collections page. */
export interface FrontDeskCollectionRow {
  invoiceId: string;
  receiptNo: string;
  patientName: string;
  healthId: string;
  invoiceType: string;
  amount: number;
  providerShare: number | null;
  platformShare: number | null;
  paymentMethod: string;
  status: string;
  date: string;
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

/** One of the calling doctor's recent prescriptions, for one-tap repeat (brief 7.2)
 *  or amendment (brief Section 6: new version + cancel the old QR). */
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
  version: number;
  supersedesCode: string | null;
  items: PrescriptionItemDraft[];
}
