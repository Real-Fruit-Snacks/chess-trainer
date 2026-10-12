import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import type * as ReviewModule from './gameReview';
import type { ReviewSummary } from './gameReview';

/** Every search the hook starts, with its parameters; none ever finishes on its own. */
interface Search {
  fen: string;
  moves: string[];
  chess960?: boolean;
}
const fake = vi.hoisted(() => ({ searches: [] as Search[], instance: {} }));

vi.mock('@/engine/useEngine', () => {
  const client = {
    name: 'Fake 1',
    init: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: Search) => {
      fake.searches.push({ ...params, moves: [...(params.moves ?? [])] });
      return {
        id: fake.searches.length,
        result: new Promise(() => undefined),
        stop: () => undefined,
      };
    },
  };
  fake.instance = client;
  const engine = () => fake.instance;
  return {
    useEngine: () => ({ engine, status: 'ready', error: null, start: () => Promise.resolve() }),
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

/** What the review was asked: the moves and the options. */
const reviewed = vi.hoisted(() => ({ calls: [] as { moves: string[]; chess960?: boolean }[] }));
vi.mock('./gameReview', async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewModule>();
  return {
    ...actual,
    reviewGame: (
      _engine: unknown,
      _startFen: string,
      moves: { san: string; from: string; to: string }[],
      options: { chess960?: boolean },
    ): Promise<ReviewSummary> => {
      reviewed.calls.push({
        moves: moves.map((m) => `${m.from}${m.to}`),
        chess960: options.chess960,
      });
      return new Promise(() => undefined);
    },
  };
});

import { useAnalysis } from './useAnalysis';

/** Position 274 (BNRKNBRQ): 1.O-O-O e5 2.e4 Nf6 3.Nf3 Be7 4.d3 O-O. */
const PGN = `[Variant "Chess960"]
[FEN "bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w KQkq - 0 1"]

1. O-O-O e5 2. e4 Nf6 3. Nf3 Be7 4. d3 O-O *`;

describe('useAnalysis with a Chess960 game', () => {
  beforeEach(() => {
    fake.searches.length = 0;
    reviewed.calls.length = 0;
  });

  it('loads the game by its rules and asks the engine in Chess960 mode', async () => {
    const { result } = renderHook(() => useAnalysis());
    act(() => {
      expect(result.current.loadPgn(PGN)).toBe(true);
    });
    expect(result.current.tree.chess960).toBe(true);
    expect(result.current.current.san).toBe('O-O');
    // The last move, Black's castling, is marked king and rook.
    expect(result.current.viewed.lastMove).toEqual(['d8', 'g8']);
    await act(async () => {
      await Promise.resolve();
    });
    const search = fake.searches.at(-1);
    expect(search?.chess960).toBe(true);
    expect(search?.moves).toEqual(['d1c1', 'e7e5', 'e2e4', 'e8f6', 'e1f3', 'f8e7', 'd2d3', 'd8g8']);
  });

  it('offers castling as the king onto its rook, and plays it from the board', () => {
    const { result } = renderHook(() => useAnalysis());
    act(() => {
      result.current.loadPgn(PGN);
    });
    act(() => result.current.goToPly(0));
    expect(result.current.viewed.dests.get('d1')).toContain('c1');
    // A variation: 1.e4, then Black castles long at once.
    act(() => result.current.playMove('e2', 'e4'));
    act(() => result.current.playMove('d8', 'c8'));
    expect(result.current.current.san).toBe('O-O-O');
    expect(result.current.current.uci).toBe('d8c8');
    expect(result.current.viewed.fen).toBe(
      'bnkrnbrq/pppppppp/8/8/4P3/8/PPPP1PPP/BNRKNBRQ w KQ - 1 2',
    );
    // An engine line's castling, and a typed one.
    act(() => result.current.playUci('d1c1'));
    expect(result.current.current.san).toBe('O-O-O');
    act(() => result.current.back());
    act(() => {
      expect(result.current.playNotation('o-o-o')).toBe(true);
    });
    expect(result.current.current.uci).toBe('d1c1');
    // The PGN keeps the variant.
    expect(result.current.pgn()).toContain('[Variant "Chess960"]');
  });

  it('reviews the game by its rules', () => {
    const { result } = renderHook(() => useAnalysis());
    act(() => {
      result.current.loadPgn(PGN);
    });
    act(() => result.current.startReview());
    expect(reviewed.calls[0]).toEqual({
      moves: ['d1c1', 'e7e5', 'e2e4', 'e8f6', 'e1f3', 'f8e7', 'd2d3', 'd8g8'],
      chess960: true,
    });
  });

  it('loads a Chess960 position, by its castling rights or when asked', () => {
    const { result } = renderHook(() => useAnalysis());
    act(() => {
      expect(
        result.current.loadFen('bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w GCgc - 0 1'),
      ).toBe(true);
    });
    expect(result.current.tree.chess960).toBe(true);
    expect(result.current.viewed.fen).toBe(
      'bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w KQkq - 0 1',
    );
    // The classical squares, asked for as Chess960: castling is the king onto its rook.
    act(() => {
      result.current.loadFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', { chess960: true });
    });
    expect(result.current.tree.chess960).toBe(true);
    expect(result.current.viewed.dests.get('e1')).toEqual(expect.arrayContaining(['a1', 'h1']));
    // A standard position stays standard.
    act(() => {
      result.current.loadFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    });
    expect(result.current.tree.chess960).toBe(false);
    expect(result.current.viewed.dests.get('e1')).toEqual(expect.arrayContaining(['c1', 'g1']));
    act(() => {
      expect(result.current.loadFen('nonsense w HAha - 0 1', { chess960: true })).toBe(false);
    });
  });
});
