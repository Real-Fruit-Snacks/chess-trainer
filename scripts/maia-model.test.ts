// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { START_FEN } from '../src/chess/helpers';
import type { Fen } from '../src/chess/types';
import { maiaMoveIndex, maiaPolicy, maiaTokens, maiaValue } from '../src/engine/maia/encoding';
import { createMaiaSession, runMaia } from '../src/engine/maia/session';
import { MAIA_FILES } from '../src/sw/maiaFiles';

/**
 * The real model, run by the very code the app's worker runs (ONNX Runtime's
 * WebAssembly build, in Node). Needs `npm run maia:setup` (which `npm run dev`
 * and `npm run build` run first); skipped without it, as the engine tests are
 * without the engine.
 */
const dir = join(process.cwd(), 'public', 'maia');
const modelPath = join(dir, MAIA_FILES.model.name);
const runtimePath = join(dir, MAIA_FILES.runtime.name);
const installed = existsSync(modelPath) && existsSync(runtimePath);

const bytes = (path: string) => {
  const data = readFileSync(path);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
};

describe.skipIf(!installed)('Maia-3 on this machine', () => {
  let session: Awaited<ReturnType<typeof createMaiaSession>>;
  const predict = async (fen: Fen, rating: number) => {
    const out = await runMaia(ort, session, maiaTokens(fen), rating, rating);
    return { moves: maiaPolicy(fen, out.logits), value: maiaValue(out.value), logits: out.logits };
  };
  const chance = (moves: { san: string; probability: number }[], san: string) =>
    moves.find((m) => m.san === san)?.probability ?? 0;

  beforeAll(async () => {
    session = await createMaiaSession(ort, bytes(modelPath), bytes(runtimePath));
  }, 60_000);

  it('opens as people do, and gives the scores the browsers give', async () => {
    const { moves, logits } = await predict(START_FEN, 1500);
    expect(
      moves
        .slice(0, 2)
        .map((m) => m.san)
        .sort(),
    ).toEqual(['d4', 'e4']);
    // The same number Chromium, Firefox and WebKit computed for 1.e4 at 1500.
    expect(logits[maiaMoveIndex('e2e4', false)]).toBeCloseTo(21.796875, 3);
  });

  it('answers 1.e4 like players of the rating: more e5 below, more Sicilian above', async () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const novice = (await predict(afterE4, 800)).moves;
    const expert = (await predict(afterE4, 2200)).moves;
    expect(novice[0]?.san).toBe('e5');
    expect(chance(novice, 'e5')).toBeGreaterThan(chance(expert, 'e5'));
    expect(chance(expert, 'c5')).toBeGreaterThan(chance(novice, 'c5'));
  });

  it('takes a queen left hanging and promotes, for both colours', async () => {
    const hanging = await predict(
      'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3',
      1500,
    );
    expect(hanging.moves[0]?.san).toBe('Nxd5');
    expect(hanging.value.win).toBeGreaterThan(0.8);
    const white = await predict('8/P5k1/8/8/8/8/6K1/8 w - - 0 1', 1500);
    expect(white.moves[0]?.san).toBe('a8=Q');
    const black = await predict('8/8/8/8/8/1K6/7p/3k4 b - - 0 1', 1500);
    expect(black.moves[0]?.san).toBe('h1=Q');
  });

  it('plays a whole game of legal moves at every rating it offers', async () => {
    const { Chess } = await import('chess.js');
    for (const rating of [600, 1500, 2600]) {
      const chess = new Chess();
      for (let ply = 0; ply < 40 && !chess.isGameOver(); ply++) {
        const { moves } = await predict(chess.fen(), rating);
        expect(moves.reduce((sum, m) => sum + m.probability, 0)).toBeCloseTo(1, 5);
        const [best] = moves;
        if (!best) break;
        expect(chess.move(best.san)).toBeTruthy();
      }
      expect(chess.history().length).toBeGreaterThan(10);
    }
  }, 60_000);
});
