import type { AccessLog, CostItem, DemoData, Invoice, LabReport, Patient, Prescription, Provider, Visit } from "./domain";
import { INITIAL_CONFIG } from "./domain";

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const patients: Patient[] = [
  {
    id: "p-1001", fullName: "Amna Siddiqui", initials: "AS", healthId: "HARD-000121", cnic: "35202-1111111-1", dob: "1994-03-18", gender: "Female", phone: "+92 300 555 0181", bloodGroup: "B+", heightCm: 163, weightKg: 59, emergencyContact: "Farah Siddiqui · +92 300 555 0121", identityCheck: "desk_checked", providerLink: "active", storageUsedMb: 1024, storageQuotaMb: 1024, storagePlan: "Base", monthlyBudget: 18000, allergies: ["Penicillin"], conditions: ["Seasonal asthma"], createdAt: daysAgo(220),
  },
  {
    id: "p-1002", fullName: "Bilal Ahmed", initials: "BA", healthId: "HARD-000117", cnic: "35202-2222222-2", dob: "1987-08-07", gender: "Male", phone: "+92 301 555 0177", bloodGroup: "O+", heightCm: 174, weightKg: 78, emergencyContact: "Nadia Ahmed · +92 301 555 0120", identityCheck: "desk_checked", providerLink: "active", storageUsedMb: 1009, storageQuotaMb: 1024, storagePlan: "Base", monthlyBudget: 24000, allergies: ["None known"], conditions: ["Hypertension"], createdAt: daysAgo(320),
  },
  {
    id: "p-1003", fullName: "Zainab Noor", initials: "ZN", healthId: "HARD-000109", cnic: "35202-3333333-3", dob: "2001-11-23", gender: "Female", phone: "+92 302 555 0109", bloodGroup: "A-", heightCm: 158, weightKg: 53, emergencyContact: "Maham Noor · +92 302 555 0110", identityCheck: "desk_checked", providerLink: "active", storageUsedMb: 1820, storageQuotaMb: 5120, storagePlan: "Plus", monthlyBudget: 12000, allergies: ["Latex"], conditions: ["Iron deficiency"], createdAt: daysAgo(420),
  },
  {
    id: "p-1004", fullName: "Hammad Shah", initials: "HS", healthId: "HARD-000096", cnic: "35202-4444444-4", dob: "1974-01-12", gender: "Male", phone: "+92 303 555 0096", bloodGroup: "AB+", heightCm: 178, weightKg: 83, emergencyContact: "Iram Shah · +92 303 555 0140", identityCheck: "desk_checked", providerLink: "active", storageUsedMb: 2470, storageQuotaMb: 5120, storagePlan: "Plus", monthlyBudget: 30000, allergies: ["Sulfa"], conditions: ["Type 2 diabetes"], createdAt: daysAgo(620),
  },
  {
    id: "p-1005", fullName: "Noor Fatima", initials: "NF", healthId: "HARD-000088", cnic: "35202-5555555-5", dob: "1968-06-04", gender: "Female", phone: "+92 304 555 0088", bloodGroup: "O-", heightCm: 155, weightKg: 66, emergencyContact: "Adeel Fatima · +92 304 555 0188", identityCheck: "desk_checked", providerLink: "active", storageUsedMb: 18880, storageQuotaMb: 20480, storagePlan: "Pro", monthlyBudget: 45000, allergies: ["Aspirin"], conditions: ["Osteoarthritis", "Type 2 diabetes"], createdAt: daysAgo(900),
  },
];

