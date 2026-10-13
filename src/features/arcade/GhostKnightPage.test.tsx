import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import type * as GhostModule from './ghostKnight';
import type { Squad } from './ghostKnight';

// One short hunt with two rooks and a budget of two moves; the knight starts on a5.
const { SQUAD } = vi.hoisted((): { SQUAD: Squad } => ({
  SQUAD: {
    id: 'test',
    name: 'Two rooks',
    pieces: [
      { type: 'r', square: 'a1' },
      { type: 'r', square: 'h1' },
    ],
    budget: 2,
  },
}));

vi.mock('./ghostKnight', async (importOriginal) => {
  const actual = await importOriginal<typeof GhostModule>();
  return {
    ...actual,
    HUNTS: [SQUAD],
    startHunt: (squad: Squad, random: () => number) => {
      const state = actual.startHunt(squad, random);
      return {
        ...state,
        ghost: 'a5',
        possible: ['a5'],
        shown: 'a5',
        lastSeen: 'a5',
        events: [{ type: 'start', square: 'a5' }],
      };
    },
  };
});
vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

import GhostKnightPage from './GhostKnightPage';

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

function renderPage() {
  render(
    <MemoryRouter>
      <GhostKnightPage />
    </MemoryRouter>,
  );
}

/** Plays a move through the board’s keyboard interface; the board redraws on the next frame. */
async function play(from: string, to: string) {
  const board = screen.getByRole('application', { name: /Ghost Knight board/ });
  act(() => board.focus());
  for (const key of [from[0], from[1], 'Enter', to[0], to[1], 'Enter']) {
    fireEvent.keyDown(board, { key });
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

describe('GhostKnightPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    // Without animations the board shows each position at once.
    useSettings.getState().update({ animations: false });
  });

  it('shows the knight at the start, then only where it could be', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('ghost-start'));
    expect(screen.getByTestId('ghost-status')).toHaveTextContent('The knight is on a5.');
    expect(document.querySelectorAll('cg-board piece.black.knight')).toHaveLength(1);
    expect(screen.getByTestId('ghost-moves')).toHaveTextContent('Move 0 of 2');
    await play('h1', 'h2');
    expect(screen.getByTestId('ghost-status')).toHaveTextContent(
      'Rook h1–h2. The knight moved, unseen. It shows itself in 2 moves.',
    );
    expect(document.querySelectorAll('cg-board piece.black')).toHaveLength(0);
    // From a5: b7, c6, c4 and b3, none of them covered.
    expect(document.querySelectorAll('cg-board square.ghost-maybe')).toHaveLength(4);
    expect(document.querySelectorAll('cg-board square.ghost-last')).toHaveLength(1);
    expect(screen.getByTestId('ghost-whereabouts')).toHaveTextContent(
      'It could be on 4 squares: b3, b7, c4 and c6.',
    );
  });

  it('leaves the tracking to you in the unshaded mode', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Unshaded' }));
    fireEvent.click(screen.getByTestId('ghost-start'));
    await play('h1', 'h2');
    expect(document.querySelectorAll('cg-board square.ghost-maybe')).toHaveLength(0);
    expect(document.querySelectorAll('cg-board square.ghost-last')).toHaveLength(1);
    expect(screen.getByTestId('ghost-whereabouts')).not.toHaveTextContent('could be');
  });

  it('scores a catch and records the run', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('ghost-start'));
    await play('a1', 'a5');
    const ended = screen.getByTestId('ghost-ended');
    expect(ended).toHaveTextContent('Caught in 1 move');
    expect(ended).toHaveTextContent('11 points: 10 for the catch and 1 for the move to spare.');
    expect(document.activeElement).toBe(screen.getByTestId('ghost-next'));
    expect(screen.getByTestId('ghost-next')).toHaveTextContent('See the result');
    fireEvent.keyDown(window, { key: 'Enter' });
    const card = screen.getByTestId('ghost-card');
    expect(card).toHaveTextContent('Run over');
    expect(card).toHaveTextContent('1 of 1');
    expect(useProgress.getState().arcade['ghost-knight']).toMatchObject({ best: 11, plays: 1 });
  });

  it('costs a life when the knight gets away, and ends with the last one', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('ghost-start'));
    for (let life = 3; life >= 1; life--) {
      await play('h1', 'h2');
      await play('h2', 'h1');
      const ended = screen.getByTestId('ghost-ended');
      expect(ended).toHaveTextContent('It got away');
      if (life > 1) {
        expect(ended).toHaveTextContent(`A life lost: ${life - 1} left.`);
        expect(screen.getByTestId('ghost-next')).toHaveTextContent('Try again');
      } else {
        expect(ended).toHaveTextContent('That was the last life.');
        expect(screen.getByTestId('ghost-next')).toHaveTextContent('See the result');
      }
      fireEvent.click(screen.getByTestId('ghost-next'));
    }
    expect(screen.getByTestId('ghost-card')).toHaveTextContent('Run over');
    expect(useProgress.getState().arcade['ghost-knight']).toMatchObject({ best: 0, plays: 1 });
  });
});
