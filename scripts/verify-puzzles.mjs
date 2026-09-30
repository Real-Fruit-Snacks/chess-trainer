#!/usr/bin/env node
/**
 * Validates the bundled puzzle data in public/puzzles/.
 *
 * Structural checks (fast, run in CI):
 *   - index.json references existing chunk files and the counts match
 *   - every puzzle has a legal FEN and a fully legal move sequence
 *   - every puzzle's rating falls within its bucket
 *   - IDs are unique across chunks
 *   - the solution has at least one move for the solver
 *
 * Optional engine spot-check (slow, run locally when changing the data set):
 *   node scripts/verify-puzzles.mjs --engine 40 [--depth 18]
 * Picks N random puzzles and confirms Stockfish agrees with the first solver
 * move (or finds a mate when the puzzle is a mate puzzle).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { engineInstalled, NodeEngine } from './lib/node-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'public', 'puzzles');

const args = process.argv.slice(2);
const engineSamples = args.includes('--engine') ? Number(args[args.indexOf('--engine') + 1]) : 0;
const depth = args.includes('--depth') ? Number(args[args.indexOf('--depth') + 1]) : 16;

let failures = 0;
function fail(msg) {
  failures++;
  console.error(`  ✗ ${msg}`);
}

function playThrough(puzzle) {
  const chess = new Chess(puzzle.fen);
  const moves = puzzle.moves.split(' ');
  for (const uci of moves) {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!move) throw new Error(`illegal move ${uci}`);
  }
  return moves;
}

/** Chunk files of a bucket; older indexes had a single file per bucket. */
function bucketFiles(bucket) {
  return bucket.files?.length ? bucket.files : bucket.file ? [bucket.file] : [];
}

async function structural() {
  const index = JSON.parse(await readFile(join(DIR, 'index.json'), 'utf8'));
  const ids = new Set();
  let total = 0;

  for (const bucket of index.buckets) {
    const puzzles = [];
    for (const file of bucketFiles(bucket)) {
      try {
        const chunk = JSON.parse(await readFile(join(DIR, file), 'utf8'));
        if (chunk.length > (index.chunk ?? Infinity)) {
          fail(`${file}: ${chunk.length} puzzles in a chunk of ${index.chunk}`);
        }
        puzzles.push(...chunk);
      } catch (err) {
        fail(`${file}: cannot read (${err.message})`);
      }
    }
    if (puzzles.length !== bucket.count) {
      fail(`${bucket.id}: index says ${bucket.count} puzzles, files have ${puzzles.length}`);
    }
    for (const p of puzzles) {
      total++;
      if (ids.has(p.id)) fail(`${p.id}: duplicate id`);
      ids.add(p.id);
      if (p.rating < bucket.min || p.rating > bucket.max) {
        fail(`${p.id}: rating ${p.rating} outside bucket ${bucket.min}–${bucket.max}`);
      }
      try {
        const moves = playThrough(p);
        if (moves.length < 2) fail(`${p.id}: solution needs the opponent's move plus a reply`);
      } catch (err) {
        fail(`${p.id}: ${err.message}`);
      }
      if (typeof p.themes !== 'string' || !p.themes.trim()) fail(`${p.id}: missing themes`);
    }
  }
  if (total !== index.total) fail(`index total ${index.total} ≠ actual ${total}`);
  console.log(`Checked ${total} puzzles across ${index.buckets.length} buckets.`);
  return index;
}

// ---------------------------------------------------------------------------
// Optional engine agreement check
// ---------------------------------------------------------------------------
async function engineCheck(index, samples) {
  if (!engineInstalled()) {
    console.error('Engine not installed — run `npm run engine:setup` first.');
    process.exit(1);
  }
  const all = [];
  for (const bucket of index.buckets) {
    for (const file of bucketFiles(bucket)) {
      all.push(...JSON.parse(await readFile(join(DIR, file), 'utf8')));
    }
  }
  // Deterministic sample so results are comparable between runs.
  const picked = [];
  let seed = 7;
  for (let i = 0; i < samples && all.length; i++) {
    seed = (seed * 48271) % 2147483647;
    picked.push(all[seed % all.length]);
  }

  const engine = new NodeEngine();
  await engine.init();
  let agree = 0;
  for (const p of picked) {
    const chess = new Chess(p.fen);
    const moves = p.moves.split(' ');
    chess.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] });
    const { bestmove, lines } = await engine.analyse(chess.fen(), { depth });
    const score = lines.get(1)?.score;
    const expected = moves[1];
    const isMatePuzzle = /\bmate/.test(p.themes);
    const ok = bestmove === expected || (isMatePuzzle && score?.type === 'mate' && score.value > 0);
    if (ok) agree++;
    else console.log(`  ? ${p.id} (${p.rating}) expected ${expected}, engine ${bestmove}`);
  }
  engine.quit();
  console.log(`Engine agreed on ${agree}/${picked.length} sampled puzzles at depth ${depth}.`);
}

const index = await structural();
if (engineSamples > 0) await engineCheck(index, engineSamples);

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('Puzzle data OK.');