const visits: Visit[] = [
  { id: "visit-1", patientId: "p-1001", provider: "Cedar Medical Centre", doctor: "Dr. Sara Malik", date: daysAgo(3), complaint: "Seasonal cough and wheeze", diagnosis: "Mild seasonal asthma", notes: "Continue inhaler as needed. Review in 4 weeks if symptoms persist.", isSensitive: false, provenance: "verified" },
  { id: "visit-2", patientId: "p-1001", provider: "Cedar Medical Centre", doctor: "Dr. Sara Malik", date: daysAgo(44), complaint: "Annual wellness review", diagnosis: "Routine follow-up", notes: "Vitals stable; maintain hydration and follow-up schedule.", isSensitive: false, provenance: "verified" },
  { id: "visit-3", patientId: "p-1002", provider: "Cedar Medical Centre", doctor: "Dr. Sara Malik", date: daysAgo(9), complaint: "Headache after missed dose", diagnosis: "Blood pressure review", notes: "Home readings requested for next visit.", isSensitive: false, provenance: "verified" },
  { id: "visit-4", patientId: "p-1003", provider: "Cedar Medical Centre", doctor: "Dr. Omar Raza", date: daysAgo(18), complaint: "Fatigue", diagnosis: "Iron deficiency follow-up", notes: "Repeat CBC in eight weeks.", isSensitive: false, provenance: "verified" },
  { id: "visit-5", patientId: "p-1004", provider: "Cedar Medical Centre", doctor: "Dr. Sara Malik", date: daysAgo(27), complaint: "Diabetes follow-up", diagnosis: "Type 2 diabetes review", notes: "Discussed glucose readings and meal plan.", isSensitive: true, provenance: "verified" },
];

const prescriptions: Prescription[] = [
  {
    id: "rx-1001", code: "RX-7F3K-92QD", shortCode: "7F3K92QD1A", token: "d_48a7b12f0e", patientId: "p-1001", patientName: "Amna Siddiqui", patientAge: 32, doctor: "Dr. Sara Malik", provider: "Cedar Medical Centre", date: daysAgo(3), expiresAt: daysAgo(-27), status: "active", fillsUsed: 0, maxFills: 1, version: 1,
    items: [
      { id: "rx-item-1", medicine: "Montelukast · Singulair", strength: "10 mg tablet", dose: "1 tablet", frequency: "Once daily at night", duration: "14 days", quantity: 14 },
      { id: "rx-item-2", medicine: "Salbutamol · Ventolin", strength: "100 mcg inhaler", dose: "2 puffs", frequency: "As needed", duration: "30 days", quantity: 1 },
    ], note: "Take with water. Bring the inhaler to your next visit.", visitId: "visit-1", consultationCost: 3500,
  },
  {
    id: "rx-1002", code: "RX-2K8M-41QT", shortCode: "2K8M41QT3B", token: "d_c2398ff410", patientId: "p-1002", patientName: "Bilal Ahmed", patientAge: 39, doctor: "Dr. Sara Malik", provider: "Cedar Medical Centre", date: daysAgo(9), expiresAt: daysAgo(-21), status: "partly_filled", fillsUsed: 1, maxFills: 2, version: 1,
    items: [{ id: "rx-item-3", medicine: "Amlodipine · Norvasc", strength: "5 mg tablet", dose: "1 tablet", frequency: "Once daily", duration: "30 days", quantity: 30 }], note: "Review home blood pressure readings at follow-up.", visitId: "visit-3", consultationCost: 3500,
  },
  {
    id: "rx-1003", code: "RX-4J1P-76BX", shortCode: "4J1P76BX5C", token: "d_95900d36ff", patientId: "p-1003", patientName: "Zainab Noor", patientAge: 24, doctor: "Dr. Omar Raza", provider: "Cedar Medical Centre", date: daysAgo(18), expiresAt: daysAgo(-12), status: "dispensed", fillsUsed: 1, maxFills: 1, version: 1,
    items: [{ id: "rx-item-4", medicine: "Ferrous sulfate · Fero-Grad", strength: "325 mg tablet", dose: "1 tablet", frequency: "Once daily with food", duration: "30 days", quantity: 30 }], note: "Avoid taking with tea or coffee.", visitId: "visit-4", consultationCost: 3200,
  },
];

