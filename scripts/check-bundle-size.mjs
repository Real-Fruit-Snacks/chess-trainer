#!/usr/bin/env node
/**
 * Fails the build when the production bundle outgrows its budget.
 *
 * The limits are gzipped sizes, which is what a visitor downloads. Content
 * chunks (lessons, the arcade positions) are allowed more than code chunks;
 * the entry chunk is kept small so an update re-downloads little.
 *
 *   node scripts/check-bundle-size.mjs           # after `vite build`
 *   node scripts/check-bundle-size.mjs --print   # just list the sizes
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(process.cwd(), 'dist');
const ASSETS = join(DIST, 'assets');

const KB = 1024;
/** Gzipped limits per chunk family (matched by file name prefix). */
const BUDGETS = [
  { name: 'entry', match: /^index-/, limitBytes: 48 * KB },
  { name: 'react', match: /^react-/, limitBytes: 110 * KB },
  { name: 'lessons', match: /^lessons-/, limitBytes: 110 * KB },
  { name: 'arcade positions', match: /^positions-/, limitBytes: 40 * KB },
  { name: 'classic games', match: /^games-/, limitBytes: 40 * KB },
  { name: 'any other chunk', match: /./, limitBytes: 40 * KB },
];
/** The service worker precaches this much at install: keep first loads honest. */
const PRECACHE_LIMIT_BYTES = 6.5 * KB * KB;

function gzipSize(file) {
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

function precacheBytes() {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  // Workbox injects the manifest as [{"revision":…,"url":"…"}, …].
  const urls = [...sw.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1].split('?')[0]);
  let total = 0;
  for (const url of urls) {
    try {
      total += statSync(join(DIST, decodeURIComponent(url))).size;
    } catch {
      // A URL that is not a file (the navigation route, say) weighs nothing.
    }
  }
  return { total, count: urls.length };
}

const print = process.argv.includes('--print');
const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const rows = files
  .map((file) => {
    const budget = BUDGETS.find((b) => b.match.test(file));
    const gz = gzipSize(join(ASSETS, file));
    return { file, gz, budget, over: gz > budget.limitBytes };
  })
  .sort((a, b) => b.gz - a.gz);

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
for (const row of rows.slice(0, print ? rows.length : 12)) {
  const flag = row.over ? '  OVER' : '';
  console.log(
    `${fmt(row.gz).padStart(9)}  ${row.file.padEnd(40)} ${row.budget.name} ≤ ${fmt(row.budget.limitBytes)}${flag}`,
  );
}
const precache = precacheBytes();
console.log(
  `\nprecache: ${precache.count} entries, ${(precache.total / KB / KB).toFixed(2)} MB on disk (limit ${(PRECACHE_LIMIT_BYTES / KB / KB).toFixed(1)} MB)`,
);

const failures = rows.filter((r) => r.over).map((r) => `${r.file} is ${fmt(r.gz)} gzipped`);
if (precache.total > PRECACHE_LIMIT_BYTES) {
  failures.push(`the precache is ${(precache.total / KB / KB).toFixed(2)} MB`);
}
if (failures.length && !print) {
  console.error(`\nBundle budget exceeded:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('\nBundle within budget.');
