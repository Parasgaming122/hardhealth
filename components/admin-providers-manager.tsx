"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Edit3, Plus, RotateCcw, Search, ShieldAlert, UserX, UsersRound, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import {
  type ProviderRecord,
  type ProviderActionState,
  updateProviderStatusAction,
  editProviderDetailsAction,
  createProviderAction,
} from "@/lib/admin/provider-actions";

const initialState: ProviderActionState = { error: null, success: null };

export function AdminProvidersManager({ initialProviders }: { initialProviders: ProviderRecord[] }) {
  const [providers, setProviders] = useState(initialProviders);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Server actions call revalidatePath, which re-renders the workspace with fresh
  // provider records. Mirror the AdminUserManager convention: sync local state when
  // the server passes new props, so create/edit/status changes reflect without a
  // full page reload.
  useEffect(() => {
    setProviders(initialProviders);
  }, [initialProviders]);

  // Modals state
  const [editingProvider, setEditingProvider] = useState<ProviderRecord | null>(null);
  const [confirmSuspendProvider, setConfirmSuspendProvider] = useState<ProviderRecord | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Server actions
  const [statusState, statusFormAction, statusPending] = useActionState(updateProviderStatusAction, initialState);
  const [editState, editFormAction, editPending] = useActionState(editProviderDetailsAction, initialState);
  const [createState, createFormAction, createPending] = useActionState(createProviderAction, initialState);

  const filtered = providers.filter((p) => {
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.license_number && p.license_number.toLowerCase().includes(search.toLowerCase())) ||
      p.provider_type.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="secure-panel">
        <div className="secure-panel-head">
          <div>
            <p className="secure-eyebrow">Platform Administration</p>
            <h2>Provider organization management</h2>
            <p className="secure-panel-copy">
              Manage approved, pending, and suspended healthcare providers. Suspensions and deactivations are non-destructive (soft-deactivations) to preserve patient and historical audit records.
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus size={14} /> Add Provider Organization
          </Button>
        </div>

        {statusState.error && <p role="alert" className="secure-error mt-4">{statusState.error}</p>}
        {statusState.success && <p role="status" className="secure-success mt-4">{statusState.success}</p>}
        {editState.error && <p role="alert" className="secure-error mt-4">{editState.error}</p>}
        {editState.success && <p role="status" className="secure-success mt-4">{editState.success}</p>}
        {createState.error && <p role="alert" className="secure-error mt-4">{createState.error}</p>}
        {createState.success && <p role="status" className="secure-success mt-4">{createState.success}</p>}

        {/* Filter bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {["all", "approved", "pending", "suspended", "rejected"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  filterStatus === st
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st} ({st === "all" ? providers.length : providers.filter((p) => p.status === st).length})
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input !h-9 !py-0 !pl-8 !text-xs !w-64"
              placeholder="Filter by name, license or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Providers Table */}
        <div className="admin-directory-table-wrap mt-4">
          <table className="admin-directory-table">
            <thead>
              <tr>
                <th scope="col">Organization</th>
                <th scope="col">Type</th>
                <th scope="col">License</th>
                <th scope="col">Active Staff</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.last_note && <span className="text-[10px] text-slate-400">Note: {p.last_note}</span>}
                  </td>
                  <td className="capitalize font-medium text-slate-700">{p.provider_type}</td>
                  <td className="font-mono text-xs">{p.license_number || "Unlicensed"}</td>
                  <td>
                    <span className="inline-flex items-center gap-1 text-slate-600 font-semibold text-xs">
                      <UsersRound size={13} /> {p.staff_count ?? 0} staff
                    </span>
                  </td>
                  <td>
                    <span
                      className={`admin-role-chip ${
                        p.status === "approved"
                          ? "active"
                          : p.status === "suspended"
                          ? "inactive"
                          : p.status === "pending"
                          ? "pending"
                          : "inactive"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProvider(p)}
                        className="btn-icon !h-7 !w-7"
                        title="Edit organization details"
                      >
                        <Edit3 size={13} />
                      </button>

                      {p.status === "pending" && (
                        <form action={statusFormAction} className="inline-flex gap-1.5">
                          <input type="hidden" name="provider_id" value={p.id} />
                          <input type="hidden" name="action" value="approve" />
                          <button
                            type="submit"
                            disabled={statusPending}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-800"
                          >
                            <Check size={11} /> Approve
                          </button>
                        </form>
                      )}

                      {p.status === "pending" && (
                        <form action={statusFormAction} className="inline-flex gap-1.5">
                          <input type="hidden" name="provider_id" value={p.id} />
                          <input type="hidden" name="action" value="reject" />
                          <input type="hidden" name="note" value="Documentation insufficient" />
                          <button
                            type="submit"
                            disabled={statusPending}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-700"
                          >
                            <X size={11} /> Reject
                          </button>
                        </form>
                      )}

                      {p.status === "approved" && (
                        <button
                          type="button"
                          onClick={() => setConfirmSuspendProvider(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                        >
                          <UserX size={11} /> Suspend
                        </button>
                      )}

                      {(p.status === "suspended" || p.status === "rejected") && (
                        <form action={statusFormAction} className="inline-flex gap-1.5">
                          <input type="hidden" name="provider_id" value={p.id} />
                          <input type="hidden" name="action" value="reinstate" />
                          <input type="hidden" name="note" value="Administrative review cleared" />
                          <button
                            type="submit"
                            disabled={statusPending}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-800"
                          >
                            <RotateCcw size={11} /> Reinstate
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="admin-directory-empty">
                    No providers matched your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Provider Modal */}
      {editingProvider && (
        <Modal open={true} onOpenChange={(o) => { if (!o) setEditingProvider(null); }} title="Edit Provider Organization" description="Update the organization's name, type, or license number.">
          <form
            action={async (formData) => {
              await editFormAction(formData);
              setEditingProvider(null);
            }}
            className="space-y-4"
          >
            <input type="hidden" name="provider_id" value={editingProvider.id} />
            <div className="field">
              <label>Organization Name *</label>
              <input name="name" className="input" defaultValue={editingProvider.name} required />
            </div>
            <div className="field">
              <label>Provider Type</label>
              <select name="provider_type" className="select" defaultValue={editingProvider.provider_type}>
                <option value="clinic">Clinic</option>
                <option value="hospital">Hospital</option>
                <option value="lab">Laboratory</option>
                <option value="pharmacy">Pharmacy</option>
              </select>
            </div>
            <div className="field">
              <label>License Number</label>
              <input name="license_number" className="input font-mono" defaultValue={editingProvider.license_number || ""} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditingProvider(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog for Suspend / Deactivate */}
      {confirmSuspendProvider && (
        <Modal
          open={true}
          onOpenChange={(o) => { if (!o) setConfirmSuspendProvider(null); }}
          title="Confirm Organization Suspension"
          description="Soft-deactivate this provider while preserving all patient histories, bills, and audit records."
        >
          <div className="space-y-4">
            <div className="notice amber">
              <ShieldAlert size={18} className="shrink-0 text-amber-700" />
              <span>
                <strong>Soft-Deactivation Notice:</strong> In accordance with H.A.R.D Business Rule 3, records are never hard-deleted. Suspending <strong>{confirmSuspendProvider.name}</strong> will revoke active staff permissions and block new prescription/lab issuing, while all existing patient histories, issued bills, and ledgers remain preserved for audit integrity.
              </span>
            </div>

            <form
              action={async (formData) => {
                await statusFormAction(formData);
                setConfirmSuspendProvider(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="provider_id" value={confirmSuspendProvider.id} />
              <input type="hidden" name="action" value="suspend" />
              <div className="field">
                <label>Reason for Suspension / Admin Note *</label>
                <input
                  name="note"
                  className="input"
                  placeholder="e.g. License renewal audit in progress, compliance check pending"
                  required
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setConfirmSuspendProvider(null)}>
                  Cancel
                </Button>
                <button
                  type="submit"
                  disabled={statusPending}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition"
                >
                  {statusPending ? "Suspending…" : "Confirm Soft-Suspension"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Add New Provider Modal */}
      {isAddOpen && (
        <Modal
          open={true}
          onOpenChange={(o) => { if (!o) setIsAddOpen(false); }}
          title="Register Provider Organization"
          description="Create a provider organization record directly in the H.A.R.D registry."
        >
          <form
            action={async (formData) => {
              await createFormAction(formData);
              setIsAddOpen(false);
            }}
            className="space-y-4"
          >
            <div className="field">
              <label>Organization Name *</label>
              <input name="name" className="input" placeholder="e.g. Al-Shifa Diagnostic Centre" required />
            </div>
            <div className="field">
              <label>Provider Type</label>
              <select name="provider_type" className="select" defaultValue="clinic">
                <option value="clinic">Clinic</option>
                <option value="hospital">Hospital</option>
                <option value="lab">Laboratory</option>
                <option value="pharmacy">Pharmacy</option>
              </select>
            </div>
            <div className="field">
              <label>License Number</label>
              <input name="license_number" className="input font-mono" placeholder="e.g. PHC-2026-9912" />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="auto_approve" name="auto_approve" defaultChecked />
              <label htmlFor="auto_approve" className="text-xs text-slate-700 font-semibold cursor-pointer">
                Approve immediately (Platform Admin verified)
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPending}>
                {createPending ? "Registering…" : "Register Organization"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
