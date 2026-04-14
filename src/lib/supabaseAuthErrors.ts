import type { AuthError } from '@supabase/supabase-js';

/** User-facing Hebrew message for Supabase Auth API errors (login/signup/update). */
export function supabaseAuthErrorMessageHe(error: AuthError | null | undefined, fallback: string): string {
  if (!error) return fallback;
  const msg = (error.message || '').trim();
  const lower = msg.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return fallback;
  }
  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return 'יש לאשר את כתובת הדוא״ל לפני ההתחברות (בדקו את תיבת הדואר).';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'כתובת הדוא״ל כבר רשומה במערכת.';
  }
  if (lower.includes('password') && (lower.includes('least') || lower.includes('short') || lower.includes('weak'))) {
    return 'הסיסמה חלשה מדי או קצרה מדי. נא לבחור סיסמה חזקה יותר.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'יותר מדי ניסיונות. המתינו רגע ונסו שוב.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'בעיית רשת. בדקו את החיבור ונסו שוב.';
  }
  if (msg.length > 0 && msg.length < 200) {
    return msg;
  }
  return fallback;
}
