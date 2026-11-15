"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AccessLog, CostCategory, CostItem, DemoData, Invoice, LabReport, Patient, Prescription, Provenance, Role, RxItem } from "@/lib/domain";
import { INITIAL_CONFIG, ageRange, yearsOld } from "@/lib/domain";
import { seedDemoData } from "@/lib/mock-data";

interface RegisterInput { fullName: string; cnic: string; phone: string; dob: string; gender: string; bloodGroup: string; heightCm: number; weightKg: number; emergencyContact: string; paymentMethod?: "Cash" | "Card" | "Wallet"; }
interface NewRxInput { patientId: string; items: RxItem[]; note: string; complaint: string; diagnosis: string; isSensitive: boolean; consultationCost: number; }
interface NewBillInput { prescriptionId: string; billNumber: string; total: number; lines: string; }
interface NewLabInput { patientId: string; testType: string; amount: number; notes: string; }
interface AddExpenseInput { patientId: string; title: string; amount: number; category: CostCategory; }
interface DemoContextValue {
  data: DemoData;
  currentRole: Role | null;
  hydrated: boolean;
  toastMessage: string;
  loginAs: (role: Role) => void;
  logout: () => void;
  showToast: (message: string) => void;
  registerPatient: (input: RegisterInput) => { patient: Patient; invoice: Invoice } | { duplicate: true };
  issuePrescription: (input: NewRxInput) => Prescription | undefined;
  addAccessLog: (input: Omit<AccessLog, "id" | "date">) => void;
  markDispensed: (prescriptionId: string, otp: string) => boolean;
  attachBill: (input: NewBillInput) => boolean;
  createLabReport: (input: NewLabInput) => LabReport | undefined;
  addExpense: (input: AddExpenseInput) => void;
  markInvoicePaid: (invoiceId: string, method: "Cash" | "Card" | "Wallet", actor?: string) => void;
  upgradeStoragePlan: (patientId: string, planName: "Base" | "Plus" | "Pro") => void;
  updateConfig: (key: "registrationFee" | "renewalFee" | "providerSharePercent" | "storageAlertPercent" | "prescriptionValidityDays" | "prescriptionMaxFills", value: number) => void;
  decideProvider: (providerId: string, status: "approved" | "rejected") => void;
  revokeProviderLink: (patientId: string) => void;
  addNotification: (title: string, body: string) => void;
  saveConfirmedIngestion: (input: { patientId: string; title: string; amount: number; date: string; fileName: string }) => void;
}

