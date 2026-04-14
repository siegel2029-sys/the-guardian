/**
 * אחסון אימות מקומי (דמו). גרסה 2: מספר מטפלים, מטופלים משויכים ל־therapistId.
 */
import { invalidatePersistedBootstrapCache } from '../bootstrap/invalidateBootstrap';
import { mockTherapist, mockTherapistB, MOCK_PASSWORD, MOCK_THERAPIST_B_PASSWORD } from '../data/mockData';
import type { Therapist } from '../types';

export const AUTH_STORAGE_KEY = 'guardian-auth-v1';

/** סיסמה אחידה למטופלים שנוצרו אוטומטית (דמו) — התחברות מ־/login */
export const SEED_PATIENT_PORTAL_PASSWORD = 'GuardianPatient';

/**
 * יוצר חשבונות PT-… + סיסמה לכל מטופל שאין לו רישום ב-auth (כולל mock ראשוני).
 * נשמר ב-localStorage; אידמפוטנטי.
 */
export function ensurePatientAccountsForPatients(
  patients: Array<{ id: string; therapistId: string; portalUsername?: string }>
): { added: number } {
  const snap = loadAuthSnapshot();
  let added = 0;
  const patientAccounts = { ...snap.patientAccounts };

  const existingLoginForPatient = (patientId: string): boolean =>
    Object.values(patientAccounts).some((a) => a.patientId === patientId);

  const allocateLoginKey = (patientId: string): string => {
    const num = /^patient-(\d+)$/.exec(patientId);
    let base = num ? `PT-${num[1]}` : `PT-${patientId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase()}`;
    if (base.length < 5) base = `PT-${patientId.slice(-8).toUpperCase()}`;
    let key = base;
    let n = 0;
    while (patientAccounts[key] && patientAccounts[key].patientId !== patientId) {
      n += 1;
      key = `${base}N${n}`;
    }
    return key;
  };

  for (const { id, therapistId, portalUsername } of patients) {
    if (existingLoginForPatient(id)) continue;
    const pu = typeof portalUsername === 'string' ? portalUsername.trim().toUpperCase() : '';
    const key =
      pu.length >= 2 ? pu.replace(/[^A-Z0-9]/g, '') : allocateLoginKey(id);
    if (!key) continue;
    if (patientAccounts[key]?.patientId === id) continue;
    patientAccounts[key] = {
      patientId: id,
      therapistId,
      password: SEED_PATIENT_PORTAL_PASSWORD,
      mustChangePassword: false,
    };
    added += 1;
  }

  if (added > 0) {
    saveAuthSnapshot({ ...snap, patientAccounts });
  }
  return { added };
}

/** סשן פעיל — מטפל חייב therapistId */
export type AuthSessionV2 =
  | { role: 'therapist'; therapistId: string }
  | { role: 'patient'; patientId: string };

export type TherapistAuthRecord = {
  email: string;
  password: string;
  displayName: string;
  clinicName: string;
};

export type PatientAccountV1 = {
  patientId: string;
  therapistId: string;
  password: string;
  mustChangePassword?: boolean;
};

/** צילום auth נוכחי (תמיד v2 בזיכרון אחרי טעינה) */
export type AuthSnapshotV2 = {
  version: 2;
  therapists: Record<string, TherapistAuthRecord>;
  patientAccounts: Record<string, PatientAccountV1>;
  session: AuthSessionV2 | null;
};

/** תאימות לאחור — מבנה ישן ב־localStorage */
type AuthSnapshotLegacyV1 = {
  version: 1;
  therapistEmail: string;
  therapistPassword: string;
  patientAccounts: Record<
    string,
    { patientId: string; password: string; mustChangePassword?: boolean; therapistId?: string }
  >;
  session: { role: string; therapistId?: string; patientId?: string } | null;
};

export function defaultAuthSnapshot(): AuthSnapshotV2 {
  return {
    version: 2,
    therapists: {
      [mockTherapist.id]: {
        email: mockTherapist.email,
        password: MOCK_PASSWORD,
        displayName: mockTherapist.name,
        clinicName: mockTherapist.clinicName,
      },
      [mockTherapistB.id]: {
        email: mockTherapistB.email,
        password: MOCK_THERAPIST_B_PASSWORD,
        displayName: mockTherapistB.name,
        clinicName: mockTherapistB.clinicName,
      },
    },
    patientAccounts: {},
    session: null,
  };
}

