import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as PuzzleServiceModule from '@/features/puzzles/puzzleService';
import type { Puzzle } from '@/features/puzzles/puzzleService';
import VisionDrill from './VisionDrill';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

// One position with exactly two captures for White after Black's setup move: Rxd5 and Rxh5.
const TWO_CAPTURES: Puzzle = {
  id: 'two-captures',
  fen: 'k7/8/8/3n3p/8/8/8/3RK2R b - - 0 1',
  moves: 'a8b8 d1d5 b8c8 h1h5',
  rating: 1200,
  rd: 50,
  popularity: 90,
  plays: 1000,
  themes: 'short',
  url: '',
};

vi.mock('@/features/puzzles/puzzleService', async (importOriginal) => {
  const actual = await importOriginal<typeof PuzzleServiceModule>();
  return {
    ...actual,
    loadPuzzleIndex: vi.fn(() =>
      Promise.resolve({
        source: 'test',
        license: 'CC0-1.0',
        generatedAt: '2026-01-01',
        total: 1,
        buckets: [
          {
            id: 'b1100',
            label: 'Casual',
            min: 1100,
            max: 1399,
            count: 1,
            files: ['b1100-00.json'],
          },
        ],
        themes: {},
      }),
    ),
    loadBucketChunk: vi.fn(() => Promise.resolve([TWO_CAPTURES])),
  };
});

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

/** Plays `from`→`to` on the chessground board through its keyboard interface. */
function keyboardMove(board: HTMLElement, from: string, to: string) {
  fireEvent.keyDown(board, { key: from[0] });
  fireEvent.keyDown(board, { key: from[1] });
  fireEvent.keyDown(board, { key: 'Enter' });
  fireEvent.keyDown(board, { key: to[0] });
  fireEvent.keyDown(board, { key: to[1] });
  fireEvent.keyDown(board, { key: 'Enter' });
}

describe('VisionDrill: find every capture', () => {
  it('accepts the second capture on the same position (the board heals after each move)', async () => {
    render(
      <MemoryRouter initialEntries={['/drills/vision?mode=captures']}>
        <VisionDrill />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Start · 60 seconds/ }));
    const status = screen.getByTestId('vision-status');
    await vi.waitFor(() => expect(status).toHaveTextContent('2 to go'));

    const board = screen.getByRole('application', { name: /Find every capture board/ });
    act(() => board.focus());
    keyboardMove(board, 'd1', 'd5');
    await vi.waitFor(() => expect(status).toHaveTextContent('1 to go'));
    // The board kept its position (the rook is back on d1, the knight still on d5) so the
    // second capture can be played the same way.
    await vi.waitFor(() => {
      const pieces = Array.from(
        document.querySelectorAll<HTMLElement & { cgKey?: string }>('cg-board piece'),
      ).filter((p) => p.style.display !== 'none');
      expect(pieces.some((p) => p.cgKey === 'd1')).toBe(true);
      expect(pieces.some((p) => p.cgKey === 'd5')).toBe(true);
    });
    keyboardMove(board, 'h1', 'h5');
    await vi.waitFor(() =>
      expect(screen.getByText('Found').previousSibling).toHaveTextContent('2'),
    );
  });

  it('names the guess-the-position mode "Guess" in the mode switch', () => {
    render(
      <MemoryRouter initialEntries={['/drills/vision?mode=moves']}>
        <VisionDrill />
      </MemoryRouter>,
    );
    expect(screen.getByRole('radio', { name: 'Guess' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Recall' })).toBeNull();
  });
});
