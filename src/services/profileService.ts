import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRow } from '../lib/mapSupabaseUser';

const PROFILE_SELECT =
  'id, email, name, title, clinic_name, avatar_initials' as const;

export type ProfileFetchResult =
  | { ok: true; profile: ProfileRow | null }
  | { ok: false; message: string };

/**
 * Fetch a therapist `profiles` row by auth user id (Iron Rule 2 — no UI/context queries).
 */
export async function fetchTherapistProfile(
  client: SupabaseClient,
  userId: string
): Promise<ProfileFetchResult> {
  const tid = userId.trim();
  if (!tid) return { ok: false, message: 'profiles: missing user id' };

  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', tid)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, profile: (data as ProfileRow | null) ?? null };
}

/**
 * Upsert minimal therapist profile columns used at sign-in / settings sync.
 */
export async function upsertTherapistProfileRow(
  client: SupabaseClient,
  input: { userId: string; email: string; displayName: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = input.userId.trim();
  if (!id) return { ok: false, message: 'profiles: missing user id' };

  const { error } = await client.from('profiles').upsert(
    {
      id,
      email: input.email || '',
      name: input.displayName || input.email || '',
    },
    { onConflict: 'id' }
  );

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/** Whether a profiles row exists for this auth uid (therapist gate for Edge budgets). */
export async function therapistProfileExists(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const res = await fetchTherapistProfile(client, userId);
  return res.ok && res.profile != null;
}
