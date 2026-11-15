import type { HardRole } from "@/lib/auth/roles";

export type AdminRoleAssignment = {
  role: HardRole;
  provider_id: string | null;
  provider_name: string | null;
  is_active: boolean;
};

export type AdminDirectoryUser = {
  user_id: string;
  email: string | null;
  display_name: string;
  created_at: string;
  roles: AdminRoleAssignment[];
};

export type AdminApprovedProvider = {
  provider_id: string;
  provider_name: string;
  provider_type: string;
};
