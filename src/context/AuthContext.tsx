// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Therapist } from '../types';
import {
  loadAuthSnapshot,
  mergeAuthSnapshot,
  setAuthSession,
  updateTherapistRecord,
  findTherapistIdByCredentials,
  therapistRecordToTherapist,
  getTherapistRecord,
  findPatientLoginByPatientId,
  patientAccountRequiresPasswordChange,
  verifyAndUpdatePatientPassword,
  verifyAndUpdatePatientLoginId,
  type AuthSessionV2,
  type PatientPasswordChangeResult,
  type PatientLoginChangeResult,
} from './authPersistence';
import { readPersistedOnce } from '../bootstrap/persistedBootstrap';

export type SessionRole = 'therapist' | 'patient' | null;

interface AuthContextValue {
  therapist: Therapist | null;
  sessionRole: SessionRole;
  patientSessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginError: string | null;
  login: (identifier: string, password: string) => Promise<'therapist' | 'patient' | null>;
  logout: () => void;
  /** שם תצוגה, דוא״ל, סיסמה (ריק = ללא שינוי סיסמה) */
  updateTherapistProfile: (displayName: string, email: string, newPassword: string) => void;
  patientMustChangePassword: boolean;
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => PatientPasswordChangeResult;
  /** שינוי מזהה כניסה למטופל (PT-...) לאחר אימות סיסמה */
  changePatientLoginId: (currentPassword: string, newLoginId: string) => PatientLoginChangeResult;
  /** מזהה כניסה נוכחי למטופל מחובר (לתצוגה בהגדרות) */
  patientLoginId: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function therapistFromSession(snap: ReturnType<typeof loadAuthSnapshot>, therapistId: string): Therapist | null {
  const rec = snap.therapists[therapistId];
  if (!rec) return null;
  return therapistRecordToTherapist(therapistId, rec);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionV2 | null>(() => readPersistedOnce().auth.session);
  const [therapist, setTherapist] = useState<Therapist | null>(() => {
    const snap = readPersistedOnce().auth;
    if (snap.session?.role === 'therapist') {
      return therapistFromSession(snap, snap.session.therapistId);
    }
    return null;
  });
  const [patientSessionId, setPatientSessionId] = useState<string | null>(() => {
    const snap = readPersistedOnce().auth;
    return snap.session?.role === 'patient' ? snap.session.patientId : null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [patientAuthRevision, setPatientAuthRevision] = useState(0);

  const sessionRole: SessionRole = useMemo(() => {
    if (!session) return null;
    return session.role;
  }, [session]);

  const patientMustChangePassword = useMemo(() => {
    void patientAuthRevision;
    if (!session || session.role !== 'patient') return false;
    const snap = loadAuthSnapshot();
    return patientAccountRequiresPasswordChange(snap, session.patientId);
  }, [session, patientAuthRevision]);

  const patientLoginId = useMemo(() => {
    void patientAuthRevision;
    if (!patientSessionId) return null;
    return findPatientLoginByPatientId(patientSessionId);
  }, [patientSessionId, patientAuthRevision]);

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    setLoginError(null);
    await new Promise((r) => setTimeout(r, 500));

    const snap = loadAuthSnapshot();
    const id = identifier.trim();
    const pw = password.trim();

    try {
      if (isEmailLike(id)) {
        const therapistId = findTherapistIdByCredentials(id, pw);
        if (therapistId) {
          const rec = snap.therapists[therapistId];
          if (rec) {
            setTherapist(therapistRecordToTherapist(therapistId, rec));
            setPatientSessionId(null);
            setPatientAuthRevision((n) => n + 1);
            const sess = { role: 'therapist' as const, therapistId };
            setSession(sess);
            setAuthSession(sess);
            setIsLoading(false);
            return 'therapist' as const;
          }
        }
        setLoginError('כתובת דוא"ל או סיסמה שגויים (מטפל).');
        setIsLoading(false);
        return null;
      }

      const loginKey = id.toUpperCase();
      const acc = snap.patientAccounts[loginKey];
      if (acc && acc.password === pw) {
        setTherapist(null);
        setPatientSessionId(acc.patientId);
        setPatientAuthRevision((n) => n + 1);
        const sess = { role: 'patient' as const, patientId: acc.patientId };
        setSession(sess);
        setAuthSession(sess);
        setIsLoading(false);
        return 'patient' as const;
      }

      setLoginError('מזהה גישה או סיסמה שגויים (מטופל).');
      setIsLoading(false);
      return null;
    } catch {
      setLoginError('שגיאת התחברות. נסו שוב.');
      setIsLoading(false);
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    setIsLoading(false);
    setTherapist(null);
    setPatientSessionId(null);
    setSession(null);
    setLoginError(null);
    setPatientAuthRevision((n) => n + 1);
    mergeAuthSnapshot({ session: null });
  }, []);

  const completePatientPasswordChange = useCallback(
    (currentPassword: string, newPassword: string): PatientPasswordChangeResult => {
      if (!patientSessionId) return 'bad_current';
      const result = verifyAndUpdatePatientPassword(patientSessionId, currentPassword, newPassword);
      if (result === 'ok') setPatientAuthRevision((n) => n + 1);
      return result;
    },
    [patientSessionId]
  );

  const changePatientLoginId = useCallback(
    (currentPassword: string, newLoginId: string): PatientLoginChangeResult => {
      if (!patientSessionId) return 'bad_password';
      const r = verifyAndUpdatePatientLoginId(patientSessionId, currentPassword, newLoginId);
      if (r === 'ok') setPatientAuthRevision((n) => n + 1);
      return r;
    },
    [patientSessionId]
  );

  const updateTherapistProfile = useCallback(
    (displayName: string, email: string, newPassword: string) => {
      if (!therapist) return;
      const cur = getTherapistRecord(therapist.id);
      if (!cur) return;
      const pw = newPassword.trim().length > 0 ? newPassword.trim() : cur.password;
      updateTherapistRecord(therapist.id, {
        displayName: displayName.trim() || cur.displayName,
        email: email.trim(),
        password: pw,
      });
      const next = getTherapistRecord(therapist.id);
      if (next) setTherapist(therapistRecordToTherapist(therapist.id, next));
    },
    [therapist]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      therapist,
      sessionRole,
      patientSessionId,
      isAuthenticated: session !== null,
      isLoading,
      loginError,
      login,
      logout,
      updateTherapistProfile,
      patientMustChangePassword,
      completePatientPasswordChange,
      changePatientLoginId,
      patientLoginId,
    }),
    [
      therapist,
      sessionRole,
      patientSessionId,
      session,
      isLoading,
      loginError,
      login,
      logout,
      updateTherapistProfile,
      patientMustChangePassword,
      completePatientPasswordChange,
      changePatientLoginId,
      patientLoginId,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
