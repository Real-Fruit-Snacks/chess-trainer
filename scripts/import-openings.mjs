#!/usr/bin/env node
/**
 * Builds public/openings/openings.json and public/openings/lines.json from the
 * lichess-org/chess-openings dataset (CC0). Every opening line is replayed with
 * chess.js; openings.json stores the name under the EPD (the first four FEN
 * fields) of the line's final position, so the app can name an opening by
 * looking up positions rather than matching move orders, and lines.json keeps
 * every line's moves for the games that quiz them (Daily Opening, Engine Says).
 *
 * Usage:  node scripts/import-openings.mjs [--ref <git ref>]
 *
 * The output file is committed, so this only needs re-running to pick up
 * upstream additions.
 */
import { Chess } from 'chess.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'openings');
const OUT_FILE = join(OUT_DIR, 'openings.json');
const LINES_FILE = join(OUT_DIR, 'lines.json');

const refIndex = process.argv.indexOf('--ref');
const ref = refIndex >= 0 ? (process.argv[refIndex + 1] ?? 'master') : 'master';
const BASE = `https://raw.githubusercontent.com/lichess-org/chess-openings/${ref}/`;
const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

function epdOf(chess) {
  return chess.fen().split(' ').slice(0, 4).join(' ');
}

async function main() {
  /** @type {Record<string, [string, string]>} epd -> [eco, name] */
  const byEpd = {};
  /** @type {[string, string, string][]} [eco, name, moves in SAN] */
  const openingLines = [];
  let total = 0;
  let skipped = 0;
  for (const file of FILES) {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`Failed to download ${file}: HTTP ${res.status}`);
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
  await mkdir(OUT_DIR, { recursive: true });
  const ordered = Object.fromEntries(Object.entries(byEpd).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(OUT_FILE, JSON.stringify(ordered));
  await writeFile(LINES_FILE, JSON.stringify(openingLines));
  console.log(
    `Wrote ${Object.keys(ordered).length} positions from ${total} openings (${skipped} skipped) to ${OUT_FILE}`,
  );
  console.log(`Wrote ${openingLines.length} opening lines to ${LINES_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
