/**
 * אחסון אימות מקומי (דמו). סיסמאות בטקסט גלוי — לא מתאים לייצור ללא שרת.
 */
import { invalidatePersistedBootstrapCache } from '../bootstrap/invalidateBootstrap';
import { mockTherapist, MOCK_PASSWORD } from '../data/mockData';

export const AUTH_STORAGE_KEY = 'guardian-auth-v1';

export type AuthSessionV1 =
  | { role: 'therapist' }
  | { role: 'patient'; patientId: string };

export type AuthSnapshotV1 = {
  version: 1;
  therapistEmail: string;
  therapistPassword: string;
  /** מפתח = מזהה כניסה למטופל (למשל PT-XXXX) */
  patientAccounts: Record<string, { patientId: string; password: string }>;
  session: AuthSessionV1 | null;
};

export function defaultAuthSnapshot(): AuthSnapshotV1 {
  return {
    version: 1,
    therapistEmail: mockTherapist.email,
    therapistPassword: MOCK_PASSWORD,
    patientAccounts: {},
    session: null,
  };
}

function normalizeAccounts(
  raw: Record<string, { patientId: string; password: string }> | undefined
): Record<string, { patientId: string; password: string }> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, { patientId: string; password: string }> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v.patientId !== 'string') continue;
    const key = k.trim().toUpperCase();
    out[key] = {
      patientId: v.patientId,
      password: String(v.password ?? ''),
    };
  }
  return out;
}

export function loadAuthSnapshot(): AuthSnapshotV1 {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultAuthSnapshot();
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return defaultAuthSnapshot();
    const data = JSON.parse(raw) as Partial<AuthSnapshotV1>;
    if (data?.version !== 1 || typeof data.therapistEmail !== 'string') {
      return defaultAuthSnapshot();
    }
    const def = defaultAuthSnapshot();
    const therapistPassword =
      typeof data.therapistPassword === 'string' && data.therapistPassword.length > 0
        ? data.therapistPassword
        : def.therapistPassword;
    return {
      version: 1,
      therapistEmail: data.therapistEmail.trim(),
      therapistPassword,
      patientAccounts: normalizeAccounts(data.patientAccounts as AuthSnapshotV1['patientAccounts']),
      session: data.session ?? null,
    };
  } catch {
    return defaultAuthSnapshot();
  }
}

export function saveAuthSnapshot(snapshot: AuthSnapshotV1): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
    invalidatePersistedBootstrapCache();
  } catch {
    /* ignore */
  }
}

export function mergeAuthSnapshot(partial: Partial<AuthSnapshotV1>): AuthSnapshotV1 {
  const cur = loadAuthSnapshot();
  const next: AuthSnapshotV1 = {
    ...cur,
    ...partial,
    patientAccounts: partial.patientAccounts ?? cur.patientAccounts,
    session: partial.session !== undefined ? partial.session : cur.session,
  };
  saveAuthSnapshot(next);
  return next;
}

export function setAuthSession(session: AuthSessionV1 | null): void {
  mergeAuthSnapshot({ session });
}

export function addPatientAccount(loginId: string, patientId: string, password: string): void {
  const snap = loadAuthSnapshot();
  const patientAccounts = { ...snap.patientAccounts, [loginId.trim().toUpperCase()]: { patientId, password } };
  saveAuthSnapshot({ ...snap, patientAccounts });
}

export function updateTherapistCredentials(email: string, password: string): void {
  const snap = loadAuthSnapshot();
  saveAuthSnapshot({
    ...snap,
    therapistEmail: email.trim(),
    therapistPassword: password,
  });
}

export function findPatientLoginByPatientId(patientId: string): string | null {
  const snap = loadAuthSnapshot();
  for (const [loginId, acc] of Object.entries(snap.patientAccounts)) {
    if (acc.patientId === patientId) return loginId;
  }
  return null;
}

/** מזהה כניסה + סיסמה כפי שנשמרו (למסירה למטופל — דמו בלבד). */
export function getPatientCredentialsByPatientId(
  patientId: string
): { loginId: string; password: string } | null {
  const snap = loadAuthSnapshot();
  for (const [loginId, acc] of Object.entries(snap.patientAccounts)) {
    if (acc.patientId === patientId) {
      return { loginId, password: acc.password };
    }
  }
  return null;
}
