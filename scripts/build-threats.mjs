#!/usr/bin/env node
/**
 * Finds the positions of the "What's the threat?" drill in the bundled puzzle
 * set and writes src/features/drills/threat-positions.json.
 *
 * A Lichess puzzle starts one move before the tactic: in its first position
 * the side to move is about to blunder. Many of those blunders ignored a
 * threat that was already on the board, and the puzzle's solution is that
 * threat carried out. Those positions make the drill: the learner, to move,
 * first names the threat (the opponent's best move if it were their turn),
 * then finds a move that meets it. For each sampled puzzle the engine checks:
 *
 *  - the threat is real: passing the move (a "null move") would cost at least
 *    two pawns, or allow mate, and the opponent's best move after a pass is
 *    the puzzle's solution (so the game itself proves it);
 *  - it can be met: with the best defence the side to move is not lost, and
 *    the move played in the game was not one of the defences;
 *  - it is clear: the threat stands out from the opponent's other moves.
 *
 * Usage:  node scripts/build-threats.mjs [--per-band 150] [--depth 14] [--workers 2]
 *
 * Slow (two searches per accepted position, a few thousand in all); the output
 * is committed. Sampling is seeded, so a rerun with the same options and the
 * same puzzle files writes the same positions.
 */
import { Chess } from 'chess.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeEngine } from './lib/node-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUZZLES = join(ROOT, 'public', 'puzzles');
export const OUT_FILE = join(ROOT, 'src', 'features', 'drills', 'threat-positions.json');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const PER_BAND = option('per-band', 150);
const DEPTH = option('depth', 14);
const WORKERS = Math.max(1, option('workers', 2));
/** Puzzles tried per band at most, whatever the yield. */
const MAX_TRIES = option('max-tries', 2500);

/** A pass must cost at least this much (centipawns) for there to be a threat. */
export const MIN_THREAT_CP = 200;
/** With the best defence the side to move may be at most this much worse. */
export const MAX_DEFENDED_DEFICIT_CP = 150;
/** The threat must beat the opponent's next-best move by this much… */
export const MIN_CLEAR_GAP_CP = 100;
/** …and other moves within this much of it are accepted as the same threat. */
export const ALSO_WITHIN_CP = 40;
/** A defence within this much of the best one holds. */
export const DEFENCE_WITHIN_CP = 70;
/** Defences looked at (MultiPV): the drill asks the engine about any other move. */
const DEFENCE_LINES = 6;

/** Centipawns from the side to move's view; a mate counts as (almost) 10,000. */
export function cpOf(score) {
  if (score.type === 'mate') {
    if (score.value === 0) return -10_000;
    return Math.sign(score.value) * (10_000 - Math.abs(score.value));
  }
  return score.value;
}

/** The position with the other side to move (a "null move"); null when the side passing is in check. */
export function passMove(fen) {
  const parts = fen.split(' ');
  const passer = parts[1] === 'b' ? 'b' : 'w';
  parts[1] = passer === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const flipped = parts.join(' ');
  try {
    const chess = new Chess(flipped);
    const king = chess.findPiece({ type: 'k', color: passer })[0];
    // A side in check cannot pass: its king could simply be taken.
    if (!king || chess.isAttacked(king, chess.turn())) return null;
    return flipped;
  } catch {
    return null;
  }
}

/**
 * Judges a candidate from the two searches: `pass` (the opponent to move after
 * a pass, MultiPV ≥ 2) and `normal` (the side to move, MultiPV ≥ 1). Returns
 * the drill entry, or null with the reason it was rejected.
 */
