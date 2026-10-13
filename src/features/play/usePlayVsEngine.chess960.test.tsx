import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chess960StartFen } from '@/chess/chess960';
import { START_FEN } from '@/chess/helpers';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';

/**
 * A scripted engine that knows both rule sets: each search replays the moves by the rules it
 * was asked for (Chess960 with `chess960: true`) and answers with the next scripted move, or
 * the first legal one. Every search is recorded with its parameters.
 */
interface Search {
  fen: string;
  moves: string[];
  depth?: number;
  chess960?: boolean;
}
const fake = vi.hoisted(() => ({
  searches: [] as Search[],
  /** The engine's own moves (searches at the level's depth), in order. */
  replies: [] as string[],
  /** What hints and threats (depth 14) answer, in order. */
  advice: [] as string[],
  instance: {},
}));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const { Chess960Game } = await import('@/chess/chess960');
  /** The first legal move by the rules of the search. */
  const firstLegal = (params: Search): string | null => {
    if (params.chess960) {
      const game = new Chess960Game(params.fen);
      for (const m of params.moves) game.move(m);
      const [from, targets] = [...game.dests()][0] ?? [];
      return from && targets?.[0] ? `${from}${targets[0]}` : null;
    }
    const chess = new Chess(params.fen);
    for (const m of params.moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4) });
    return chess.moves({ verbose: true })[0]?.lan ?? null;
  };
  const client = {
    init: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    newGame: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: Search) => {
      const search = { ...params, moves: [...(params.moves ?? [])] };
      fake.searches.push(search);
      const scripted = params.depth === 14 ? fake.advice.shift() : fake.replies.shift();
      const move = scripted ?? firstLegal(search);
      const lines = new Map();
      if (move) {
        lines.set(1, { depth: 12, multipv: 1, score: { type: 'cp', value: 0 }, pv: [move] });
      }
      return {
        id: fake.searches.length,
        stop: () => undefined,
        result: Promise.resolve({ stopped: false, bestmove: { move }, lines }),
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
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

import { usePlayVsEngine } from './usePlayVsEngine';

const settle = async (ms = 400) => {
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }
};

/** Position 274, BNRKNBRQ: the king on d1 between rooks on c1 and g1. */
const P274 = chess960StartFen(274);

describe('usePlayVsEngine in Chess960', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.searches.length = 0;
    fake.replies.length = 0;
    fake.advice.length = 0;
    // No random moves from the weak levels: the scripted engine decides.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    useProgress.getState().resetAll();
    useSettings.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts from a random start position, named by its number, with the engine in Chess960 mode', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'black',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
      }),
    );
    // Math.random() is 0.99 here: position 950.
    expect(result.current.variant).toBe('chess960');
    expect(result.current.chess960Position).toBe(950);
    expect(result.current.startFen).toBe(chess960StartFen(950));
    await settle();
    // The engine (White) moved, playing by Chess960's rules.
    expect(result.current.game.position.history).toHaveLength(1);
    expect(fake.searches[0]).toMatchObject({ fen: chess960StartFen(950), chess960: true });
  });

  it('castles long for both sides: the king dropped on its rook, the engine’s king takes rook', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
        fen: P274,
      }),
    );
    expect(result.current.chess960Position).toBe(274);
    expect(result.current.game.position.dests.get('d1')).toContain('c1');
    fake.replies.push('d8c8');
    act(() => result.current.playerMove('d1', 'c1'));
    await settle();
    const history = result.current.game.position.history;
    expect(history.map((m) => m.san)).toEqual(['O-O-O', 'O-O-O']);
    expect(result.current.game.position.fen).toBe(
      'bnkrnbrq/pppppppp/8/8/8/8/PPPPPPPP/BNKRNBRQ w - - 2 2',
    );
    // The engine was given the player's castling as king takes rook.
    expect(fake.searches.at(-1)).toMatchObject({ fen: P274, moves: ['d1c1'], chess960: true });
    expect(result.current.game.position.lastMove).toEqual(['d8', 'c8']);
  });

  it('castles short for both sides once the way is clear, and takes moves back', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
        fen: P274,
      }),
    );
    fake.replies.push('e7e5', 'e8f6', 'f8e7', 'd8g8');
    for (const [from, to] of [
      ['e2', 'e4'],
      ['e1', 'f3'],
      ['f1', 'e2'],
    ] as const) {
      act(() => result.current.playerMove(from, to));
      await settle();
    }
    expect(result.current.game.position.dests.get('d1')).toContain('g1');
    act(() => result.current.playerMove('d1', 'g1'));
    await settle();
    expect(result.current.game.position.history.map((m) => m.san)).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nf6',
      'Be2',
      'Be7',
      'O-O',
      'O-O',
    ]);
    const castled = result.current.game.position.fen;
    expect(castled.split(' ')[0]).toBe('bnr2rkq/ppppbppp/5n2/4p3/4P3/5N2/PPPPBPPP/BNR2RKQ');
    expect(castled.split(' ')[2]).toBe('-');
    // Taking back undoes both castlings: the rights come back.
    act(() => result.current.takeBack());
    await settle(10);
    expect(result.current.game.position.history).toHaveLength(6);
    expect(result.current.game.position.fen.split(' ')[2]).toBe('KQkq');
    expect(result.current.game.position.dests.get('d1')).toContain('g1');
  });

  it('gives hints and threats in Chess960 notation', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
        fen: P274,
      }),
    );
    fake.advice.push('d1c1');
    act(() => result.current.hint());
    await settle();
    expect(result.current.hintMove).toEqual({ kind: 'hint', san: 'O-O-O' });
    expect(result.current.hintShapes[0]).toMatchObject({ orig: 'd1', dest: 'c1' });
    expect(fake.searches.at(-1)).toMatchObject({ depth: 14, chess960: true });
    fake.advice.push('d8c8');
    act(() => result.current.showThreat());
    await settle();
    expect(result.current.hintMove).toEqual({ kind: 'threat', san: 'O-O-O' });
    // The threat is asked of the position with Black to move.
    expect(fake.searches.at(-1)?.fen.split(' ')[1]).toBe('b');
  });

  it('ends the game on mate and records it with the Chess960 tags', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
        fen,
      }),
    );
    // Not one of the 960 starts.
    expect(result.current.chess960Position).toBeNull();
    act(() => {
      result.current.playerNotation('Ra8#');
    });
    await settle();
    expect(result.current.gameOver).toMatchObject({ verdict: 'win', reason: 'checkmate' });
    const [record] = useProgress.getState().games;
    expect(record?.result).toBe('1-0');
    expect(record?.pgn).toContain('[Variant "Chess960"]');
    expect(record?.pgn).toContain('[SetUp "1"]');
    expect(record?.pgn).toContain(`[FEN "${fen}"]`);
    expect(record?.pgn).toContain('[Event "Open File — Chess960 vs engine"]');
    expect(record?.pgn).toMatch(/1\. Ra8# 1-0$/);
    expect(result.current.pgn()).toBe(record?.pgn);
  });

  it('draws a flag when the side with time left has no mating material', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    // Castling rights by file: chess.js could not read this FEN as it stands.
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: '1+0',
        variant: 'chess960',
        fen: '4k3/8/8/8/8/8/8/RK5R w HA - 0 1',
      }),
    );
    fake.replies.push('e8e7');
    act(() => result.current.playerMove('b1', 'c2'));
    await settle();
    // Back on the player's turn the clock runs out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });
    expect(result.current.gameOver).toMatchObject({
      result: '1/2-1/2',
      reason: 'time, with no mating material left',
    });
  });

  it('turns off what is for standard chess only, and plays the engine instead of Maia', () => {
    const { result } = renderHook(() => usePlayVsEngine());
    const book = BUILT_IN_REPERTOIRES[0];
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
        coach: true,
        blunderCheck: true,
        opponent: 'humanlike',
        ...(book
          ? { book: { id: book.id, name: book.name, color: book.color, pgn: book.pgn } }
          : {}),
      }),
    );
    expect(result.current.coach).toBe(false);
    expect(result.current.blunderCheck).toBe(false);
    expect(result.current.book).toBeNull();
    expect(result.current.opponent).toBe('engine');
  });

  it('goes back to standard chess for the next standard game', async () => {
    const { result } = renderHook(() => usePlayVsEngine());
    act(() =>
      result.current.start({
        color: 'white',
        levelId: 4,
        timeControlId: 'none',
        variant: 'chess960',
        fen: P274,
      }),
    );
    act(() => result.current.start({ color: 'white', levelId: 4, timeControlId: 'none' }));
    expect(result.current.variant).toBe('standard');
    expect(result.current.chess960Position).toBeNull();
    expect(result.current.game.position.fen).toBe(START_FEN);
    act(() => {
      result.current.playerNotation('e4');
    });
    await settle();
    expect(fake.searches.at(-1)?.chess960).toBeUndefined();
    expect(result.current.pgn()).not.toContain('Variant');
  });
});
