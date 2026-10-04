import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { HANDOFF_PGN_KEY } from '@/lib/handoff';
import { useSettings } from '@/store/settings';
import { GameMoves } from './EngineGameBoard';

// jsdom has no modal dialog support; the real element fires `close` on close().
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const PGN = '[White "Stockfish"]\n[Black "You"]\n\n1. e4 e5 *';

/** Just enough of a game against the engine for the move panel. */
function fakePlay(overrides: Partial<UsePlayVsEngine> = {}): UsePlayVsEngine {
  return {
    started: true,
    gameOver: null,
    playerColor: 'black',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    game: { position: { history: [{ san: 'e4' }, { san: 'e5' }] } },
    pgn: () => PGN,
    resign: vi.fn(),
    ...overrides,
  } as unknown as UsePlayVsEngine;
}

function renderMoves(play: UsePlayVsEngine) {
  const router = createMemoryRouter(
    [
      { path: '/arcade/odds-ladder', element: <GameMoves play={play} /> },
      { path: '/analyze', element: <p>Analysis board</p> },
    ],
    { initialEntries: ['/arcade/odds-ladder'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('GameMoves: the arcade engine games’ move panel', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useSettings.getState().reset();
  });

  it('asks before resigning, in the one confirmation style', () => {
    const play = fakePlay();
    renderMoves(play);
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAccessibleName('Resign this game?');
    // Cancel first, the dangerous action last.
    const buttons = within(dialog)
      .getAllByRole('button', { hidden: true })
      .map((b) => b.textContent);
    expect(buttons.slice(0, 2)).toEqual(['Keep playing', 'Resign']);
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));
    expect(play.resign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    fireEvent.click(screen.getByTestId('confirm-accept'));
    expect(play.resign).toHaveBeenCalledTimes(1);
  });

  it('hands the game to the analysis board from the learner’s side', async () => {
    const router = renderMoves(fakePlay());
    fireEvent.click(screen.getByRole('button', { name: 'Analyze game' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/analyze'));
    expect(JSON.parse(sessionStorage.getItem(HANDOFF_PGN_KEY) ?? '{}')).toEqual({
      pgn: PGN,
      orientation: 'black',
    });
  });

  it('copies the PGN and toggles focus mode', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderMoves(fakePlay());
    fireEvent.click(screen.getByRole('button', { name: 'Copy PGN' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(PGN));
    const focus = screen.getByRole('button', { name: 'Focus' });
    expect(focus).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(focus);
    expect(useSettings.getState().playFocus).toBe(true);
  });

  it('offers nothing to copy or analyze before the first move, and no resigning a finished game', () => {
    renderMoves(
      fakePlay({
        game: { position: { history: [] } } as unknown as UsePlayVsEngine['game'],
        gameOver: { result: '0-1', reason: 'resignation', verdict: 'loss' },
      }),
    );
    expect(screen.getByRole('button', { name: 'Copy PGN' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Analyze game' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled();
  });
});
