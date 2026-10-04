/**
 * Engine verification of every endgame study (slow; run with
 * `npm run studies:verify`). For each solver ply every accepted move must keep
 * the goal: a decisive advantage for "win" studies (studies are deep, so the
 * bar is 250 cp or mate) and at least a level position for "draw" studies.
 *
 * The dual check runs too: every legal move the study does *not* list must lose
 * the goal, so a learner who finds a second solution is never told it is wrong
 * — a study with a dual lists the alternative in `moves` or is replaced. A move
 * that keeps the goal only by returning to the study's own line (the engine's
 * best play transposes back into a main-line position within three moves) is a
 * repetition, not a dual. `VERIFY_DUAL_DEPTH` (default 16) keeps the many
 * alternatives affordable.
 */
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeEngine } from '../../../scripts/lib/node-engine.mjs';
import { STUDIES } from './studies';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ENABLED = !!env.VERIFY_ENGINE;
const DEPTH = Number(env.VERIFY_DEPTH ?? 22);
const DUAL_DEPTH = Number(env.VERIFY_DUAL_DEPTH ?? 16);
const WIN_CP = 250;
const DRAW_CP = -60;

function moverScore(score: { type: 'cp' | 'mate'; value: number }): number {
  if (score.type === 'mate') {
    return score.value > 0 ? -(10_000 - score.value) : 10_000 + score.value;
  }
  return -score.value;
}

/** SAN without check/mate marks, so "Kb5+" and "Kb5" compare equal. */
const plain = (san: string) => san.replace(/[+#]/g, '');

/** Whether some sequence of at most `plies` moves leads back to a main-line position. */
function returnsToLine(
  chess: Chess,
  mainLine: Set<string>,
  position: (fen: string) => string,
  plies: number,
): boolean {
  if (mainLine.has(position(chess.fen()))) return true;
  if (plies === 0) return false;
  for (const move of chess.moves()) {
    chess.move(move);
    const back = returnsToLine(chess, mainLine, position, plies - 1);
    chess.undo();
    if (back) return true;
  }
  return false;
}

describe.skipIf(!ENABLED)('endgame studies agree with the engine', () => {
  let engine: NodeEngine;
  beforeAll(async () => {
    engine = new NodeEngine();
    await engine.init({ hashMb: 128 });
  }, 60_000);
  afterAll(() => engine?.quit());

  for (const study of STUDIES) {
    it(`${study.id} (${study.goal})`, async () => {
      const analyse = async (fen: string, depth = DEPTH) => {
        const chess = new Chess(fen);
        if (chess.isCheckmate()) return { score: 10_000, pv: [] as string[] };
        if (chess.isGameOver()) return { score: 0, pv: [] as string[] };
        const { lines } = await engine.analyse(fen, { depth });
        const line = lines.get(1);
        if (!line) throw new Error(`No score for ${fen}`);
        return { score: moverScore(line.score), pv: line.pv };
      };
      const evaluate = async (fen: string, depth = DEPTH) => (await analyse(fen, depth)).score;
      const keeps = (score: number) => (study.goal === 'win' ? score >= WIN_CP : score >= DRAW_CP);
      // Every position of the main line (pieces and side to move): a move that merely returns
      // to one of them repeats rather than solves, and is not a dual.
      const position = (fen: string) => fen.split(' ').slice(0, 2).join(' ');
      const mainLine = new Set<string>();
      {
        const walk = new Chess(study.fen);
        mainLine.add(position(walk.fen()));
        for (const ply of study.line) {
          walk.move(ply.moves[0] as string);
          mainLine.add(position(walk.fen()));
          if (ply.reply) {
            walk.move(ply.reply);
            mainLine.add(position(walk.fen()));
          }
        }
      }
      const chess = new Chess(study.fen);
      for (const [index, ply] of study.line.entries()) {
        const base = chess.fen();
        for (const san of ply.moves) {
          const probe = new Chess(base);
          probe.move(san);
          const score = await evaluate(probe.fen());
          expect(keeps(score), `${study.id} ply ${index + 1}: ${san} scores ${score}`).toBe(true);
        }
        // Duals: a legal move the study does not list must not keep the goal.
        const listed = new Set(ply.moves.map(plain));
        const probe = new Chess(base);
        for (const alternative of probe.moves()) {
          if (listed.has(plain(alternative))) continue;
          const after = new Chess(base);
          after.move(alternative);
          // A step backwards is not a solution: the position can be shuffled back into one of
          // the main line within two moves (the Saavedra king wandering before it finds c8=R),
          // or the engine's best play from here transposes back into it within three.
          if (returnsToLine(after, mainLine, position, 4)) continue;
          const { score, pv } = await analyse(after.fen(), DUAL_DEPTH);
          if (!keeps(score)) continue;
          const walk = new Chess(after.fen());
          let transposes = false;
          for (const uci of pv.slice(0, 6)) {
            try {
              walk.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
            } catch {
              break;
            }
            if (mainLine.has(position(walk.fen()))) {
              transposes = true;
              break;
            }
          }
          expect(
            transposes,
            `${study.id} ply ${index + 1}: unlisted ${alternative} also keeps the goal (${score}) — list it or change the study`,
          ).toBe(true);
        }
        chess.move(ply.moves[0] as string);
        if (ply.reply) chess.move(ply.reply);
      }
      // The final position must still show the goal for the side that just moved.
      // `evaluate` scores from the point of view of the side that just moved.
      const final = await evaluate(chess.fen());
      const solverJustMoved = chess.turn() !== study.fen.split(' ')[1];
      const solverScore = solverJustMoved ? final : -final;
      expect(keeps(solverScore), `${study.id}: final position scores ${solverScore}`).toBe(true);
    }, 900_000);
  }
});
