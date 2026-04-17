import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Normalize .env values (trailing newlines / spaces break isSupabaseConfigured otherwise). */
function trimEnv(v: string | undefined): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseUrl = trimEnv(rawSupabaseUrl);
export const supabaseAnonKey = trimEnv(rawSupabaseAnonKey);

const url = supabaseUrl;
const anonKey = supabaseAnonKey;

/** Mismatch (only one of URL/key set) is always misconfiguration. Both empty = local-only mode. */
const hasUrl = url.length > 0;
const hasKey = anonKey.length > 0;
if (hasUrl !== hasKey) {
  throw new Error(
    `[Supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set in .env (or omit both for offline demo). ` +
      `Currently: VITE_SUPABASE_URL is ${typeof rawSupabaseUrl === 'undefined' ? 'undefined' : hasUrl ? 'set' : 'empty'}, ` +
      `VITE_SUPABASE_ANON_KEY is ${typeof rawSupabaseAnonKey === 'undefined' ? 'undefined' : hasKey ? 'set' : 'empty'}.`
  );
}

/**
 * True when both Vite env vars are non-empty — safe to call the client for requests.
 * Uses exactly: import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY
 */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

function maskSupabaseUrl(u: string): string {
  try {
    const parsed = new URL(u);
    const host = parsed.hostname;
    const hostMasked =
      host.length <= 14 ? host : `${host.slice(0, 6)}…${host.slice(-6)}`;
    return `${parsed.protocol}//${hostMasked}/…`;
  } catch {
    return '(invalid URL)';
  }
}

/**
 * Browser Supabase client (anon key). Null when env is missing — callers must check
 * {@link isSupabaseConfigured} or handle null before use.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        /** Required so the browser keeps a refreshable session for Edge Functions (e.g. gemini-proxy). */
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** True if localStorage holds a Supabase Auth session key (`sb-*-auth-token`). Used for route guards. */
export function hasPersistedSupabaseAuthSession(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const raw = window.localStorage.getItem(k);
        if (raw && raw !== '{}' && raw !== 'null') return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Alias for the browser client — same instance as {@link supabase}. */
export const supabaseClient = supabase;

if (import.meta.env.DEV) {
  if (isSupabaseConfigured) {
    console.log('Supabase initialized with URL:', maskSupabaseUrl(url));
  } else {
    console.warn(
      '[Supabase] Not configured. Expected non-empty VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env at project root (next to package.json).',
      { urlLength: url.length, anonKeyLength: anonKey.length }
    );
  }
}
