#!/usr/bin/env node
/**
 * Rebuilds the counts in public/puzzles/index.json from the chunk files on
 * disk (themes, openings, per-bucket totals) without re-importing anything.
 *
 * Usage:  node scripts/reindex-puzzles.mjs [--out public/puzzles]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countPuzzle, emptyCounts, sortedCounts } from './lib/puzzle-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = args.includes('--out')
  ? args[args.indexOf('--out') + 1]
  : join(__dirname, '..', 'public', 'puzzles');

const indexPath = join(out, 'index.json');
const index = JSON.parse(await readFile(indexPath, 'utf8'));
const counts = emptyCounts();
let total = 0;
for (const bucket of index.buckets) {
  const files = bucket.files ?? (bucket.file ? [bucket.file] : []);
  let count = 0;
  for (const file of files) {
    const puzzles = JSON.parse(await readFile(join(out, file), 'utf8'));
    for (const p of puzzles) countPuzzle(counts, p);
    count += puzzles.length;
  }
  bucket.count = count;
  total += count;
}
index.total = total;
Object.assign(index, sortedCounts(counts));
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(
  `Reindexed ${total} puzzles: ${Object.keys(index.themes).length} themes, ${Object.keys(index.openings).length} opening families.`,
);
