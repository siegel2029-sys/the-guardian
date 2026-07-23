/**
 * Web Push endpoint allowlist — prevents SSRF via attacker-controlled HTTPS pushToken URLs.
 * Push gateways only; reject localhost / private / cloud-metadata hosts.
 *
 * Keep in sync with `supabase/functions/_shared/webPushEndpointAllowlist.ts` (Edge deploy copy).
 */

const BLOCKED_HOST_EXACT = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
]);

/** Known Web Push delivery hosts (suffix match after normalizing). */
const ALLOWED_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
  'push.cdn.mozilla.net',
] as const;

function isPrivateOrLinkLocalIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255)) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOST_EXACT.has(host)) return false;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (isPrivateOrLinkLocalIpv4(host)) return false;
  // IPv6 localhost / ULA — only when hostname is an IPv6 literal
  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return false;
    }
  }
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** True when token is an HTTPS PushSubscription endpoint on an allowlisted push host. */
export function isWebPushEndpoint(token: string): boolean {
  const raw = token.trim();
  if (!raw.toLowerCase().startsWith('https://')) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return hostAllowed(url.hostname);
}
