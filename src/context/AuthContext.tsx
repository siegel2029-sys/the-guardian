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
import { mockTherapist } from '../data/mockData';
import {
  loadAuthSnapshot,
  mergeAuthSnapshot,
  setAuthSession,
  updateTherapistCredentials as persistTherapistCredentials,
  patientAccountRequiresPasswordChange,
  verifyAndUpdatePatientPassword,
  type AuthSessionV1,
  type PatientPasswordChangeResult,
} from './authPersistence';
import { readPersistedOnce } from '../bootstrap/persistedBootstrap';

export type SessionRole = 'therapist' | 'patient' | null;

interface AuthContextValue {
  therapist: Therapist | null;
  /** null = לא מחובר; therapist / patient לפי סשן */
  sessionRole: SessionRole;
  /** כשמחובר כמטופל — מזהה המטופל */
  patientSessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginError: string | null;
  /** דוא״ל למטפל או מזהה גישה למטופל (PT-...) */
  /** הצלחה: תפקיד; כישלון: null */
  login: (identifier: string, password: string) => Promise<'therapist' | 'patient' | null>;
  logout: () => void;
  updateTherapistProfile: (email: string, newPassword: string) => void;
  /** מטופל מחובר — נדרשת החלפת סיסמה (חשבון חדש או דגל ב־localStorage) */
  patientMustChangePassword: boolean;
  /** עדכון סיסמת מטופל לאחר אימות סיסמה נוכחית */
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => PatientPasswordChangeResult;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function therapistFromSnapshot(email: string): Therapist {
  return { ...mockTherapist, email };
}

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionV1 | null>(() => readPersistedOnce().auth.session);
  const [therapist, setTherapist] = useState<Therapist | null>(() => {
    const snap = readPersistedOnce().auth;
    if (snap.session?.role === 'therapist') {
      return therapistFromSnapshot(snap.therapistEmail);
    }
    return null;
  });
  const [patientSessionId, setPatientSessionId] = useState<string | null>(() => {
    const snap = readPersistedOnce().auth;
    return snap.session?.role === 'patient' ? snap.session.patientId : null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  /** מספר עדכון אחרי שינוי סיסמת מטופל — מרענן נגזרות מ־loadAuthSnapshot */
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

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    setLoginError(null);
    await new Promise((r) => setTimeout(r, 500));

    const snap = loadAuthSnapshot();
    const id = identifier.trim();
    const pw = password.trim();

    try {
      if (isEmailLike(id)) {
        const emailMatch = id.toLowerCase() === snap.therapistEmail.toLowerCase();
        const passwordMatch = pw === snap.therapistPassword;
        if (emailMatch && passwordMatch) {
          const t = therapistFromSnapshot(snap.therapistEmail);
          setTherapist(t);
          setPatientSessionId(null);
          setPatientAuthRevision((n) => n + 1);
          setSession({ role: 'therapist' });
          setAuthSession({ role: 'therapist' });
          setIsLoading(false);
          return 'therapist' as const;
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

  const updateTherapistProfile = useCallback((email: string, newPassword: string) => {
    persistTherapistCredentials(email, newPassword);
    if (therapist) {
      setTherapist({ ...therapist, email: email.trim() });
    }
  }, [therapist]);

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
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
