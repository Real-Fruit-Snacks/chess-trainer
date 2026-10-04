import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import type { SimulSetup } from './simul';

/**
 * A scripted engine: every search answers instantly with the first legal move
 * (`answer`), keeps thinking until it is stopped (`hold`), or comes back
 * stopped without a move (`interrupt`); the start-up can be made to fail.
 */
interface FakeEngine {
  status: 'ready' | 'error' | 'loading';
  failing: boolean;
  mode: 'answer' | 'hold' | 'interrupt';
  searches: { moves: string[]; movetime?: number }[];
  stops: number;
  /** Ends a held search as stopped. */
  release: (() => void) | null;
}
const fake: FakeEngine = vi.hoisted(() => ({
  status: 'ready',
  failing: false,
  mode: 'answer',
  searches: [],
  stops: 0,
  release: null,
}));

vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const stopped = { stopped: true, bestmove: { move: null }, lines: new Map() };
  const client = {
    init: () => (fake.failing ? Promise.reject(new Error('no engine')) : Promise.resolve()),
    setOption: () => Promise.resolve(),
    stop: () => {
      fake.stops += 1;
      fake.release?.();
      fake.release = null;
    },
    search: (params: { fen: string; moves?: string[]; movetime?: number }) => {
      fake.searches.push({ moves: [...(params.moves ?? [])], movetime: params.movetime });
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const move = chess.moves({ verbose: true })[0];
      const result =
        fake.mode === 'hold'
          ? new Promise((resolve) => {
              fake.release = () => resolve(stopped);
            })
          : Promise.resolve(
              fake.mode === 'interrupt'
                ? stopped
                : { stopped: false, bestmove: { move: move ? move.lan : null }, lines: new Map() },
            );
      return { id: fake.searches.length, stop: () => undefined, result };
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

import { ANNOUNCE_GAP_MS, Announcer, useSimul } from './useSimul';

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
    fake.mode = 'answer';
    fake.stops = 0;
    fake.release = null;
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
    // Simul boards are kept apart from ordinary engine games (ladder, courses, Progress).
    expect(progress.games.map((g) => g.source)).toEqual(['simul', 'simul']);
    expect(progress.games.map((g) => g.event).sort()).toEqual(['Simul board 1', 'Simul board 2']);
    expect(new Set(progress.games.map((g) => g.id)).size).toBe(2);
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

  it('stops the search of a board that ends while the engine thinks about it', async () => {
    fake.mode = 'hold';
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start(SETUP));
    act(() => result.current.move('e2', 'e4'));
    await settle();
    expect(result.current.state!.boards[0]!.engine).toBe('thinking');
    const stopsBefore = fake.stops;
    act(() => result.current.resign(0));
    await settle();
    // The wasted search is stopped at once, and that is not taken for an engine in trouble.
    expect(fake.stops).toBeGreaterThan(stopsBefore);
    expect(result.current.state!.boards[0]!.result?.reason).toBe('resignation');
    expect(result.current.stalled).toBe(false);
    // The other board still gets its answer.
    fake.mode = 'answer';
    act(() => result.current.move('e2', 'e4'));
    await settle();
    expect(result.current.state!.boards[1]!.sans).toEqual(['e4', 'Nc6']);
  });

  it('says when the engine has stopped answering, and Retry carries on', async () => {
    fake.mode = 'interrupt';
    const { result } = renderHook(() => useSimul());
    act(() => result.current.start({ ...SETUP, color: 'black' }));
    await settle();
    await settle();
    expect(result.current.stalled).toBe(true);
    expect(result.current.state!.boards.every((b) => b.engine === 'waiting')).toBe(true);
    fake.mode = 'answer';
    act(() => result.current.retry());
    await settle();
    expect(result.current.stalled).toBe(false);
    expect(result.current.state!.boards.map((b) => b.sans)).toEqual([['a3'], ['a3']]);
  });
});

describe('Announcer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads messages one at a time with a gap, so none cuts off another', () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    const announcer = new Announcer((text) => shown.push(text));
    announcer.say('Board 1: Nc6. Your move.');
    announcer.say('Board 2: e5. Your move.');
    announcer.say('Board 3: d5. Your move.');
    expect(shown).toEqual(['Board 1: Nc6. Your move.']);
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(shown).toEqual(['Board 1: Nc6. Your move.', 'Board 2: e5. Your move.']);
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(shown).toHaveLength(3);
    // Nothing waiting: the next message is read at once.
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS);
    announcer.say('Board 1: resigned.');
    expect(shown).toHaveLength(4);
  });

  it('puts an urgent message first and drops what was waiting', () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    const announcer = new Announcer((text) => shown.push(text));
    announcer.say('one');
    announcer.say('two');
    announcer.say('The simul is over.', true);
    expect(shown).toEqual(['one', 'The simul is over.']);
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS * 3);
    expect(shown).toEqual(['one', 'The simul is over.']);
    announcer.clear();
  });
});
