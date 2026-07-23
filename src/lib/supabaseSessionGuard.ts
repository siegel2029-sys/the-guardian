/**
 * Session checks before writes — reduces silent failures when JWT refresh failed or the user was signed out.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseAuthEnabled } from './patientPortalAuth';
import { hasPersistedSupabaseAuthSession } from './supabase';
import { isDevLoggingEnabled, redactLogContext } from './safeLog';

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

/** Log PostgREST / Auth errors for RLS debugging — DEV only; redacts id-like keys (Iron Rule 1). */
export function logSupabaseCallError(
  scope: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  if (!isDevLoggingEnabled()) return;
  const message =
    err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : String(err);
  const code =
    err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : undefined;
  try {
    console.error(`[Supabase:${scope}]`, {
      message,
      code,
      ...redactLogContext(extra),
    });
  } catch {
    console.error(`[Supabase:${scope}]`, message);
  }
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
