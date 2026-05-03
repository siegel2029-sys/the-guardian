// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
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
import type { Session, User } from '@supabase/supabase-js';
import { hasPersistedSupabaseAuthSession, supabase } from '../lib/supabase';
import { supabaseAuthErrorMessageHe } from '../lib/supabaseAuthErrors';
import {
  getSupabaseUserMetadata,
  mapSupabaseUserToTherapist,
  metadataString,
  type ProfileRow,
} from '../lib/mapSupabaseUser';
import {
  isSupabaseAuthEnabled,
  portalUsernameToAuthEmail,
  normalizePortalUsername,
  isValidPortalUsername,
  linkPatientAuthUserRow,
} from '../lib/patientPortalAuth';

/** Only `VITE_USE_LEGACY_AUTH=true` enables local demo users — any other value is treated as false. */
const LEGACY_AUTH_ENABLED = import.meta.env.VITE_USE_LEGACY_AUTH === 'true';

export type SessionRole = 'therapist' | 'patient' | null;

/** תוצאת הרשמת מטפל ב-Supabase — לעדכון ה-UI (הפניה / אימות דוא״ל / שגיאה). */
export type TherapistSignUpResult = 'session' | 'verify_email' | 'failure';

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/** Legacy keys that could disagree with Supabase Auth — clear on Supabase login. */
function clearLegacyLocalUserStorageKeys(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem('patient-user');
    window.localStorage.removeItem('therapist-user');
  } catch {
    /* ignore quota / private mode */
  }
}

/** Profile/RLS failures must not invalidate a valid Supabase JWT session. */
function isProfileAccessDeniedError(err: { code?: string; message?: string; status?: number }): boolean {
  const st = (err as { status?: number }).status;
  const c = err.code ?? '';
  return (
    st === 401 ||
    st === 403 ||
    c === '42501' ||
    c === 'PGRST301' ||
    /permission denied|jwt|row-level security/i.test(err.message ?? '')
  );
}

