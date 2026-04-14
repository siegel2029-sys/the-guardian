// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
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
import { mockTherapist, mockTherapistB } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { supabaseAuthErrorMessageHe } from '../lib/supabaseAuthErrors';
import {
  getSupabaseUserMetadata,
  mapSupabaseUserToTherapist,
  metadataString,
} from '../lib/mapSupabaseUser';
import {
  isSupabaseAuthEnabled,
  portalUsernameToAuthEmail,
  normalizePortalUsername,
  isValidPortalUsername,
  linkPatientAuthUserRow,
} from '../lib/patientPortalAuth';

export type SessionRole = 'therapist' | 'patient' | null;

/** תוצאת הרשמת מטפל ב-Supabase — לעדכון ה-UI (הפניה / אימות דוא״ל / שגיאה). */
export type TherapistSignUpResult = 'session' | 'verify_email' | 'failure';

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/** מזהי therapistId מקומיים (דמו) המותאמים למטפל מחובר ל-Supabase לפי דוא״ל — לסינון מטופלים ישנים. */
function therapistPatientScopeIdsForUser(therapist: Therapist | null): string[] {
  if (!therapist) return [];
  if (!isUuidLike(therapist.id)) return [therapist.id];
  const em = therapist.email.trim().toLowerCase();
  if (em === mockTherapist.email.toLowerCase()) return [therapist.id, mockTherapist.id];
  if (em === mockTherapistB.email.toLowerCase()) return [therapist.id, mockTherapistB.id];
  return [therapist.id];
}

function therapistFromSession(snap: ReturnType<typeof loadAuthSnapshot>, therapistId: string): Therapist | null {
  const rec = snap.therapists[therapistId];
  if (!rec) return null;
  return therapistRecordToTherapist(therapistId, rec);
}

interface AuthContextValue {
  therapist: Therapist | null;
  sessionRole: SessionRole;
  patientSessionId: string | null;
  /** מזהי therapistId לסינון מטופלים (כולל כינוי דמו כשמחוברים ל-Supabase עם UUID). */
  therapistPatientScopeIds: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  loginError: string | null;
  /** מאפס הודעות שגיאה מהטופס (למשל בעת מעבר בין כניסה להרשמה). */
  clearLoginError: () => void;
  login: (identifier: string, password: string) => Promise<'therapist' | 'patient' | null>;
  /**
   * הרשמת מטפל ב-Supabase Auth (מטא־דאטה: full_name, role=therapist).
   * session — נכנסים מיד; verify_email — נרשמו בהצלחה, יש לאשר דוא״ל; failure — ראו loginError.
   */
  signUp: (email: string, password: string, displayName?: string) => Promise<TherapistSignUpResult>;
  logout: () => Promise<void>;
  /** שם תצוגה, דוא״ל, סיסמה (ריק = ללא שינוי סיסמה) */
  updateTherapistProfile: (displayName: string, email: string, newPassword: string) => Promise<void>;
  patientMustChangePassword: boolean;
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => Promise<PatientPasswordChangeResult>;
  /** נעול — מזהה פורטל קבוע (מדיניות פרטיות) */
  changePatientLoginId: (currentPassword: string, newLoginId: string) => PatientLoginChangeResult;
  /** מזהה פורטל (רמזים) לתצוגה */
  patientLoginId: string | null;
  /** true כשהסשן מגיע מ-Supabase Auth */
  usesSupabaseSession: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const [usesSupabaseSession, setUsesSupabaseSession] = useState(false);
  const [patientPortalDisplayId, setPatientPortalDisplayId] = useState<string | null>(null);

  const supabaseAuth = isSupabaseAuthEnabled();

  const syncTherapistProfileRow = useCallback(async (userId: string, email: string, displayName: string) => {
    if (!supabase) return;
    const now = new Date().toISOString();
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('');
    await supabase.from('profiles').upsert(
      {
        id: userId,
        email: email || '',
        name: displayName || email || '',
        title: '',
        avatar_initials: initials || '—',
        clinic_name: '',
        updated_at: now,
      },
      { onConflict: 'id' }
    );
  }, [supabase]);

