/**
 * Keep Edge `_shared/programReviewEngine.ts` identical to the canonical
 * frontend source at `src/ai/programReviewEngine.ts`.
 *
 * Usage:
 *   node scripts/sync-program-review-engine.mjs          # copy
 *   node scripts/sync-program-review-engine.mjs --check   # exit 1 if drift
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = path.join(root, 'src', 'ai', 'programReviewEngine.ts');
const destPath = path.join(
  root,
  'supabase',
  'functions',
  '_shared',
  'programReviewEngine.ts'
);

const BANNER =
  '/**\n' +
  ' * AUTO-GENERATED — do not edit.\n' +
  ' * Source of truth: src/ai/programReviewEngine.ts\n' +
  ' * Regenerate: npm run sync:program-review-engine\n' +
  ' */\n\n';

function stripGeneratedBanner(text) {
  return text.replace(
    /^\/\*\*\r?\n \* AUTO-GENERATED[\s\S]*?\*\/\r?\n\r?\n/,
    ''
  );
}

function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

const checkOnly = process.argv.includes('--check');
const canonical = readFileSync(srcPath, 'utf8');
const expected = BANNER + canonical;

let current = '';
try {
  current = readFileSync(destPath, 'utf8');
} catch {
  current = '';
}

const currentLogic = stripGeneratedBanner(current);
const inSync = hash(currentLogic) === hash(canonical) && current.startsWith('/**\n * AUTO-GENERATED');

if (checkOnly) {
  if (!inSync) {
    console.error(
      '[sync-program-review-engine] Drift detected between src/ai/programReviewEngine.ts and Edge _shared copy.\n' +
        'Run: npm run sync:program-review-engine'
    );
    process.exit(1);
  }
  console.log('[sync-program-review-engine] OK — Edge copy matches canonical source.');
  process.exit(0);
}

writeFileSync(destPath, expected, 'utf8');
console.log(
  `[sync-program-review-engine] Wrote ${path.relative(root, destPath)} from canonical source.`
);
