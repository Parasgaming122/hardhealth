export type HardRole = "patient" | "doctor" | "front_desk" | "pharmacist" | "lab_tech" | "provider_admin" | "platform_admin";
export type WorkspaceSlug = "patient" | "doctor" | "front-desk" | "pharmacy" | "lab" | "provider-admin" | "admin";

export type AssignedWorkspaceRole = {
  role: HardRole;
  provider_id: string | null;
  provider_name: string | null;
};

export type WorkspacePayload = {
  profile?: { display_name?: string };
  roles?: AssignedWorkspaceRole[];
  patient?: { health_id?: string; full_name?: string; date_of_birth?: string | null };
  summary?: Record<string, number | string | null>;
};

export const workspaceConfig: Record<WorkspaceSlug, {
  role: HardRole;
  label: string;
  pages: { key: string; label: string }[];
}> = {
  patient: { role: "patient", label: "Patient", pages: [
    { key: "overview", label: "Overview" }, { key: "timeline", label: "Timeline" },
    { key: "prescriptions", label: "Prescriptions" }, { key: "reports", label: "Reports" },
    { key: "expenses", label: "Expenses" }, { key: "providers", label: "Providers & access" },
    { key: "billing", label: "Billing" }, { key: "settings", label: "Settings" },
  ] },
  doctor: { role: "doctor", label: "Doctor", pages: [
    { key: "overview", label: "Overview" }, { key: "patients", label: "Patients" },
    { key: "prescriptions/new", label: "New prescription" }, { key: "prescriptions", label: "Prescriptions" },
  ] },
  "front-desk": { role: "front_desk", label: "Front desk", pages: [
    { key: "overview", label: "Overview" }, { key: "patients/new", label: "Register patient" },
    { key: "patients", label: "Patients" }, { key: "collections", label: "Collections" },
  ] },
  pharmacy: { role: "pharmacist", label: "Pharmacy", pages: [
    { key: "overview", label: "Overview" }, { key: "resolve", label: "Resolve one prescription" },
    { key: "dispenses", label: "Dispenses" }, { key: "bills", label: "Bills" },
  ] },
  lab: { role: "lab_tech", label: "Laboratory", pages: [
    { key: "overview", label: "Overview" }, { key: "reports/new", label: "Issue report" },
    { key: "reports", label: "Reports issued" },
  ] },
  "provider-admin": { role: "provider_admin", label: "Provider admin", pages: [
    { key: "overview", label: "Overview" }, { key: "staff", label: "Staff" }, { key: "ledger", label: "Ledger" },
  ] },
  admin: { role: "platform_admin", label: "Platform admin", pages: [
    { key: "overview", label: "Overview" }, { key: "providers", label: "Provider approvals" },
    { key: "config", label: "Configuration" }, { key: "audit", label: "Audit log" },
    { key: "users", label: "Users & roles" },
  ] },
};

export const workspaceSlugs = Object.keys(workspaceConfig) as WorkspaceSlug[];

const roleToSlug: Record<HardRole, WorkspaceSlug> = {
  patient: "patient", doctor: "doctor", front_desk: "front-desk", pharmacist: "pharmacy",
  lab_tech: "lab", provider_admin: "provider-admin", platform_admin: "admin",
};

export function workspaceForRole(role: string | undefined): WorkspaceSlug | null {
  return role && role in roleToSlug ? roleToSlug[role as HardRole] : null;
}

export function homePathForRole(role: string | undefined): string | null {
  const slug = workspaceForRole(role);
  return slug ? `/${slug}/overview` : null;
}

export function homePathForRoles(roles: AssignedWorkspaceRole[] | undefined): string | null {
  const assigned = roles ?? [];
  if (assigned.some((entry) => entry.role === "platform_admin")) return homePathForRole("platform_admin");
  return homePathForRole(assigned[0]?.role);
}

export function isPlatformAdmin(roles: AssignedWorkspaceRole[] | undefined) {
  return (roles ?? []).some((entry) => entry.role === "platform_admin");
}

export function isAssignedToWorkspace(roles: AssignedWorkspaceRole[] | undefined, workspace: WorkspaceSlug) {
  const assigned = roles ?? [];
  return isPlatformAdmin(assigned) || assigned.some((entry) => entry.role === workspaceConfig[workspace].role);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAllowedWorkspacePath(workspace: WorkspaceSlug, sections: string[]) {
  const path = sections.length ? sections.join("/") : "overview";
  const configured = workspaceConfig[workspace].pages.some((page) => page.key === path);
  if (configured) return true;
  if ((workspace === "doctor" || workspace === "front-desk") && sections.length === 2 && sections[0] === "patients") {
    return uuidPattern.test(sections[1]);
  }
  if (workspace === "doctor" && sections.length === 2 && sections[0] === "prescriptions" && sections[1] !== "new") {
    return uuidPattern.test(sections[1]);
  }
  if (workspace === "lab" && sections.length === 2 && sections[0] === "reports" && sections[1] !== "new") {
    return uuidPattern.test(sections[1]);
  }
  return false;
}

export function sectionTitle(workspace: WorkspaceSlug, sections: string[]) {
  const path = sections.length ? sections.join("/") : "overview";
  const match = workspaceConfig[workspace].pages.find((page) => page.key === path);
  if (match) return match.label;
  if (path.endsWith("/new")) return workspace === "lab" ? "Issue report" : "New prescription";
  if (sections.length === 2 && sections[0] === "patients") return "Patient record";
  if (sections.length === 2 && sections[0] === "prescriptions") return "Prescription record";
  if (sections.length === 2 && sections[0] === "reports") return "Lab report";
  return "Overview";
}
