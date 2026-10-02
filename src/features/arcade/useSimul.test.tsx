import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import type { SimulSetup } from './simul';

/**
 * A scripted engine: every search answers instantly with the first legal move,
 * and the start-up can be made to fail.
 */
interface FakeEngine {
  status: 'ready' | 'error' | 'loading';
  failing: boolean;
  searches: { moves: string[]; movetime?: number }[];
}
const fake: FakeEngine = vi.hoisted(() => ({ status: 'ready', failing: false, searches: [] }));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const client = {
    init: () => (fake.failing ? Promise.reject(new Error('no engine')) : Promise.resolve()),
    setOption: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[]; movetime?: number }) => {
      fake.searches.push({ moves: [...(params.moves ?? [])], movetime: params.movetime });
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const move = chess.moves({ verbose: true })[0];
      return {
        id: fake.searches.length,
        stop: () => undefined,
        result: Promise.resolve({
          stopped: false,
          bestmove: { move: move ? move.lan : null },
          lines: new Map(),
        }),
      };
    },
  };
  return {
    useEngine: () => ({
      engine: () => client,
      status: fake.status,
      error: null,
      start: () => Promise.resolve(),
    }),
  };
});

const played = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: played };
});

import { useSimul } from './useSimul';

const SETUP: SimulSetup = {
  boards: 2,
  levelId: 2,
  rising: false,
  color: 'white',
  timeControlId: 'none',
  autoAdvance: true,
};

/** Lets the engine loop's promises settle. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('useSimul', () => {
  beforeEach(() => {
    fake.status = 'ready';
    fake.failing = false;
    fake.searches.length = 0;
    played.mockClear();
    // No random moves from the weak levels: the scripted engine decides.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    useProgress.getState().resetAll();
    useSettings.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('the one engine answers every board in the order they started waiting', async () => {
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start({ ...SETUP, boards: 3, color: 'black' }));
    await settle();
    const state = result.current.state!;
    expect(state.boards.map((b) => b.sans)).toEqual([['a3'], ['a3'], ['a3']]);
    expect(state.boards.every((b) => b.turn === 'black' && b.engine === 'idle')).toBe(true);
    expect(fake.searches).toHaveLength(3);
  });

  it('a move gets an answer and the next board comes up', async () => {
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start(SETUP));
    expect(result.current.state?.active).toBe(0);
    act(() => result.current.move('e2', 'e4'));
    expect(result.current.state?.active).toBe(1);
    await settle();
    const board = result.current.state!.boards[0]!;
    expect(board.sans).toEqual(['e4', 'Nc6']);
    expect(board.engine).toBe('idle');
    // The reply came on a board the player was not looking at: announced, not sounded.
    expect(result.current.announcement).toBe(
      'Board 1: Stockfish · Beginner played Nc6. Your move.',
    );
    expect(played).toHaveBeenCalledWith('move');
    // Moving on by hand.
    act(() => result.current.next());
    expect(result.current.state?.active).toBe(0);
    act(() => result.current.select(1));
    expect(result.current.state?.active).toBe(1);
  });

  it('saves every game and the score when the simul ends', async () => {
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start(SETUP));
    act(() => result.current.move('e2', 'e4'));
    await settle();
    act(() => result.current.resign(0));
    expect(useProgress.getState().games).toHaveLength(1);
    expect(played).toHaveBeenLastCalledWith('gameLost');
    act(() => result.current.resignAll());
    const progress = useProgress.getState();
    expect(progress.games).toHaveLength(2);
    expect(progress.games[1]?.pgn).toContain('[Event "Chess Trainer — simul on 2 boards"]');
    expect(progress.games[1]?.pgn).toContain('1. e4 Nc6');
    expect(progress.arcade.simul).toMatchObject({
      best: 0,
      plays: 1,
      detail: '0/2 · Beginner · no clock',
    });
    expect(result.current.announcement).toBe('The simul is over: 0 out of 2.');
    // Back to the setup screen.
    act(() => result.current.quit());
    expect(result.current.state).toBeNull();
  });

  it('runs every clock where it is the player’s move, flags them and warns once per board', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start({ ...SETUP, timeControlId: '5+3' }));
    // Ten seconds before the flag: one warning for each board.
    act(() => {
      vi.advanceTimersByTime(290_100);
    });
    expect(played.mock.calls.filter(([name]) => name === 'lowTime')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const state = result.current.state!;
    expect(state.boards.map((b) => b.result?.reason)).toEqual(['time', 'time']);
    expect(useProgress.getState().arcade.simul?.detail).toBe('0/2 · Beginner · 5 + 3');
    expect(useProgress.getState().games).toHaveLength(2);
  });

  it('waits for a failed engine and carries on once it is back', async () => {
    fake.failing = true;
    fake.status = 'loading';
    const { result, rerender } = renderHook(() => useSimul());
    act(() => result.current.start({ ...SETUP, color: 'black' }));
    await settle();
    // Nothing moved, nothing is pretending to think, and no clock was charged.
    expect(result.current.state!.boards.every((b) => b.engine === 'waiting')).toBe(true);
    expect(fake.searches).toHaveLength(0);

    fake.failing = false;
    fake.status = 'ready';
    rerender();
    await settle();
    expect(result.current.state!.boards.map((b) => b.sans)).toEqual([['a3'], ['a3']]);
  });

  it('asks for a promotion piece unless queens are automatic', () => {
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start({ ...SETUP, boards: 2 }));
    // Not a promotion: nothing pending, and an illegal move changes nothing.
    act(() => result.current.move('e2', 'e5'));
    expect(result.current.promotion).toBeNull();
    expect(result.current.state!.boards[0]!.sans).toEqual([]);
    expect(result.current.resolvePromotion('q')).toBe(false);
  });
});
