/**
 * מאתחל את שורת app_knowledge_base (id=global) עם רשימת עובדות ריקה — הוספה ידנית מהדשבורד.
 * דורש: .env עם VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY, ומיגרציות.
 *
 * הרצה: npm run seed:knowledge
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const url = (process.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !anonKey) {
  console.error('חסרים VITE_SUPABASE_URL או VITE_SUPABASE_ANON_KEY ב-.env (בשורש הפרויקט).');
  process.exit(1);
}

const client = createClient(url, anonKey);
const now = new Date().toISOString();

const { data: existing, error: readErr } = await client
  .from('app_knowledge_base')
  .select('id')
  .eq('id', 'global')
  .maybeSingle();

if (readErr) {
  console.error('קריאה מ-app_knowledge_base נכשלה:', readErr.message);
  process.exit(1);
}

if (existing) {
  console.log('שורת app_knowledge_base (id=global) כבר קיימת — לא בוצע שינוי. הוסיפו עובדות מהדשבורד.');
  process.exit(0);
}

const fullRow = {
  id: 'global' as const,
  items: [] as unknown[],
  deleted_seed_ids: [] as string[],
  updated_at: now,
};

const minimalRow = {
  id: 'global' as const,
  items: [] as unknown[],
  updated_at: now,
};

let { error } = await client.from('app_knowledge_base').insert(fullRow);

if (
  error &&
  /deleted_seed_ids|column.*does not exist|Could not find.*column/i.test(error.message)
) {
  console.warn(
    'מנסה insert בלי deleted_seed_ids (הריצו מיגרציה 20260411120000_app_knowledge_deleted_seed_ids.sql).'
  );
  ({ error } = await client.from('app_knowledge_base').insert(minimalRow));
}

if (error) {
  if (/Could not find the table|relation.*does not exist/i.test(error.message)) {
    console.error(
      'הטבלה app_knowledge_base לא קיימת. הריצו supabase db push או הדביקו את המיגרציה המתאימה ב-SQL Editor.'
    );
  } else {
    console.error('Supabase upsert נכשל:', error.message);
  }
  process.exit(1);
}

console.log('נוצרה שורת app_knowledge_base (id=global) עם items=[] — הוסיפו עובדות ידנית מהדשבורד.');
