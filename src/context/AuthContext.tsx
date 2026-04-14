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
import {
  useSupabaseAuthBridge,
  portalUsernameToAuthEmail,
  normalizePortalUsername,
  isValidPortalUsername,
  linkPatientAuthUserRow,
} from '../lib/patientPortalAuth';

export type SessionRole = 'therapist' | 'patient' | null;

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
  login: (identifier: string, password: string) => Promise<'therapist' | 'patient' | null>;
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

  const bridge = useSupabaseAuthBridge();

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
    setSession(null);
    mergeAuthSnapshot({ session: null });
  }, []);

  const loadSupabaseUserIntoState = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      clearSupabaseAuthState();
      return;
    }

    setUsesSupabaseSession(true);
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const pid = typeof meta?.patient_id === 'string' ? meta.patient_id.trim() : '';
    if (pid) {
      await linkPatientAuthUserRow(supabase, pid);
      const pun = typeof meta?.portal_username === 'string' ? meta.portal_username.trim() : '';
      if (pun) {
        try {
          window.sessionStorage.setItem(
            'sb-portal-username-cache',
            JSON.stringify({ patientId: pid, u: pun })
          );
        } catch {
          /* ignore */
        }
      }
      setTherapist(null);
      setPatientSessionId(pid);
      const sess = { role: 'patient' as const, patientId: pid };
      setSession(sess);
      mergeAuthSnapshot({ session: sess });
      return;
    }

    const tid = user.id;
    const email = user.email ?? '';
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', tid).maybeSingle();
    const displayName =
      (prof?.name && String(prof.name)) ||
      (typeof meta?.full_name === 'string' && meta.full_name) ||
      email.split('@')[0] ||
      'מטפל';
    if (!prof) {
      await syncTherapistProfileRow(tid, email, displayName);
    }
    const nextTherapist: Therapist = {
      id: tid,
      name: displayName,
      email: (prof?.email && String(prof.email)) || email,
      title: (prof?.title && String(prof.title)) || 'מטפל',
      avatarInitials: (prof?.avatar_initials && String(prof.avatar_initials)) || 'מ',
      clinicName: (prof?.clinic_name && String(prof.clinic_name)) || '',
    };
    setTherapist(nextTherapist);
    setPatientSessionId(null);
    const sess = { role: 'therapist' as const, therapistId: tid };
    setSession(sess);
    mergeAuthSnapshot({ session: sess });
  }, [supabase, clearSupabaseAuthState, syncTherapistProfileRow]);

  useEffect(() => {
    if (!bridge || !supabase) return;

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
  }, [bridge, supabase, clearSupabaseAuthState, loadSupabaseUserIntoState]);

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
    if (usesSupabaseSession && supabase) {
      const syncRead = (): string | null => {
        try {
          const raw = window.sessionStorage.getItem('sb-portal-username-cache');
          if (!raw) return null;
          const o = JSON.parse(raw) as { patientId?: string; u?: string };
          if (o.patientId === patientSessionId && typeof o.u === 'string') return o.u;
        } catch {
          /* ignore */
        }
        return null;
      };
      const cached = syncRead();
      if (cached) return cached;
    }
    return findPatientLoginByPatientId(patientSessionId);
  }, [patientSessionId, patientAuthRevision, usesSupabaseSession, supabase]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      setIsLoading(true);
      setLoginError(null);
      const id = identifier.trim();
      const pw = password.trim();

      try {
        if (bridge && supabase) {
          if (isEmailLike(id)) {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: id.toLowerCase(),
              password: pw,
            });
            if (error || !data.user) {
              setLoginError('כתובת דוא"ל או סיסמה שגויים (מטפל).');
              setIsLoading(false);
              return null;
            }
            const meta = data.user.user_metadata as Record<string, unknown> | undefined;
            if (typeof meta?.patient_id === 'string' && meta.patient_id.trim()) {
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
            setLoginError('מזהה פורטל או סיסמה שגויים.');
            setIsLoading(false);
            return null;
          }
          const patientId = (data.user.user_metadata as { patient_id?: string } | undefined)?.patient_id;
          if (typeof patientId === 'string' && patientId.trim()) {
            await linkPatientAuthUserRow(supabase, patientId.trim());
            try {
              window.sessionStorage.setItem(
                'sb-portal-username-cache',
                JSON.stringify({ patientId: patientId.trim(), u: normalized })
              );
            } catch {
              /* ignore */
            }
          }
          await loadSupabaseUserIntoState();
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
    [bridge, supabase, loadSupabaseUserIntoState]
  );

  const logout = useCallback(async () => {
    setIsLoading(false);
    if (bridge && supabase) {
      await supabase.auth.signOut();
    }
    setTherapist(null);
    setPatientSessionId(null);
    setSession(null);
    setLoginError(null);
    setUsesSupabaseSession(false);
    setPatientAuthRevision((n) => n + 1);
    mergeAuthSnapshot({ session: null });
    try {
      window.sessionStorage.removeItem('sb-portal-username-cache');
    } catch {
      /* ignore */
    }
  }, [bridge, supabase]);

  const completePatientPasswordChange = useCallback(
    async (currentPassword: string, newPassword: string): Promise<PatientPasswordChangeResult> => {
      if (!patientSessionId) return 'bad_current';
      if (bridge && supabase) {
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
    [patientSessionId, bridge, supabase]
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

      if (bridge && supabase) {
        const attrs: { email?: string; password?: string } = {};
        if (em.length > 0) attrs.email = em;
        const np = newPassword.trim();
        if (np.length > 0) attrs.password = np;
        if (Object.keys(attrs).length > 0) {
          await supabase.auth.updateUser(attrs);
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
    [therapist, bridge, supabase, syncTherapistProfileRow]
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
      login,
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
      login,
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
