/**
 * אחסון אימות מקומי (דמו). סיסמאות בטקסט גלוי — לא מתאים לייצור ללא שרת.
 */
import { invalidatePersistedBootstrapCache } from '../bootstrap/invalidateBootstrap';
import { mockTherapist, MOCK_PASSWORD } from '../data/mockData';

export const AUTH_STORAGE_KEY = 'guardian-auth-v1';

export type AuthSessionV1 =
  | { role: 'therapist' }
  | { role: 'patient'; patientId: string };

export type PatientAccountV1 = {
  patientId: string;
  password: string;
  /** נוצר עם חשבון חדש — מחייב החלפת סיסמה בכניסה ראשונה לפורטל */
  mustChangePassword?: boolean;
};

export type AuthSnapshotV1 = {
  version: 1;
  therapistEmail: string;
  therapistPassword: string;
  /** מפתח = מזהה כניסה למטופל (למשל PT-XXXX) */
  patientAccounts: Record<string, PatientAccountV1>;
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

export function normalizeAuthSession(raw: unknown): AuthSessionV1 | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as { role?: string; patientId?: unknown };
  if (r.role === 'therapist') return { role: 'therapist' };
  if (
    r.role === 'patient' &&
    typeof r.patientId === 'string' &&
    r.patientId.trim().length > 0
  ) {
    return { role: 'patient', patientId: r.patientId.trim() };
  }
  return null;
}

function normalizeAccounts(
  raw: Record<string, PatientAccountV1> | undefined
): Record<string, PatientAccountV1> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PatientAccountV1> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v.patientId !== 'string') continue;
    const key = k.trim().toUpperCase();
    out[key] = {
      patientId: v.patientId.trim(),
      password: String(v.password ?? ''),
      mustChangePassword: v.mustChangePassword === true,
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
      session: normalizeAuthSession(data.session),
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

export function addPatientAccount(
  loginId: string,
  patientId: string,
  password: string,
  options?: { mustChangePassword?: boolean }
): void {
  const snap = loadAuthSnapshot();
  const mustChange = options?.mustChangePassword !== false;
  const patientAccounts = {
    ...snap.patientAccounts,
    [loginId.trim().toUpperCase()]: { patientId, password, mustChangePassword: mustChange },
  };
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

export function patientAccountRequiresPasswordChange(snap: AuthSnapshotV1, patientId: string): boolean {
  for (const acc of Object.values(snap.patientAccounts)) {
    if (acc.patientId === patientId) return acc.mustChangePassword === true;
  }
  return false;
}

export type PatientPasswordChangeResult = 'ok' | 'bad_current' | 'invalid_new';

export function verifyAndUpdatePatientPassword(
  patientId: string,
  currentPassword: string,
  newPassword: string
): PatientPasswordChangeResult {
  const snap = loadAuthSnapshot();
  const newPw = newPassword.trim();
  if (newPw.length < 6) return 'invalid_new';
  const entry = Object.entries(snap.patientAccounts).find(([, a]) => a.patientId === patientId);
  if (!entry) return 'bad_current';
  const [key, acc] = entry;
  if (acc.password !== currentPassword.trim()) return 'bad_current';
  const patientAccounts = {
    ...snap.patientAccounts,
    [key]: { ...acc, password: newPw, mustChangePassword: false },
  };
  saveAuthSnapshot({ ...snap, patientAccounts });
  return 'ok';
}
