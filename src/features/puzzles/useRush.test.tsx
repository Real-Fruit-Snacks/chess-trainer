import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import type * as PuzzleServiceModule from './puzzleService';
import { type Puzzle, selectRushPuzzle } from './puzzleService';
import { RushTrainer } from './RushTrainer';
import { RUSH_DURATION_MS, useRush } from './useRush';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));
vi.mock('./puzzleService', async (importOriginal) => {
  const actual = await importOriginal<typeof PuzzleServiceModule>();
  return { ...actual, selectRushPuzzle: vi.fn() };
});

const PUZZLE: Puzzle = {
  id: 'r1',
  fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1',
  moves: 'g8h8 d1d8',
  rating: 1000,
  rd: 80,
  popularity: 100,
  plays: 1000,
  themes: 'mate mateIn1',
  url: 'https://lichess.org/r1',
};

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

beforeEach(() => {
  vi.mocked(selectRushPuzzle).mockReset();
  useProgress.getState().resetAll();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useRush', () => {
  it('stops the clock while a puzzle downloads', async () => {
    vi.useFakeTimers();
    let deliver: (puzzle: Puzzle) => void = () => undefined;
    vi.mocked(selectRushPuzzle).mockImplementationOnce(
      () => new Promise<Puzzle>((resolve) => (deliver = resolve)),
    );
    const { result } = renderHook(() => useRush(1500));
    act(() => result.current.start('timed'));
    // Ten seconds on a slow connection: none of it comes off the three minutes.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.clockMs).toBe(RUSH_DURATION_MS);

    await act(async () => {
      deliver(PUZZLE);
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.clockMs).toBeLessThanOrEqual(RUSH_DURATION_MS - 4_900);
    expect(result.current.clockMs).toBeGreaterThan(RUSH_DURATION_MS - 5_200);
  });

  it('keeps a new run’s clock paused when an earlier run’s download answers late', async () => {
    vi.useFakeTimers();
    let first: (puzzle: Puzzle) => void = () => undefined;
    vi.mocked(selectRushPuzzle)
      .mockImplementationOnce(() => new Promise<Puzzle>((resolve) => (first = resolve)))
      .mockImplementationOnce(() => new Promise<Puzzle>(() => undefined));
    const { result } = renderHook(() => useRush(1500));
    act(() => result.current.start('timed'));
    act(() => result.current.start('timed'));
    await act(async () => {
      first(PUZZLE);
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    // The second run is still waiting for its puzzle: its clock has not moved.
    expect(result.current.clockMs).toBe(RUSH_DURATION_MS);
  });
});

/** Plays a move on the focused board through its keyboard interface. */
function keyboardMove(board: HTMLElement, from: string, to: string) {
  for (const key of [from[0], from[1], 'Enter', to[0], to[1], 'Enter']) {
    fireEvent.keyDown(board, { key });
  }
}

describe('RushTrainer', () => {
  it('lists the run’s puzzles with their result in words, not colour alone', async () => {
    vi.mocked(selectRushPuzzle).mockResolvedValue(PUZZLE);
    render(
      <MemoryRouter>
        <RushTrainer />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /3 minutes/ }));
    const status = () => document.querySelector('.puzzle-status');
    await vi.waitFor(() => expect(status()).toHaveTextContent('Your move.'));
    await act(() => Promise.resolve());
    const board = screen.getByRole('application', { name: /Rush puzzle/ });
    act(() => board.focus());
    keyboardMove(board, 'd1', 'd8');
    await vi.waitFor(() => expect(status()).toHaveTextContent('Solved!'));
    fireEvent.click(screen.getByRole('button', { name: 'End run' }));
    const results = screen.getByRole('list', { name: 'Puzzles in this run, by rating' });
    expect(results).toHaveTextContent('Solved: 1000');
  });

  it('starts the three-minute run with Enter before the first run', async () => {
    vi.mocked(selectRushPuzzle).mockResolvedValue(PUZZLE);
    render(
      <MemoryRouter>
        <RushTrainer />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /3 minutes/ })).toBeInTheDocument();
    // Enter on a focused button is that button's, not the shortcut's.
    const survival = screen.getByRole('button', { name: 'Survival' });
    act(() => survival.focus());
    fireEvent.keyDown(survival, { key: 'Enter' });
    expect(selectRushPuzzle).not.toHaveBeenCalled();

    act(() => survival.blur());
    fireEvent.keyDown(window, { key: 'Enter' });
    await vi.waitFor(() => expect(selectRushPuzzle).toHaveBeenCalled());
    expect(screen.getByText('Time left')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /3 minutes/ })).toBeNull();
    // The strike counter is announced as text.
    expect(screen.getByRole('img', { name: '0 of 3 strikes' })).toBeInTheDocument();
  });
});
