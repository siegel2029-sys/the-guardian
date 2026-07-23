/**
 * Enable HaveIBeenPwned (HIBP) leaked-password protection via the Supabase
 * Management API.
 *
 * ⚠️  REQUIRES A SUPABASE PRO PLAN (or higher).
 * On Free tier this PATCH returns an error — do not treat that as a script bug.
 * Run this manually once the project is upgraded to Pro:
 *
 *   set SUPABASE_ACCESS_TOKEN=sbp_...   # Dashboard → Account → Access Tokens
 *   set SUPABASE_PROJECT_REF=sbbmyxztjmeerfmuhrka   # optional override
 *   node scripts/enable-password-hibp.mjs
 *
 * Alternative (same setting): Dashboard → Authentication → Providers / Password
 * strength → enable “Leaked password protection”.
 *
 * No application code depends on this script at build/runtime.
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
if (!res.ok) {
  console.error(
    'Failed to enable HIBP. Confirm the project is on Pro+ and the access token has auth config permissions.',
  );
  process.exit(1);
}
console.log('password_hibp_enabled=true');
