export interface RealPatientRecord {
  id: string;
  userId: string | null;
  healthId: string;
  fullName: string;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  heightCm?: number;
  weightKg?: number;
  emergencyContact?: string;
  storagePlan?: string;
  storageUsedMb?: number;
  storageQuotaMb?: number;
}

export interface RealCostItem {
  id: string;
  title: string;
  category: "Consultation" | "Test" | "Medicine" | "Procedure" | "Admission" | "Other";
  amount: number;
  provenance: "verified" | "ai-confirmed" | "self-reported";
  date: string;
  provider: string;
  paymentStatus: "paid" | "pending" | "partly_covered";
}

export interface RealPrescriptionItem {
  id: string;
  medicine: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  quantity: number;
}

export interface RealPrescription {
  id: string;
  code: string;
  doctor: string;
  provider: string;
  status: "active" | "partly_filled" | "dispensed" | "expired" | "cancelled";
  date: string;
  expiresAt: string;
  maxFills: number;
  fillsUsed: number;
  consultationCost: number;
  items: RealPrescriptionItem[];
}

export interface RealLabReport {
  id: string;
  testType: string;
  date: string;
  lab: string;
  hash: string;
  token: string;
  results?: Array<{ name: string; value: string; unit: string; range: string }>;
}

export interface RealInvoice {
  id: string;
  type: string;
  amount: number;
  status: "paid" | "outstanding" | "cancelled";
  receiptNo: string | null;
  date: string;
}

export interface RealAccessLog {
  id: string;
  date: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  kind: string;
}

export interface RealPatientPortalData {
  patient: RealPatientRecord;
  costs: RealCostItem[];
  prescriptions: RealPrescription[];
  labReports: RealLabReport[];
  invoices: RealInvoice[];
  accessLogs: RealAccessLog[];
  providers: Array<{ id: string; name: string; type: string; location: string; status: string }>;
}
