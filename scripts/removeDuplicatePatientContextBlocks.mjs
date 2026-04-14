import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../src/context/PatientContext.tsx');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

/** 1-based inclusive line ranges; process from bottom so indices stay valid */
const ranges = [
  [1665, 1699],
  [1648, 1663],
  [1636, 1642],
  [1519, 1634],
  [1244, 1294],
];
ranges.sort((a, b) => b[0] - a[0]);
for (const [from, to] of ranges) {
  const n = to - from + 1;
  lines.splice(from - 1, n);
}
fs.writeFileSync(file, lines.join('\n') + '\n');
console.log('Spliced ranges (bottom-first)', ranges);
