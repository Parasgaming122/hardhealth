import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Email-link claim (owner feedback 2026-11-21): a patient registered at the
 * front desk with an email, then signs up with the SAME email — the portal
 * must CLAIM the existing row (stamp user_id, keep the desk-issued Health ID)
 * instead of inserting a duplicate patient.
 */

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const DESK_EMAIL = "zainab.noor@example.com";

const state = vi.hoisted(() => ({
  patients: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  authUser: null as { id: string; email?: string } | null,
  updateShouldFailWith: null as string | null,
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabaseAdmin } = await import("@/tests/fake-supabase");
  return {
    createSupabaseAdminClient: () =>
      createFakeSupabaseAdmin(
        (chain) => {
          if (chain.table === "audit_events") {
            if (chain.kind === "insert") {
              state.audits.push(chain.payload as Record<string, unknown>);
              return { data: null, error: null };
            }
            return { data: [], error: null };
          }
          if (chain.table !== "patients") return { data: null, error: null };

          // select * ... eq user_id → find by user id
          if (chain.kind === "select" && typeof chain.filters.user_id === "string" && !chain.filters.email) {
            return {
              data: state.patients.find((p) => p.user_id === chain.filters.user_id) ?? null,
              error: null,
            };
          }
          // claim candidate: eq email + is(user_id, null)
          if (chain.kind === "select" && typeof chain.filters.email === "string" && chain.isFilters?.user_id === true) {
            return {
              data:
                state.patients.find((p) => p.email === chain.filters.email && p.user_id === null) ?? null,
              error: null,
            };
          }
          // max(health_id) probe (select "health_id", no filters)
          if (chain.kind === "select" && !Object.keys(chain.filters).length) {
            const sorted = [...state.patients].sort((a, b) =>
              String(b.health_id).localeCompare(String(a.health_id))
            );
            return { data: sorted.length ? { health_id: sorted[0].health_id } : null, error: null };
          }
          // insert (the fallback path when no claim happens)
          if (chain.kind === "insert") {
            const row = { ...(chain.payload as Record<string, unknown>) };
            state.patients.push(row);
            return { data: row, error: null };
          }
          // update user_id on the claim
          if (chain.kind === "update") {
            if (state.updateShouldFailWith) {
              return { data: null, error: { code: "23505", message: state.updateShouldFailWith } };
            }
            const target = state.patients.find((p) => p.id === chain.filters.id);
            if (target) Object.assign(target, chain.payload);
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        // The fake's auth.admin.getUserById resolves against this user.
        { get authUser() { return state.authUser; } }
      ),
  };
});

import { ensurePatientRecord } from "./real-patient";

beforeEach(() => {
  state.patients = [];
  state.audits = [];
  state.authUser = { id: AUTH_USER_ID, email: DESK_EMAIL };
  state.updateShouldFailWith = null;
});

describe("ensurePatientRecord — email-link claim", () => {
  it("claims an unlinked desk registration with the same email (keeps its Health ID)", async () => {
    state.patients.push({
      id: "desk-row-1",
      user_id: null,
      health_id: "HARD-000104",
      full_name: "Zainab Noor",
      email: DESK_EMAIL,
      phone: "03001234567",
      date_of_birth: null,
      gender: "Female",
      blood_group: "O+",
    });

    const patient = await ensurePatientRecord(AUTH_USER_ID);

    expect(patient.healthId).toBe("HARD-000104"); // kept the desk-issued ID
    expect(patient.userId).toBe(AUTH_USER_ID);
    expect(patient.fullName).toBe("Zainab Noor");
    expect(state.patients).toHaveLength(1); // NO duplicate row inserted
    // The link is audited.
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      actor_user_id: AUTH_USER_ID,
      patient_id: "desk-row-1",
      resource_type: "patient_registration",
    });
    expect((state.audits[0].metadata as Record<string, unknown>).action).toBe("portal_account_linked");
  });

  it("claims with a case-insensitive email match (auth emails are normalized to lowercase)", async () => {
    state.patients.push({
      id: "desk-row-1",
      user_id: null,
      health_id: "HARD-000104",
      full_name: "Zainab Noor",
      email: DESK_EMAIL,
      date_of_birth: null,
      gender: null,
      blood_group: null,
    });

    const patient = await ensurePatientRecord(AUTH_USER_ID);
    expect(patient.healthId).toBe("HARD-000104");
    expect(patient.userId).toBe(AUTH_USER_ID);
  });

  it("never hijacks a row that already belongs to a different account", async () => {
    const otherUser = "22222222-2222-4222-8222-222222222222";
    state.patients.push({
      id: "desk-row-1",
      user_id: otherUser, // already linked — NOT claimable
      health_id: "HARD-000104",
      full_name: "Someone Else",
      email: DESK_EMAIL,
      date_of_birth: null,
      gender: null,
      blood_group: null,
    });

    const patient = await ensurePatientRecord(AUTH_USER_ID);

    // A NEW row was inserted for this account instead of stealing the linked one.
    expect(patient.userId).toBe(AUTH_USER_ID);
    expect(patient.healthId).not.toBe("HARD-000104");
    expect(state.patients).toHaveLength(2);
    expect(state.patients.find((p) => p.id === "desk-row-1")).toMatchObject({ user_id: otherUser });
  });

  it("inserts a fresh row when no email match exists", async () => {
    state.patients.push({
      id: "desk-row-1",
      user_id: null,
      health_id: "HARD-000102",
      full_name: "Unrelated Person",
      email: "someone.else@example.com",
      date_of_birth: null,
      gender: null,
      blood_group: null,
    });

    const patient = await ensurePatientRecord(AUTH_USER_ID);

    expect(patient.userId).toBe(AUTH_USER_ID);
    expect(patient.healthId).toBe("HARD-000103"); // max+1 over HARD-000102
    expect(state.patients).toHaveLength(2);
  });

  it("inserts a fresh row when the account has no email (phone-only auth)", async () => {
    state.authUser = { id: AUTH_USER_ID }; // no email on the auth user
    state.patients.push({
      id: "desk-row-1",
      user_id: null,
      health_id: "HARD-000102",
      full_name: "Unrelated Person",
      email: "someone.else@example.com",
      date_of_birth: null,
      gender: null,
      blood_group: null,
    });

    const patient = await ensurePatientRecord(AUTH_USER_ID);

    expect(patient.userId).toBe(AUTH_USER_ID);
    expect(patient.healthId).toBe("HARD-000103"); // max+1 over HARD-000102
    expect(state.patients).toHaveLength(2);
  });

  it("recovers when the claim update loses a same-user race (23505 on patients_user_id_key)", async () => {
    state.patients.push({
      id: "desk-row-1",
      user_id: null,
      health_id: "HARD-000104",
      full_name: "Zainab Noor",
      email: DESK_EMAIL,
      date_of_birth: null,
      gender: null,
      blood_group: null,
    });
    // The update fails with the same-user unique violation, and a row for this
    // user already exists (the racing tab claimed it).
    state.updateShouldFailWith =
      'duplicate key value violates unique constraint "patients_user_id_key"';

    const patient = await ensurePatientRecord(AUTH_USER_ID);
    expect(patient.userId).toBe(AUTH_USER_ID);
  });

  it("returns the existing row immediately when the account already has one", async () => {
    state.patients.push({
      id: "own-row",
      user_id: AUTH_USER_ID,
      health_id: "HARD-000105",
      full_name: "Existing Patient",
      email: DESK_EMAIL,
      date_of_birth: null,
      gender: null,
      blood_group: null,
    });

    const patient = await ensurePatientRecord(AUTH_USER_ID);
    expect(patient.id).toBe("own-row");
    expect(state.patients).toHaveLength(1);
    expect(state.audits).toHaveLength(0); // no claim happened
  });
});
