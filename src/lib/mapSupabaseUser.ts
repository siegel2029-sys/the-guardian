import type { User } from '@supabase/supabase-js';
import type { Therapist } from '../types';

/**
 * Canonical Web Push subscription persisted to `public.profiles.push_payload`
 * (mirrors `patients.payload.webPushSubscription`).
 */
export type ProfilePushPayload = {
  webPushSubscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh: string; auth: string };
  };
} & Record<string, unknown>;

/** Row shape from public.profiles (subset). */
export type ProfileRow = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  title?: unknown;
  avatar_initials?: unknown;
  clinic_name?: unknown;
  /** Therapist Expo push token (`ExponentPushToken[...]`) or HTTPS Web Push endpoint. */
  push_token?: string | null;
  /** Canonical `{ webPushSubscription: { endpoint, keys } }` for VAPID Web Push. */
  push_payload?: ProfilePushPayload | null;
  /** Set when a push gateway returned a persistent rejection (403/404/410) and the token was cleared. */
  push_invalidated_at?: string | null;
  /** Short detail of the last push gateway failure (dashboard triage). */
  push_last_error?: string | null;
  /** Updated whenever the therapist opens the dashboard; push-health heartbeat. */
  last_activity_timestamp?: string | null;
};

/**
 * Merge JWT app_metadata and user_metadata (user_metadata wins on key clash).
 * Use for role, full_name, patient_id, portal_username, etc.
 */
export function getSupabaseUserMetadata(user: User): Record<string, unknown> {
  const app = user.app_metadata as Record<string, unknown> | null | undefined;
  const um = user.user_metadata as Record<string, unknown> | null | undefined;
  return { ...(app ?? {}), ...(um ?? {}) };
}

export function metadataString(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Map Supabase user + optional profiles row to {@link Therapist} for the rest of the app.
 * `role` in metadata is reserved for RLS / future UI; not stored on Therapist.
 */
export function mapSupabaseUserToTherapist(user: User, prof: ProfileRow | null | undefined): Therapist {
  const meta = getSupabaseUserMetadata(user);
  const email = user.email ?? '';
  const fromProfName = prof?.name != null ? String(prof.name).trim() : '';
  const fullName =
    (fromProfName.length > 0 ? fromProfName : undefined) ||
    metadataString(meta, 'full_name') ||
    metadataString(meta, 'name') ||
    email.split('@')[0] ||
    'מטפל';
  const displayEmail =
    (prof?.email != null ? String(prof.email).trim() : '') || email || '';
  const title =
    (prof?.title != null ? String(prof.title).trim() : '') ||
    metadataString(meta, 'title') ||
    'מטפל';
  const initialsFromProf =
    prof?.avatar_initials != null ? String(prof.avatar_initials).trim() : '';
  const initialsFromName = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('');
  const avatarInitials = initialsFromProf || initialsFromName || 'מ';
  const clinicName =
    (prof?.clinic_name != null ? String(prof.clinic_name).trim() : '') ||
    metadataString(meta, 'clinic_name') ||
    '';

  return {
    id: user.id,
    name: fullName,
    email: displayEmail,
    title,
    avatarInitials,
    clinicName,
  };
}
