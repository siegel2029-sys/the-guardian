import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Normalize .env values (trailing newlines / spaces break isSupabaseConfigured otherwise). */
function trimEnv(v: string | undefined): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

export const supabaseUrl = trimEnv(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

const url = supabaseUrl;
const anonKey = supabaseAnonKey;

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
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

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
