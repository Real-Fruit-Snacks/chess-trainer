import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import type { ClassicGame } from './games';

/** An engine whose searches answer after `delayMs` of fake time with an equal score. */
const fake = vi.hoisted(() => ({ delayMs: 1000, searches: 0, stopped: 0 }));
vi.mock('@/engine/useEngine', () => {
  const client = {
    init: () => Promise.resolve(),
    stop: () => {
      fake.stopped += 1;
    },
    search: () => {
      fake.searches += 1;
      const lines = new Map([
        [1, { depth: 13, multipv: 1, score: { type: 'cp', value: 0 }, pv: [], nodes: 1 }],
      ]);
      return {
        id: fake.searches,
        stop: () => undefined,
        result: new Promise((resolve) =>
          setTimeout(
            () => resolve({ stopped: false, bestmove: { move: 'e2e4' }, lines }),
            fake.delayMs,
          ),
        ),
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
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

import { useGuessTheMove } from './useGuessTheMove';

const GAME: ClassicGame = {
  id: 'test-game',
  title: 'Test game',
  white: 'A',
  black: 'B',
  event: 'Test',
  year: 2000,
  result: '1-0',
  guessColor: 'white',
  guessFromPly: 0,
  difficulty: 1,
  intro: '',
  moves: 'e4 e5 Nf3 Nc6 Bb5',
  notes: {},
  outro: '',
};

describe('useGuessTheMove', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.searches = 0;
    fake.stopped = 0;
    useProgress.getState().resetAll();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a judgement still running when the game is restarted does not play a stray move', async () => {
    const { result } = renderHook(() => useGuessTheMove(GAME));
    expect(result.current.phase).toBe('guess');
    // A wrong guess goes to the engine.
    act(() => result.current.playMove('d2', 'd4'));
    expect(result.current.phase).toBe('checking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fake.searches).toBe(1);

    act(() => result.current.restart());
    expect(fake.stopped).toBe(1);
    expect(result.current.phase).toBe('guess');
    expect(result.current.history).toHaveLength(0);

    // The old judgement arrives: ignored, the new game is untouched, and the game move is not
    // searched for an answer nobody is waiting for.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fake.searches).toBe(1);
    expect(result.current.history).toHaveLength(0);
    expect(result.current.phase).toBe('guess');
    expect(result.current.score).toBe(0);
    expect(result.current.guesses).toBe(0);
  });

  it('judges the guess and the game move one after the other, never in parallel', async () => {
    const { result } = renderHook(() => useGuessTheMove(GAME));
    act(() => result.current.playMove('d2', 'd4'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fake.searches).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(fake.searches).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(result.current.phase).toBe('feedback');
    // Equal scores: the alternative is "good" and worth two points.
    expect(result.current.feedback).toMatchObject({ played: 'd4', actual: 'e4', points: 2 });
  });
});
