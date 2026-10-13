#!/usr/bin/env node
/**
 * Engine-checks the endgame drill positions in src/features/drills/endgameDrills.ts:
 *   - "mate" / "promote" / "capture" drills must be winning for the side the user plays
 *   - "hold" drills must be drawn with best play
 *
 * The drills are loaded as the app loads them (through Vite), not scraped from
 * the source, and the run fails unless it accounted for every drill: each one
 * either has fixed positions, all checked here, or places its pieces at random
 * (the mating drills, whose generator the unit tests cover).
 *
 * Usage:  node scripts/verify-drills.mjs [--depth 28]
 */
import { Chess } from 'chess.js';
import { withAppModules } from './lib/load-module.mjs';
import { NodeEngine } from './lib/node-engine.mjs';

const args = process.argv.slice(2);
const depth = args.includes('--depth') ? Number(args[args.indexOf('--depth') + 1]) : 24;

function scoreForUser(score, sideToMove, userColor) {
  // Engine scores are from the side to move's point of view.
  const sign = sideToMove === userColor ? 1 : -1;
  return score.type === 'mate'
    ? { type: 'mate', value: score.value * sign }
    : { type: 'cp', value: score.value * sign };
}

async function loadDrills() {
  const drills = await withAppModules(
    async (load) => (await load('/src/features/drills/endgameDrills.ts')).ENDGAME_DRILLS,
  );
  if (!Array.isArray(drills) || drills.length === 0) {
    throw new Error('No drills found: ENDGAME_DRILLS is missing or empty.');
  }
  return drills;
}

async function main() {
  const drills = await loadDrills();
  const fixed = drills.filter((drill) => Array.isArray(drill.positions));
  const random = drills.filter((drill) => drill.positions === 'random');
  const unaccounted = drills.filter((d) => !fixed.includes(d) && !random.includes(d));
  if (unaccounted.length) {
    throw new Error(
      `Drills with neither fixed positions nor 'random': ${unaccounted.map((d) => d.id).join(', ')}`,
    );
  }

  const engine = new NodeEngine();
  await engine.init({ hashMb: 64 });
  let failures = 0;
  let checked = 0;
  for (const drill of fixed) {
    if (drill.positions.length === 0) {
      console.error(`✗ ${drill.id}: no positions`);
      failures++;
      continue;
    }
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
      checked++;
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
  const summary =
    `${checked} position(s) of ${fixed.length} drill(s) checked; ${random.length} drill(s) place ` +
    `their pieces at random; ${drills.length} drill(s) in all.`;
  if (failures || checked === 0) {
    console.error(`\n${summary}\n${failures} drill position(s) failed verification.`);
    process.exit(1);
  }
  console.log(`\n${summary}\nAll drill positions verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
