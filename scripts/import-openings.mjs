#!/usr/bin/env node
/**
 * Builds public/openings/openings.json and public/openings/lines.json from the
 * lichess-org/chess-openings dataset (CC0). Every opening line is replayed with
 * chess.js; openings.json stores the name under the EPD (the first four FEN
 * fields) of the line's final position, so the app can name an opening by
 * looking up positions rather than matching move orders, and lines.json keeps
 * every line's moves for the games that quiz them (Daily Opening, Engine Says).
 *
 * The dataset is read at a pinned commit (`DATASET_REF`), so re-running the
 * script reproduces the committed files; pass `--ref` to pick up upstream
 * additions, then move `DATASET_REF` to that commit. openings.json records the
 * commit and the time it was generated under its `ref` and `generatedAt` keys
 * (no EPD can collide with them; lines.json is a plain list, written from the
 * same commit).
 *
 * Usage:  node scripts/import-openings.mjs [--ref <commit>] [--out <dir>]
 */
import { Chess } from 'chess.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** lichess-org/chess-openings at the commit the committed files were built from (2026-09-20). */
export const DATASET_REF = 'c67912be581f0793dbaa776be5ccf111e01f88d9';
const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

function epdOf(chess) {
  return chess.fen().split(' ').slice(0, 4).join(' ');
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) =>
    args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
  const ref = option('--ref', DATASET_REF);
  const outDir = resolve(option('--out', join(ROOT, 'public', 'openings')));
  const base = `https://raw.githubusercontent.com/lichess-org/chess-openings/${ref}/`;

  /** @type {Record<string, [string, string]>} epd -> [eco, name] */
  const byEpd = {};
  /** @type {[string, string, string][]} [eco, name, moves in SAN] */
  const openingLines = [];
  let total = 0;
  let skipped = 0;
  for (const file of FILES) {
    const res = await fetch(base + file);
    if (!res.ok) throw new Error(`Failed to download ${file} at ${ref}: HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n').slice(1); // header row
    for (const line of lines) {
      if (!line.trim()) continue;
      const [eco, name, pgn] = line.split('\t');
      if (!eco || !name || !pgn) continue;
      total++;
      const chess = new Chess();
      let ok = true;
      const sans = [];
      for (const token of pgn.split(/\s+/)) {
        if (!token || /^\d+\.(\.\.)?$/.test(token)) continue;
        try {
          sans.push(chess.move(token).san);
        } catch {
          ok = false;
          break;
        }
      }
      if (!ok) {
        skipped++;
        console.warn(`Skipping ${eco} ${name}: could not replay "${pgn}"`);
        continue;
      }
      openingLines.push([eco, name, sans.join(' ')]);
      // Longer names for the same position win (they are more specific); keep the first otherwise.
      const epd = epdOf(chess);
      const existing = byEpd[epd];
      if (!existing || existing[1].length < name.length) byEpd[epd] = [eco, name];
    }
  }
  await mkdir(outDir, { recursive: true });
  const ordered = Object.fromEntries(Object.entries(byEpd).sort(([a], [b]) => a.localeCompare(b)));
  const outFile = join(outDir, 'openings.json');
  const linesFile = join(outDir, 'lines.json');
  await writeFile(
    outFile,
    JSON.stringify({ ref, generatedAt: new Date().toISOString(), ...ordered }),
  );
  await writeFile(linesFile, JSON.stringify(openingLines));
  console.log(
    `Wrote ${Object.keys(ordered).length} positions from ${total} openings (${skipped} skipped) to ${outFile}`,
  );
  console.log(`Wrote ${openingLines.length} opening lines to ${linesFile} (dataset at ${ref})`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
