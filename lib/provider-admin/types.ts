/**
 * P2-9 / P2-10 shared types + constants for the real provider-admin workspace
 * (brief 8.6 / 7.5 / 11.3). Plain module — "use server" files may only export
 * async functions, so the UI imports these from here.
 */

export const staffRoles = ["doctor", "front_desk", "pharmacist", "lab_tech", "provider_admin"] as const;
export type StaffRole = (typeof staffRoles)[number];
export const STAFF_ROLES: StaffRole[] = [...staffRoles];

export interface ProviderStaffMember {
  userId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  isSelf: boolean;
}

export interface ProviderLedgerRow {
  id: string;
  invoiceId: string;
  receiptNo: string | null;
  invoiceTotal: number;
  providerAmount: number;
  platformAmount: number;
  payoutStatus: "pending" | "settled";
  createdAt: string;
}

export interface ProviderAdminData {
  providerId: string;
  providerName: string;
  providerType: string;
  staff: ProviderStaffMember[];
  ledger: ProviderLedgerRow[];
  kpis: {
    patientsRegistered: number;
    documentsIssued: number;
    feesCollected: number;
    shareEarned: number;
    sharePending: number;
    outstandingInvoices: number;
    activeStaff: number;
  };
}

export const EMPTY_PROVIDER_ADMIN_DATA: ProviderAdminData = {
  providerId: "",
  providerName: "",
  providerType: "",
  staff: [],
  ledger: [],
  kpis: { patientsRegistered: 0, documentsIssued: 0, feesCollected: 0, shareEarned: 0, sharePending: 0, outstandingInvoices: 0, activeStaff: 0 },
};
