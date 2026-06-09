// Simple bundle size checker — reads dist/ JS files, gzips them, sums sizes.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_SIZE = 200 * 1024; // 200KB
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (extname(entry.name) === '.js') files.push(full);
  }
  return files;
}

if (!existsSync(distDir)) {
  console.error('❌ dist/ directory not found — run `npm run build` first');
  process.exit(1);
}

if (!readdirSync(distDir, { withFileTypes: true }).length) {
  console.error('❌ dist/ directory is empty — run `npm run build` first');
  process.exit(1);
}

let total = 0;
for (const f of walk(distDir)) {
  const raw = readFileSync(f);
  const gzipped = gzipSync(raw, { level: 9 });
  total += gzipped.length;
  console.log(`  ${f.replace(distDir, 'dist')}: ${gzipped.length} bytes gzipped`);
}

console.log(`\nTotal JS gzip: ${total} bytes / ${MAX_SIZE} bytes (${((total / MAX_SIZE) * 100).toFixed(1)}%)`);
if (total > MAX_SIZE) {
  console.error(`❌ Bundle budget exceeded! ${total} > ${MAX_SIZE} (${total - MAX_SIZE} bytes over)`);
  process.exit(1);
}
console.log('✅ Bundle budget OK');
