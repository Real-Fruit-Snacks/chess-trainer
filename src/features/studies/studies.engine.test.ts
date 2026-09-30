/**
 * Engine verification of every endgame study (slow; run with
 * `npm run studies:verify`). For each solver ply every accepted move must keep
 * the goal: a decisive advantage for "win" studies (studies are deep, so the
 * bar is 250 cp or mate) and at least a level position for "draw" studies.
 */
import { Chess } from 'chess.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeEngine } from '../../../scripts/lib/node-engine.mjs';
import { STUDIES } from './studies';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ENABLED = !!env.VERIFY_ENGINE;
const DEPTH = Number(env.VERIFY_DEPTH ?? 22);
const WIN_CP = 250;
const DRAW_CP = -60;

function moverScore(score: { type: 'cp' | 'mate'; value: number }): number {
  if (score.type === 'mate') {
    return score.value > 0 ? -(10_000 - score.value) : 10_000 + score.value;
  }
  return -score.value;
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
      const evaluate = async (fen: string) => {
        const chess = new Chess(fen);
        if (chess.isCheckmate()) return 10_000;
        if (chess.isGameOver()) return 0;
        const { lines } = await engine.analyse(fen, { depth: DEPTH });
        const score = lines.get(1)?.score;
        if (!score) throw new Error(`No score for ${fen}`);
        return moverScore(score);
      };
      const keeps = (score: number) => (study.goal === 'win' ? score >= WIN_CP : score >= DRAW_CP);
      const chess = new Chess(study.fen);
      for (const [index, ply] of study.line.entries()) {
        const base = chess.fen();
        for (const san of ply.moves) {
          const probe = new Chess(base);
          probe.move(san);
          const score = await evaluate(probe.fen());
          expect(keeps(score), `${study.id} ply ${index + 1}: ${san} scores ${score}`).toBe(true);
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
    }, 300_000);
  }
});
