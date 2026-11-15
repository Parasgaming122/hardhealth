export type Role = "patient" | "doctor" | "frontDesk" | "pharmacy" | "lab" | "providerAdmin" | "platformAdmin";
export type Provenance = "verified" | "ai-confirmed" | "self-reported";
export type CostCategory = "Consultation" | "Test" | "Medicine" | "Procedure" | "Admission" | "Other";
export type RxStatus = "active" | "partly_filled" | "dispensed" | "expired" | "cancelled";

export interface Patient {
  id: string;
  fullName: string;
  initials: string;
  healthId: string;
  cnic: string;
  dob: string;
  gender: string;
  phone: string;
  bloodGroup: string;
  heightCm: number;
  weightKg: number;
  emergencyContact: string;
  identityCheck: "desk_checked" | "unchecked";
  providerLink: "active" | "revoked";
  storageUsedMb: number;
  storageQuotaMb: number;
  storagePlan: "Base" | "Plus" | "Pro";
  monthlyBudget: number;
  allergies: string[];
  conditions: string[];
  createdAt: string;
}

export interface Visit {
  id: string;
  patientId: string;
  provider: string;
  doctor: string;
  date: string;
  complaint: string;
  diagnosis: string;
  notes: string;
  isSensitive: boolean;
  provenance: Provenance;
}

export interface RxItem {
  id: string;
  medicine: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  quantity: number;
}

export interface Prescription {
  id: string;
  code: string;
  shortCode: string;
  token: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  doctor: string;
  provider: string;
  date: string;
  expiresAt: string;
  status: RxStatus;
  fillsUsed: number;
  maxFills: number;
  version: number;
  items: RxItem[];
  note: string;
  visitId: string;
  consultationCost: number;
}

export interface CostItem {
  id: string;
  patientId: string;
  providerId: string;
  provider: string;
  title: string;
  category: CostCategory;
  amount: number;
  coveredAmount: number;
  date: string;
  paymentStatus: "paid" | "pending" | "partly_covered";
  source: string;
  linkedType: "visit" | "prescription" | "lab_report" | "bill" | "manual" | "invoice";
  linkedId: string;
  provenance: Provenance;
}

export interface Invoice {
  id: string;
  patientId: string;
  patientName: string;
  type: "registration" | "renewal" | "upgrade" | "outstanding";
  amount: number;
  status: "paid" | "outstanding";
  method?: "Cash" | "Card" | "Wallet";
  receiptNo?: string;
  planName?: "Base" | "Plus" | "Pro";
  date: string;
  collectedBy: string;
}

export interface LedgerSplit {
  id: string;
  invoiceId: string;
  patientName: string;
  date: string;
  amount: number;
  providerAmount: number;
  platformAmount: number;
  sharePercent: number;
  payoutStatus: "Pending" | "Settled";
}

export interface AccessLog {
  id: string;
  patientId: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  date: string;
  kind: "normal_read" | "pharmacy_resolve" | "dispense" | "emergency" | "court" | "write";
}

export interface LabReport {
  id: string;
  token: string;
  patientId: string;
  patientName: string;
  lab: string;
  testType: string;
  date: string;
  values: { name: string; value: string; unit: string; range: string; flag?: "high" | "low" }[];
  notes: string;
  hash: string;
  amount: number;
  status: "verified" | "pending";
}

export interface Provider {
  id: string;
  name: string;
  type: "Clinic" | "Hospital" | "Lab" | "Pharmacy";
  status: "approved" | "pending" | "rejected";
  license: string;
  location: string;
  collected: number;
  share: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export interface DemoConfig {
  registrationFee: number;
  renewalFee: number;
  providerSharePercent: number;
  storageAlertPercent: number;
  prescriptionValidityDays: number;
  prescriptionMaxFills: number;
  plans: { name: "Base" | "Plus" | "Pro"; quotaMb: number; yearlyPrice: number }[];
  monthlyBudget: number;
}

export interface DemoData {
  patients: Patient[];
  visits: Visit[];
  prescriptions: Prescription[];
  costs: CostItem[];
  invoices: Invoice[];
  ledger: LedgerSplit[];
  accessLogs: AccessLog[];
  labReports: LabReport[];
  providers: Provider[];
  notifications: NotificationItem[];
  config: DemoConfig;
}

export const ROLE_LABELS: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  frontDesk: "Front desk",
  pharmacy: "Pharmacy",
  lab: "Lab tech",
  providerAdmin: "Provider admin",
  platformAdmin: "Platform admin",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  patient: "See spending, records and access",
  doctor: "Review linked patients and prescribe",
  frontDesk: "Register patients and collect fees",
  pharmacy: "Resolve one prescription and dispense",
  lab: "Issue and verify test reports",
  providerAdmin: "Review earnings and operations",
  platformAdmin: "Manage approvals and aggregate finance",
};

export const INITIAL_CONFIG: DemoConfig = {
  registrationFee: 500,
  renewalFee: 400,
  providerSharePercent: 30,
  storageAlertPercent: 80,
  prescriptionValidityDays: 30,
  prescriptionMaxFills: 1,
  monthlyBudget: 18000,
  plans: [
    { name: "Base", quotaMb: 1024, yearlyPrice: 500 },
    { name: "Plus", quotaMb: 5120, yearlyPrice: 1000 },
    { name: "Pro", quotaMb: 20480, yearlyPrice: 2500 },
  ],
};

export const pkr = (amount: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("PKR", "PKR");

export const compactPkr = (amount: number) =>
  amount >= 1000000
    ? `PKR ${(amount / 1000000).toFixed(1)}m`
    : amount >= 1000
      ? `PKR ${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`
      : pkr(amount);

export const dateLabel = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-PK", options ?? { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export const relativeDate = (value: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return dateLabel(value, { day: "numeric", month: "short" });
};

export const yearsOld = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
};

export const ageRange = (age: number) => `${Math.floor(age / 10) * 10}–${Math.floor(age / 10) * 10 + 9}`;
