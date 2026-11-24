import { notFound, redirect } from "next/navigation";
import { isAllowedWorkspacePath, isAssignedToWorkspace, isPlatformAdmin, sectionTitle, workspaceConfig, type WorkspaceSlug, type WorkspacePayload } from "@/lib/auth/roles";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { SecureWorkspace } from "@/components/secure-workspace";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";
import { getAdminDirectoryData } from "@/lib/admin/actions";
import { listAllAdminProviders, type ProviderRecord } from "@/lib/admin/provider-actions";
import { getPlatformConfigForAdmin } from "@/lib/admin/config-actions";
import { readPlatformConfig, type PlatformConfig } from "@/lib/admin/config";
import { listRecentAuditEvents, type AuditEventRow } from "@/lib/admin/audit-log";
import { getRealPatientPortalData, type RealPatientPortalData } from "@/lib/patient/real-patient";
import {
  listRealPatients,
  listDoctorTemplates,
  listDoctorRecentPrescriptions,
  listRecentLabReports,
  listMyPharmacyActivity,
  listFrontDeskCollections,
  type RealPatientSummary,
  type LabReportSummary,
  type PharmacyActivity,
  type FrontDeskCollectionRow,
} from "@/lib/provider/real-provider";
import { getProviderAdminData } from "@/lib/provider-admin/actions";
import { type ProviderAdminData } from "@/lib/provider-admin/types";
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
  // S14 (async-parallel): the session check and the role payload are
  // independent reads of the same cookies — run them concurrently.
  const [userRes, workspaceRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_workspace"),
  ]);
  const { data: { user }, error: userError } = userRes;
  if (userError || !user) redirect("/login");

  const { data, error } = workspaceRes;
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
  let platformConfig: PlatformConfig | undefined;
  let adminAuditEvents: AuditEventRow[] | undefined;
  if (hasPlatformAdmin && workspace === "admin") {
    // S14 (async-parallel): the admin summary, directories, live configuration
    // and audit log are independent reads — fetch them all concurrently.
    // Rejection semantics are unchanged: the two directory readers degrade
    // gracefully, while the config and audit reads reject exactly like their
    // sequential awaits did.
    const directorySettled = Promise.allSettled([
      getAdminDirectoryData(),
      listAllAdminProviders(),
    ]);
    const configAndAudit = Promise.all([getPlatformConfigForAdmin(), listRecentAuditEvents()]);
    const [summaryRes, directoryRes, [configRes, auditRes]] = await Promise.all([
      supabase.rpc("admin_platform_summary"),
      directorySettled,
      configAndAudit,
    ]);
    const { data: summary } = summaryRes;
    if (summary) {
      access = { ...access, summary: summary as WorkspacePayload["summary"] };
    }

    // Degrade gracefully when the admin-only directories are unavailable (for example a missing
    // server-side service-role key): the workspace still renders with empty states instead of a
    // hard failure, matching getAdminDirectoryData()'s internal fallback behavior.
    const [adminDataRes, allProvidersRes] = directoryRes;
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

    // P2-8 (brief 8.7/Rule 1): live platform configuration for the real config
    // editor. Degrades to brief-22 defaults when the RPC/table is unavailable.
    platformConfig = configRes;

    // Owner feedback 2026-11-21: /admin/audit now lists REAL audit events
    // (metadata only) instead of the offline demo's fake list.
    adminAuditEvents = auditRes;
  }

  // P2-8 (brief Rule 1): the front desk shows the live registration fee and
  // revenue split from the config table — never hard-coded. The collections
  // page lists REAL invoices with their ledger splits (owner feedback
  // 2026-11-21), scoped to the desk's own provider organization when the
  // signed-in account has an active front-desk role there.
  let frontDeskConfig: PlatformConfig | undefined;
  let frontDeskCollections: FrontDeskCollectionRow[] | undefined;
  if (workspace === "front-desk") {
    // S14 (async-parallel): the shared config read and the desk's own role
    // lookup are independent; only the collections read depends on the role.
    const deskRolePromise = createSupabaseAdminClient()
      .from("user_roles")
      .select("provider_id")
      .eq("user_id", user.id)
      .eq("role", "front_desk")
      .eq("is_active", true)
      .not("provider_id", "is", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    const [frontDeskConfigRes, deskRoleRes] = await Promise.all([
      readPlatformConfig(),
      deskRolePromise,
    ]);
    frontDeskConfig = frontDeskConfigRes;
    frontDeskCollections = await listFrontDeskCollections(
      deskRoleRes.data?.provider_id ? (deskRoleRes.data.provider_id as string) : undefined
    );
  }

  let patientPortalData: RealPatientPortalData | undefined;
  if (workspace === "patient") {
    patientPortalData = await getRealPatientPortalData(user.id);
  }

  let realPatients: RealPatientSummary[] | undefined;
  if (workspace === "doctor" || workspace === "front-desk" || workspace === "lab") {
    realPatients = await listRealPatients();
  }

  // Owner feedback 2026-11-21: the lab "Reports issued" page listed hard-coded
  // demo rows — it now shows the real reports registry (D10: degrades to []).
  let labReports: LabReportSummary[] | undefined;
  if (workspace === "lab") {
    labReports = await listRecentLabReports();
  }

  // Owner feedback 2026-11-21: the pharmacy dispenses/bills pages were copies
  // of the resolve card — they now show the pharmacist's OWN recorded actions
  // (strictly self-scoped, brief §4 narrow-scope rule).
  let pharmacyActivity: PharmacyActivity | undefined;
  if (workspace === "pharmacy") {
    pharmacyActivity = await listMyPharmacyActivity(user.id);
  }

  // Brief 7.2: saved prescription templates for the <30s issuing flow. Degrades to
  // an empty list when the templates migration has not been applied yet.
  let doctorTemplates: DoctorTemplateSummary[] | undefined;
  let doctorRecentPrescriptions: DoctorRecentPrescription[] | undefined;
  if (workspace === "doctor") {
    // S14 (async-parallel): templates and the issuing history are independent
    // reads; both degrade internally, exactly as before.
    const [templatesRes, prescriptionsRes] = await Promise.all([
      listDoctorTemplates(),
      listDoctorRecentPrescriptions(user.id),
    ]);
    doctorTemplates = templatesRes;
    // Brief 7.2: repeat-last-prescription — the doctor's own issuing history,
    // self-scoped to the authenticated user id. Degrades to [].
    doctorRecentPrescriptions = prescriptionsRes;
  }

  // P2-9/P2-10 (brief 8.6): the provider admin's real staff + ledger data,
  // strictly self-scoped to their own organization inside the action.
  let providerAdminData: ProviderAdminData | undefined;
  if (workspace === "provider-admin") {
    providerAdminData = await getProviderAdminData();
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
      adminAuditEvents={adminAuditEvents}
      platformConfig={platformConfig}
      frontDeskConfig={frontDeskConfig}
      frontDeskCollections={frontDeskCollections}
      providerAdminData={providerAdminData}
      patientPortalData={patientPortalData}
      realPatients={realPatients}
      labReports={labReports}
      pharmacyActivity={pharmacyActivity}
      doctorTemplates={doctorTemplates}
      doctorRecentPrescriptions={doctorRecentPrescriptions}
    />
  );
}
