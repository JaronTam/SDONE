/**
 * NFR-P6 Bundle Budget Check
 *
 * Verifies that the production build output (dist/) does not exceed
 * the 200 KB gzip budget mandated by NFR-P6.
 *
 * Usage: node scripts/check-bundle-size.mjs
 *   (also available as npm run build:check)
 *
 * Story 7.7 AC2 — Bundle Budget Check (NFR-P6)
 * Generated: 2026-06-09
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// ── Config ──────────────────────────────────────────────────────────────
const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url)) + sep;
const BUDGET_BYTES = 200 * 1024; // 200 KB
const COMPRESSIBLE_EXTS = new Set(['.js', '.css', '.html', '.svg', '.json']);

// ── Main ────────────────────────────────────────────────────────────────

if (!statSync(DIST_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('dist/ directory not found. Run npm run build first.');
  process.exit(1);
}

let totalGzip = 0;
let totalRaw = 0;
const fileSizes = [];

for (const entry of walkDir(DIST_DIR)) {
  if (!entry.isFile) continue;
  const ext = extname(entry.path);
  if (!COMPRESSIBLE_EXTS.has(ext)) continue;

  const raw = readFileSync(entry.path);
  const gzip = gzipSync(raw).length;

  totalRaw += raw.length;
  totalGzip += gzip;

  fileSizes.push({
    path: entry.path.replace(DIST_DIR, ''),
    raw: raw.length,
    gzip,
  });
}

// Sort by gzip size descending
fileSizes.sort((a, b) => b.gzip - a.gzip);

// ── Report ──────────────────────────────────────────────────────────────

console.log('\n📦 NFR-P6 Bundle Budget Check');
console.log('══════════════════════════════\n');

console.log('File                       │   Raw   │  Gzip   │ %');
console.log('───────────────────────────┼─────────┼─────────┼──────');
for (const f of fileSizes) {
  const pct = totalGzip > 0 ? ((f.gzip / totalGzip) * 100).toFixed(1) : '0.0';
  console.log(
    ` ${f.path.padEnd(25).slice(0, 25)} │ ${formatBytes(f.raw).padStart(7)} │ ${formatBytes(f.gzip).padStart(7)} │ ${pct}%`,
  );
}
console.log('───────────────────────────┼─────────┼─────────┼──────');
console.log(
  ` TOTAL                     │ ${formatBytes(totalRaw).padStart(7)} │ ${formatBytes(totalGzip).padStart(7)} │`,
);

const budgetKB = (BUDGET_BYTES / 1024).toFixed(0);
const usedKB = (totalGzip / 1024).toFixed(1);
const pctUsed = ((totalGzip / BUDGET_BYTES) * 100).toFixed(1);

console.log(`\nBudget: ${budgetKB} KB gzip  |  Used: ${usedKB} KB  |  ${pctUsed}%`);

if (totalGzip <= BUDGET_BYTES) {
  const remaining = ((BUDGET_BYTES - totalGzip) / 1024).toFixed(1);
  console.log(`✅ PASS — ${remaining} KB remaining under NFR-P6 budget\n`);
  process.exit(0);
} else {
  const excess = ((totalGzip - BUDGET_BYTES) / 1024).toFixed(1);
  console.log(`❌ FAIL — ${excess} KB over NFR-P6 budget\n`);
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function* walkDir(dir) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const fullPath = join(current, name);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        stack.push(fullPath);
      } else {
        yield { path: fullPath, isFile: true };
      }
    }
  }
}

function formatBytes(bytes) {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
