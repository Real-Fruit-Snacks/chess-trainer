#!/usr/bin/env node
/**
 * Engine-checks the endgame drill positions in src/features/drills/endgameDrills.ts:
 *   - "mate" / "promote" drills must be winning for the side the user plays
 *   - "hold" drills must be drawn with best play
 *
 * Usage:  node scripts/verify-drills.mjs [--depth 28]
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { NodeEngine } from './lib/node-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILE = join(ROOT, 'src', 'features', 'drills', 'endgameDrills.ts');

const args = process.argv.slice(2);
const depth = args.includes('--depth') ? Number(args[args.indexOf('--depth') + 1]) : 24;

/** Minimal extraction of the drill objects (id, goal, color, positions) from the TS source. */
function extractDrills(source) {
  const drills = [];
  const blocks = source.split(/\n {2}\{\n/).slice(1);
  for (const block of blocks) {
    const id = /id: '([^']+)'/.exec(block)?.[1];
    const goal = /goal: '([^']+)'/.exec(block)?.[1];
    const color = /color: '([^']+)'/.exec(block)?.[1];
    const positionsMatch = /positions: \[([\s\S]*?)\]/.exec(block);
    if (!id || !goal || !color) {
      continue;
    }
    const positions = positionsMatch
      ? [...positionsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
      : [];
    drills.push({ id, goal, color, positions });
  }
  return drills;
}

function scoreForUser(score, sideToMove, userColor) {
  // Engine scores are from the side to move's point of view.
  const sign = sideToMove === userColor ? 1 : -1;
  return score.type === 'mate'
    ? { type: 'mate', value: score.value * sign }
    : { type: 'cp', value: score.value * sign };
}

async function main() {
  const source = await readFile(FILE, 'utf8');
  const drills = extractDrills(source);
  const engine = new NodeEngine();
  await engine.init({ hashMb: 64 });
  let failures = 0;
  for (const drill of drills) {
    for (const fen of drill.positions) {
      let chess;
      try {
        chess = new Chess(fen);
      } catch (err) {
        console.error(`✗ ${drill.id}: invalid FEN ${fen} (${err.message})`);
        failures++;
        continue;
      }
      // Stockfish never answers `go` for a position where the side not to move is in check.
      const flipped = fen
        .replace(/ (w|b) /, (m, side) => ` ${side === 'w' ? 'b' : 'w'} `)
        .replace(/ [a-h][36] /, ' - ');
      if (new Chess(flipped).inCheck()) {
        console.error(`✗ ${drill.id}: illegal position (side not to move is in check) ${fen}`);
        failures++;
        continue;
      }
      const sideToMove = chess.turn() === 'w' ? 'white' : 'black';
      const { lines } = await engine.analyse(fen, { depth });
      const raw = lines.get(1)?.score;
      if (!raw) {
        console.error(`✗ ${drill.id}: no evaluation for ${fen}`);
        failures++;
        continue;
      }
      const score = scoreForUser(raw, sideToMove, drill.color);
      const text = score.type === 'mate' ? `mate ${score.value}` : `${score.value} cp`;
      let ok;
      if (drill.goal === 'hold') {
        // Stockfish has no tablebases here and keeps a material bias in known fortresses such as the
        // wrong-bishop ending, so "drawn" means no forced win in sight rather than exactly 0.00.
        ok = score.type === 'cp' && Math.abs(score.value) < 160;
      } else {
        // Winning endings with bishop and knight evaluate around +2 until the mate is in reach.
        ok =
          (score.type === 'mate' && score.value > 0) || (score.type === 'cp' && score.value > 150);
      }
      console.log(
        `${ok ? '✓' : '✗'} ${drill.id} (${drill.goal}, plays ${drill.color}) ${fen} → ${text}`,
      );
      if (!ok) failures++;
    }
  }
  engine.quit();
  if (failures) {
    console.error(`\n${failures} drill position(s) failed verification.`);
    process.exit(1);
  }
  console.log('\nAll drill positions verified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
