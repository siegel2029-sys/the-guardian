import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuthErrorMessageHe } from './supabaseAuthErrors';

/** Synthetic email domain for Supabase password auth (must be unique per portal username). */
export function getPatientAuthEmailDomain(): string {
  const d = import.meta.env.VITE_PATIENT_AUTH_EMAIL_DOMAIN?.trim();
  return d && d.length > 0 ? d : 'patient.guardian.internal';
}

/** True when Supabase Auth should own the session (not localStorage demo auth). */
export function isSupabaseAuthEnabled(): boolean {
  if (import.meta.env.VITE_USE_LEGACY_AUTH === 'true') return false;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  return url.length > 0 && key.length > 0;
}

/** @deprecated Use {@link isSupabaseAuthEnabled} — name kept for call sites that expect "bridge". */
export function useSupabaseAuthBridge(): boolean {
  return isSupabaseAuthEnabled();
}

/** Normalize portal username / initials: uppercase A–Z and digits, 2–32 chars. */
export function normalizePortalUsername(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidPortalUsername(normalized: string): boolean {
  return normalized.length >= 2 && normalized.length <= 32;
}

export function portalUsernameToAuthEmail(normalizedUsername: string): string {
  const domain = getPatientAuthEmailDomain();
  return `${normalizedUsername}@${domain}`;
}

/**
 * Ephemeral client so signUp does not replace the therapist session in default auth storage.
 */
export function createEphemeralSupabaseClient(url: string, anonKey: string): SupabaseClient {
  const memory: Record<string, string> = {};
  const memStorage = {
    getItem: (k: string) => memory[k] ?? null,
    setItem: (k: string, v: string) => {
      memory[k] = v;
    },
    removeItem: (k: string) => {
      delete memory[k];
    },
  };
  return createClient(url, anonKey, {
    auth: {
      storage: memStorage,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type SignUpPortalPatientResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signUpPortalPatientOnCreate(params: {
  url: string;
  anonKey: string;
  portalUsername: string;
  password: string;
  patientId: string;
}): Promise<SignUpPortalPatientResult> {
  const normalized = normalizePortalUsername(params.portalUsername);
  if (!isValidPortalUsername(normalized)) {
    return { ok: false, message: 'מזהה פורטל לא תקין (2–32 תווים, אנגלית ומספרים).' };
  }
  const email = portalUsernameToAuthEmail(normalized);
  const ephemeral = createEphemeralSupabaseClient(params.url, params.anonKey);
  const { error } = await ephemeral.auth.signUp({
    email,
    password: params.password,
    options: {
      data: {
        patient_id: params.patientId,
        portal_username: normalized,
      },
    },
  });
  if (error) {
    if (/already registered|already been registered|User already registered/i.test(error.message)) {
      return {
        ok: false,
        message: 'מזהה הפורטל כבר קיים במערכת. בחרו רמז אחר (למשל JD2).',
      };
    }
    return {
      ok: false,
      message: supabaseAuthErrorMessageHe(error, 'לא ניתן ליצור חשבון פורטל. נסו שוב או בחרו מזהה אחר.'),
    };
  }
  return { ok: true };
}

export async function linkPatientAuthUserRow(
  client: SupabaseClient,
  patientId: string
): Promise<void> {
  const { error } = await client.rpc('link_patient_auth_user', {
    p_patient_id: patientId,
  });
  if (error && import.meta.env.DEV) {
    console.warn('[linkPatientAuthUserRow]', error.message);
  }
}
