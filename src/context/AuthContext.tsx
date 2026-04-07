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
  saveAuthSnapshot,
  setAuthSession,
  updateTherapistCredentials as persistTherapistCredentials,
  type AuthSessionV1,
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

  const sessionRole: SessionRole = useMemo(() => {
    if (!session) return null;
    return session.role;
  }, [session]);

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    setLoginError(null);
    await new Promise((r) => setTimeout(r, 500));

    const snap = loadAuthSnapshot();
    const id = identifier.trim();
    const pw = password;

    try {
      if (isEmailLike(id)) {
        if (id.toLowerCase() === snap.therapistEmail.toLowerCase() && pw === snap.therapistPassword) {
          const t = therapistFromSnapshot(snap.therapistEmail);
          setTherapist(t);
          setPatientSessionId(null);
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
    setTherapist(null);
    setPatientSessionId(null);
    setSession(null);
    setLoginError(null);
    const snap = loadAuthSnapshot();
    saveAuthSnapshot({ ...snap, session: null });
  }, []);

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
    }),
    [therapist, sessionRole, patientSessionId, session, isLoading, loginError, login, logout, updateTherapistProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
