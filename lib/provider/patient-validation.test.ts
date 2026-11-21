import { describe, expect, it } from "vitest";
import {
  formatPakistaniPhone,
  normalizePakistaniPhone,
  validatePatientRegistration,
} from "./patient-validation";

/**
 * Owner feedback 2026-11-21: the front-desk registration form accepted any
 * digit string as a phone number ("30 numbers and it's nothing"). These tests
 * pin the shared validation used by BOTH the client form and the server
 * action, plus the phone normalization rules.
 */

const valid = {
  fullName: "Zainab Noor",
  cnic: "42101-1234567-1",
  phone: "0300-1234567",
  email: "zainab.noor@example.com",
  dob: "1994-06-15",
};

describe("validatePatientRegistration", () => {
  it("accepts a fully filled form and normalizes every field", () => {
    const res = validatePatientRegistration(valid);
    expect(res).toEqual({
      ok: true,
      value: {
        fullName: "Zainab Noor",
        cnic: "4210112345671",
        phone: "03001234567",
        email: "zainab.noor@example.com",
        dob: "1994-06-15",
      },
    });
  });

  it("accepts a form without email or dob (both optional)", () => {
    const res = validatePatientRegistration({ ...valid, email: "", dob: "" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.email).toBeNull();
      expect(res.value.dob).toBeNull();
    }
  });

  it("collapses extra whitespace and letter-case in the name", () => {
    const res = validatePatientRegistration({ ...valid, fullName: "  Muhammad   Ali  " });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.fullName).toBe("Muhammad Ali");
  });

  it("rejects names that are too short, numeric or full of symbols", () => {
    expect(validatePatientRegistration({ ...valid, fullName: "Z" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, fullName: "123456" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, fullName: "Ali <script>" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, fullName: "" }).ok).toBe(false);
  });

  it("accepts Urdu-script names", () => {
    const res = validatePatientRegistration({ ...valid, fullName: "محمد علی" });
    expect(res.ok).toBe(true);
  });

  it("requires exactly 13 CNIC digits and strips formatting", () => {
    const twelve = validatePatientRegistration({ ...valid, cnic: "42101-123456-7" }); // 12 digits
    expect(twelve.ok).toBe(false);
    const fourteen = validatePatientRegistration({ ...valid, cnic: "42101-1234567-89" });
    expect(fourteen.ok).toBe(false);
    const ok = validatePatientRegistration({ ...valid, cnic: "4210112345671" });
    expect(ok.ok).toBe(true);
  });

  it("rejects absurd phone input (the reported '30 numbers' bug)", () => {
    const thirtyDigits = validatePatientRegistration({
      ...valid,
      phone: "0300123456789012345678901234567",
    });
    expect(thirtyDigits.ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, phone: "12345" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, phone: "" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, phone: "not-a-phone" }).ok).toBe(false);
  });

  it("accepts and normalizes common Pakistani phone formats", () => {
    const cases = [
      ["0300-1234567", "03001234567"], // mobile with dash
      ["0300 1234567", "03001234567"], // mobile with space
      ["+92 300 1234567", "03001234567"], // country code
      ["923001234567", "03001234567"], // bare country code
      ["042-35778800", "04235778800"], // landline
    ] as const;
    for (const [raw, expected] of cases) {
      const res = validatePatientRegistration({ ...valid, phone: raw });
      expect(res.ok, raw).toBe(true);
      if (res.ok) expect(res.value.phone).toBe(expected);
    }
  });

  it("rejects invalid emails but accepts valid ones of any case", () => {
    expect(validatePatientRegistration({ ...valid, email: "not-an-email" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, email: "a@b" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, email: "a b@c.com" }).ok).toBe(false);
    const res = validatePatientRegistration({ ...valid, email: "Zainab.Noore@Example.COM " });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.email).toBe("zainab.noore@example.com");
  });

  it("rejects future or impossible dates of birth", () => {
    expect(validatePatientRegistration({ ...valid, dob: "2999-01-01" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, dob: "1850-01-01" }).ok).toBe(false);
    expect(validatePatientRegistration({ ...valid, dob: "not-a-date" }).ok).toBe(false);
  });
});

describe("normalizePakistaniPhone / formatPakistaniPhone", () => {
  it("normalizes country-code and dashed forms to 0-prefixed digits", () => {
    expect(normalizePakistaniPhone("+92-300-1234567")).toBe("03001234567");
    expect(normalizePakistaniPhone("(0300) 123 4567")).toBe("03001234567");
    expect(normalizePakistaniPhone("042 3577 8800")).toBe("04235778800");
  });

  it("returns null for anything that is not a Pakistani number", () => {
    expect(normalizePakistaniPhone("")).toBeNull();
    expect(normalizePakistaniPhone("1-555-0100")).toBeNull(); // US-style
    expect(normalizePakistaniPhone("030012345")).toBeNull(); // too short
    expect(normalizePakistaniPhone("030012345678")).toBeNull(); // too long
  });

  it("formats normalized digits for display", () => {
    expect(formatPakistaniPhone("03001234567")).toBe("0300-1234567");
    expect(formatPakistaniPhone("04235778800")).toBe("04235778800");
  });
});
