import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * P2-13 (brief Section 6 / acceptance criteria): amending a prescription
 * cancels the old QR (status → cancelled) and issues a NEW VERSION
 * (version = old + 1, supersedes_id = old id); the old record is kept and no
 * second consultation fee is charged.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabaseAdmin } = await import("@/tests/fake-supabase");
  const state = {
    original: null as null | Record<string, unknown>,
    updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    rxInserts: [] as Array<Record<string, unknown>>,
    itemInserts: [] as Array<Array<Record<string, unknown>>>,
    auditInserts: [] as Array<Record<string, unknown>>,
    costInserts: [] as Array<Record<string, unknown>>,
  };
  return {
    __state: state,
    createSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "doctor-1" } }, error: null }) },
    }),
    createSupabaseAdminClient: () =>
      createFakeSupabaseAdmin((chain) => {
        if (chain.table === "config") return { data: [], error: null };
        if (chain.table === "user_roles") {
          return { data: { provider_id: "prov-1" }, error: null };
        }
        if (chain.table === "prescriptions") {
          if (chain.kind === "select" && typeof chain.filters.id === "string") {
            return { data: state.original, error: state.original ? null : { code: "PGRST116", message: "not found" } };
          }
          if (chain.kind === "update") {
            state.updates.push({ id: String(chain.filters.id), payload: (chain.payload ?? {}) as Record<string, unknown> });
            return { data: null, error: null };
          }
          if (chain.kind === "insert") {
            const row = { ...(chain.payload as Record<string, unknown>), id: "new-rx-id" };
            state.rxInserts.push(row);
            return { data: row, error: null };
          }
        }
        if (chain.table === "prescription_items" && chain.kind === "insert") {
          state.itemInserts.push((chain.payload ?? []) as Array<Record<string, unknown>>);
          return { data: null, error: null };
        }
        if (chain.table === "audit_events" && chain.kind === "insert") {
          state.auditInserts.push((chain.payload ?? {}) as Record<string, unknown>);
          return { data: null, error: null };
        }
        if (chain.table === "cost_items" && chain.kind === "insert") {
          state.costInserts.push((chain.payload ?? {}) as Record<string, unknown>);
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
  };
});

import { amendRealPrescription } from "@/lib/provider/actions";

const serverModule = (await import("@/lib/supabase/server")) as unknown as {
  __state: {
    original: Record<string, unknown> | null;
    updates: Array<{ id: string; payload: Record<string, unknown> }>;
    rxInserts: Array<Record<string, unknown>>;
    itemInserts: Array<Array<Record<string, unknown>>>;
    auditInserts: Array<Record<string, unknown>>;
    costInserts: Array<Record<string, unknown>>;
  };
};

const baseOriginal = {
  id: "rx-original",
  patient_id: "patient-1",
  status: "active",
  version: 1,
  prescription_code: "RX-AAAA-BBBB",
};

beforeEach(() => {
  serverModule.__state.original = { ...baseOriginal };
  serverModule.__state.updates = [];
  serverModule.__state.rxInserts = [];
  serverModule.__state.itemInserts = [];
  serverModule.__state.auditInserts = [];
  serverModule.__state.costInserts = [];
});

const items = [
  { medicine: "Amoxicillin", strength: "500 mg", dose: "1 cap", frequency: "TDS", duration: "5 days", quantity: 15 },
];

describe("amendRealPrescription (brief Section 6: new version + cancelled old QR)", () => {
  it("cancels the original, inserts v2 with supersedes_id, keeps the fee off the cost ledger, and audits", async () => {
    const res = await amendRealPrescription({
      originalId: "rx-original",
      patientId: "patient-1",
      consultationCost: 3500,
      note: "Corrected dose",
      items,
    });

    // old QR cancelled, row kept (update, not delete)
    expect(serverModule.__state.updates).toEqual([{ id: "rx-original", payload: { status: "cancelled" } }]);

    // new version linked back to the original
    expect(serverModule.__state.rxInserts).toHaveLength(1);
    const insert = serverModule.__state.rxInserts[0];
    expect(insert.version).toBe(2);
    expect(insert.supersedes_id).toBe("rx-original");
    expect(insert.status).toBe("active");
    expect(insert.patient_id).toBe("patient-1");
    expect(insert.provider_id).toBe("prov-1");
    expect(insert.doctor_user_id).toBe("doctor-1");
    expect(String(insert.prescription_code)).toMatch(/^RX-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(insert.consultation_cost).toBe(3500);

    // amended items written to the NEW prescription only
    expect(serverModule.__state.itemInserts).toEqual([[{ ...items[0], prescription_id: "new-rx-id", quantity: 15 }]]);

    // the consultation fee is NOT re-charged (no cost_items insert)
    expect(serverModule.__state.costInserts).toHaveLength(0);

    // audited with amendment metadata
    expect(serverModule.__state.auditInserts).toHaveLength(1);
    const audit = serverModule.__state.auditInserts[0];
    expect(audit.event_type).toBe("write");
    expect(audit.resource_type).toBe("prescription");
    expect(audit.actor_user_id).toBe("doctor-1");
    expect(audit.patient_id).toBe("patient-1");
    expect(audit.metadata).toMatchObject({ action: "prescription_amended", original_code: "RX-AAAA-BBBB", version: 2 });

    expect(res.version).toBe(2);
    expect(res.supersedesCode).toBe("RX-AAAA-BBBB");
    expect(res.id).toBe("new-rx-id");
    expect(res.code).toBe(String(insert.prescription_code));
  });

  it("rejects amending a prescription that was already superseded (cancelled)", async () => {
    serverModule.__state.original = { ...baseOriginal, status: "cancelled" };
    await expect(
      amendRealPrescription({ originalId: "rx-original", patientId: "patient-1", items })
    ).rejects.toThrow("already cancelled");
    expect(serverModule.__state.rxInserts).toHaveLength(0);
    expect(serverModule.__state.updates).toHaveLength(0);
  });

  it("rejects amending a fully dispensed prescription", async () => {
    serverModule.__state.original = { ...baseOriginal, status: "dispensed" };
    await expect(
      amendRealPrescription({ originalId: "rx-original", patientId: "patient-1", items })
    ).rejects.toThrow("fully dispensed");
  });

  it("rejects a patient mismatch between the amendment and the original", async () => {
    await expect(
      amendRealPrescription({ originalId: "rx-original", patientId: "patient-OTHER", items })
    ).rejects.toThrow("different patient");
  });

  it("rejects an amendment with no medicine lines", async () => {
    await expect(
      amendRealPrescription({ originalId: "rx-original", patientId: "patient-1", items: [] })
    ).rejects.toThrow("at least one medicine");
  });

  it("allows amending an expired prescription (the correction revives the treatment as a new version)", async () => {
    serverModule.__state.original = { ...baseOriginal, status: "expired" };
    const res = await amendRealPrescription({ originalId: "rx-original", patientId: "patient-1", items });
    expect(res.version).toBe(2);
    expect(serverModule.__state.updates[0].payload).toEqual({ status: "cancelled" });
  });
});
