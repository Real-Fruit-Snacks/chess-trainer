/**
 * Engine verification of every lesson task. Slow, so it only runs when asked:
 *
 *   VERIFY_ENGINE=1 npx vitest run src/features/learn/lessons/lessons.engine.test.ts
 *
 * For each task the accepted moves must be (close to) the engine's best move:
 * a mate task must be mate, a task in a decisively won position must keep a
 * clear win, and otherwise the accepted move may not give away more than
 * TOLERANCE_CP compared with the best move. Scripted replies are checked to be legal elsewhere.
 */
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeEngine } from '../../../../scripts/lib/node-engine.mjs';
import { lessons } from './index';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ENABLED = !!env.VERIFY_ENGINE;
const DEPTH = Number(env.VERIFY_DEPTH ?? 18);
const TOLERANCE_CP = 80;
/** Above this the position is decisively won; any move that keeps a clear win is fine for a lesson. */
const DECISIVE_CP = 300;

/** Score from the point of view of the side that just moved into `fen`. */
function moverScore(score: { type: 'cp' | 'mate'; value: number }): number {
  if (score.type === 'mate') {
    return score.value > 0 ? -(10_000 - score.value) : 10_000 + score.value;
  }
  return -score.value;
}

describe.skipIf(!ENABLED)('lesson tasks agree with the engine', () => {
  let engine: NodeEngine;
  beforeAll(async () => {
    engine = new NodeEngine();
    await engine.init({ hashMb: 64 });
  }, 60_000);
  afterAll(() => engine?.quit());

  for (const lesson of lessons) {
    for (const [index, step] of lesson.steps.entries()) {
      const task = step.task;
      if (!task) continue;
      it(`${lesson.id} step ${index + 1}: ${task.moves.join(' / ')}`, async () => {
        const evaluate = async (fen: string) => {
          const chess = new Chess(fen);
          if (chess.isCheckmate()) return 10_000;
          if (chess.isGameOver()) return 0;
          const { lines } = await engine.analyse(fen, { depth: DEPTH });
          const score = lines.get(1)?.score;
          if (!score) throw new Error(`No score for ${fen}`);
          return moverScore(score);
        };
        const scored = async (san: string) => {
          const chess = new Chess(step.fen);
          chess.move(san);
          return evaluate(chess.fen());
        };
        // Engine's own best move from the task position.
        const chess = new Chess(step.fen);
        const { bestmove } = await engine.analyse(step.fen, { depth: DEPTH });
        const best = chess.move({
          from: bestmove.slice(0, 2),
          to: bestmove.slice(2, 4),
          promotion: bestmove[4],
        });
        const bestScore = await evaluate(chess.fen());
        for (const san of task.moves) {
          if (task.acceptAnyMate) {
            const probe = new Chess(step.fen);
            probe.move(san);
            expect(probe.isCheckmate(), `${san} should be mate`).toBe(true);
            continue;
          }
          const score = await scored(san);
          const message = `${lesson.id} step ${index + 1}: ${san} scores ${score} but ${best.san} scores ${bestScore}`;
          if (bestScore >= DECISIVE_CP) {
            // Clearly winning: the accepted move must keep a clear win (lessons often teach technique, not the fastest win).
            expect(score, message).toBeGreaterThan(200);
          } else {
            expect(score, message).toBeGreaterThanOrEqual(bestScore - TOLERANCE_CP);
          }
        }
      }, 120_000);
    }
  }
});