const STORE_KEY = "hard-demo-data-v1";
const ROLE_KEY = "hard-demo-role-v1";
const DemoContext = createContext<DemoContextValue | null>(null);
const cloneSeed = (): DemoData => JSON.parse(JSON.stringify(seedDemoData)) as DemoData;
const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const shortCode = () => Math.random().toString(36).slice(2, 12).toUpperCase();
const fakeToken = () => `d_${Math.random().toString(16).slice(2, 14)}`;
const now = () => new Date().toISOString();

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DemoData>(cloneSeed);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORE_KEY);
      if (stored) setData(JSON.parse(stored) as DemoData);
      const role = localStorage.getItem(ROLE_KEY) as Role | null;
      if (role) setCurrentRole(role);
    } catch {
      localStorage.removeItem(STORE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 2900);
  }, []);

  const addNotification = useCallback((title: string, body: string) => {
    setData((previous) => ({ ...previous, notifications: [{ id: makeId("note"), title, body, date: now(), read: false }, ...previous.notifications] }));
  }, []);

  const addAccessLog = useCallback((input: Omit<AccessLog, "id" | "date">) => {
    setData((previous) => ({ ...previous, accessLogs: [{ ...input, id: makeId("log"), date: now() }, ...previous.accessLogs] }));
  }, []);

  const loginAs = useCallback((role: Role) => {
    setCurrentRole(role);
    localStorage.setItem(ROLE_KEY, role);
    if (role === "doctor") {
      addAccessLog({ patientId: "p-1001", actor: "Dr. Sara Malik", role: "Doctor", action: "Viewed linked patient history", entity: "Linked recent history", kind: "normal_read" });
    } else if (role === "frontDesk" || role === "lab" || role === "providerAdmin" || role === "platformAdmin") {
      const actor = role === "frontDesk" ? "Front desk · Cedar Medical Centre" : role === "lab" ? "Lab tech · Northstar Diagnostics" : role === "providerAdmin" ? "Provider admin · Cedar Medical Centre" : "Platform admin";
      const action = role === "frontDesk" ? "Opened registration and fee-collection workspace" : role === "lab" ? "Opened linked lab work queue" : role === "providerAdmin" ? "Viewed provider operational and financial aggregates" : "Viewed platform aggregates and audit metadata";
      addAccessLog({ patientId: "system", actor, role: role === "frontDesk" ? "Front desk" : role === "lab" ? "Lab tech" : role === "providerAdmin" ? "Provider admin" : "Platform admin", action, entity: "Workspace metadata only", kind: "normal_read" });
    }
    showToast(`${role === "platformAdmin" ? "Platform admin" : role === "frontDesk" ? "Front desk" : role === "providerAdmin" ? "Provider admin" : role === "lab" ? "Lab tech" : role[0].toUpperCase() + role.slice(1)} demo opened`);
  }, [addAccessLog, showToast]);

  const logout = useCallback(() => {
    setCurrentRole(null);
    localStorage.removeItem(ROLE_KEY);
  }, []);

  const registerPatient = useCallback((input: RegisterInput) => {
    const normalized = input.cnic.replace(/\D/g, "");
    if (data.patients.some((patient) => patient.cnic.replace(/\D/g, "") === normalized)) return { duplicate: true } as const;
    const { paymentMethod = "Cash", ...patientInput } = input;
    const patient: Patient = {
      ...patientInput,
      id: makeId("patient"),
      initials: input.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase(),
      healthId: `HARD-${String(122 + data.patients.length).padStart(6, "0")}`,
      identityCheck: "desk_checked",
      providerLink: "active",
      storageUsedMb: 0,
      storageQuotaMb: 1024,
      storagePlan: "Base",
      monthlyBudget: data.config.monthlyBudget,
      allergies: [],
      conditions: [],
      createdAt: now(),
    };
    const amount = data.config.registrationFee;
    const invoiceId = makeId("invoice");
    const invoice: Invoice = { id: invoiceId, patientId: patient.id, patientName: patient.fullName, type: "registration", amount, status: "paid", method: paymentMethod, receiptNo: `HARD-R-${Math.floor(10000 + Math.random() * 89999)}`, date: now(), collectedBy: "Cedar Medical Centre" };
    const providerAmount = Math.round(amount * data.config.providerSharePercent / 100);
    const split = { id: makeId("split"), invoiceId, patientName: patient.fullName, date: now(), amount, providerAmount, platformAmount: amount - providerAmount, sharePercent: data.config.providerSharePercent, payoutStatus: "Pending" as const };
    setData((previous) => {
      if (previous.patients.some((patient) => patient.cnic.replace(/\D/g, "") === normalized)) return previous;
      return {
        ...previous,
        patients: [patient, ...previous.patients],
        invoices: [invoice, ...previous.invoices],
        ledger: [split, ...previous.ledger],
        costs: [{ id: makeId("cost"), patientId: patient.id, providerId: "clinic-1", provider: "Cedar Medical Centre", title: "Registration · Year one", category: "Other", amount, coveredAmount: 0, date: now(), paymentStatus: "paid", source: "Registration invoice", linkedType: "invoice", linkedId: invoiceId, provenance: "verified" }, ...previous.costs],
        accessLogs: [{ id: makeId("log"), patientId: patient.id, actor: "Front desk · Cedar Medical Centre", role: "Front desk", action: "Registered patient and created active provider link", entity: patient.healthId, date: now(), kind: "write" }, ...previous.accessLogs],
      };
    });
    addNotification("Registration complete", `${patient.fullName} has a Health ID and an active Cedar Medical Centre link.`);
    showToast(`Health ID ${patient.healthId} created · split posted`);
    return { patient, invoice };
  }, [data, addNotification, showToast]);

  const issuePrescription = useCallback((input: NewRxInput) => {
    const patient = data.patients.find((item) => item.id === input.patientId);
    if (!patient) return undefined;
    const nowDate = new Date();
    const rx: Prescription = {
      id: crypto.randomUUID(),
      code: `RX-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      shortCode: shortCode(),
      token: fakeToken(),
      patientId: patient.id,
      patientName: patient.fullName,
      patientAge: yearsOld(patient.dob),
      doctor: "Dr. Sara Malik",
      provider: "Cedar Medical Centre",
      date: now(),
      expiresAt: new Date(nowDate.getTime() + data.config.prescriptionValidityDays * 86400000).toISOString(),
      status: "active",
      fillsUsed: 0,
      maxFills: data.config.prescriptionMaxFills,
      version: 1,
      items: input.items,
      note: input.note,
      visitId: `visit-${makeId("new")}`,
      consultationCost: input.consultationCost,
    };
    const newVisit = { id: rx.visitId, patientId: patient.id, provider: rx.provider, doctor: rx.doctor, date: rx.date, complaint: input.complaint, diagnosis: input.diagnosis, notes: input.note, isSensitive: input.isSensitive, provenance: "verified" as Provenance };
    const newCost: CostItem = { id: makeId("cost"), patientId: patient.id, providerId: "clinic-1", provider: rx.provider, title: `Consultation · ${rx.doctor}`, category: "Consultation", amount: input.consultationCost, coveredAmount: 0, date: rx.date, paymentStatus: "paid", source: "Verified visit", linkedType: "visit", linkedId: rx.visitId, provenance: "verified" };
    setData((previous) => ({ ...previous, prescriptions: [rx, ...previous.prescriptions], visits: [newVisit, ...previous.visits], costs: [newCost, ...previous.costs], accessLogs: [{ id: makeId("log"), patientId: patient.id, actor: rx.doctor, role: "Doctor", action: "Issued digital prescription", entity: rx.code, date: now(), kind: "write" }, ...previous.accessLogs] }));
    addNotification("Prescription ready", `${rx.doctor} issued ${rx.code}. Your pharmacy can resolve this prescription only.`);
    showToast("Prescription issued · QR and short code generated");
    return rx;
  }, [addNotification, data.config, data.patients, showToast]);

  const markDispensed = useCallback((prescriptionId: string, otp: string) => {
    let ok = false;
    let patientId = "";
    setData((previous) => {
      const rx = previous.prescriptions.find((item) => item.id === prescriptionId);
      if (!rx || otp !== "4812" || rx.status === "expired" || rx.status === "cancelled" || rx.fillsUsed >= rx.maxFills || new Date(rx.expiresAt).getTime() < Date.now()) return previous;
      ok = true;
      patientId = rx.patientId;
      const nextFills = rx.fillsUsed + 1;
      const nextStatus = nextFills >= rx.maxFills ? "dispensed" : "partly_filled";
      return {
        ...previous,
        prescriptions: previous.prescriptions.map((item) => item.id === prescriptionId ? { ...item, status: nextStatus, fillsUsed: nextFills } : item),
        accessLogs: [{ id: makeId("log"), patientId: rx.patientId, actor: "Green Cross Pharmacy", role: "Pharmacist", action: "OTP-confirmed dispense", entity: rx.code, date: now(), kind: "dispense" }, ...previous.accessLogs],
      };
    });
    if (ok) addNotification("Prescription dispensed", "Your pharmacy recorded the OTP-confirmed dispense.");
    return ok;
  }, [addNotification]);

  const attachBill = useCallback((input: NewBillInput) => {
    let attached = false;
    let rx: Prescription | undefined;
    setData((previous) => {
      rx = previous.prescriptions.find((item) => item.id === input.prescriptionId);
      if (!rx) return previous;
      attached = true;
      const id = makeId("bill");
      const cost: CostItem = { id: makeId("cost"), patientId: rx.patientId, providerId: "pharmacy-1", provider: "Green Cross Pharmacy", title: `Prescription bill · ${input.billNumber}`, category: "Medicine", amount: input.total, coveredAmount: 0, date: now(), paymentStatus: "paid", source: `Pharmacy bill · ${input.lines}`, linkedType: "bill", linkedId: id, provenance: "verified" };
      const log: AccessLog = { id: makeId("log"), patientId: rx.patientId, actor: "Green Cross Pharmacy", role: "Pharmacist", action: "Attached pharmacy bill", entity: input.billNumber, date: now(), kind: "write" };
      return { ...previous, costs: [cost, ...previous.costs], accessLogs: [log, ...previous.accessLogs], notifications: [{ id: makeId("note"), title: "New pharmacy bill", body: `${input.billNumber} · PKR ${input.total.toLocaleString("en-PK")}`, date: now(), read: false }, ...previous.notifications] };
    });
    if (attached) showToast("Bill attached · patient spending updated");
    return attached;
  }, [showToast]);

  const createLabReport = useCallback((input: NewLabInput) => {
    const patient = data.patients.find((item) => item.id === input.patientId);
    if (!patient) return undefined;
    const report: LabReport = { id: makeId("lab"), token: `lab_vfy_${Math.random().toString(16).slice(2, 10)}`, patientId: patient.id, patientName: patient.fullName, lab: "Northstar Diagnostics", testType: input.testType, date: now(), values: [{ name: "Sample value", value: "Within range", unit: "—", range: "See report" }], notes: input.notes || "Report issued digitally by the lab.", hash: `SHA-256 · ${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`, amount: input.amount, status: "verified" };
    setData((previous) => ({
      ...previous,
      labReports: [report, ...previous.labReports],
      costs: [{ id: makeId("cost"), patientId: patient.id, providerId: "lab-1", provider: report.lab, title: report.testType, category: "Test", amount: report.amount, coveredAmount: 0, date: report.date, paymentStatus: "paid", source: "Verified lab report", linkedType: "lab_report", linkedId: report.id, provenance: "verified" }, ...previous.costs],
      accessLogs: [{ id: makeId("log"), patientId: patient.id, actor: "Northstar Diagnostics", role: "Lab tech", action: "Issued verified report", entity: report.testType, date: now(), kind: "write" }, ...previous.accessLogs],
      notifications: [{ id: makeId("note"), title: "Lab report ready", body: `${report.testType} · verified report link is ready.`, date: now(), read: false }, ...previous.notifications],
    }));
    showToast("Verified lab report issued · demo message prepared");
    return report;
  }, [data.patients, showToast]);

  const addExpense = useCallback((input: AddExpenseInput) => {
    const cost: CostItem = { id: makeId("cost"), patientId: input.patientId, providerId: "manual", provider: "Self-reported", title: input.title, category: input.category, amount: input.amount, coveredAmount: 0, date: now(), paymentStatus: "paid", source: "Patient entry", linkedType: "manual", linkedId: makeId("manual"), provenance: "self-reported" };
    setData((previous) => ({ ...previous, costs: [cost, ...previous.costs] }));
    showToast("Expense added · marked Self-reported");
  }, [showToast]);

  const markInvoicePaid = useCallback((invoiceId: string, method: "Cash" | "Card" | "Wallet", actor?: string) => {
    setData((previous) => {
      const invoice = previous.invoices.find((item) => item.id === invoiceId);
      if (!invoice || invoice.status === "paid") return previous;
      const providerCollected = invoice.collectedBy !== "H.A.R.D Platform";
      const providerAmount = providerCollected ? Math.round(invoice.amount * previous.config.providerSharePercent / 100) : 0;
      const split = { id: makeId("split"), invoiceId, patientName: invoice.patientName, date: now(), amount: invoice.amount, providerAmount, platformAmount: invoice.amount - providerAmount, sharePercent: providerCollected ? previous.config.providerSharePercent : 0, payoutStatus: "Pending" as const };
      const patients = invoice.planName ? previous.patients.map((patient) => patient.id === invoice.patientId ? { ...patient, storagePlan: invoice.planName!, storageQuotaMb: previous.config.plans.find((plan) => plan.name === invoice.planName)?.quotaMb ?? patient.storageQuotaMb } : patient) : previous.patients;
      const actorName = actor ?? (providerCollected ? "Front desk · Cedar Medical Centre" : "Patient");
      const role = actorName.startsWith("Platform") ? "Platform admin" : actorName.startsWith("Patient") ? "Patient" : "Front desk";
      const accessLog: AccessLog = { id: makeId("log"), patientId: invoice.patientId, actor: actorName, role, action: "Paid invoice and posted reconciled ledger split", entity: invoice.id, date: now(), kind: "write" };
      return { ...previous, patients, invoices: previous.invoices.map((item) => item.id === invoiceId ? { ...item, status: "paid", method, receiptNo: `HARD-R-${Math.floor(10000 + Math.random() * 89999)}` } : item), ledger: [split, ...previous.ledger], accessLogs: [accessLog, ...previous.accessLogs] };
    });
    showToast("Invoice paid · revenue split posted");
  }, [showToast]);

  const upgradeStoragePlan = useCallback((patientId: string, planName: "Base" | "Plus" | "Pro") => {
    const patient = data.patients.find((item) => item.id === patientId);
    const plan = data.config.plans.find((item) => item.name === planName);
    if (!patient || !plan || plan.quotaMb <= patient.storageQuotaMb) { showToast("Choose a higher storage plan"); return; }
    if (data.invoices.some((invoice) => invoice.patientId === patientId && invoice.type === "upgrade" && invoice.status === "outstanding")) { showToast("Pay your outstanding upgrade invoice first"); return; }
    const invoice: Invoice = { id: makeId("invoice"), patientId, patientName: patient.fullName, type: "upgrade", amount: plan.yearlyPrice, status: "outstanding", planName, date: now(), collectedBy: "H.A.R.D Platform" };
    setData((previous) => ({ ...previous, invoices: [invoice, ...previous.invoices] }));
    addNotification("Storage upgrade invoice", `${plan.name} plan · PKR ${plan.yearlyPrice.toLocaleString("en-PK")}. Pay the invoice to activate your additional storage.`);
    showToast(`${plan.name} upgrade invoice created · pay to activate`);
  }, [addNotification, data, showToast]);

  const updateConfig = useCallback((key: "registrationFee" | "renewalFee" | "providerSharePercent" | "storageAlertPercent" | "prescriptionValidityDays" | "prescriptionMaxFills", value: number) => {
    setData((previous) => ({ ...previous, config: { ...previous.config, [key]: value } }));
    showToast("Demo configuration updated");
  }, [showToast]);

  const decideProvider = useCallback((providerId: string, status: "approved" | "rejected") => {
    setData((previous) => ({ ...previous, providers: previous.providers.map((provider) => provider.id === providerId ? { ...provider, status } : provider) }));
    showToast(`Provider ${status}`);
  }, [showToast]);

  const revokeProviderLink = useCallback((patientId: string) => {
    setData((previous) => ({ ...previous, patients: previous.patients.map((patient) => patient.id === patientId ? { ...patient, providerLink: "revoked" } : patient) }));
    showToast("Provider link revoked in this demo");
  }, [showToast]);

  const saveConfirmedIngestion = useCallback((input: { patientId: string; title: string; amount: number; date: string; fileName: string }) => {
    const cost: CostItem = { id: makeId("cost"), patientId: input.patientId, providerId: "patient-confirmed", provider: "Patient-confirmed document", title: input.title, category: "Other", amount: input.amount, coveredAmount: 0, date: input.date, paymentStatus: "paid", source: `AI-read · confirmed · ${input.fileName}`, linkedType: "manual", linkedId: makeId("ingestion"), provenance: "ai-confirmed" };
    setData((previous) => ({ ...previous, costs: [cost, ...previous.costs] }));
    showToast("Document confirmed · saved as AI-read, patient-confirmed");
  }, [showToast]);

  const value = useMemo<DemoContextValue>(() => ({ data, currentRole, hydrated, toastMessage, loginAs, logout, showToast, registerPatient, issuePrescription, addAccessLog, markDispensed, attachBill, createLabReport, addExpense, markInvoicePaid, upgradeStoragePlan, updateConfig, decideProvider, revokeProviderLink, addNotification, saveConfirmedIngestion }), [data, currentRole, hydrated, toastMessage, loginAs, logout, showToast, registerPatient, issuePrescription, addAccessLog, markDispensed, attachBill, createLabReport, addExpense, markInvoicePaid, upgradeStoragePlan, updateConfig, decideProvider, revokeProviderLink, addNotification, saveConfirmedIngestion]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export const useDemo = () => {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used within DemoProvider");
  return context;
};