export function judgeCandidate(puzzle, pass, normal) {
  const moves = puzzle.moves.split(' ');
  const gameMove = moves[0];
  const solution = moves[1];
  const passLines = [...pass.lines.values()].sort((a, b) => cpOf(b.score) - cpOf(a.score));
  const best = passLines[0];
  if (!best) return { reject: 'no pass line' };
  const threat = best.pv[0];
  const threatCp = cpOf(best.score);
  const sameAsSolution =
    threat === solution ||
    passLines.some((l) => l.pv[0] === solution && cpOf(l.score) >= threatCp - ALSO_WITHIN_CP);
  if (!sameAsSolution) return { reject: 'not the game threat' };
  const second = passLines[1];
  const also = passLines
    .slice(1)
    .filter((l) => cpOf(l.score) >= threatCp - ALSO_WITHIN_CP)
    .map((l) => l.pv[0]);
  // Every move as strong as the threat is accepted; the next one must be clearly weaker.
  const firstWeaker = passLines.find((l) => cpOf(l.score) < threatCp - ALSO_WITHIN_CP);
  if (firstWeaker && cpOf(firstWeaker.score) > threatCp - MIN_CLEAR_GAP_CP) {
    return { reject: 'threat not clear' };
  }
  if (!firstWeaker && second && also.length >= 3) return { reject: 'threat not clear' };

  const normalLines = [...normal.lines.values()].sort((a, b) => cpOf(b.score) - cpOf(a.score));
  const defence = normalLines[0];
  if (!defence) return { reject: 'no defence line' };
  const defendedCp = cpOf(defence.score);
  if (defendedCp < -MAX_DEFENDED_DEFICIT_CP) return { reject: 'lost anyway' };
  // What a pass costs: the opponent's best after it, against the best defence.
  const cost = threatCp + defendedCp;
  const mateThreat = best.score.type === 'mate' && best.score.value > 0;
  if (cost < MIN_THREAT_CP && !mateThreat) return { reject: 'threat too small' };
  const defences = normalLines
    .filter((l) => cpOf(l.score) >= defendedCp - DEFENCE_WITHIN_CP)
    .map((l) => l.pv[0]);
  if (defences.includes(gameMove)) return { reject: 'game move defends' };

  const motifs = puzzle.themes
    .split(' ')
    .filter((t) => t && !GENERIC_THEMES.has(t))
    .join(' ');
  return {
    entry: {
      id: puzzle.id,
      fen: puzzle.fen,
      threat,
      ...(also.length ? { also } : {}),
      // The threat carried out, a few plies (the drill describes what it wins from it).
      line: best.pv.slice(0, 6),
      defences,
      game: gameMove,
      rating: puzzle.rating,
      kind: mateThreat ? 'mate' : 'material',
      ...(motifs ? { motifs } : {}),
    },
  };
}

/** Puzzle tags that say nothing about the tactic itself. */
const GENERIC_THEMES = new Set([
  'advantage',
  'crushing',
  'equality',
  'oneMove',
  'short',
  'long',
  'veryLong',
  'opening',
  'middlegame',
  'endgame',
  'master',
  'masterVsMaster',
  'superGM',
  'mate',
  'rookEndgame',
  'pawnEndgame',
  'bishopEndgame',
  'knightEndgame',
  'queenEndgame',
  'queenRookEndgame',
]);

/** mulberry32: a small seeded generator, so the sample is the same on every run. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const random = seeded(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function loadBands() {
  const index = JSON.parse(readFileSync(join(PUZZLES, 'index.json'), 'utf8'));
  return index.buckets.map((bucket) => ({
    id: bucket.id,
    puzzles: bucket.files.flatMap((file) => JSON.parse(readFileSync(join(PUZZLES, file), 'utf8'))),
  }));
}

async function main() {
  const bands = loadBands();
  const engines = [];
  for (let i = 0; i < WORKERS; i++) {
    const engine = new NodeEngine();
    await engine.init({ hashMb: 64 });
    engines.push(engine);
  }
  const out = [];
  const reasons = {};
  const started = Date.now();
  let searched = 0;

  for (const [bandIndex, band] of bands.entries()) {
    const queue = shuffled(band.puzzles, 0x7e1a + bandIndex).slice(0, MAX_TRIES);
    const accepted = [];
    let next = 0;
    const work = async (engine) => {
      while (accepted.length < PER_BAND && next < queue.length) {
        const puzzle = queue[next++];
        const chess = new Chess(puzzle.fen);
        if (chess.isCheck() || chess.isGameOver()) {
          reasons['in check'] = (reasons['in check'] ?? 0) + 1;
          continue;
        }
        const passed = passMove(puzzle.fen);
        if (!passed) {
          reasons['cannot pass'] = (reasons['cannot pass'] ?? 0) + 1;
          continue;
        }
        const pass = await engine.analyse(passed, { depth: DEPTH, multipv: 3, maxMs: 15_000 });
        searched++;
        // Cheap first filter: the solution must be (about) the opponent's best after a pass.
        const quick = judgeCandidate(puzzle, pass, { lines: new Map() });
        if (quick.reject && quick.reject !== 'no defence line') {
          reasons[quick.reject] = (reasons[quick.reject] ?? 0) + 1;
          continue;
        }
        const normal = await engine.analyse(puzzle.fen, {
          depth: DEPTH,
          multipv: DEFENCE_LINES,
          maxMs: 15_000,
        });
        searched++;
        const verdict = judgeCandidate(puzzle, pass, normal);
        if (verdict.reject) {
          reasons[verdict.reject] = (reasons[verdict.reject] ?? 0) + 1;
          continue;
        }
        if (accepted.length < PER_BAND) accepted.push(verdict.entry);
      }
    };
    await Promise.all(engines.map(work));
    out.push(...accepted);
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(
      `${band.id}: ${accepted.length} positions from ${Math.min(next, queue.length)} puzzles (${searched} searches, ${secs}s)`,
    );
  }
  for (const engine of engines) engine.quit();
  out.sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1));
  writeFileSync(OUT_FILE, `${JSON.stringify(out)}\n`);
  console.log(`Wrote ${out.length} positions to ${OUT_FILE}`);
  console.log('Rejected:', reasons);
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
