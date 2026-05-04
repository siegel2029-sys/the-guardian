/**
 * After a successful remote delete, the therapist dashboard still merges `prev` from
 * localStorage on Supabase hydrate — that could resurrect a deleted patient. Tombstone IDs
 * we deleted on the server so merge skips them until they reappear on the server (rare).
 */
const STORAGE_KEY = 'guardian-supabase-deleted-patient-ids-v1';
const MAX_IDS = 400;

function readIds(): string[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_IDS)));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Call after Supabase confirmed delete (or idempotent "already gone"). */
export function recordPatientDeletedFromSupabase(patientId: string): void {
  const id = patientId.trim();
  if (!id) return;
  const arr = readIds();
  if (arr.includes(id)) return;
  arr.unshift(id);
  writeIds(arr);
}

export function tombstonedDeletedPatientIds(): Set<string> {
  return new Set(readIds());
}

/** If a patient ID shows up again on the server, drop its tombstone. */
export function prunePatientTombstonesIfReappearedOnServer(liveServerPatientIds: Iterable<string>): void {
  const live = new Set(liveServerPatientIds);
  const next = readIds().filter((id) => !live.has(id));
  writeIds(next);
}
