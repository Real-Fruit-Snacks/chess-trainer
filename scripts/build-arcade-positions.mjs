#!/usr/bin/env node
/**
 * Evaluates the middlegame positions of the classic games with the engine and
 * writes src/features/arcade/positions.json for the arcade games that need
 * graded positions: "Who Stands Better?" (quiet positions with a known
 * evaluation) and "Fortress" (positions where the side to move is clearly
 * worse but not lost).
 *
 * Usage:  node scripts/build-arcade-positions.mjs [--depth 16] [--step 2]
 *
 * Slow (a few hundred engine searches); the output is committed.
 */
import { Chess } from 'chess.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeEngine } from './lib/node-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GAME_FILES = ['games.ts', 'games2.ts', 'games3.ts'].map((f) =>
  join(ROOT, 'src', 'features', 'classics', f),
);
const OUT_FILE = join(ROOT, 'src', 'features', 'arcade', 'positions.json');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const DEPTH = option('depth', 16);
const STEP = option('step', 2);
/** Skip the opening and the final combination. */
const FIRST_PLY = 12;
const LAST_PLIES = 8;

/** Pulls the games out of the TypeScript data files without compiling them. */
function readGames() {
  const games = [];
  for (const file of GAME_FILES) {
    const source = readFileSync(file, 'utf8');
    const pattern =
      /id: '([^']+)',\s*title: '([^']+)',\s*white: '([^']+)',\s*black: '([^']+)',\s*event: '([^']+)',\s*year: (\d+),\s*result: '([^']+)',[\s\S]*?moves:\s*'([^']+)'/g;
    let match;
    while ((match = pattern.exec(source))) {
      const [, id, title, white, black, event, year, result, moves] = match;
      games.push({ id, title, white, black, event, year: Number(year), result, moves });
    }
  }
  return games;
}

function cpFromWhite(score, turn) {
  const value = score.type === 'mate' ? (score.value > 0 ? 10_000 : -10_000) : score.value;
  return turn === 'w' ? value : -value;
}

async function main() {
  const games = readGames();
  if (games.length === 0) throw new Error('No classic games found.');
  const engine = new NodeEngine();
  await engine.init({ hashMb: 64 });
  const out = [];
  let searches = 0;
  const started = Date.now();
  for (const game of games) {
    const chess = new Chess();
    const sans = game.moves.split(/\s+/);
    const fens = [];
    for (const san of sans) {
      chess.move(san);
      fens.push(chess.fen());
    }
    const lastPly = fens.length - LAST_PLIES;
    for (let ply = FIRST_PLY; ply < lastPly; ply += STEP) {
      const fen = fens[ply - 1];
      const probe = new Chess(fen);
      const turn = probe.turn();
      if (probe.isCheck() || probe.isGameOver()) continue;
      const pieces = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
      if (pieces < 12) continue;
      const { bestmove, lines } = await engine.analyse(fen, { depth: DEPTH, multipv: 1 });
      searches++;
      const line = lines.get(1);
      if (!line || !bestmove) continue;
      const best = probe.move({
        from: bestmove.slice(0, 2),
        to: bestmove.slice(2, 4),
        promotion: bestmove[4],
      });
      const bestIsForcing = !!best && (best.captured !== undefined || probe.isCheck());
      // The game's names and year come from the classic games data at runtime.
      out.push({
        id: `${game.id}-${ply}`,
        gameId: game.id,
        ply,
        fen,
        cp: cpFromWhite(line.score, turn),
        mate: line.score.type === 'mate' ? line.score.value : undefined,
        best: bestmove,
        forcing: bestIsForcing,
        pieces,
      });
      if (searches % 25 === 0) {
        const secs = Math.round((Date.now() - started) / 1000);
        console.log(`${searches} positions evaluated (${secs}s)…`);
      }
    }
  }
  engine.quit();
  writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log(`Wrote ${out.length} positions from ${games.length} games to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
