import { act, fireEvent, render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import type { OpeningLine } from './openingLines';

// Two lines with the same fourteen moves: whichever comes first, the moves are known.
const MOVES = 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 Nxe4'.split(' ');
const LINES: OpeningLine[] = [
  { eco: 'C54', name: 'Italian Game: Classical Variation', moves: MOVES },
  { eco: 'C54', name: 'Italian Game: Giuoco Piano, Main Line', moves: MOVES },
];

vi.mock('./openingLines', () => ({ loadOpeningLines: () => Promise.resolve(LINES) }));
vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

import EngineSaysPage from './EngineSaysPage';

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

/** The from and to squares of each move of the line. */
const SQUARES = (() => {
  const chess = new Chess();
  return MOVES.map((san) => {
    const move = chess.move(san);
    return [move.from, move.to] as const;
  });
})();

/** Renders the page and starts a run once the lines are in (then the clock is the test's). */
async function start() {
  render(
    <MemoryRouter>
      <EngineSaysPage />
    </MemoryRouter>,
  );
  const button = await screen.findByTestId('engine-says-start');
  await vi.waitFor(() => expect(button).toBeEnabled());
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fireEvent.click(button);
}

/** Lets the engine show the whole sequence and reset the board. */
function watch() {
  act(() => {
    vi.advanceTimersByTime(20_000);
  });
}

/** Plays a move through the board's keyboard interface (chessground reports it a tick later). */
function play(from: string, to: string) {
  const board = screen.getByRole('application', { name: /Engine Says board, replay/ });
  act(() => board.focus());
  for (const key of [from[0], from[1], 'Enter', to[0], to[1], 'Enter']) {
    fireEvent.keyDown(board, { key });
  }
  act(() => {
    vi.advanceTimersByTime(5);
  });
}

describe('EngineSaysPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names each move it shows and keeps its highlight on the board', async () => {
    await start();
    const status = screen.getByTestId('engine-says-status');
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(status).toHaveTextContent('Move 1 of 3: e4');
    expect(document.querySelectorAll('cg-board square.last-move')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(status).toHaveTextContent('Move 3 of 3: Nf3');
    // The strip is readable too: the moves shown so far, then the ones still to come.
    const sequence = screen.getByRole('list', { name: 'The sequence' });
    expect(sequence.querySelectorAll('[data-san]')).toHaveLength(3);
    watch();
    expect(status).toHaveTextContent('0 of 3 replayed');
  });

  it('keeps the moves of a finished line in the score when a later round is missed', async () => {
    await start();
    const status = screen.getByTestId('engine-says-status');
    // Twelve rounds take the first line from three moves to all fourteen.
    for (let length = 3; length <= MOVES.length; length++) {
      watch();
      expect(status).toHaveTextContent(`0 of ${length} replayed`);
      for (const [from, to] of SQUARES.slice(0, length)) play(from, to);
    }
    // A fresh line, back to three moves — with the fourteen banked.
    expect(screen.getByTestId('engine-says-score')).toHaveTextContent('14');
    watch();
    expect(status).toHaveTextContent('0 of 3 replayed');
    // A wrong first move: the run ends at 14, not 0.
    play('d2', 'd4');
    expect(screen.getByTestId('engine-says-card')).toHaveTextContent('Run over');
    expect(screen.getByTestId('engine-says-score')).toHaveTextContent('14');
    expect(useProgress.getState().arcade['engine-says']).toMatchObject({
      best: 14,
      detail: '14 moves replayed from memory',
    });
    // A hundred-odd moves through the board's keyboard interface: slow on a busy machine.
  }, 60_000);
});
