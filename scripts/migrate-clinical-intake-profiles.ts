/**
 * מיגרציה חד-פעמית / תחזוקה: מפרס legacy intake text ל־`patients.payload.clinicalIntakeProfile`.
 *
 * דורש: `.env` עם VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * וכניסת מטפל (RLS): הגדירו MIGRATE_THERAPIST_EMAIL + MIGRATE_THERAPIST_PASSWORD
 *
 * הרצה:
 *   npm run migrate:clinical-intake
 *   npm run migrate:clinical-intake -- --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateClinicalIntakeProfilesInSupabase } from '../src/services/clinicalService';

function loadEnvFromDotEnv(): void {
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

loadEnvFromDotEnv();

const dryRun = process.argv.includes('--dry-run');
const url = (process.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const therapistEmail = (process.env.MIGRATE_THERAPIST_EMAIL ?? '').trim();
const therapistPassword = (process.env.MIGRATE_THERAPIST_PASSWORD ?? '').trim();

if (!url || !anonKey) {
  console.error('חסרים VITE_SUPABASE_URL או VITE_SUPABASE_ANON_KEY ב-.env');
  process.exit(1);
}

if (!therapistEmail || !therapistPassword) {
  console.error(
    'הגדירו MIGRATE_THERAPIST_EMAIL ו-MIGRATE_THERAPIST_PASSWORD ב-.env (חשבון מטפל Supabase Auth).'
  );
  process.exit(1);
}

const client = createClient(url, anonKey);

const { error: signInErr } = await client.auth.signInWithPassword({
  email: therapistEmail,
  password: therapistPassword,
});

if (signInErr) {
  console.error('כניסת מטפל נכשלה:', signInErr.message);
  process.exit(1);
}

console.log(dryRun ? '▶ dry-run — לא יבוצע upsert' : '▶ מיגרציה — כולל כתיבה ל-Supabase');

const result = await migrateClinicalIntakeProfilesInSupabase(client, { dryRun });

if (result.ok === false) {
  console.error('מיגרציה נכשלה:', result.message);
  process.exit(1);
}

console.log('✓ סיום מיגרציית clinicalIntakeProfile');
console.log(`  עודכנו: ${result.migratedPatientIds.length}`);
console.log(`  דולגו: ${result.skippedCount}`);
if (result.migratedPatientIds.length > 0) {
  console.log(`  מזהים: ${result.migratedPatientIds.join(', ')}`);
}
if (result.errors.length > 0) {
  console.warn('  שגיאות per-patient:');
  for (const err of result.errors) {
    console.warn(`    - ${err.patientId}: ${err.message}`);
  }
}

await client.auth.signOut();
process.exit(result.errors.length > 0 ? 2 : 0);
