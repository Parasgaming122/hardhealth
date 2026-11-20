"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, FileText, HandCoins, Shield, UserMinus, UserPlus, UsersRound, WalletCards } from "lucide-react";
import { Badge, Button, Modal } from "@/components/ui";
import { dateLabel, pkr } from "@/lib/domain";
import type { ProviderAdminData, ProviderLedgerRow, ProviderStaffMember, StaffRole } from "@/lib/provider-admin/types";
import { STAFF_ROLES } from "@/lib/provider-admin/types";

const ROLE_LABELS: Record<StaffRole, string> = {
  doctor: "Doctor",
  front_desk: "Front desk",
  pharmacist: "Pharmacist",
  lab_tech: "Lab tech",
  provider_admin: "Provider admin",
};

/**
 * P2-9 / P2-10 (brief 8.6 / 7.5 / 11.3): the REAL provider-admin workspace —
 * live organization KPIs, staff sub-role management (add, deactivate with a
 * confirmation dialog, reactivate — never delete; brief Rule 3) and the
 * provider earnings ledger with payout status updates. Replaces the demo
 * panel inside the authenticated workspace (the demo panel stays on /demo).
 */
export function RealProviderAdminPanel({ data: initialData, section = "Overview" }: { data: ProviderAdminData; section?: string }) {
  const [data, setData] = useState<ProviderAdminData>(initialData);
  useEffect(() => setData(initialData), [initialData]);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Add staff dialog
  const [addOpen, setAddOpen] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("doctor");

  // Deactivate/reactivate confirmation (brief 11.3: confirmation dialog + audit)
  const [confirmTarget, setConfirmTarget] = useState<{ member: ProviderStaffMember; active: boolean } | null>(null);

  const orgMissing = !data.providerId;

  const refresh = async () => {
    setBusy(true);
    try {
      const { getProviderAdminData } = await import("@/lib/provider-admin/actions");
      const fresh = await getProviderAdminData();
      if (fresh.providerId) setData(fresh);
    } catch {
      // keep the current view; server actions surface their own errors
    } finally {
      setBusy(false);
    }
  };

  const handleAddStaff = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { addProviderStaffAction } = await import("@/lib/provider-admin/actions");
      const res = await addProviderStaffAction({ email: staffEmail, role: staffRole });
      setStatus(`${res.email} is now ${ROLE_LABELS[res.role]} staff of ${data.providerName}.`);
      setStaffEmail("");
      setAddOpen(false);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add staff");
    } finally {
      setBusy(false);
    }
  };

  const handleSetActive = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { setStaffActiveAction } = await import("@/lib/provider-admin/actions");
      const res = await setStaffActiveAction({ userId: confirmTarget.member.userId, role: confirmTarget.member.role, active: confirmTarget.active });
      setStatus(
        res.active
          ? `${confirmTarget.member.displayName} (${ROLE_LABELS[res.role]}) reactivated — they can sign in to this workspace again.`
          : `${confirmTarget.member.displayName} (${ROLE_LABELS[res.role]}) deactivated — issued records are kept (brief Rule 3); they can no longer use this workspace.`
      );
      setConfirmTarget(null);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update staff status");
    } finally {
      setBusy(false);
    }
  };

  const handlePayout = async (entry: ProviderLedgerRow) => {
    const next = entry.payoutStatus === "settled" ? "pending" : "settled";
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { setPayoutStatusAction } = await import("@/lib/provider-admin/actions");
      await setPayoutStatusAction({ entryId: entry.id, status: next });
      setStatus(`Payout for ${entry.receiptNo || entry.invoiceId.slice(0, 8)} marked ${next}.`);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update payout status");
    } finally {
      setBusy(false);
    }
  };

  if (orgMissing) {
    return (
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Provider admin workspace</h2>
            <div className="card-caption">Real database operations for your organization</div>
          </div>
          <Badge type="pending">No organization</Badge>
        </div>
        <div className="card-body">
          <div className="notice coral">
            <Shield size={14} className="shrink-0" />
            <span>
              Your account does not have an active provider admin role attached to a provider
              organization yet. Ask a platform admin to assign one (Admin → Users), then reload.
            </span>
          </div>
        </div>
      </section>
    );
  }

  const showOverview = section === "Overview";
  return (
    <div className="space-y-6">
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-label"><UsersRound size={15} /> Patients registered</div>
          <div className="kpi-value">{data.kpis.patientsRegistered}</div>
          <div className="kpi-foot">Active links to {data.providerName}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><FileText size={15} /> Documents issued</div>
          <div className="kpi-value">{data.kpis.documentsIssued}</div>
          <div className="kpi-foot">Prescriptions + lab reports</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><WalletCards size={15} /> Fees collected</div>
          <div className="kpi-value">{pkr(data.kpis.feesCollected)}</div>
          <div className="kpi-foot">Paid invoices at this provider</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label"><HandCoins size={15} /> Provider share earned</div>
          <div className="kpi-value">{pkr(data.kpis.shareEarned)}</div>
          <div className="kpi-foot">{pkr(data.kpis.sharePending)} pending payout</div>
        </div>
      </div>

      {status && <div className="notice">{status}</div>}
      {error && <div className="notice coral">{error}</div>}

      {(showOverview || section === "Staff") && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Staff management</h2>
              <div className="card-caption">
                Sub-roles within {data.providerName} · deactivation keeps every issued record (brief Rule 3)
              </div>
            </div>
            <Button size="small" onClick={() => setAddOpen(true)}>
              <UserPlus size={12} /> Add staff
            </Button>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Email</th>
                    <th>Sub-role</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((member) => (
                    <tr key={`${member.userId}-${member.role}`}>
                      <td><strong>{member.displayName}</strong>{member.isSelf && <span className="text-slate-400"> (you)</span>}</td>
                      <td className="mono text-xs">{member.email}</td>
                      <td>{ROLE_LABELS[member.role]}</td>
                      <td><Badge type={member.isActive ? "verified" : "alert"}>{member.isActive ? "Active" : "Deactivated"}</Badge></td>
                      <td>
                        {member.isActive ? (
                          <Button size="small" variant="secondary" disabled={busy || member.isSelf} onClick={() => setConfirmTarget({ member, active: false })}>
                            <UserMinus size={11} /> Deactivate
                          </Button>
                        ) : (
                          <Button size="small" variant="secondary" disabled={busy} onClick={() => setConfirmTarget({ member, active: true })}>
                            <UserPlus size={11} /> Reactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.staff.length === 0 && (
                    <tr><td colSpan={5} className="text-center p-6 text-slate-400 text-xs">No staff roles assigned yet — add your first team member.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {(showOverview || section === "Ledger" || section === "Earnings ledger") && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Earnings ledger</h2>
              <div className="card-caption">Provider share per paid invoice · platform + provider amounts sum to the invoice total (brief Rule 4)</div>
            </div>
            <Badge type={data.kpis.sharePending > 0 ? "pending" : "verified"}>{pkr(data.kpis.sharePending)} pending</Badge>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Invoice total</th>
                    <th>Provider share</th>
                    <th>Platform share</th>
                    <th>Payout</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono font-bold text-emerald-800">{entry.receiptNo || entry.invoiceId.slice(0, 8)}</td>
                      <td className="text-slate-400">{dateLabel(entry.createdAt, { day: "numeric", month: "short" })}</td>
                      <td>{pkr(entry.invoiceTotal)}</td>
                      <td className="font-bold">{pkr(entry.providerAmount)}</td>
                      <td>{pkr(entry.platformAmount)}</td>
                      <td><Badge type={entry.payoutStatus === "settled" ? "verified" : "pending"}>{entry.payoutStatus === "settled" ? "Settled" : "Pending"}</Badge></td>
                      <td>
                        <Button size="small" variant="secondary" disabled={busy} onClick={() => handlePayout(entry)}>
                          <HandCoins size={11} /> {entry.payoutStatus === "settled" ? "Mark pending" : "Mark settled"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.ledger.length === 0 && (
                    <tr><td colSpan={7} className="text-center p-6 text-slate-400 text-xs">No provider-side ledger entries yet — they appear when a registration or upgrade invoice is paid.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Add staff dialog (brief 5.1: approved providers create staff users and assign sub-roles) */}
      <Modal open={addOpen} onOpenChange={setAddOpen} title="Add staff member" description="Assign a provider sub-role to an existing H.A.R.D account within your organization only.">
        <div className="space-y-4">
          <div className="field">
            <label>Account email *</label>
            <input
              className="input"
              type="email"
              placeholder="colleague@example.com"
              value={staffEmail}
              onChange={(e) => setStaffEmail(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-slate-400">The person must already have a H.A.R.D account (sign up first).</p>
          </div>
          <div className="field">
            <label>Sub-role *</label>
            <select className="select" value={staffRole} onChange={(e) => setStaffRole(e.target.value as StaffRole)}>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="small" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="small" disabled={busy || !staffEmail.trim()} onClick={handleAddStaff}>
              <BriefcaseBusiness size={12} /> {busy ? "Working…" : `Assign ${ROLE_LABELS[staffRole]}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deactivate/reactivate confirmation (brief 11.3) */}
      <Modal
        open={!!confirmTarget}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
        title={confirmTarget?.active ? "Reactivate staff member" : "Deactivate staff member"}
        description="This action is recorded in the immutable audit log."
      >
        {confirmTarget && (
          <div className="space-y-4">
            <p className="text-xs leading-5 text-slate-600">
              {confirmTarget.active
                ? `Reactivate ${confirmTarget.member.displayName} (${ROLE_LABELS[confirmTarget.member.role]})? They will be able to sign in and use this workspace again.`
                : `Deactivate ${confirmTarget.member.displayName} (${ROLE_LABELS[confirmTarget.member.role]})? Nothing they issued is deleted — records stay verifiable — but they lose access to this workspace immediately.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="small" onClick={() => setConfirmTarget(null)}>Cancel</Button>
              <Button
                size="small"
                variant={confirmTarget.active ? "primary" : "danger"}
                disabled={busy}
                onClick={handleSetActive}
              >
                {busy ? "Working…" : confirmTarget.active ? "Reactivate" : "Deactivate"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <div className="notice">
        <BadgeCheck size={14} className="shrink-0" />
        <span>
          All staff and payout changes are scoped to {data.providerName} and written to the audit
          log — other organizations are never visible from this workspace.
        </span>
      </div>
    </div>
  );
}
