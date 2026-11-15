import { describe, expect, it } from "vitest";
import { validateSignupInput } from "./signup-validation";

describe("patient signup input validation", () => {
  it("normalizes name/email and returns only identity fields, never a requested role", () => {
    const result = validateSignupInput({
      fullName: "  Paras   Mehtab ", email: " PARAS@example.com ",
      password: "correct horse battery", confirmPassword: "correct horse battery",
      role: "platform_admin",
    } as Parameters<typeof validateSignupInput>[0]);
    expect(result).toEqual({ ok: true, value: { fullName: "Paras Mehtab", email: "paras@example.com", password: "correct horse battery" } });
    if (result.ok) expect("role" in result.value).toBe(false);
  });

  it("rejects short or malformed identity fields and short passwords", () => {
    expect(validateSignupInput({ fullName: "A", email: "bad", password: "123456789012", confirmPassword: "123456789012" }).ok).toBe(false);
    expect(validateSignupInput({ fullName: "Patient", email: "p@example.com", password: "short", confirmPassword: "short" })).toMatchObject({ ok: false, error: "Use a password between 12 and 128 characters." });
  });

  it("rejects mismatched confirmation without changing or trimming the password", () => {
    expect(validateSignupInput({ fullName: "Patient Name", email: "p@example.com", password: "long password 123", confirmPassword: "different password" })).toMatchObject({ ok: false, error: "Passwords do not match." });
    expect(validateSignupInput({ fullName: "Patient Name", email: "p@example.com", password: " long password 123 ", confirmPassword: " long password 123 " })).toMatchObject({ ok: true });
  });
});
