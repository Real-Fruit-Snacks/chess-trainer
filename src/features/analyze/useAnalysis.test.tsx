import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import type { SearchInfo } from '@/engine/uci';
import type * as ReviewModule from './gameReview';
import type { ReviewSummary } from './gameReview';

/**
 * A scripted engine: each search hands out the `info` callbacks the test
 * pushes through `fake.emit`, and resolves when the test says so, so late
 * messages from a stopped search can be simulated.
 */
interface Search {
  fen: string;
  onInfo?: (info: SearchInfo) => void;
  resolve: (result: {
    stopped: boolean;
    bestmove: { move: string | null };
    lines: Map<number, SearchInfo>;
  }) => void;
  stopped: boolean;
}
const fake = vi.hoisted(() => ({
  status: 'ready',
  searches: [] as Search[],
  instance: {},
}));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  // The hook sends the start position plus the line's moves; record the position reached.
  const positionOf = (params: { fen: string; moves?: string[] }) => {
    if (!params.moves?.length) return params.fen;
    const chess = new Chess(params.fen);
    for (const uci of params.moves) {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    return chess.fen();
  };
  const client = {
    name: 'Fake 1',
    init: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[] }, onInfo?: (info: SearchInfo) => void) => {
      let resolve!: Search['resolve'];
      const result = new Promise<Parameters<Search['resolve']>[0]>((r) => {
        resolve = r;
      });
      const search: Search = { fen: positionOf(params), onInfo, resolve, stopped: false };
      fake.searches.push(search);
      return {
        id: fake.searches.length,
        result,
        stop: () => {
          search.stopped = true;
          resolve({ stopped: true, bestmove: { move: null }, lines: new Map() });
        },
      };
    },
  };
  fake.instance = client;
  const engine = () => fake.instance;
  return {
    useEngine: () => ({ engine, status: fake.status, error: null, start: () => Promise.resolve() }),
  };
});

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playMoveSound: vi.fn() };
});

vi.mock('@/lib/openings', () => ({
  loadOpenings: () => Promise.resolve({}),
  findOpening: () => null,
}));

vi.mock('./gameReview', async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewModule>();
  return {
    ...actual,
    reviewGame: (
      _engine: unknown,
      _startFen: string,
      moves: { san: string }[],
    ): Promise<ReviewSummary> =>
      Promise.resolve({
        moves: moves.map((m, i) => ({
          ply: i + 1,
          san: m.san,
          mover: i % 2 === 0 ? 'white' : 'black',
          winBefore: 0.5,
          winAfter: 0.5,
          loss: i === 1 ? 0.4 : 0,
          judgement: i === 1 ? 'blunder' : 'good',
          best: i === 1 ? 'e5' : null,
          bestUci: i === 1 ? 'e7e5' : null,
          scoreBefore: null,
          fen: '',
          scoreAfter: null,
          bestPv: [],
          replyUci: null,
          replyPv: [],
        })),
        counts: {
          white: { inaccuracy: 0, mistake: 0, blunder: 0 },
          black: { inaccuracy: 0, mistake: 0, blunder: 1 },
        },
        accuracy: { white: 100, black: 20 },
        wins: [0.5, 0.5, 0.9],
        depth: 12,
      }),
  };
});

import { useSettings } from '@/store/settings';
import { useAnalysis } from './useAnalysis';

