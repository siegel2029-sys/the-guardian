import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuthErrorMessageHe } from './supabaseAuthErrors';
import { devError, devLog, devWarn, redactId } from './safeLog';

/** Synthetic email domain for Supabase password auth (must be unique per portal username). */
export function getPatientAuthEmailDomain(): string {
  const d = import.meta.env.VITE_PATIENT_AUTH_EMAIL_DOMAIN?.trim();
  return d && d.length > 0 ? d : 'patient.guardian.internal';
}

/**
 * Legacy localStorage demo auth is a development-only convenience.
 * In production builds the flag is ignored entirely (plaintext passwords in
 * localStorage must never ship), so Supabase Auth always owns the session.
 */
export function isLegacyAuthEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_LEGACY_AUTH === 'true';
}

/** True when Supabase Auth should own the session (not localStorage demo auth). */
export function isSupabaseAuthEnabled(): boolean {
  if (isLegacyAuthEnabled()) return false;
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
  /**
   * `authUserId` is the Supabase Auth `users.id` (UUID) of the new account.
   * Pass this to `upsertPatientRecords` so `patients.auth_user_id` is set
   * immediately, without waiting for the patient's first portal login.
   */
  | { ok: true; authUserId: string }
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
  const { data, error } = await ephemeral.auth.signUp({
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
    // Dev-only: never emit portal email / patient id in production consoles (Iron Rule 1).
    devError('[signUpPortalPatientOnCreate] Supabase Auth error', {
      message: error.message,
      status: (error as { status?: number }).status,
      code: (error as { code?: string }).code,
      patientRef: redactId(params.patientId),
      supabaseUrl: params.url,
    });

    const isAlreadyRegistered =
      /already registered|already been registered|User already registered|email.*already/i.test(
        error.message
      );
    if (isAlreadyRegistered) {
      return {
        ok: false,
        message:
          'מזהה הפורטל כבר קיים ב-Supabase Auth (גם אם השורה ב-patients נמחקה). ' +
          'מחקו את משתמש ה-Auth ידנית בלוח הבקרה של Supabase (Authentication → Users) ואז נסו שוב, ' +
          `או בחרו מזהה אחר (למשל ${normalized}2).`,
      };
    }
    return {
      ok: false,
      message: supabaseAuthErrorMessageHe(error, 'לא ניתן ליצור חשבון פורטל. נסו שוב או בחרו מזהה אחר.'),
    };
  }

  const authUserId = data.user?.id ?? '';
  if (!authUserId) {
    // Auth user was created but UUID not returned (e.g. email-confirm flow).
    // The patient row will get auth_user_id linked on first portal login instead.
    devWarn(
      '[signUpPortalPatientOnCreate] Auth user created but UUID not returned — auth_user_id will be set on first patient login.',
      { patientRef: redactId(params.patientId) },
    );
  } else {
    devLog('[signUpPortalPatientOnCreate] Auth user created', {
      authUserRef: redactId(authUserId),
      patientRef: redactId(params.patientId),
    });
  }

  return { ok: true, authUserId };
}

export async function linkPatientAuthUserRow(
  client: SupabaseClient,
  patientId: string
): Promise<void> {
  const { error } = await client.rpc('link_patient_auth_user', {
    p_patient_id: patientId,
  });
  if (error) {
    devWarn('[linkPatientAuthUserRow]', { message: error.message, patientRef: redactId(patientId) });
  }
}
