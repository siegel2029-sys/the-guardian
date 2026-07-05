/** Supabase signup / password-change policy (W13): min 8 chars + letters and digits. */
const MIN_NEW_PASSWORD_LENGTH = 8;

/**
 * Login submission only — do NOT enforce signup policy here.
 * Existing production accounts may still use legacy shorter passwords.
 */
export function loginPasswordFieldError(password: string): string | null {
  if (password.trim().length < 1) {
    return 'נא להזין סיסמה.';
  }
  return null;
}

/** Signup, password reset, therapist settings, admin-created patients, portal password change. */
export function validateNewPassword(password: string): string | null {
  const p = password.trim();
  if (p.length < MIN_NEW_PASSWORD_LENGTH) {
    return 'הסיסמה חייבת להכיל לפחות 8 תווים (אותיות ומספרים).';
  }
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) {
    return 'הסיסמה חייבת לכלול אותיות באנגלית ומספרים.';
  }
  return null;
}

export function isNewPasswordValid(password: string): boolean {
  return validateNewPassword(password) === null;
}
