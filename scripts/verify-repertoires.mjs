#!/usr/bin/env node
/**
 * Engine-checks every built-in opening repertoire (src/features/openings/repertoires.ts).
 *
 * Each repertoire's PGN is read into the app's own move tree and every move in it
 * is scored against the engine's best move in the same position, at the same
 * depth (the move's own score comes from a search restricted to it with
 * `searchmoves`). The tolerances are the ones docs/CONTENT_GUIDE.md sets: a
 * learner move may give away at most 120 centipawns, an opponent move — what
 * people actually play, not always the best — at most 300 (no outright blunders).
 *
 * Usage:  node scripts/verify-repertoires.mjs [--depth 14] [--only <repertoire id>]
 */
import { withAppModules } from './lib/load-module.mjs';
import { NodeEngine, engineInstalled } from './lib/node-engine.mjs';

const LEARNER_TOLERANCE_CP = 120;
const OPPONENT_TOLERANCE_CP = 300;
const MATE = 10_000;

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const depth = Number(option('--depth', '14'));
const only = option('--only', null);

/** An engine score as centipawns for the side to move; a mate counts as (almost) 10,000. */
function centipawns(score) {
  if (score.type === 'cp') return score.value;
  return score.value > 0 ? MATE - score.value : -MATE - score.value;
}

/** The SAN path to a node, with move numbers ("1. e4 e5 2. Nf3"). */
function pathOf(node) {
  const moves = [];
  for (let cursor = node; cursor?.parent; cursor = cursor.parent) moves.unshift(cursor);
  return moves
    .map((n) => {
      const [, turn, , , , full] = n.parent.fen.split(' ');
      if (turn === 'w') return `${full}. ${n.san}`;
      return n === moves[0] ? `${full}... ${n.san}` : n.san;
    })
    .join(' ');
}

async function main() {
  if (!engineInstalled()) {
    console.error('Engine not installed — run `npm run engine:setup` first.');
    process.exit(1);
  }
  const { repertoires, GameTree, isLearnerMove } = await withAppModules(async (load) => ({
    repertoires: (await load('/src/features/openings/repertoires.ts')).BUILT_IN_REPERTOIRES,
    GameTree: (await load('/src/chess/tree.ts')).GameTree,
    isLearnerMove: (await load('/src/features/openings/model.ts')).isLearnerMove,
  }));
  const selected = repertoires.filter((rep) => !only || rep.id === only);
  if (selected.length === 0) throw new Error(`No repertoire ${only ? `"${only}"` : ''} to verify.`);

  const engine = new NodeEngine();
  await engine.init({ hashMb: 64 });
  /** Best move and score per position; a move's own score per position and move. */
  const bestCache = new Map();
  const moveCache = new Map();
  const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');
  async function best(fen) {
    const key = epd(fen);
    if (!bestCache.has(key)) {
      const { bestmove, lines } = await engine.analyse(fen, { depth });
      const line = lines.get(1);
      if (!line) throw new Error(`No evaluation for ${fen}`);
      bestCache.set(key, { move: bestmove, cp: centipawns(line.score) });
    }
    return bestCache.get(key);
  }
  async function scoreOf(fen, uci) {
    const top = await best(fen);
    if (top.move === uci) return top.cp;
    const key = `${epd(fen)} ${uci}`;
    if (!moveCache.has(key)) {
      const { lines } = await engine.analyse(fen, { depth, searchmoves: [uci] });
      const line = lines.get(1);
      if (!line) throw new Error(`No evaluation for ${uci} in ${fen}`);
      moveCache.set(key, centipawns(line.score));
    }
    return moveCache.get(key);
  }

  const failures = [];
  let moves = 0;
  for (const rep of selected) {
    const tree = GameTree.fromPgn(rep.pgn);
    const nodes = [];
    const walk = (node) => {
      for (const child of node.children) {
        nodes.push(child);
        walk(child);
      }
    };
    walk(tree.root);
    let repFailures = 0;
    for (const node of nodes) {
      const fen = node.parent.fen;
      const learner = isLearnerMove(node, rep.color);
      const top = await best(fen);
      const loss = top.cp - (await scoreOf(fen, node.uci));
      const tolerance = learner ? LEARNER_TOLERANCE_CP : OPPONENT_TOLERANCE_CP;
      moves++;
      if (loss > tolerance) {
        repFailures++;
        failures.push(
          `${rep.id}: ${pathOf(node)} — ${learner ? 'learner' : 'opponent'} move loses ${loss} cp ` +
            `(limit ${tolerance}; the engine prefers ${top.move})`,
        );
      }
    }
    const learnerMoves = nodes.filter((n) => isLearnerMove(n, rep.color)).length;
    console.log(
      `${repFailures ? '✗' : '✓'} ${rep.id}: ${learnerMoves} learner and ${nodes.length - learnerMoves} ` +
        `opponent moves${repFailures ? `, ${repFailures} over the limit` : ''}`,
    );
  }
  engine.quit();

  if (failures.length) {
    console.error(`\nAt depth ${depth}, ${failures.length} of ${moves} moves are over the limit:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `\nAll ${moves} moves of ${selected.length} repertoire(s) verified at depth ${depth}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
