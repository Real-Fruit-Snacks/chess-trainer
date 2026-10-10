#!/usr/bin/env node
/**
 * Prints Stockfish's best lines for a position, in SAN: the quick way to check a
 * claim while writing a lesson, a study or a drill.
 *
 * Usage:  node scripts/analyse-position.mjs "<fen>|start" [--moves "1. e4 e5 2. Nf3"] [--depth 20] [--multipv 5]
 *
 * --moves plays the moves from the position first. Scores are from the side to
 * move's point of view, in pawns, or M<n> for a forced mate (negative: being mated).
 */
import { Chess } from 'chess.js';
import { NodeEngine } from './lib/node-engine.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const fenArg = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!fenArg) {
  console.error(
    'Usage: node scripts/analyse-position.mjs "<fen>|start" [--moves "e4 e5"] [--depth 20] [--multipv 5]',
  );
  process.exit(1);
}
const chess = new Chess(fenArg === 'start' ? undefined : fenArg);
for (const token of option('--moves', '').split(/\s+/)) {
  if (!token || /^\d+\.+$/.test(token)) continue;
  chess.move(token.replace(/^\d+\.+/, ''));
}
const fen = chess.fen();
if (chess.isGameOver()) {
  console.log(`FEN ${fen}: the game is over (${chess.isCheckmate() ? 'checkmate' : 'a draw'}).`);
  process.exit(0);
}
const legal = chess.moves().length;
const engine = new NodeEngine();
await engine.init({ hashMb: 64 });
const { lines } = await engine.analyse(fen, {
  depth: Number(option('--depth', 20)),
  multipv: Math.min(Number(option('--multipv', 5)), legal),
});
engine.quit();
console.log(
  `FEN ${fen} (${chess.turn() === 'w' ? 'White' : 'Black'} to move, ${legal} legal moves)`,
);
for (const [rank, line] of [...lines.entries()].sort((a, b) => a[0] - b[0])) {
  const probe = new Chess(fen);
  const sans = [];
  for (const uci of line.pv.slice(0, 10)) {
    try {
      sans.push(probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  const { type, value } = line.score;
  const score =
    type === 'mate' ? `M${value}` : `${value >= 0 ? '+' : ''}${(value / 100).toFixed(2)}`;
  console.log(`${String(rank).padStart(2)}  ${score.padStart(7)}  ${sans.join(' ')}`);
}