const costs: CostItem[] = [
  { id: "cost-1", patientId: "p-1001", providerId: "clinic-1", provider: "Cedar Medical Centre", title: "Consultation · Dr. Sara Malik", category: "Consultation", amount: 3500, coveredAmount: 0, date: daysAgo(3), paymentStatus: "paid", source: "Verified visit", linkedType: "visit", linkedId: "visit-1", provenance: "verified" },
  { id: "cost-2", patientId: "p-1001", providerId: "lab-1", provider: "Northstar Diagnostics", title: "CBC with differential", category: "Test", amount: 2400, coveredAmount: 0, date: daysAgo(6), paymentStatus: "paid", source: "Verified report", linkedType: "lab_report", linkedId: "lab-1", provenance: "verified" },
  { id: "cost-3", patientId: "p-1001", providerId: "pharmacy-1", provider: "Green Cross Pharmacy", title: "Respiratory medicines", category: "Medicine", amount: 6250, coveredAmount: 0, date: daysAgo(10), paymentStatus: "paid", source: "Prescription bill", linkedType: "bill", linkedId: "bill-1", provenance: "verified" },
  { id: "cost-4", patientId: "p-1001", providerId: "clinic-1", provider: "Cedar Medical Centre", title: "Wellness consultation", category: "Consultation", amount: 3000, coveredAmount: 0, date: daysAgo(44), paymentStatus: "paid", source: "Verified visit", linkedType: "visit", linkedId: "visit-2", provenance: "verified" },
  { id: "cost-5", patientId: "p-1001", providerId: "lab-1", provider: "Northstar Diagnostics", title: "Vitamin D panel", category: "Test", amount: 4200, coveredAmount: 0, date: daysAgo(96), paymentStatus: "paid", source: "Verified report", linkedType: "lab_report", linkedId: "lab-2", provenance: "verified" },
  { id: "cost-6", patientId: "p-1001", providerId: "manual", provider: "Self-reported", title: "Travel to clinic", category: "Other", amount: 800, coveredAmount: 0, date: daysAgo(3), paymentStatus: "paid", source: "Patient entry", linkedType: "manual", linkedId: "manual-1", provenance: "self-reported" },
  { id: "cost-7", patientId: "p-1002", providerId: "clinic-1", provider: "Cedar Medical Centre", title: "Blood pressure review", category: "Consultation", amount: 3500, coveredAmount: 0, date: daysAgo(9), paymentStatus: "paid", source: "Verified visit", linkedType: "visit", linkedId: "visit-3", provenance: "verified" },
  { id: "cost-8", patientId: "p-1002", providerId: "pharmacy-1", provider: "Green Cross Pharmacy", title: "Amlodipine refill", category: "Medicine", amount: 3100, coveredAmount: 500, date: daysAgo(31), paymentStatus: "partly_covered", source: "Prescription bill", linkedType: "bill", linkedId: "bill-2", provenance: "verified" },
  { id: "cost-9", patientId: "p-1003", providerId: "clinic-1", provider: "Cedar Medical Centre", title: "Iron deficiency follow-up", category: "Consultation", amount: 3200, coveredAmount: 0, date: daysAgo(18), paymentStatus: "paid", source: "Verified visit", linkedType: "visit", linkedId: "visit-4", provenance: "verified" },
  { id: "cost-10", patientId: "p-1004", providerId: "clinic-1", provider: "Cedar Medical Centre", title: "Diabetes review", category: "Consultation", amount: 4000, coveredAmount: 0, date: daysAgo(27), paymentStatus: "paid", source: "Verified visit", linkedType: "visit", linkedId: "visit-5", provenance: "verified" },
  { id: "cost-11", patientId: "p-1005", providerId: "lab-1", provider: "Northstar Diagnostics", title: "HbA1c and metabolic panel", category: "Test", amount: 7800, coveredAmount: 0, date: daysAgo(14), paymentStatus: "paid", source: "Verified report", linkedType: "lab_report", linkedId: "lab-5", provenance: "verified" },
];

