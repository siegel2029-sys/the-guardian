import { normalizePortalUsername, isValidPortalUsername } from '../lib/patientPortalAuth';
import { validateNewPassword } from '../lib/passwordPolicy';

/** Minimal Hebrew → Latin map for password / portal-username bases (not full linguistics). */
const HEBREW_TO_LATIN: Record<string, string> = {
  א: 'a',
  ב: 'b',
  ג: 'g',
  ד: 'd',
  ה: 'h',
  ו: 'v',
  ז: 'z',
  ח: 'ch',
  ט: 't',
  י: 'y',
  כ: 'k',
  ך: 'k',
  ל: 'l',
  מ: 'm',
  ם: 'm',
  נ: 'n',
  ן: 'n',
  ס: 's',
  ע: 'a',
  פ: 'p',
  ף: 'p',
  צ: 'tz',
  ץ: 'tz',
  ק: 'k',
  ר: 'r',
  ש: 'sh',
  ת: 't',
};

/** First whitespace-separated token of a full name. */
export function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return trimmed.split(' ')[0] ?? '';
}

/** Letters-only Latin base from a first name (Hebrew transliterated; Latin kept). */
export function firstNameToLatinLetters(firstName: string): string {
  let out = '';
  for (const ch of firstName.trim()) {
    if (/[A-Za-z]/.test(ch)) {
      out += ch;
      continue;
    }
    const mapped = HEBREW_TO_LATIN[ch];
    if (mapped) out += mapped;
  }
  return out.replace(/[^A-Za-z]/g, '');
}

/**
 * High-entropy temporary portal password (never derived from name/PII).
 * `fullName` is accepted for call-site compatibility only and ignored.
 * Meets Supabase policy: min 8 chars, English letters + digits.
 */
export function temporaryPasswordFromFirstName(_fullName?: string): string {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (src: string) => src[Math.floor(Math.random() * src.length)]!;
  let s = pick(letters) + pick(digits);
  for (let i = 0; i < 10; i++) s += pick(all);
  if (validateNewPassword(s) !== null) {
    return `Ab${pick(digits)}${pick(digits)}${pick(letters)}${pick(letters)}${pick(digits)}${pick(digits)}`;
  }
  return s;
}

/**
 * Portal username (A–Z0–9) derived from first name + lead id suffix for uniqueness.
 * Auth still uses synthetic `{username}@patient…` email — lead mailbox is for contact only.
 */
export function portalUsernameFromLeadName(fullName: string, leadId: string): string {
  const latin = firstNameToLatinLetters(extractFirstName(fullName)).toUpperCase();
  const idSuffix = leadId.replace(/-/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  let base = latin.length >= 2 ? latin.slice(0, 12) : 'PT';
  let candidate = normalizePortalUsername(`${base}${idSuffix}`);
  if (!isValidPortalUsername(candidate)) {
    candidate = normalizePortalUsername(`PT${idSuffix}${Date.now().toString(36).toUpperCase()}`);
  }
  return candidate.slice(0, 32);
}
