import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * D16/D20 regression tests: Health IDs are generated from max(health_id) with
 * a FRESH re-read on every retry — never count(*). The production incident
 * (owner's admin account switching to the patient workspace, Session 11) was
 * the pre-D16 count-based code colliding with the baseline patient
 * HARD-000102 on every new patient row.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabaseAdmin } = await import("@/tests/fake-supabase");
  const state = {
    patients: [] as Array<Record<string, unknown>>,
    /** Sneak a competing row in just before a specific insert attempt resolves. */
    raceOnAttempt: null as null | ((attempt: number, healthId: string) => void),
    failEveryInsertWith: null as null | { code: string; message: string },
    insertAttempts: [] as string[],
  };
  return {
    __state: state,
    createSupabaseAdminClient: () =>
      createFakeSupabaseAdmin((chain) => {
        if (chain.table === "config") return { data: [], error: null };
        if (chain.table !== "patients") return { data: null, error: null };

        // select * ... eq user_id → find by user id
        if (chain.kind === "select" && typeof chain.filters.user_id === "string") {
          return { data: state.patients.find((p) => p.user_id === chain.filters.user_id) ?? null, error: null };
        }
        // max(health_id) probe (select "health_id", no filters)
        if (chain.kind === "select" && !Object.keys(chain.filters).length) {
          const sorted = [...state.patients].sort((a, b) =>
            String(b.health_id).localeCompare(String(a.health_id))
          );
          return { data: sorted.length ? { health_id: sorted[0].health_id } : null, error: null };
        }
        // insert
        if (chain.kind === "insert") {
          const row = { ...(chain.payload as Record<string, unknown>) };
          const attempt = state.insertAttempts.length;
          state.insertAttempts.push(String(row.health_id));
          state.raceOnAttempt?.(attempt, String(row.health_id));
          if (state.failEveryInsertWith) {
            return { data: null, error: state.failEveryInsertWith };
          }
          if (state.patients.some((p) => p.health_id === row.health_id)) {
            return {
              data: null,
              error: {
                code: "23505",
                message: `duplicate key value violates unique constraint "patients_health_id_key"`,
              },
            };
          }
          if (row.user_id && state.patients.some((p) => p.user_id === row.user_id)) {
            return {
              data: null,
              error: {
                code: "23505",
                message: `duplicate key value violates unique constraint "patients_user_id_key"`,
              },
            };
          }
          const inserted = { id: `row-${state.patients.length + 1}`, ...row };
          state.patients.push(inserted);
          return { data: inserted, error: null };
        }
        return { data: null, error: null };
      }),
  };
});

import { ensurePatientRecord } from "@/lib/patient/real-patient";

const serverModule = (await import("@/lib/supabase/server")) as unknown as {
  __state: {
    patients: Array<Record<string, unknown>>;
    raceOnAttempt: ((attempt: number, healthId: string) => void) | null;
    failEveryInsertWith: { code: string; message: string } | null;
    insertAttempts: string[];
  };
};

const baseline = {
  id: "baseline-row",
  user_id: "user-baseline",
  health_id: "HARD-000102",
  full_name: "Paras sadjia",
  date_of_birth: null,
  gender: null,
  blood_group: "O+",
};

beforeEach(() => {
  serverModule.__state.patients = [{ ...baseline }];
  serverModule.__state.raceOnAttempt = null;
  serverModule.__state.failEveryInsertWith = null;
  serverModule.__state.insertAttempts = [];
});

describe("ensurePatientRecord (D16/D20 health-id generation)", () => {
  it("returns the existing row for a user who already has one, without inserting", async () => {
    const record = await ensurePatientRecord("user-baseline");
    expect(record.healthId).toBe("HARD-000102");
    expect(serverModule.__state.insertAttempts).toHaveLength(0);
  });

  it("issues the next serial after the current max (the owner's admin-account scenario)", async () => {
    // Pre-D16 the code derived the serial from count(*)+101, which with the
    // single baseline patient computed HARD-000102 and collided with it — the
    // exact runtime error reported ("duplicate key value violates unique
    // constraint patients_health_id_key"). max(health_id)+1 must give 103.
    const record = await ensurePatientRecord("user-admin");
    expect(record.healthId).toBe("HARD-000103");
    expect(serverModule.__state.insertAttempts).toEqual(["HARD-000103"]);
    expect(record.userId).toBe("user-admin");
  });

  it("re-reads max(health_id) fresh after losing a serial race and takes the next one", async () => {
    // Another signup commits HARD-000103 between our max-read and insert.
    serverModule.__state.raceOnAttempt = (_attempt, healthId) => {
      if (healthId === "HARD-000103") {
        serverModule.__state.patients.push({
          id: "winner-row",
          user_id: "user-winner",
          health_id: "HARD-000103",
          full_name: "Someone Else",
          date_of_birth: null,
          gender: null,
          blood_group: "O+",
        });
      }
    };

    const record = await ensurePatientRecord("user-admin");
    expect(serverModule.__state.insertAttempts).toEqual(["HARD-000103", "HARD-000104"]);
    expect(record.healthId).toBe("HARD-000104");
  });

  it("recovers when a concurrent request for the SAME user won the insert (patients_user_id_key)", async () => {
    // Two tabs mount /patient/overview at once: tab A inserts our row first.
    // Tab B then hits a health_id race (attempt 1), re-reads max, and its second
    // insert violates patients_user_id_key — B must re-select by user_id and
    // return A's row instead of failing the whole portal.
    serverModule.__state.raceOnAttempt = (_attempt, healthId) => {
      if (healthId === "HARD-000103") {
        serverModule.__state.patients.push({
          id: "tab-a-row",
          user_id: "user-admin",
          health_id: "HARD-000103",
          full_name: "H.A.R.D Patient",
          date_of_birth: null,
          gender: null,
          blood_group: "O+",
        });
      }
    };

    const record = await ensurePatientRecord("user-admin");
    expect(record.id).toBe("tab-a-row");
    expect(record.healthId).toBe("HARD-000103");
    expect(serverModule.__state.insertAttempts).toEqual(["HARD-000103", "HARD-000104"]);
  });

  it("throws a clear error on non-retryable failures instead of looping", async () => {
    serverModule.__state.failEveryInsertWith = { code: "42501", message: "permission denied" };
    await expect(ensurePatientRecord("user-admin")).rejects.toThrow(
      "Could not ensure patient profile: permission denied"
    );
    expect(serverModule.__state.insertAttempts).toHaveLength(1);
  });

  it("gives up after five colliding attempts rather than looping forever", async () => {
    // A pathological adversary always takes the serial we are about to insert.
    serverModule.__state.raceOnAttempt = (_attempt, healthId) => {
      serverModule.__state.patients.push({
        id: `phantom-${healthId}`,
        user_id: `phantom-${healthId}`,
        health_id: healthId,
        full_name: "Phantom",
        date_of_birth: null,
        gender: null,
        blood_group: "O+",
      });
    };
    await expect(ensurePatientRecord("user-admin")).rejects.toThrow("Could not ensure patient profile");
    expect(serverModule.__state.insertAttempts).toHaveLength(5);
  });

  it("starts from HARD-000101 when no parseable health id exists yet", async () => {
    serverModule.__state.patients = [];
    const record = await ensurePatientRecord("user-first");
    expect(record.healthId).toBe("HARD-000101");
  });
});
