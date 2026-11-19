export interface RealPatientSummary {
  id: string;
  healthId: string;
  fullName: string;
  cnic: string | null;
  dob: string | null;
  bloodGroup: string | null;
  createdAt: string;
}
