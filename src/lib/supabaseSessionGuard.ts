/**
 * Session checks before writes — reduces silent failures when JWT refresh failed or the user was signed out.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseAuthEnabled } from './patientPortalAuth';

export type SupabaseSessionGuardResult = { ok: true } | { ok: false; message: string };

/** Log the full PostgREST / Auth error for RLS / policy debugging. */
export function logSupabaseCallError(
  scope: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  const base =
    err && typeof err === 'object'
      ? { ...(err as Record<string, unknown>) }
      : { message: String(err) };
  try {
    console.error(`[Supabase:${scope}]`, {
      ...base,
      ...extra,
      raw: err,
    });
  } catch {
    console.error(`[Supabase:${scope}]`, err, extra);
  }
}

/**
 * Ensures a usable session when app auth is enabled: `getSession`, then `refreshSession` if needed.
 * Optionally alerts the user so data is not “silently” discarded.
 */
export async function ensureSupabaseSessionReady(
  client: SupabaseClient,
  opts?: { alertUser?: boolean; context?: string }
): Promise<SupabaseSessionGuardResult> {
  if (!isSupabaseAuthEnabled()) {
    return { ok: true };
  }

  const ctx = opts?.context ?? 'סנכרון לענן';
  const alertUser = opts?.alertUser !== false;

  try {
    const {
      data: { session },
      error: sessionErr,
    } = await client.auth.getSession();

    if (session?.user?.id && !sessionErr) {
      return { ok: true };
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
    }
    return { ok: false, message };
  } catch (e) {
    logSupabaseCallError('ensureSupabaseSessionReady/catch', e, { context: ctx });
    const message = e instanceof Error ? e.message : String(e);
    if (alertUser) {
      window.alert(`[PHYSIOSHIELD] ${ctx}\n\nשגיאת אימות: ${message}`);
    }
    return { ok: false, message };
  }
}
