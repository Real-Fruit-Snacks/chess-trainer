import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineClient, SearchHandle, SearchParams, SearchResult } from '@/engine/EngineClient';
import type { SearchInfo } from '@/engine/uci';
import { judge, reviewGame } from './gameReview';

/** A fake engine that returns scripted evaluations keyed by FEN. */
function fakeEngine(evaluations: Record<string, { cp: number; best: string }>): EngineClient {
  const search = (params: SearchParams): SearchHandle => {
    const entry = evaluations[params.fen];
    if (!entry) throw new Error(`No scripted evaluation for ${params.fen}`);
    const info: SearchInfo = {
      depth: 12,
      multipv: 1,
      score: { type: 'cp', value: entry.cp },
      pv: [entry.best],
    };
    const result: SearchResult = {
      bestmove: { move: entry.best },
      lines: new Map([[1, info]]),
      stopped: false,
    };
    return { id: 1, result: Promise.resolve(result), stop: () => undefined };
  };
  return { search } as unknown as EngineClient;
}

describe('judge', () => {
  it('classifies by win-probability loss', () => {
    expect(judge(0)).toBe('good');
    expect(judge(0.12)).toBe('inaccuracy');
    expect(judge(0.22)).toBe('mistake');
    expect(judge(0.5)).toBe('blunder');
  });
});

describe('reviewGame', () => {
  it('annotates a blunder and reports the better move', async () => {
    const chess = new Chess();
    const start = chess.fen();
    const afterE4 = (() => {
      const c = new Chess();
      c.move('e4');
      return c.fen();
    })();
    const afterF5 = (() => {
      const c = new Chess();
      c.move('e4');
      c.move('f5');
      return c.fen();
    })();

    chess.move('e4');
    chess.move('f5'); // ??
    const moves = chess.history({ verbose: true });

    const engine = fakeEngine({
      [start]: { cp: 30, best: 'e2e4' },
      [afterE4]: { cp: -30, best: 'e7e5' }, // black to move, slight white edge
      [afterF5]: { cp: 650, best: 'e4f5' }, // white to move, winning
    });

    const progress: number[] = [];
    const review = await reviewGame(engine, start, moves, {
      onProgress: (d, t) => progress.push(d / t),
    });

    expect(progress[progress.length - 1]).toBe(1);
    expect(review.moves).toHaveLength(2);
    expect(review.moves[0]).toMatchObject({ san: 'e4', judgement: 'best' });
    expect(review.moves[1]?.judgement).toBe('blunder');
    expect(review.moves[1]?.best).toBe('e5');
    expect(review.counts.black.blunder).toBe(1);
    expect(review.accuracy.white).toBe(100);
    expect(review.accuracy.black).toBeLessThan(50);
  });

  it('can be cancelled', async () => {
    const chess = new Chess();
    chess.move('e4');
    const controller = new AbortController();
    controller.abort();
    await expect(
      reviewGame(fakeEngine({}), new Chess().fen(), chess.history({ verbose: true }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/);
  });
});
