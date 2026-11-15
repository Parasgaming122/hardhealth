import { notFound, redirect } from "next/navigation";
import { isAllowedWorkspacePath, isAssignedToWorkspace, isPlatformAdmin, sectionTitle, workspaceConfig, type WorkspaceSlug, type WorkspacePayload } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SecureWorkspace } from "@/components/secure-workspace";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";

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
  if (hasPlatformAdmin && workspace === "admin") {
    const { data: summary, error: summaryError } = await supabase.rpc("admin_platform_summary");
    if (summaryError) return unavailable("Administrator aggregate metrics could not be loaded securely.");
    access = { ...access, summary: (summary ?? {}) as WorkspacePayload["summary"] };

    if (section.join("/") === "users") {
      const [{ data: users, error: usersError }, { data: providers, error: providersError }] = await Promise.all([
        supabase.rpc("admin_list_users", { p_search: null, p_limit: 100, p_offset: 0 }),
        supabase.rpc("admin_list_providers", { p_limit: 100 }),
      ]);
      if (usersError || providersError) return unavailable("The administrator account and approved-provider directory could not be loaded securely.");
      adminUsers = (users ?? []) as AdminDirectoryUser[];
      adminProviders = (providers ?? []) as AdminApprovedProvider[];
    }
  }

  return <SecureWorkspace workspace={workspace} sections={section} pageTitle={sectionTitle(workspace, section)} access={access} adminUsers={adminUsers} adminProviders={adminProviders} />;
}