function migrateLegacyV1(data: AuthSnapshotLegacyV1): AuthSnapshotV2 {
  const def = defaultAuthSnapshot();
  const tid = mockTherapist.id;
  const therapists: Record<string, TherapistAuthRecord> = {
    ...def.therapists,
    [tid]: {
      email: data.therapistEmail.trim(),
      password:
        typeof data.therapistPassword === 'string' && data.therapistPassword.length > 0
          ? data.therapistPassword
          : MOCK_PASSWORD,
      displayName: mockTherapist.name,
      clinicName: mockTherapist.clinicName,
    },
  };
  const patientAccounts: Record<string, PatientAccountV1> = {};
  for (const [k, v] of Object.entries(data.patientAccounts ?? {})) {
    if (!v?.patientId) continue;
    const key = k.trim().toUpperCase();
    patientAccounts[key] = {
      patientId: v.patientId.trim(),
      therapistId: typeof v.therapistId === 'string' && v.therapistId ? v.therapistId : tid,
      password: String(v.password ?? ''),
      mustChangePassword: v.mustChangePassword === true,
    };
  }
  let session: AuthSessionV2 | null = null;
  const s = data.session;
  if (s?.role === 'therapist') {
    session = { role: 'therapist', therapistId: tid };
  } else if (s?.role === 'patient' && typeof s.patientId === 'string' && s.patientId.trim()) {
    session = { role: 'patient', patientId: s.patientId.trim() };
  }
  return { version: 2, therapists, patientAccounts, session };
}

export function normalizeAuthSession(raw: unknown): AuthSessionV2 | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as { role?: string; patientId?: unknown; therapistId?: unknown };
  if (r.role === 'therapist') {
    if (typeof r.therapistId === 'string' && r.therapistId.trim().length > 0) {
      return { role: 'therapist', therapistId: r.therapistId.trim() };
    }
    return null;
  }
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
  raw: Record<string, PatientAccountV1> | undefined,
  fallbackTherapistId: string
): Record<string, PatientAccountV1> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PatientAccountV1> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v.patientId !== 'string') continue;
    const key = k.trim().toUpperCase();
    out[key] = {
      patientId: v.patientId.trim(),
      therapistId:
        typeof v.therapistId === 'string' && v.therapistId.trim()
          ? v.therapistId.trim()
          : fallbackTherapistId,
      password: String(v.password ?? ''),
      mustChangePassword: v.mustChangePassword === true,
    };
  }
  return out;
}

function normalizeTherapists(
  raw: Record<string, TherapistAuthRecord> | undefined
): Record<string, TherapistAuthRecord> {
  const def = defaultAuthSnapshot().therapists;
  if (!raw || typeof raw !== 'object') return { ...def };
  const out: Record<string, TherapistAuthRecord> = { ...def };
  for (const [id, t] of Object.entries(raw)) {
    if (!t || typeof t.email !== 'string') continue;
    out[id.trim()] = {
      email: t.email.trim(),
      password: String(t.password ?? ''),
      displayName: typeof t.displayName === 'string' && t.displayName.trim() ? t.displayName.trim() : mockTherapist.name,
      clinicName:
        typeof t.clinicName === 'string' && t.clinicName.trim()
          ? t.clinicName.trim()
          : mockTherapist.clinicName,
    };
  }
  return out;
}

export function loadAuthSnapshot(): AuthSnapshotV2 {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultAuthSnapshot();
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return defaultAuthSnapshot();
    const data = JSON.parse(raw) as Partial<AuthSnapshotLegacyV1> & Partial<AuthSnapshotV2>;

    if (data.version === 1 && typeof (data as AuthSnapshotLegacyV1).therapistEmail === 'string') {
      const migrated = migrateLegacyV1(data as AuthSnapshotLegacyV1);
      saveAuthSnapshot(migrated);
      return migrated;
    }

    if (data.version !== 2 || typeof data.therapists !== 'object') {
      return defaultAuthSnapshot();
    }

    const therapists = normalizeTherapists(data.therapists as Record<string, TherapistAuthRecord>);
    const fallbackTid = mockTherapist.id;
    return {
      version: 2,
      therapists,
      patientAccounts: normalizeAccounts(
        data.patientAccounts as Record<string, PatientAccountV1>,
        fallbackTid
      ),
      session: normalizeAuthSession(data.session),
    };
  } catch {
    return defaultAuthSnapshot();
  }
}

