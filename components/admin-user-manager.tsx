"use client";

import { useActionState, useEffect, useState } from "react";
import { Search, ShieldCheck, UserCog, UserRoundX } from "lucide-react";
import { grantAdminRoleAction, revokeAdminRoleAction, searchAdminDirectoryAction, type AdminRoleActionState } from "@/lib/admin/actions";
import type { AdminApprovedProvider, AdminDirectoryUser } from "@/lib/admin/types";
import type { HardRole } from "@/lib/auth/roles";

const initialActionState: AdminRoleActionState = { error: null, success: null };
const roleOptions: { value: HardRole; label: string; providerScoped: boolean }[] = [
  { value: "patient", label: "Patient", providerScoped: false },
  { value: "doctor", label: "Doctor", providerScoped: true },
  { value: "front_desk", label: "Front desk", providerScoped: true },
  { value: "pharmacist", label: "Pharmacist", providerScoped: true },
  { value: "lab_tech", label: "Lab technician", providerScoped: true },
  { value: "provider_admin", label: "Provider admin", providerScoped: true },
  { value: "platform_admin", label: "Platform admin", providerScoped: false },
];
const roleLabel = Object.fromEntries(roleOptions.map((role) => [role.value, role.label])) as Record<HardRole, string>;

export function AdminUserManager({ initialUsers, providers }: { initialUsers: AdminDirectoryUser[]; providers: AdminApprovedProvider[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(initialUsers.length);
  const [hasMore, setHasMore] = useState(initialUsers.length === 100);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [selectedRole, setSelectedRole] = useState<HardRole>("patient");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [grantState, grantFormAction, grantPending] = useActionState(grantAdminRoleAction, initialActionState);
  const [revokeState, revokeFormAction, revokePending] = useActionState(revokeAdminRoleAction, initialActionState);
  const providerScoped = roleOptions.find((role) => role.value === selectedRole)?.providerScoped ?? false;

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = search.trim();
    if (value.length > 120) {
      setDirectoryError("Search is limited to 120 characters.");
      return;
    }
    setDirectoryBusy(true);
    setDirectoryError(null);
    const result = await searchAdminDirectoryAction(value, 0);
    setDirectoryBusy(false);
    setDirectoryError(result.error);
    if (!result.error) {
      setUsers(result.users);
      setAppliedSearch(value);
      setOffset(result.users.length);
      setHasMore(result.users.length === 100);
    }
  }

  async function loadMore() {
    if (directoryBusy || !hasMore) return;
    setDirectoryBusy(true);
    setDirectoryError(null);
    const result = await searchAdminDirectoryAction(appliedSearch, offset);
    setDirectoryBusy(false);
    setDirectoryError(result.error);
    if (!result.error) {
      setUsers((current) => [...current, ...result.users]);
      setOffset((current) => current + result.users.length);
      setHasMore(result.users.length === 100);
    }
  }

  return <div className="secure-admin-directory">
    <section className="secure-admin-callout" aria-label="Administrator role safety">
      <ShieldCheck size={18} />
      <div><strong>Database-enforced role controls</strong><p>Only an active platform admin can grant or revoke H.A.R.D roles. Provider staff roles require an approved provider. The last active platform admin cannot be removed.</p></div>
    </section>
    <p className="secure-admin-boundary">This page manages H.A.R.D application access only; it does not grant Supabase project or database-owner privileges. Clinical-record access remains at its current policy scope.</p>

    <section className="secure-panel secure-admin-grant">
      <div className="secure-panel-head"><div><p className="secure-eyebrow">Role assignment</p><h2>Grant access</h2></div><UserCog size={18} /></div>
      <form action={grantFormAction} className="admin-grant-grid">
        <label className="secure-field"><span>Account</span><select name="user_id" required defaultValue="" disabled={!users.length}><option value="" disabled>Select an account</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.email || user.display_name} · {user.user_id.slice(0, 8)}</option>)}</select></label>
        <label className="secure-field"><span>H.A.R.D role</span><select name="role" value={selectedRole} onChange={(event) => { const nextRole = event.target.value as HardRole; setSelectedRole(nextRole); if (!roleOptions.find((role) => role.value === nextRole)?.providerScoped) setSelectedProvider(""); }}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <label className="secure-field"><span>Approved provider {providerScoped ? "(required)" : "(not used)"}</span><select name="provider_id" value={providerScoped ? selectedProvider : ""} onChange={(event) => setSelectedProvider(event.target.value)} disabled={!providerScoped} required={providerScoped}><option value="">{providerScoped ? "Select an approved provider" : "No provider scope"}</option>{providers.map((provider) => <option key={provider.provider_id} value={provider.provider_id}>{provider.provider_name} · {provider.provider_type}</option>)}</select></label>
        <button type="submit" className="secure-primary admin-grant-button" disabled={grantPending || !users.length || (providerScoped && !selectedProvider)}>{grantPending ? "Saving…" : "Grant role"}</button>
      </form>
      {grantState.error && <p role="alert" className="secure-error mt-4">{grantState.error}</p>}
      {grantState.success && <p role="status" className="secure-success mt-4">{grantState.success}</p>}
      {!users.length && <p className="secure-admin-boundary mt-3">No accounts are available in this directory page yet.</p>}
      {providerScoped && !providers.length && <p className="secure-admin-boundary mt-3">No approved provider is available for provider-scoped roles.</p>}
    </section>

    <section className="secure-panel secure-admin-directory-panel">
      <div className="secure-panel-head"><div><p className="secure-eyebrow">Account directory</p><h2>Users &amp; roles</h2></div><span className="verified-chip">{users.length} shown</span></div>
      <form className="admin-directory-search" onSubmit={runSearch} role="search"><label className="sr-only" htmlFor="admin-user-search">Search account email or name</label><input id="admin-user-search" type="search" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or display name" /><button className="secure-secondary" type="submit" disabled={directoryBusy}><Search size={15} />{directoryBusy ? "Searching…" : "Search"}</button></form>
      {directoryError && <p role="alert" className="secure-error mt-3">{directoryError}</p>}
      <div className="admin-directory-table-wrap"><table className="admin-directory-table"><thead><tr><th scope="col">Account</th><th scope="col">H.A.R.D roles</th><th scope="col">Created</th></tr></thead><tbody>
        {users.map((user) => <tr key={user.user_id}><td><strong>{user.display_name}</strong><span>{user.email || "Email not available"}</span><small>{user.user_id.slice(0, 8)}…</small></td><td>{user.roles.length ? <div className="admin-role-list">{user.roles.map((role) => <div key={`${role.role}:${role.provider_id ?? "none"}`} className="admin-role-item"><span className={`admin-role-chip ${role.is_active ? "active" : "inactive"}`}>{roleLabel[role.role]}{role.is_active ? "" : " · revoked"}{role.provider_name ? ` · ${role.provider_name}` : ""}</span>{role.is_active && <form action={revokeFormAction}><input type="hidden" name="user_id" value={user.user_id} /><input type="hidden" name="role" value={role.role} /><input type="hidden" name="provider_id" value={role.provider_id ?? ""} /><button type="submit" className="admin-revoke-button" disabled={revokePending} aria-label={`Revoke ${roleLabel[role.role]} role from ${user.email || user.display_name}`}><UserRoundX size={14} />Revoke</button></form>}</div>)}</div> : <span className="admin-role-chip pending">No role · pending assignment</span>}</td><td>{user.created_at.slice(0, 10)}</td></tr>)}
        {!users.length && <tr><td colSpan={3} className="admin-directory-empty">{directoryBusy ? "Loading accounts…" : "No accounts matched this search."}</td></tr>}
      </tbody></table></div>
      {revokeState.error && <p role="alert" className="secure-error mt-3">{revokeState.error}</p>}
      {revokeState.success && <p role="status" className="secure-success mt-3">{revokeState.success}</p>}
      {hasMore && <button type="button" className="secure-secondary mt-4" onClick={loadMore} disabled={directoryBusy}><Search size={14} />{directoryBusy ? "Loading…" : "Load next 100 accounts"}</button>}
    </section>
  </div>;
}
