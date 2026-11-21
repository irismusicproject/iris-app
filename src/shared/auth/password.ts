// Shared password rules. Native apps can import this file too.
// Supabase enforces the same minimum: Authentication -> Sign In / Providers
// -> Email -> Minimum password length (see README).
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72; // Supabase (bcrypt) ignores bytes past 72

export function validateNewPassword(
  password: string,
  confirm: string,
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well, like "cello tuesday 42".`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) {
    return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  if (password !== confirm) {
    return "The two passwords don't match.";
  }
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Supabase one-time codes are 6 digits by default (configurable up to 10).
export function normalizeCode(code: string): string | null {
  const digits = code.replace(/\s+/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