  const clearSupabaseAuthState = useCallback(() => {
    setUsesSupabaseSession(false);
    setTherapist(null);
    setPatientSessionId(null);
    setPatientPortalDisplayId(null);
    setSession(null);
    if (!isSupabaseAuthEnabled()) {
      mergeAuthSnapshot({ session: null });
    }
  }, []);

  const loadSupabaseUserIntoState = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      clearSupabaseAuthState();
      return;
    }

    setUsesSupabaseSession(true);
    const meta = getSupabaseUserMetadata(user);
    const pid = metadataString(meta, 'patient_id') ?? '';
    if (pid) {
      await linkPatientAuthUserRow(supabase, pid);
      const pun = metadataString(meta, 'portal_username') ?? null;
      setPatientPortalDisplayId(pun);
      setTherapist(null);
      setPatientSessionId(pid);
      setSession({ role: 'patient', patientId: pid });
      return;
    }

    setPatientPortalDisplayId(null);
    const tid = user.id;
    const email = user.email ?? '';
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', tid).maybeSingle();
    const nextTherapist = mapSupabaseUserToTherapist(user, prof ?? undefined);
    if (!prof) {
      await syncTherapistProfileRow(tid, email, nextTherapist.name);
    }
    setTherapist(nextTherapist);
    setPatientSessionId(null);
    setSession({ role: 'therapist', therapistId: tid });
  }, [supabase, clearSupabaseAuthState, syncTherapistProfileRow]);

  useEffect(() => {
    if (!supabaseAuth || !supabase) return;

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) clearSupabaseAuthState();
      else void loadSupabaseUserIntoState();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT' || !s) {
        clearSupabaseAuthState();
        return;
      }
      void loadSupabaseUserIntoState();
    });

    return () => subscription.unsubscribe();
  }, [supabaseAuth, supabase, clearSupabaseAuthState, loadSupabaseUserIntoState]);

  const sessionRole: SessionRole = useMemo(() => {
    if (!session) return null;
    return session.role;
  }, [session]);

  const therapistPatientScopeIds = useMemo(
    () => therapistPatientScopeIdsForUser(therapist),
    [therapist]
  );

  const patientMustChangePassword = useMemo(() => {
    void patientAuthRevision;
    if (usesSupabaseSession) return false;
    if (!session || session.role !== 'patient') return false;
    const snap = loadAuthSnapshot();
    return patientAccountRequiresPasswordChange(snap, session.patientId);
  }, [session, patientAuthRevision, usesSupabaseSession]);

  const patientLoginId = useMemo(() => {
    void patientAuthRevision;
    if (!patientSessionId) return null;
    if (usesSupabaseSession && patientPortalDisplayId) {
      return patientPortalDisplayId;
    }
    return findPatientLoginByPatientId(patientSessionId);
  }, [patientSessionId, patientAuthRevision, usesSupabaseSession, patientPortalDisplayId]);

  const clearLoginError = useCallback(() => {
    setLoginError(null);
  }, []);

  const signUp = useCallback(
    async (
      emailRaw: string,
      passwordRaw: string,
      displayName?: string
    ): Promise<TherapistSignUpResult> => {
      if (!supabaseAuth || !supabase) {
        setLoginError('הרשמה דורשת Supabase מוגדר ו־VITE_USE_LEGACY_AUTH שאינו true.');
        return 'failure';
      }
      const email = emailRaw.trim().toLowerCase();
      const password = passwordRaw.trim();
      const name = displayName?.trim() ?? '';
      if (!isEmailLike(email)) {
        setLoginError('נא להזין כתובת דוא״ל תקינה.');
        return 'failure';
      }
      if (password.length < 6) {
        setLoginError('הסיסמה חייבת להכיל לפחות 6 תווים.');
        return 'failure';
      }
      if (!name) {
        setLoginError('נא למלא שם מלא.');
        return 'failure';
      }
      setIsLoading(true);
      setLoginError(null);
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              role: 'therapist',
            },
          },
        });
        if (error) {
          setLoginError(
            supabaseAuthErrorMessageHe(error, 'לא ניתן להשלים הרשמה. נסו שוב.')
          );
          setIsLoading(false);
          return 'failure';
        }
        if (data.session) {
          await loadSupabaseUserIntoState();
          setIsLoading(false);
          return 'session';
        }
        setIsLoading(false);
        return 'verify_email';
      } catch {
        setLoginError('שגיאת הרשמה. נסו שוב.');
        setIsLoading(false);
        return 'failure';
      }
    },
    [supabaseAuth, supabase, loadSupabaseUserIntoState]
  );

  const login = useCallback(
    async (identifier: string, password: string) => {
      setIsLoading(true);
      setLoginError(null);
      const id = identifier.trim();
      const pw = password.trim();

      try {
        if (supabaseAuth) {
          if (!supabase) {
            setLoginError(
              'חסרות הגדרות Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
            );
            setIsLoading(false);
            return null;
          }

          if (isEmailLike(id)) {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: id.toLowerCase(),
              password: pw,
            });
            if (error || !data.user) {
              setLoginError(
                supabaseAuthErrorMessageHe(
                  error ?? undefined,
                  'כתובת דוא"ל או סיסמה שגויים (מטפל).'
                )
              );
              setIsLoading(false);
              return null;
            }
            const meta = getSupabaseUserMetadata(data.user);
            if (metadataString(meta, 'patient_id')) {
              setLoginError('התחברתם כמטופל עם דוא״ל מטפל — השתמשו במזהה הפורטל (רמזים).');
              await supabase.auth.signOut();
              setIsLoading(false);
              return null;
            }
            await loadSupabaseUserIntoState();
            setIsLoading(false);
            return 'therapist';
          }

          const normalized = normalizePortalUsername(id);
          if (!isValidPortalUsername(normalized)) {
            setLoginError('מזהה פורטל לא תקין (2–32 תווים, אנגלית ומספרים).');
            setIsLoading(false);
            return null;
          }
          const email = portalUsernameToAuthEmail(normalized);
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
          if (error || !data.user) {
            setLoginError(
              supabaseAuthErrorMessageHe(error ?? undefined, 'מזהה פורטל או סיסמה שגויים.')
            );
            setIsLoading(false);
            return null;
          }
          const patientId = metadataString(getSupabaseUserMetadata(data.user), 'patient_id');
          if (patientId) {
            await linkPatientAuthUserRow(supabase, patientId);
          }
          await loadSupabaseUserIntoState();
          setPatientPortalDisplayId((prev) => prev ?? normalized);
          setIsLoading(false);
          return 'patient';
        }

        await new Promise((r) => setTimeout(r, 300));
        const snap = loadAuthSnapshot();

        if (isEmailLike(id)) {
          const therapistId = findTherapistIdByCredentials(id, pw);
          if (therapistId) {
            const rec = snap.therapists[therapistId];
            if (rec) {
              setTherapist(therapistRecordToTherapist(therapistId, rec));
              setPatientSessionId(null);
              setPatientAuthRevision((n) => n + 1);
              setUsesSupabaseSession(false);
              const sess = { role: 'therapist' as const, therapistId };
              setSession(sess);
              setAuthSession(sess);
              setIsLoading(false);
              return 'therapist';
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
          setUsesSupabaseSession(false);
          const sess = { role: 'patient' as const, patientId: acc.patientId };
          setSession(sess);
          setAuthSession(sess);
          setIsLoading(false);
          return 'patient';
        }

        setLoginError('מזהה גישה או סיסמה שגויים (מטופל).');
        setIsLoading(false);
        return null;
      } catch {
        setLoginError('שגיאת התחברות. נסו שוב.');
        setIsLoading(false);
        return null;
      }
    },
    [supabaseAuth, supabase, loadSupabaseUserIntoState]
  );

  const logout = useCallback(async () => {
    setIsLoading(false);
    if (supabaseAuth && supabase) {
      await supabase.auth.signOut();
    }
    setTherapist(null);
    setPatientSessionId(null);
    setSession(null);
    setLoginError(null);
    setUsesSupabaseSession(false);
    setPatientPortalDisplayId(null);
    setPatientAuthRevision((n) => n + 1);
    if (!isSupabaseAuthEnabled()) {
      mergeAuthSnapshot({ session: null });
    }
  }, [supabaseAuth, supabase]);

  const completePatientPasswordChange = useCallback(
    async (currentPassword: string, newPassword: string): Promise<PatientPasswordChangeResult> => {
      if (!patientSessionId) return 'bad_current';
      if (supabaseAuth && supabase) {
        const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
        if (error) {
          return 'invalid_new';
        }
        return 'ok';
      }
      const result = verifyAndUpdatePatientPassword(patientSessionId, currentPassword, newPassword);
      if (result === 'ok') setPatientAuthRevision((n) => n + 1);
      return result;
    },
    [patientSessionId, supabaseAuth, supabase]
  );

  const changePatientLoginId = useCallback(
    (currentPassword: string, newLoginId: string): PatientLoginChangeResult =>
      verifyAndUpdatePatientLoginId(patientSessionId ?? '', currentPassword, newLoginId),
    [patientSessionId]
  );

  const updateTherapistProfile = useCallback(
    async (displayName: string, email: string, newPassword: string) => {
      if (!therapist) return;
      const name = displayName.trim();
      const em = email.trim();

      if (supabaseAuth && supabase) {
        const attrs: { email?: string; password?: string } = {};
        if (em.length > 0) attrs.email = em;
        const np = newPassword.trim();
        if (np.length > 0) attrs.password = np;
        if (Object.keys(attrs).length > 0) {
          const { error } = await supabase.auth.updateUser(attrs);
          if (error && import.meta.env.DEV) {
            console.warn('[updateTherapistProfile]', error.message);
          }
        }
        await syncTherapistProfileRow(therapist.id, em || therapist.email, name || therapist.name);
        setTherapist((prev) =>
          prev
            ? {
                ...prev,
                name: name || prev.name,
                email: em || prev.email,
              }
            : null
        );
        return;
      }

      const cur = getTherapistRecord(therapist.id);
      if (!cur) return;
      const pw = newPassword.trim().length > 0 ? newPassword.trim() : cur.password;
      updateTherapistRecord(therapist.id, {
        displayName: name || cur.displayName,
        email: em,
        password: pw,
      });
      const next = getTherapistRecord(therapist.id);
      if (next) setTherapist(therapistRecordToTherapist(therapist.id, next));
    },
    [therapist, supabaseAuth, supabase, syncTherapistProfileRow]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      therapist,
      sessionRole,
      patientSessionId,
      therapistPatientScopeIds,
      isAuthenticated: session !== null,
      isLoading,
      loginError,
      clearLoginError,
      login,
      signUp,
      logout,
      updateTherapistProfile,
      patientMustChangePassword,
      completePatientPasswordChange,
      changePatientLoginId,
      patientLoginId,
      usesSupabaseSession,
    }),
    [
      therapist,
      sessionRole,
      patientSessionId,
      therapistPatientScopeIds,
      session,
      isLoading,
      loginError,
      clearLoginError,
      login,
      signUp,
      logout,
      updateTherapistProfile,
      patientMustChangePassword,
      completePatientPasswordChange,
      changePatientLoginId,
      patientLoginId,
      usesSupabaseSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
