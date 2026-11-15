export type SignupValue = { fullName: string; email: string; password: string };
export type SignupValidation = { ok: true; value: SignupValue } | { ok: false; error: string };

export function validateSignupInput(input: {
  fullName: unknown;
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
}): SignupValidation {
  const rawName = typeof input.fullName === "string" ? input.fullName : "";
  const fullName = rawName.trim().replace(/\s+/g, " ");
  const email = (typeof input.email === "string" ? input.email : "").trim().toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";

  if (fullName.length < 2 || fullName.length > 100 || /[\u0000-\u001f\u007f]/.test(fullName)) {
    return { ok: false, error: "Enter your name (2–100 characters)." };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length < 12 || password.length > 128) {
    return { ok: false, error: "Use a password between 12 and 128 characters." };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  return { ok: true, value: { fullName, email, password } };
}
