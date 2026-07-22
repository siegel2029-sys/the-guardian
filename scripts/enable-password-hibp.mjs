/**
 * Enable HaveIBeenPwned leaked-password protection (Pro plan+).
 * Requires a personal access token from https://supabase.com/dashboard/account/tokens
 *
 *   set SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/enable-password-hibp.mjs
 */
const ref = process.env.SUPABASE_PROJECT_REF || 'sbbmyxztjmeerfmuhrka';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ password_hibp_enabled: true }),
});
const body = await res.text();
console.log(res.status, body.slice(0, 500));
if (!res.ok) process.exit(1);
console.log('password_hibp_enabled=true');
