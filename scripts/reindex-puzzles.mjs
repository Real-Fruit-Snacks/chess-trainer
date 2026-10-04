#!/usr/bin/env node
/**
 * Rebuilds public/puzzles/index.json from the chunk files on disk without
 * re-importing anything: the counts (themes, openings, per-bucket totals), the
 * rating span of every chunk, and the chunk layout itself.
 *
 * Every bucket's puzzles are dealt round-robin over its chunk files (sorted by
 * rating, puzzle i goes to chunk i mod n), so each chunk — the precached first
 * one in particular — samples the whole rating band instead of one narrow
 * slice of it. The ids and the per-bucket counts never change; running the
 * script twice gives the same files.
 *
 * Usage:  node scripts/reindex-puzzles.mjs [--out public/puzzles]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chunkRange,
  countPuzzle,
  dealChunks,
  emptyCounts,
  sortedCounts,
} from './lib/puzzle-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = args.includes('--out')
  ? args[args.indexOf('--out') + 1]
  : join(__dirname, '..', 'public', 'puzzles');

const indexPath = join(out, 'index.json');
const index = JSON.parse(await readFile(indexPath, 'utf8'));
const chunkSize = index.chunk ?? 500;
const counts = emptyCounts();
let total = 0;
let rewritten = 0;
for (const bucket of index.buckets) {
  const files = bucket.files ?? (bucket.file ? [bucket.file] : []);
  const puzzles = [];
  for (const file of files) {
    puzzles.push(...JSON.parse(await readFile(join(out, file), 'utf8')));
  }
  for (const p of puzzles) countPuzzle(counts, p);
  bucket.count = puzzles.length;
  total += puzzles.length;

  if (bucket.files?.length) {
    const chunks = dealChunks(puzzles, chunkSize);
    if (chunks.length !== files.length) {
      throw new Error(
        `${bucket.id}: ${puzzles.length} puzzles need ${chunks.length} chunks of ${chunkSize}, index lists ${files.length} files — re-import instead`,
      );
    }
    for (const [i, chunk] of chunks.entries()) {
      const json = JSON.stringify(chunk);
      const file = files[i];
      if ((await readFile(join(out, file), 'utf8')) !== json) {
        await writeFile(join(out, file), json);
        rewritten++;
      }
    }
    bucket.ranges = chunks.map(chunkRange);
  } else {
    delete bucket.ranges;
  }
}
index.total = total;
Object.assign(index, sortedCounts(counts));
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(
  `Reindexed ${total} puzzles: ${Object.keys(index.themes).length} themes, ${Object.keys(index.openings).length} opening families; ${rewritten} chunk file(s) re-dealt.`,
);