const invoices: Invoice[] = [
  { id: "inv-100", patientId: "p-1002", patientName: "Bilal Ahmed", type: "renewal", amount: 400, status: "outstanding", date: daysAgo(2), collectedBy: "Cedar Medical Centre" },
  { id: "inv-101", patientId: "p-1001", patientName: "Amna Siddiqui", type: "renewal", amount: 400, status: "paid", method: "Wallet", receiptNo: "HARD-R-31184", date: daysAgo(52), collectedBy: "Cedar Medical Centre" },
  { id: "inv-102", patientId: "p-1003", patientName: "Zainab Noor", type: "upgrade", amount: 1000, status: "paid", method: "Card", receiptNo: "HARD-U-30091", date: daysAgo(93), collectedBy: "Cedar Medical Centre" },
  { id: "inv-103", patientId: "p-1001", patientName: "Amna Siddiqui", type: "renewal", amount: 400, status: "outstanding", date: daysAgo(1), collectedBy: "Cedar Medical Centre" },
];

const ledger = [
  { id: "split-1", invoiceId: "inv-101", patientName: "Amna Siddiqui", date: daysAgo(52), amount: 400, providerAmount: 120, platformAmount: 280, sharePercent: 30, payoutStatus: "Pending" as const },
  { id: "split-2", invoiceId: "inv-102", patientName: "Zainab Noor", date: daysAgo(93), amount: 1000, providerAmount: 300, platformAmount: 700, sharePercent: 30, payoutStatus: "Settled" as const },
];

const accessLogs: AccessLog[] = [
  { id: "log-1", patientId: "p-1001", actor: "Dr. Sara Malik", role: "Doctor", action: "Viewed linked patient history", entity: "Visit history", date: daysAgo(3), kind: "normal_read" },
  { id: "log-2", patientId: "p-1001", actor: "Green Cross Pharmacy", role: "Pharmacist", action: "Resolved one prescription", entity: "RX-7F3K-92QD", date: daysAgo(10), kind: "pharmacy_resolve" },
  { id: "log-3", patientId: "p-1001", actor: "Northstar Diagnostics", role: "Lab tech", action: "Issued verified report", entity: "CBC with differential", date: daysAgo(6), kind: "write" },
];

const labReports: LabReport[] = [
  { id: "lab-1", token: "lab_vfy_88c6b02b", patientId: "p-1001", patientName: "Amna Siddiqui", lab: "Northstar Diagnostics", testType: "CBC with differential", date: daysAgo(6), values: [{ name: "Hemoglobin", value: "13.2", unit: "g/dL", range: "12.0–15.5" }, { name: "WBC", value: "6.8", unit: "10⁹/L", range: "4.0–11.0" }, { name: "Platelets", value: "278", unit: "10⁹/L", range: "150–400" }], notes: "All values are within reference range.", hash: "SHA-256 · 9d2b…a41f", amount: 2400, status: "verified" },
  { id: "lab-2", token: "lab_vfy_7a3f91cc", patientId: "p-1001", patientName: "Amna Siddiqui", lab: "Northstar Diagnostics", testType: "Vitamin D panel", date: daysAgo(96), values: [{ name: "25-OH Vitamin D", value: "31", unit: "ng/mL", range: "30–100" }], notes: "Within reference range.", hash: "SHA-256 · d91c…74a0", amount: 4200, status: "verified" },
];

const providers: Provider[] = [
  { id: "clinic-1", name: "Cedar Medical Centre", type: "Clinic", status: "approved", license: "PMC-C-20481", location: "Gulberg, Lahore", collected: 184500, share: 12750 },
  { id: "lab-1", name: "Northstar Diagnostics", type: "Lab", status: "approved", license: "PHL-8820", location: "Johar Town, Lahore", collected: 72600, share: 0 },
  { id: "pharmacy-1", name: "Green Cross Pharmacy", type: "Pharmacy", status: "approved", license: "DRAP-P-4412", location: "Gulberg, Lahore", collected: 0, share: 0 },
  { id: "clinic-2", name: "Riverside Family Clinic", type: "Clinic", status: "pending", license: "PMC-C-20991", location: "Model Town, Lahore", collected: 0, share: 0 },
];

