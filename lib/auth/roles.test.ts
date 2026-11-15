import { describe, expect, it } from "vitest";
import { homePathForRole, homePathForRoles, isAllowedWorkspacePath, isAssignedToWorkspace, isPlatformAdmin, sectionTitle, workspaceForRole } from "./roles";

const patientRole = { role: "patient" as const, provider_id: null, provider_name: null };
const adminRole = { role: "platform_admin" as const, provider_id: null, provider_name: null };
const doctorRole = { role: "doctor" as const, provider_id: "provider-1", provider_name: "Demo Clinic" };

describe("role-to-workspace routing", () => {
  it("maps every supported database role to its fixed URL root", () => {
    expect(homePathForRole("patient")).toBe("/patient/overview");
    expect(homePathForRole("doctor")).toBe("/doctor/overview");
    expect(homePathForRole("front_desk")).toBe("/front-desk/overview");
    expect(homePathForRole("pharmacist")).toBe("/pharmacy/overview");
    expect(homePathForRole("lab_tech")).toBe("/lab/overview");
    expect(homePathForRole("provider_admin")).toBe("/provider-admin/overview");
    expect(homePathForRole("platform_admin")).toBe("/admin/overview");
    expect(homePathForRole("unrecognized")).toBeNull();
  });

  it("prefers the administrator landing page when an account has multiple roles", () => {
    expect(homePathForRoles([patientRole, adminRole])).toBe("/admin/overview");
    expect(homePathForRoles([patientRole])).toBe("/patient/overview");
    expect(homePathForRoles([])).toBeNull();
  });

  it("uses only active database role rows to grant admin workspace navigation", () => {
    expect(isPlatformAdmin([adminRole])).toBe(true);
    expect(isPlatformAdmin([patientRole])).toBe(false);
    expect(isAssignedToWorkspace([patientRole], "doctor")).toBe(false);
    expect(isAssignedToWorkspace([doctorRole], "doctor")).toBe(true);
    for (const workspace of ["patient", "doctor", "front-desk", "pharmacy", "lab", "provider-admin", "admin"] as const) {
      expect(isAssignedToWorkspace([adminRole], workspace)).toBe(true);
    }
  });

  it("allows only configured nested pages and valid record identifiers", () => {
    expect(isAllowedWorkspacePath("patient", ["expenses"])).toBe(true);
    expect(isAllowedWorkspacePath("front-desk", ["patients", "new"])).toBe(true);
    expect(isAllowedWorkspacePath("doctor", ["patients", "123e4567-e89b-42d3-a456-426614174000"])).toBe(true);
    expect(isAllowedWorkspacePath("doctor", ["patients", "not-an-id"])).toBe(false);
    expect(isAllowedWorkspacePath("doctor", ["prescriptions", "123e4567-e89b-42d3-a456-426614174000"])).toBe(true);
    expect(isAllowedWorkspacePath("pharmacy", ["patients"])).toBe(false);
    expect(isAllowedWorkspacePath("pharmacy", ["resolve"])).toBe(true);
    expect(isAllowedWorkspacePath("admin", ["audit"])).toBe(true);
    expect(isAllowedWorkspacePath("admin", ["users"])).toBe(true);
    expect(isAllowedWorkspacePath("admin", ["audit", "unexpected", "extra"])).toBe(false);
  });

  it("labels nested portal pages and rejects unsupported role slugs", () => {
    expect(sectionTitle("patient", ["providers"])).toBe("Providers & access");
    expect(sectionTitle("doctor", ["patients", "123e4567-e89b-42d3-a456-426614174000"])).toBe("Patient record");
    expect(sectionTitle("admin", ["users"])).toBe("Users & roles");
    expect(workspaceForRole("pharmacist")).toBe("pharmacy");
    expect(workspaceForRole("court")).toBeNull();
  });
});
