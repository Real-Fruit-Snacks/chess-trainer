import { act, fireEvent, render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { getClassicGame } from './games';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));
vi.mock('@/engine/useEngine', () => ({
  useEngine: () => ({ engine: vi.fn(), status: 'ready', error: null, start: vi.fn() }),
}));

/** The board is a chessground instance; a stub that hands its props to the test. */
const board = vi.hoisted(() => ({
  props: null as null | { onMove?: (from: string, to: string) => void },
}));
vi.mock('@/components/board/Board', () => ({
  Board: (props: { onMove?: (from: string, to: string) => void; ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import { ClassicGamePage } from './ClassicsPage';

const status = () => document.querySelector('.puzzle-status')?.textContent ?? '';

describe('ClassicGamePage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    useSettings.getState().reset();
  });

  it('continues after feedback on Space/Enter/→, but not with a modifier, from the board or a button', () => {
    const game = getClassicGame('opera-game')!;
    render(
      <MemoryRouter initialEntries={[`/classics/${game.id}`]}>
        <Routes>
          <Route path="/classics/:gameId" element={<ClassicGamePage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip the opening' }));
    // Guess the game move exactly.
    const chess = new Chess();
    const moves = game.moves.split(' ');
    moves.slice(0, game.guessFromPly).forEach((san) => chess.move(san));
    const actual = chess.move(moves[game.guessFromPly]!);
    act(() => board.props?.onMove?.(actual.from, actual.to));
    expect(status()).toContain('3 points');

    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowRight' });
    // Enter on the focused Continue button is the button's own business (no second step).
    fireEvent.keyDown(screen.getByRole('button', { name: /Continue/ }), { key: 'Enter' });
    expect(status()).toContain('3 points');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(status()).toBe('Opponent replies…');
  });

  it('keeps Space, Enter and → working when single-key shortcuts are off', () => {
    useSettings.getState().update({ keyboardShortcuts: false });
    const game = getClassicGame('opera-game')!;
    render(
      <MemoryRouter initialEntries={[`/classics/${game.id}`]}>
        <Routes>
          <Route path="/classics/:gameId" element={<ClassicGamePage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip the opening' }));
    const chess = new Chess();
    const moves = game.moves.split(' ');
    moves.slice(0, game.guessFromPly).forEach((san) => chess.move(san));
    const actual = chess.move(moves[game.guessFromPly]!);
    act(() => board.props?.onMove?.(actual.from, actual.to));
    expect(status()).toContain('3 points');
    fireEvent.keyDown(window, { key: ' ' });
    expect(status()).toBe('Opponent replies…');
  });
});
