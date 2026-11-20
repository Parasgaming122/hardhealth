import { notFound, redirect } from "next/navigation";
import { isAllowedWorkspacePath, isAssignedToWorkspace, isPlatformAdmin, sectionTitle, workspaceConfig, type WorkspaceSlug, type WorkspacePayload } from "@/lib/auth/roles";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { SecureWorkspace } from "@/components/secure-workspace";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";
import { getAdminDirectoryData } from "@/lib/admin/actions";
import { listAllAdminProviders, type ProviderRecord } from "@/lib/admin/provider-actions";
import { getRealPatientPortalData, type RealPatientPortalData } from "@/lib/patient/real-patient";
import { listRealPatients, listDoctorTemplates, listDoctorRecentPrescriptions, type RealPatientSummary } from "@/lib/provider/real-provider";
import type { DoctorRecentPrescription, DoctorTemplateSummary } from "@/lib/provider/types";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return <main className="secure-state-page"><section className="secure-state-card"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">{message}</p></section></main>;
}

export default async function WorkspaceRoute({ params }: { params: Promise<{ workspace: string; section?: string[] }> }) {
  const { workspace: rawWorkspace, section = [] } = await params;
  if (!(rawWorkspace in workspaceConfig)) notFound();
  const workspace = rawWorkspace as WorkspaceSlug;
  if (!isAllowedWorkspacePath(workspace, section)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_workspace");
  if (error) return unavailable("Your session could not load its role-scoped workspace. Please retry or contact the administrator. No record data was shown.");
  let access = data as WorkspacePayload;
  const hasPlatformAdmin = isPlatformAdmin(access.roles);
  if (!isAssignedToWorkspace(access.roles, workspace)) {
    return <main className="secure-state-page"><section className="secure-state-card"><h1 className="text-xl font-semibold">Access not permitted</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your account is not assigned to the {workspaceConfig[workspace].label.toLowerCase()} workspace. Access is not granted by changing the URL.</p></section></main>;
  }

  const { error: auditError } = await supabase.rpc("record_workspace_read", { p_workspace: workspace });
  if (auditError) return unavailable("Workspace access could not be recorded securely. No workspace content was shown.");

  const hasRequestedRole = (access.roles ?? []).some((entry) => entry.role === workspaceConfig[workspace].role);
  if (hasPlatformAdmin && workspace !== "admin" && !hasRequestedRole) {
    // Route access does not widen clinical data access. Keep the route shell, but discard
    // the other role's returned summary before rendering an administrator override.
    access = { ...access, patient: {}, summary: {} };
  }

  let adminUsers: AdminDirectoryUser[] | undefined;
  let adminProviders: AdminApprovedProvider[] | undefined;
  let allAdminProviders: ProviderRecord[] | undefined;
  if (hasPlatformAdmin && workspace === "admin") {
    const { data: summary } = await supabase.rpc("admin_platform_summary");
    if (summary) {
      access = { ...access, summary: summary as WorkspacePayload["summary"] };
    }

    // Degrade gracefully when the admin-only directories are unavailable (for example a missing
    // server-side service-role key): the workspace still renders with empty states instead of a
    // hard failure, matching getAdminDirectoryData()'s internal fallback behavior.
    const [adminDataRes, allProvidersRes] = await Promise.allSettled([
      getAdminDirectoryData(),
      listAllAdminProviders(),
    ]);
    if (adminDataRes.status === "fulfilled") {
      adminUsers = adminDataRes.value.users;
      adminProviders = adminDataRes.value.providers;
    }
    if (allProvidersRes.status === "fulfilled") {
      allAdminProviders = allProvidersRes.value;
    } else {
      console.error(
        "[admin] provider lifecycle directory unavailable:",
        allProvidersRes.reason instanceof Error ? allProvidersRes.reason.message : allProvidersRes.reason
      );
      allAdminProviders = [];
    }
  }

  let patientPortalData: RealPatientPortalData | undefined;
  if (workspace === "patient") {
    patientPortalData = await getRealPatientPortalData(user.id);
  }

  let realPatients: RealPatientSummary[] | undefined;
  if (workspace === "doctor" || workspace === "front-desk" || workspace === "lab") {
    realPatients = await listRealPatients();
  }

  // Brief 7.2: saved prescription templates for the <30s issuing flow. Degrades to
  // an empty list when the templates migration has not been applied yet.
  let doctorTemplates: DoctorTemplateSummary[] | undefined;
  let doctorRecentPrescriptions: DoctorRecentPrescription[] | undefined;
  if (workspace === "doctor") {
    doctorTemplates = await listDoctorTemplates();
    // Brief 7.2: repeat-last-prescription — the doctor's own issuing history,
    // self-scoped to the authenticated user id. Degrades to [].
    doctorRecentPrescriptions = await listDoctorRecentPrescriptions(user.id);
  }

  return (
    <SecureWorkspace
      workspace={workspace}
      sections={section}
      pageTitle={sectionTitle(workspace, section)}
      access={access}
      adminUsers={adminUsers}
      adminProviders={adminProviders}
      allAdminProviders={allAdminProviders}
      patientPortalData={patientPortalData}
      realPatients={realPatients}
      doctorTemplates={doctorTemplates}
      doctorRecentPrescriptions={doctorRecentPrescriptions}
    />
  );
}