/** Returns the therapist's Supabase id plus legacy demo ids for backward-compat patient scoping. */
function therapistPatientScopeIdsForUser(therapist: Therapist | null): string[] {
  if (!therapist) return [];
  const ids = [therapist.id];
  if (isUuidLike(therapist.id)) {
    ids.push('therapist-001', 'therapist-002');
  }
  return ids;
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
  /** JWT session from Supabase Auth (for routing before profile hydration). */
  hasSupabaseSession: boolean;
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
  /** True until Supabase initial session + profile load finishes (avoids redirect to /login during hydration). */
  const [isLoading, setIsLoading] = useState(() => isSupabaseAuthEnabled());
  const [loginError, setLoginError] = useState<string | null>(null);
  const [patientAuthRevision, setPatientAuthRevision] = useState(0);
  const [usesSupabaseSession, setUsesSupabaseSession] = useState(false);
  const [patientPortalDisplayId, setPatientPortalDisplayId] = useState<string | null>(null);
  const [supabaseAuthSession, setSupabaseAuthSession] = useState<Session | null>(null);
  /** Row from `public.profiles` when fetched (for debugging / UI). */
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const supabaseAuth = isSupabaseAuthEnabled();

  /** Minimal columns only — avoids 400 when optional columns are missing from remote schema. DB uses `name` for display (not `full_name`). */
  const syncTherapistProfileRow = useCallback(async (userId: string, email: string, displayName: string) => {
    if (!supabase) return;
    await supabase.from('profiles').upsert(
      {
        id: userId,
        email: email || '',
        name: displayName || email || '',
      },
      { onConflict: 'id' }
    );
  }, [supabase]);

  const clearSupabaseAuthState = useCallback(() => {
    setSupabaseAuthSession(null);
    setProfile(null);
    setUsesSupabaseSession(false);
    setTherapist(null);
    setPatientSessionId(null);
    setPatientPortalDisplayId(null);
    setSession(null);
    if (!isSupabaseAuthEnabled()) {
      mergeAuthSnapshot({ session: null });
    }
  }, []);

  /**
   * Clears only when there is no Supabase auth token in localStorage and getSession() stays empty.
   * If `sb-*-auth-token` exists, waits for hydration — never kicks while storage suggests a session.
   */
  const clearSupabaseAuthStateIfSessionGone = useCallback(
    async (reason: string) => {
      const client = supabase;
      if (!client) return;

      const sessionHasUser = async () => {
        const { data: w } = await client.auth.getSession();
        return Boolean(w.session?.user);
      };

      if (await sessionHasUser()) return;

      if (hasPersistedSupabaseAuthSession()) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 50 + i * 25));
          if (await sessionHasUser()) return;
          if (!hasPersistedSupabaseAuthSession()) break;
        }
      }

      if (hasPersistedSupabaseAuthSession()) {
        return;
      }

      if (await sessionHasUser()) return;
      await new Promise((r) => setTimeout(r, 50));
      if (await sessionHasUser()) return;

      if (hasPersistedSupabaseAuthSession()) {
        return;
      }

      if (import.meta.env.DEV) {
        console.debug(`[Auth] clear session (no Supabase JWT): ${reason}`);
      }
      clearSupabaseAuthState();
    },
    [supabase, clearSupabaseAuthState]
  );

  const loadSupabaseUserIntoState = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data: sessWrap } = await supabase.auth.getSession();
      let user: User | null = sessWrap.session?.user ?? null;
      if (!user) {
        await clearSupabaseAuthStateIfSessionGone('loadSupabaseUserIntoState: getSession had no user');
        return;
      }

      if (!LEGACY_AUTH_ENABLED) {
        clearLegacyLocalUserStorageKeys();
      }

      try {
        const { data: gu } = await supabase.auth.getUser();
        if (gu.user) user = gu.user;
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[Auth] getUser (keeping getSession user)', e);
      }

      setUsesSupabaseSession(true);
      const meta = getSupabaseUserMetadata(user);
      const pid = metadataString(meta, 'patient_id') ?? '';
      if (pid) {
        try {
          await linkPatientAuthUserRow(supabase, pid);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[Auth] linkPatientAuthUserRow', e);
        }
        const pun = metadataString(meta, 'portal_username') ?? null;
        setPatientPortalDisplayId(pun);
        setTherapist(null);
        setPatientSessionId(pid);
        setSession({ role: 'patient', patientId: pid });
        setProfile(null);
        return;
      }

      setPatientPortalDisplayId(null);
      const tid = user.id;
      const email = user.email ?? '';

      let prof: ProfileRow | undefined;
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', tid).maybeSingle();
        if (error) {
          if (import.meta.env.DEV) {
            console.warn('[Auth] profiles select', error.message, isProfileAccessDeniedError(error) ? '(session kept)' : '');
          }
          prof = undefined;
        } else {
          prof = data ?? undefined;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[Auth] profiles fetch', e);
      }

      setProfile(prof ?? null);
      const nextTherapist = mapSupabaseUserToTherapist(user, prof);
      setTherapist(nextTherapist);
      setPatientSessionId(null);
      setSession({ role: 'therapist', therapistId: tid });

      if (!prof) {
        try {
          await syncTherapistProfileRow(tid, email, nextTherapist.name);
          const { data: after } = await supabase.from('profiles').select('*').eq('id', tid).maybeSingle();
          if (after) setProfile(after);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[Auth] profile upsert', e);
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Auth] loadSupabaseUserIntoState', e);
      const { data: sessWrap } = await supabase.auth.getSession();
      const user = sessWrap.session?.user;
      if (!user) {
        return;
      }
      /* Session still valid — never clear auth because profile or getUser failed. */
      setUsesSupabaseSession(true);
      const meta = getSupabaseUserMetadata(user);
      const pid = metadataString(meta, 'patient_id') ?? '';
      if (pid) {
        setPatientPortalDisplayId(metadataString(meta, 'portal_username') ?? null);
        setTherapist(null);
        setPatientSessionId(pid);
        setSession({ role: 'patient', patientId: pid });
        setProfile(null);
        return;
      }
      setProfile(null);
      setTherapist(mapSupabaseUserToTherapist(user, undefined));
      setPatientSessionId(null);
      setSession({ role: 'therapist', therapistId: user.id });
    }
  }, [supabase, clearSupabaseAuthStateIfSessionGone, syncTherapistProfileRow]);

  const loadSupabaseUserIntoStateRef = useRef(loadSupabaseUserIntoState);
  loadSupabaseUserIntoStateRef.current = loadSupabaseUserIntoState;
  const clearIfSessionGoneRef = useRef(clearSupabaseAuthStateIfSessionGone);
  clearIfSessionGoneRef.current = clearSupabaseAuthStateIfSessionGone;
  const clearSupabaseAuthStateRef = useRef(clearSupabaseAuthState);
  clearSupabaseAuthStateRef.current = clearSupabaseAuthState;

  useEffect(() => {
    if (!supabaseAuth || !supabase) {
      setIsLoading(false);
      return;
    }

    /* No navigate("/login") here — access control is in ProtectedRoute only (avoids redirect loops). */

    let cancelled = false;

    void (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSupabaseAuthSession(s);
      try {
        if (!s) {
          await clearIfSessionGoneRef.current('initial auth bootstrap: getSession returned null');
        } else {
          await loadSupabaseUserIntoStateRef.current();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSupabaseAuthSession(sess ?? null);
      if (import.meta.env.DEV) console.debug('[Auth] onAuthStateChange', event, sess ? 'session' : 'null');
      if (event === 'INITIAL_SESSION') {
        return;
      }
      if (event === 'SIGNED_OUT') {
        if (!hasPersistedSupabaseAuthSession()) {
          if (import.meta.env.DEV) {
            console.debug(
              '[Auth] SIGNED_OUT — cleared app auth (no sb-*-auth-token in localStorage)'
            );
          }
          clearSupabaseAuthStateRef.current();
        }
        if (!cancelled) setIsLoading(false);
        return;
      }
      if (!sess) {
        void (async () => {
          await clearIfSessionGoneRef.current(
            `onAuthStateChange: null session after event ${event}`
          );
          if (!cancelled) setIsLoading(false);
        })();
        return;
      }
      void loadSupabaseUserIntoStateRef.current().finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabaseAuth, supabase]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[Auth] state', { hasSession: !!supabaseAuthSession, hasProfile: profile !== null });
    }
  }, [supabaseAuthSession, profile]);

  const sessionRole: SessionRole = useMemo(() => {
    if (session) return session.role;
    const u = supabaseAuthSession?.user;
    if (!u) return null;
    const meta = getSupabaseUserMetadata(u);
    return metadataString(meta, 'patient_id') ? 'patient' : 'therapist';
  }, [session, supabaseAuthSession]);

  const patientSessionIdForUi = useMemo(() => {
    if (session?.role === 'patient') return session.patientId;
    const u = supabaseAuthSession?.user;
    if (u) {
      const fromJwt = metadataString(getSupabaseUserMetadata(u), 'patient_id');
      if (fromJwt) return fromJwt;
    }
    return patientSessionId;
  }, [session, patientSessionId, supabaseAuthSession]);

  const therapistPatientScopeIds = useMemo(() => {
    if (therapist) return therapistPatientScopeIdsForUser(therapist);
    const u = supabaseAuthSession?.user;
    if (!u) return [];
    const meta = getSupabaseUserMetadata(u);
    if (metadataString(meta, 'patient_id')) return [];
    return [u.id];
  }, [therapist, supabaseAuthSession]);

  const patientMustChangePassword = useMemo(() => {
    void patientAuthRevision;
    if (usesSupabaseSession) return false;
    if (!session || session.role !== 'patient') return false;
    const snap = loadAuthSnapshot();
    return patientAccountRequiresPasswordChange(snap, session.patientId);
  }, [session, patientAuthRevision, usesSupabaseSession]);

  const patientLoginId = useMemo(() => {
    void patientAuthRevision;
    if (!patientSessionIdForUi) return null;
    if (usesSupabaseSession && patientPortalDisplayId) {
      return patientPortalDisplayId;
    }
    return findPatientLoginByPatientId(patientSessionIdForUi);
  }, [patientSessionIdForUi, patientAuthRevision, usesSupabaseSession, patientPortalDisplayId]);

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
        setLoginError('הרשמה דורשת Supabase מוגדר (או VITE_USE_LEGACY_AUTH=true לדמו מקומי).');
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
          if (!patientId) {
            // Account exists but has no patient_id in JWT metadata — misconfigured portal account.
            setLoginError('חשבון פורטל לא תקין: חסר מזהה מטופל. פנו למטפל לתיקון.');
            await supabase.auth.signOut();
            setIsLoading(false);
            return null;
          }
          await linkPatientAuthUserRow(supabase, patientId);
          await loadSupabaseUserIntoState();
          setPatientPortalDisplayId((prev) => prev ?? normalized);
          setIsLoading(false);
          return 'patient';
        } else if (LEGACY_AUTH_ENABLED) {
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
        }

        setLoginError(
          'התחברות דורשת Supabase (VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY) או מצב דמו מקומי (VITE_USE_LEGACY_AUTH=true).'
        );
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
    setSupabaseAuthSession(null);
    setProfile(null);
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
      if (!patientSessionIdForUi) return 'bad_current';
      if (supabaseAuth && supabase) {
        const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
        if (error) {
          return 'invalid_new';
        }
        return 'ok';
      }
      const result = verifyAndUpdatePatientPassword(
        patientSessionIdForUi,
        currentPassword,
        newPassword
      );
      if (result === 'ok') setPatientAuthRevision((n) => n + 1);
      return result;
    },
    [patientSessionIdForUi, supabaseAuth, supabase]
  );

  const changePatientLoginId = useCallback(
    (currentPassword: string, newLoginId: string): PatientLoginChangeResult =>
      verifyAndUpdatePatientLoginId(patientSessionIdForUi ?? '', currentPassword, newLoginId),
    [patientSessionIdForUi]
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
      patientSessionId: patientSessionIdForUi,
      therapistPatientScopeIds,
      isAuthenticated:
        session !== null || (supabaseAuth && supabaseAuthSession !== null),
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
      hasSupabaseSession: supabaseAuth && supabaseAuthSession !== null,
    }),
    [
      therapist,
      sessionRole,
      patientSessionIdForUi,
      therapistPatientScopeIds,
      session,
      supabaseAuth,
      supabaseAuthSession,
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
