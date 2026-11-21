/**
 * Shared validation for front-desk patient registration (owner feedback
 * 2026-11-21: the form accepted "30 numbers" as a phone and had no email
 * field). The SAME rules run in the client form (instant per-field feedback)
 * and in `registerRealPatient` on the server (the source of truth — the
 * client can always be bypassed).
 *
 * Pure functions only: this module is imported by a client component, so it
 * must not pull server-only dependencies.
 */

export type PatientRegistrationInput = {
  fullName: string;
  cnic: string;
  phone: string;
  /** Optional — but when present it must be a valid address. */
  email?: string;
  dob?: string;
};

export type ValidatedPatientRegistration = {
  fullName: string;
  /** Exactly 13 digits, dashes stripped. */
  cnic: string;
  /** Digits only, 0-prefixed Pakistani national number (92-country-code forms normalized). */
  phone: string;
  /** Trimmed + lowercased, or null when not provided. */
  email: string | null;
  /** ISO date (yyyy-mm-dd) or null. */
  dob: string | null;
};

export type PatientValidation =
  | { ok: true; value: ValidatedPatientRegistration }
  | { ok: false; field: "fullName" | "cnic" | "phone" | "email" | "dob"; error: string };

/** Letters (Latin + common Urdu/Arabic ranges), spaces, dots, apostrophes, hyphens. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** After normalization: 0 + 9 or 10 more digits (mobile 03XXXXXXXXX, landline 0XXXXXXXXX). */
const PK_PHONE_PATTERN = /^0\d{9,10}$/;

export function normalizePakistaniPhone(raw: string): string | null {
  let digits = (raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  // +92 / 92 country-code form → national form (0 + subscriber number).
  if (digits.length === 12 && digits.startsWith("92")) digits = `0${digits.slice(2)}`;
  return PK_PHONE_PATTERN.test(digits) ? digits : null;
}

export function formatPakistaniPhone(digits: string): string {
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("03")) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return digits;
}

export function validatePatientRegistration(input: PatientRegistrationInput): PatientValidation {
  // --- Full name -----------------------------------------------------------
  const fullName = (input.fullName ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 100) {
    return { ok: false, field: "fullName", error: "Enter the patient's full name (2–100 characters)." };
  }
  if (!NAME_PATTERN.test(fullName)) {
    return { ok: false, field: "fullName", error: "Names may only contain letters, spaces, dots, apostrophes or hyphens." };
  }

  // --- CNIC ----------------------------------------------------------------
  const cnic = (input.cnic ?? "").replace(/\D/g, "");
  if (cnic.length !== 13) {
    return { ok: false, field: "cnic", error: "CNIC must contain exactly 13 digits (e.g. 42101-1234567-1)." };
  }

  // --- Phone (required, Pakistani format) ----------------------------------
  const phone = normalizePakistaniPhone(input.phone ?? "");
  if (!phone) {
    return {
      ok: false,
      field: "phone",
      error: "Enter a valid Pakistani phone number, e.g. 0300-1234567 (mobile) or 042-35778800 (landline).",
    };
  }

  // --- Email (optional; validated when present) -----------------------------
  const emailRaw = (input.email ?? "").trim().toLowerCase();
  if (emailRaw) {
    if (emailRaw.length > 254 || !EMAIL_PATTERN.test(emailRaw)) {
      return { ok: false, field: "email", error: "Enter a valid email address (e.g. zainab@example.com), or leave it empty." };
    }
  }

  // --- Date of birth (optional; validated when present) ---------------------
  const dobRaw = (input.dob ?? "").trim();
  if (dobRaw) {
    const dobDate = new Date(`${dobRaw}T00:00:00Z`);
    if (Number.isNaN(dobDate.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) {
      return { ok: false, field: "dob", error: "Enter a valid date of birth." };
    }
    const now = new Date();
    if (dobDate.getTime() > now.getTime()) {
      return { ok: false, field: "dob", error: "Date of birth cannot be in the future." };
    }
    if (dobDate.getUTCFullYear() < 1900) {
      return { ok: false, field: "dob", error: "Date of birth must be after 1900." };
    }
  }

  return {
    ok: true,
    value: {
      fullName,
      cnic,
      phone,
      email: emailRaw || null,
      dob: dobRaw || null,
    },
  };
}