const notifications = [
  { id: "n-1", title: "Prescription ready", body: "Dr. Sara Malik issued RX-7F3K-92QD.", date: daysAgo(3), read: false },
  { id: "n-2", title: "Report verified", body: "Your CBC report is available with a verification link.", date: daysAgo(6), read: false },
  { id: "n-3", title: "Pharmacy access logged", body: "Green Cross Pharmacy resolved one prescription.", date: daysAgo(10), read: true },
];

export const seedDemoData: DemoData = {
  patients,
  visits,
  prescriptions,
  costs,
  invoices,
  ledger,
  accessLogs: accessLogs as AccessLog[],
  labReports,
  providers,
  notifications,
  config: INITIAL_CONFIG,
};

const genericNames = [
  "Paracetamol", "Ibuprofen", "Amoxicillin", "Azithromycin", "Cetirizine", "Loratadine", "Omeprazole", "Pantoprazole", "Metformin", "Amlodipine", "Losartan", "Atorvastatin", "Rosuvastatin", "Montelukast", "Salbutamol", "Ferrous sulfate", "Folic acid", "Vitamin D3", "Calcium carbonate", "Cefixime", "Ciprofloxacin", "Doxycycline", "Levocetirizine", "Esomeprazole", "Ondansetron", "Domperidone", "Metronidazole", "Prednisolone", "Aspirin", "Clopidogrel", "Bisoprolol", "Glimepiride", "Sitagliptin", "Gabapentin", "Pregabalin", "Sertraline", "Fluoxetine", "Mupirocin", "Diclofenac", "Ketorolac", "Loperamide", "ORS", "Zinc sulfate", "Budesonide", "Formoterol", "Insulin glargine", "Levothyroxine", "Tamsulosin", "Nitrofurantoin", "Cotrimoxazole",
];
const brandNames = [
  "Panadol", "Brufen", "Amoxil", "Zithromax", "Rigix", "Clarityn", "Losec", "Protonix", "Glucophage", "Norvasc", "Cozaar", "Lipitor", "Crestor", "Singulair", "Ventolin", "Fero-Grad", "Fefol", "SunnyD", "Caltrate", "Cefspan", "Ciproxin", "Vibramycin", "T-Day", "Nexum", "Emeset", "Motilium", "Flagyl", "Deltacortril", "Disprin", "Plavix", "Concor", "Amaryl", "Januvia", "Neurontin", "Lyrica", "Zoloft", "Prozac", "Bactroban", "Voltaren", "Toradol", "Imodium", "Hydralyte", "Surbex-Z", "Pulmicort", "Foradil", "Lantus", "Eltroxin", "Flomax", "Furadantin", "Septran",
];
const strengths = ["250 mg tablet", "500 mg tablet"];
export const medicineCatalogue = genericNames.flatMap((generic, index) =>
  strengths.map((strength, strengthIndex) => ({
    id: `med-${index * 2 + strengthIndex + 1}`,
    genericName: generic,
    brandName: brandNames[index],
    strength: strengthIndex === 0 ? strength : strength.replace("250", "500"),
    form: "Tablet",
  })),
);

export const getPatient = (id: string, data: DemoData = seedDemoData) => data.patients.find((patient) => patient.id === id);
export const getPatientCosts = (id: string, data: DemoData = seedDemoData) => data.costs.filter((cost) => cost.patientId === id);
export const getPatientPrescriptions = (id: string, data: DemoData = seedDemoData) => data.prescriptions.filter((rx) => rx.patientId === id);
export const getPatientVisits = (id: string, data: DemoData = seedDemoData) => data.visits.filter((visit) => visit.patientId === id);
export const findDemoRx = (value: string, data: DemoData = seedDemoData) => {
  const normalized = value.trim().toUpperCase();
  return data.prescriptions.find((rx) => [rx.code, rx.shortCode, rx.token].some((candidate) => candidate.toUpperCase() === normalized));
};
