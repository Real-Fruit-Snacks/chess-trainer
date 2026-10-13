import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { SearchInfo } from '@/engine/uci';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import type * as ReviewModule from './gameReview';
import type { ReviewSummary } from './gameReview';

/** A scripted engine: searches wait until the test answers them (or they are stopped). */
interface Search {
  fen: string;
  searchmoves?: string[];
  resolve: (result: {
    stopped: boolean;
    bestmove: { move: string | null };
    lines: Map<number, SearchInfo>;
  }) => void;
}
interface Fake {
  searches: Search[];
  /** Judgement and engine move per ply of the reviewed game (1-based). */
  plan: Record<number, { judgement: MoveJudgement; best?: string; bestUci?: string }>;
}
const fake = vi.hoisted((): Fake => ({ searches: [], plan: {} }));

vi.mock('@/engine/useEngine', () => {
  const client = {
    name: 'Fake 1',
    stop: () => undefined,
    search: (params: { fen: string; searchmoves?: string[] }) => {
      let resolve!: Search['resolve'];
      const result = new Promise<Parameters<Search['resolve']>[0]>((r) => {
        resolve = r;
      });
      fake.searches.push({ fen: params.fen, searchmoves: params.searchmoves, resolve });
      return {
        id: fake.searches.length,
        result,
        stop: () => resolve({ stopped: true, bestmove: { move: null }, lines: new Map() }),
      };
    },
  };
  const engine = () => client;
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
vi.mock('./gameReview', async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewModule>();
  return {
    ...actual,
    reviewGame: (
      _engine: unknown,
      _startFen: string,
      moves: { san: string; before: string }[],
    ): Promise<ReviewSummary> =>
      Promise.resolve({
        moves: moves.map((m, i) => {
          const plan = fake.plan[i + 1];
          return {
            ply: i + 1,
            san: m.san,
            mover: i % 2 === 0 ? 'white' : 'black',
            winBefore: 0.5,
            winAfter: 0.5,
            loss: plan?.judgement === 'blunder' ? 0.4 : plan?.judgement === 'mistake' ? 0.25 : 0,
            judgement: plan?.judgement ?? 'good',
            best: plan?.best ?? null,
            bestUci: plan?.bestUci ?? null,
            scoreBefore: null,
            fen: m.before,
            scoreAfter: null,
            bestPv: [],
            replyUci: null,
            replyPv: [],
          };
        }),
        counts: {
          white: { inaccuracy: 0, mistake: 0, blunder: 0 },
          black: { inaccuracy: 0, mistake: 1, blunder: 1 },
        },
        accuracy: { white: 90, black: 40 },
        wins: [],
        depth: 12,
      }),
  };
});

import { useAnalysis } from './useAnalysis';
import { useSelfReview } from './useSelfReview';

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function setup() {
  return renderHook(() => {
    const analysis = useAnalysis();
    const self = useSelfReview(analysis);
    return { analysis, self };
  });
}

describe('useSelfReview', () => {
  beforeEach(() => {
    fake.searches.length = 0;
    fake.plan = {
      2: { judgement: 'mistake', best: 'e5', bestUci: 'e7e5' },
      3: { judgement: 'inaccuracy' },
      4: { judgement: 'blunder', best: 'e5', bestUci: 'e7e5' },
    };
    useProgress.getState().resetAll();
  });

  it('hides the engine, collects marks and a move instead, then scores them against the review', async () => {
    const { result } = setup();
    act(() => {
      result.current.analysis.loadPgn('1. e4 f6 2. d4 g5');
    });
    act(() => result.current.self.start());
    expect(result.current.self.phase).toBe('marking');
    expect(result.current.analysis.engineOn).toBe(false);

    for (const ply of [1, 3, 4]) {
      act(() => result.current.analysis.goToPly(ply));
      act(() => result.current.self.toggleMark(result.current.analysis.current));
    }
    expect(result.current.self.marks.map((m) => m.san)).toEqual(['e4', 'd4', 'g5']);
    expect(result.current.self.markedNodes.size).toBe(3);

    // "Your move instead" for 2...g5: the board goes back a move and takes the next one played.
    act(() => result.current.self.suggestFor(4));
    expect(result.current.analysis.current.ply).toBe(3);
    // The game move itself is not an alternative.
    act(() => result.current.analysis.playMove('g7', 'g5'));
    expect(result.current.self.notice).toMatch(/move played in the game/);
    expect(result.current.analysis.current.ply).toBe(3);
    act(() => result.current.analysis.playMove('e7', 'e6'));
    expect(result.current.self.suggesting).toBeNull();
    expect(result.current.self.marks.find((m) => m.ply === 4)?.suggestion).toEqual({
      uci: 'e7e6',
      san: 'e6',
    });

    act(() => result.current.self.check());
    expect(result.current.self.phase).toBe('checking');
    await settle();
    await settle();
    // The suggestion is searched against the engine's move, in the position before 2...g5.
    const judging = fake.searches.find((s) => s.searchmoves?.includes('e7e6'));
    expect(judging?.searchmoves).toEqual(['e7e5', 'e7e6']);
    await act(async () => {
      judging?.resolve({
        stopped: false,
        bestmove: { move: 'e7e5' },
        lines: new Map([
          [1, { score: { type: 'cp', value: 0 }, pv: ['e7e5'] } as SearchInfo],
          [2, { score: { type: 'cp', value: -30 }, pv: ['e7e6'] } as SearchInfo],
        ]),
      });
      await Promise.resolve();
    });
    await settle();

    const { self, analysis } = result.current;
    expect(self.phase).toBe('done');
    expect(self.score).toMatchObject({ found: 2, late: 1, total: 2, falseAlarms: 1 });
    expect(self.score?.marks.map((m) => [m.san, m.outcome])).toEqual([
      ['e4', 'false-alarm'],
      ['d4', 'late'],
      ['g5', 'found'],
    ]);
    expect(self.suggestions.get(4)?.verdict).toBe('good');
    expect(analysis.engineOn).toBe(true);
    expect(useProgress.getState().selfReview).toMatchObject({
      games: 1,
      found: 2,
      total: 2,
      falseAlarms: 1,
      suggestions: 1,
      goodSuggestions: 1,
    });
    expect(useProgress.getState().drills['self-review']?.best).toBe(1);
    act(() => result.current.self.finish());
    expect(result.current.self.phase).toBe('off');
    // The engine's review stays on the board.
    expect(result.current.analysis.review?.moves).toHaveLength(4);
  });

  it('judges a move instead of one the engine chose too, against the move played', async () => {
    // 1...e5 was the engine's own choice: the review gives no other move for it.
    fake.plan = { 2: { judgement: 'best' } };
    const { result } = setup();
    act(() => {
      result.current.analysis.loadPgn('1. e4 e5 2. Nf3 Nc6');
    });
    act(() => result.current.self.start());
    act(() => result.current.analysis.goToPly(2));
    act(() => result.current.self.toggleMark(result.current.analysis.current));
    act(() => result.current.self.suggestFor(2));
    act(() => result.current.analysis.playMove('c7', 'c5'));
    act(() => result.current.self.check());
    await settle();
    await settle();
    const judging = fake.searches.find((s) => s.searchmoves?.includes('c7c5'));
    expect(judging?.searchmoves).toEqual(['e7e5', 'c7c5']);
    await act(async () => {
      judging?.resolve({
        stopped: false,
        bestmove: { move: 'e7e5' },
        lines: new Map([
          [1, { score: { type: 'cp', value: -20 }, pv: ['e7e5'] } as SearchInfo],
          [2, { score: { type: 'cp', value: -60 }, pv: ['c7c5'] } as SearchInfo],
        ]),
      });
      await Promise.resolve();
    });
    await settle();
    expect(result.current.self.phase).toBe('done');
    expect(result.current.self.suggestions.get(2)).toMatchObject({ verdict: 'good', best: 'e7e5' });
    expect(useProgress.getState().selfReview).toMatchObject({ suggestions: 1, goodSuggestions: 1 });
  });

  it('puts the engine back as it was when stopped, and only marks main-line moves', () => {
    const { result } = setup();
    act(() => {
      result.current.analysis.loadPgn('1. e4 (1. d4) 1... e5');
    });
    act(() => result.current.analysis.setEngineOn(false));
    act(() => result.current.self.start());
    // 1.d4 is a variation: not a move of the game.
    const variation = result.current.analysis.tree.root.children[1];
    if (!variation) throw new Error('no variation');
    act(() => result.current.self.toggleMark(variation));
    expect(result.current.self.marks).toEqual([]);
    act(() => result.current.self.stop());
    expect(result.current.self.phase).toBe('off');
    expect(result.current.analysis.engineOn).toBe(false);
  });
});