export function saveAuthSnapshot(snapshot: AuthSnapshotV2): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
    invalidatePersistedBootstrapCache();
  } catch {
    /* ignore */
  }
}

export function mergeAuthSnapshot(partial: Partial<AuthSnapshotV2>): AuthSnapshotV2 {
  const cur = loadAuthSnapshot();
  const next: AuthSnapshotV2 = {
    ...cur,
    ...partial,
    therapists: partial.therapists ?? cur.therapists,
    patientAccounts: partial.patientAccounts ?? cur.patientAccounts,
    session: partial.session !== undefined ? partial.session : cur.session,
  };
  saveAuthSnapshot(next);
  return next;
}

export function setAuthSession(session: AuthSessionV2 | null): void {
  mergeAuthSnapshot({ session });
}

export function findTherapistIdByCredentials(email: string, password: string): string | null {
  const snap = loadAuthSnapshot();
  const em = email.trim().toLowerCase();
  const pw = password.trim();
  for (const [id, t] of Object.entries(snap.therapists)) {
    if (t.email.toLowerCase() === em && t.password === pw) return id;
  }
  return null;
}

export function therapistRecordToTherapist(therapistId: string, rec: TherapistAuthRecord): Therapist {
  const initials = rec.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return {
    id: therapistId,
    name: rec.displayName,
    email: rec.email,
    title: mockTherapist.title,
    avatarInitials: initials || mockTherapist.avatarInitials,
    clinicName: rec.clinicName,
  };
}

export function getTherapistRecord(therapistId: string): TherapistAuthRecord | null {
  const snap = loadAuthSnapshot();
  return snap.therapists[therapistId] ?? null;
}

export function getTherapistDisplayName(therapistId: string): string {
  return getTherapistRecord(therapistId)?.displayName ?? mockTherapist.name;
}

export function updateTherapistRecord(
  therapistId: string,
  updates: Partial<Pick<TherapistAuthRecord, 'email' | 'password' | 'displayName' | 'clinicName'>>
): void {
  const snap = loadAuthSnapshot();
  const cur = snap.therapists[therapistId];
  if (!cur) return;
  const nextRec: TherapistAuthRecord = {
    ...cur,
    ...updates,
    email: (updates.email ?? cur.email).trim(),
    displayName: (updates.displayName ?? cur.displayName).trim(),
    clinicName: (updates.clinicName ?? cur.clinicName).trim(),
    password: updates.password ?? cur.password,
  };
  saveAuthSnapshot({
    ...snap,
    therapists: { ...snap.therapists, [therapistId]: nextRec },
  });
}

/** מחיקת כל חשבונות הפורטל המקושרים למטופל (מזהי PT-…) */
export function removePatientAccountsForPatient(patientId: string): void {
  const snap = loadAuthSnapshot();
  const patientAccounts = { ...snap.patientAccounts };
  for (const [k, acc] of Object.entries(patientAccounts)) {
    if (acc.patientId === patientId) delete patientAccounts[k];
  }
  saveAuthSnapshot({ ...snap, patientAccounts });
}

export function addPatientAccount(
  loginId: string,
  patientId: string,
  password: string,
  therapistId: string,
  options?: { mustChangePassword?: boolean }
): void {
  const snap = loadAuthSnapshot();
  const mustChange = options?.mustChangePassword !== false;
  const patientAccounts = {
    ...snap.patientAccounts,
    [loginId.trim().toUpperCase()]: {
      patientId,
      therapistId,
      password,
      mustChangePassword: mustChange,
    },
  };
  saveAuthSnapshot({ ...snap, patientAccounts });
}

export function findPatientLoginByPatientId(patientId: string): string | null {
  const snap = loadAuthSnapshot();
  for (const [loginId, acc] of Object.entries(snap.patientAccounts)) {
    if (acc.patientId === patientId) return loginId;
  }
  return null;
}

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

export function patientAccountRequiresPasswordChange(snap: AuthSnapshotV2, patientId: string): boolean {
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

export type PatientLoginChangeResult = 'ok' | 'bad_password' | 'invalid_id' | 'taken' | 'locked';

/** מזהה פורטל נשמר קבוע (מדיניות פרטיות) — שינוי עצמי של המטופל אינו מותר. */
export function verifyAndUpdatePatientLoginId(
  _patientId: string,
  _currentPassword: string,
  _newLoginIdRaw: string
): PatientLoginChangeResult {
  return 'locked';
}