const info = (cp: number, pv: string[]): SearchInfo => ({
  depth: 10,
  multipv: 1,
  score: { type: 'cp', value: cp },
  pv,
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useAnalysis', () => {
  beforeEach(() => {
    fake.status = 'ready';
    fake.searches.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ignores late info from a stopped search and clears lines when the engine is off', async () => {
    const { result } = renderHook(() => useAnalysis());
    await flush();
    const first = fake.searches[0];
    expect(first?.fen).toContain('rnbqkbnr/pppppppp');
    act(() => first?.onInfo?.(info(30, ['e2e4'])));
    expect(result.current.lines.get(1)?.score).toEqual({ type: 'cp', value: 30 });

    act(() => {
      result.current.playNotation('e4');
    });
    await flush();
    expect(first?.stopped).toBe(true);
    // The old search still emits one more line: it must not be shown for the new position.
    act(() => first?.onInfo?.(info(999, ['e2e4'])));
    expect(result.current.lines.get(1)?.score.value).not.toBe(999);
    const second = fake.searches[1];
    act(() => second?.onInfo?.(info(-25, ['e7e5'])));
    expect(result.current.lines.get(1)?.score).toEqual({ type: 'cp', value: -25 });

    act(() => result.current.setEngineOn(false));
    expect(result.current.lines.size).toBe(0);
    expect(result.current.thinking).toBe(false);
  });

  it('drops the review when the main line changes and keeps it otherwise', async () => {
    const { result } = renderHook(() => useAnalysis());
    await flush();
    act(() => {
      result.current.playNotation('e4');
    });
    act(() => {
      result.current.playNotation('f5');
    });
    act(() => {
      result.current.startReview();
    });
    await flush();
    expect(result.current.review?.moves[1]?.san).toBe('f5');
    const f5 = result.current.current;
    expect(result.current.reviewFor(f5)?.judgement).toBe('blunder');

    // A side variation after 1. e4: ...e5, then back to f5.
    act(() => result.current.back());
    act(() => {
      result.current.playNotation('e5');
    });
    const e5 = result.current.current;
    expect(result.current.reviewFor(e5)).toBeUndefined();
    expect(result.current.review).not.toBeNull();
    expect(result.current.judgements.get(f5.id)).toBe('blunder');

    // Deleting the side variation keeps the review.
    act(() => result.current.deleteVariation(e5));
    expect(result.current.review).not.toBeNull();

    // Adding it again and moving it up changes the main line: the review is gone.
    act(() => {
      result.current.playNotation('e5');
    });
    act(() => result.current.promoteVariation());
    expect(result.current.tree.mainLine().map((n) => n.san)).toEqual(['e4', 'e5']);
    expect(result.current.review).toBeNull();
    expect(result.current.judgements.size).toBe(0);
  });

  it('queens a typed pawn move to the last rank when auto-queen is on, and asks otherwise', () => {
    const { result } = renderHook(() => useAnalysis());
    act(() => {
      result.current.loadFen('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    });
    act(() => useSettings.getState().update({ autoQueen: false }));
    let played = true;
    act(() => {
      played = result.current.playNotation('e8');
    });
    expect(played).toBe(false);
    act(() => useSettings.getState().update({ autoQueen: true }));
    try {
      act(() => {
        played = result.current.playNotation('e8');
      });
      expect(played).toBe(true);
      expect(result.current.current.san).toBe('e8=Q');
    } finally {
      useSettings.getState().update({ autoQueen: false });
    }
  });

  it('sanitises FENs it loads and follows a shared variation path', () => {
    const { result } = renderHook(() => useAnalysis());
    // Castling rights with the king on e2 are stale: they are dropped, not trusted.
    let ok = false;
    act(() => {
      ok = result.current.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPKPPP/RNBQ1BNR w KQkq - 0 1');
    });
    expect(ok).toBe(true);
    expect(result.current.viewed.fen.split(' ')[2]).toBe('kq');
    act(() => {
      ok = result.current.loadFen('not a fen');
    });
    expect(ok).toBe(false);

    act(() => {
      result.current.loadPgn('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *', undefined, [
        'e2e4',
        'c7c5',
        'g1f3',
      ]);
    });
    expect(result.current.current.san).toBe('Nf3');
    expect(result.current.current.ply).toBe(3);
    expect(result.current.tree.isMainLine(result.current.current)).toBe(false);
    // ply 0 opens at the start.
    act(() => {
      result.current.loadPgn('1. e4 e5 *', 0);
    });
    expect(result.current.current.ply).toBe(0);
  });
});
