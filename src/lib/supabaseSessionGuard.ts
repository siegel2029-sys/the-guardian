/**
 * Session checks before writes — reduces silent failures when JWT refresh failed or the user was signed out.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseAuthEnabled } from './patientPortalAuth';
import { hasPersistedSupabaseAuthSession } from './supabase';
import { redactLogContext } from './safeLog';

export type SupabaseSessionGuardResult = { ok: true } | { ok: false; message: string };

/** True when the error text indicates a missing or expired JWT (not a user-facing save failure). */
export function isAuthSessionMissingMessage(message: string): boolean {
  return /auth session missing|no active auth session|אין סשן פעיל/i.test(message);
}

/** Fast read — no refresh attempt. Use before background DB writes. */
export async function getSupabaseAuthSession(client: SupabaseClient) {
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session?.user?.id) return null;
  return session;
}

/** Extract PostgREST / Auth error fields without dumping PHI payloads. */
function postgrestErrorFields(err: unknown): {
  message: string;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
} {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const message =
      typeof o.message === 'string'
        ? o.message
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      message,
      code: o.code,
      details: o.details,
      hint: o.hint,
      status: o.status,
    };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}

/**
 * Log PostgREST / Auth errors for RLS debugging.
 * Always emits code/message/details/hint (no patient free-text). Redacts id-like keys (Iron Rule 1).
 */
export function logSupabaseCallError(
  scope: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  const fields = postgrestErrorFields(err);
  try {
    console.error(`[Supabase:${scope}]`, {
      ...fields,
      ...redactLogContext(extra),
    });
  } catch {
    console.error(`[Supabase:${scope}]`, fields.message);
  }
}

/**
 * Ensures the JWT carries `app_metadata.role=therapist` (required by patients INSERT RLS).
 * Refreshes the session once so DB backfills of auth.users.app_metadata are picked up.
 */
export async function ensureTherapistJwtRole(
  client: SupabaseClient
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const appRole = (u: { app_metadata?: Record<string, unknown> } | null | undefined): string => {
    const role = u?.app_metadata?.role;
    return typeof role === 'string' ? role.trim() : '';
  };

  const { data: first, error: getUserErr } = await client.auth.getUser();
  if (getUserErr) {
    logSupabaseCallError('ensureTherapistJwtRole/getUser', getUserErr);
  }
  if (first.user?.id && appRole(first.user) === 'therapist') {
    return { ok: true, userId: first.user.id };
  }

  const { data: refreshed, error: refreshErr } = await client.auth.refreshSession();
  if (refreshErr) {
    logSupabaseCallError('ensureTherapistJwtRole/refreshSession', refreshErr);
  }

  let user = refreshed.session?.user ?? null;
  if (!user) {
    const { data: again, error: againErr } = await client.auth.getUser();
    if (againErr) logSupabaseCallError('ensureTherapistJwtRole/getUserAfterRefresh', againErr);
    user = again.user;
  }

  if (user?.id && appRole(user) === 'therapist') {
    return { ok: true, userId: user.id };
  }

  console.error('[ensureTherapistJwtRole] missing app_metadata.role=therapist', {
    hasUser: Boolean(user?.id),
    appRole: appRole(user),
  });
  return {
    ok: false,
    message:
      'חסרה הרשאת מטפל בחשבון. התנתקו והתחברו מחדש, ואז נסו שוב ליצור מטופל.',
  };
}

/**
 * Ensures a usable session when app auth is enabled: `getSession`, then `refreshSession` if needed.
 * Background / auto-save callers should leave `alertUser` false (default) — only explicit user actions
 * should pass `alertUser: true`.
 */
export async function ensureSupabaseSessionReady(
  client: SupabaseClient,
  opts?: { alertUser?: boolean; context?: string }
): Promise<SupabaseSessionGuardResult> {
  if (!isSupabaseAuthEnabled()) {
    return { ok: true };
  }

  const ctx = opts?.context ?? 'סנכרון לענן';
  const alertUser = opts?.alertUser === true;

  try {
    const {
      data: { session },
      error: sessionErr,
    } = await client.auth.getSession();

    if (session?.user?.id && !sessionErr) {
      return { ok: true };
    }

    if (!hasPersistedSupabaseAuthSession()) {
      const message =
        sessionErr?.message ??
        'אין סשן פעיל — התחברו מחדש כדי לשמור לענן.';
      if (alertUser) {
        window.alert(`[PHYSIOSHIELD] ${ctx}\n\n${message}`);
      } else if (import.meta.env.DEV) {
        console.debug('[ensureSupabaseSessionReady] no persisted auth token — skipping refresh', {
          context: ctx,
        });
      }
      return { ok: false, message };
    }

    logSupabaseCallError('ensureSupabaseSessionReady/getSession', sessionErr ?? 'no session', {
      context: ctx,
      hasSession: Boolean(session),
    });

    const { data: refreshed, error: refreshErr } = await client.auth.refreshSession();

    if (refreshed.session?.user?.id && !refreshErr) {
      console.info('[ensureSupabaseSessionReady] session refreshed');
      return { ok: true };
    }

    logSupabaseCallError('ensureSupabaseSessionReady/refreshSession', refreshErr ?? 'refresh failed', {
      context: ctx,
    });

    const message =
      refreshErr?.message ??
      sessionErr?.message ??
      'אין סשן פעיל — התחברו מחדש כדי לשמור לענן.';

    if (alertUser) {
      window.alert(
        `[PHYSIOSHIELD] ${ctx}\n\n${message}\n\nהשמירה לא הושלמה — ייתכן אובדן נתונים אם תצאו מהאפליקציה.`
      );
    } else {
      console.warn(
        `[ensureSupabaseSessionReady] Skipping database persistence (${ctx}): no active auth session.`,
        message
      );
    }
    return { ok: false, message };
  } catch (e) {
    logSupabaseCallError('ensureSupabaseSessionReady/catch', e, { context: ctx });
    const message = e instanceof Error ? e.message : String(e);
    if (alertUser) {
      window.alert(`[PHYSIOSHIELD] ${ctx}\n\nשגיאת אימות: ${message}`);
    } else {
      console.warn(
        `[ensureSupabaseSessionReady] Skipping database persistence (${ctx}): auth error.`,
        message
      );
    }
    return { ok: false, message };
  }
}
