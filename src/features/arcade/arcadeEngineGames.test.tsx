import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameOver, UsePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { ODDS_RUNGS, oddsFen } from './odds';

/**
 * The Odds Ladder, Army Draft and Blindfold pages over a stand-in for the play
 * hook: a plain object the test changes between renders.
 */
const fake = vi.hoisted((): { play: unknown } => ({ play: null }));
vi.mock('@/features/play/usePlayVsEngine', () => ({ usePlayVsEngine: () => fake.play }));

import ArmyDraftPage from './ArmyDraftPage';
import BlindfoldPage from './BlindfoldPage';
import OddsLadderPage from './OddsLadderPage';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fakePlay(): UsePlayVsEngine {
  const play = {
    started: false,
    gameOver: null as GameOver | null,
    playerColor: 'white',
    orientation: 'white',
    thinking: false,
    hintShapes: [],
    engineStatus: 'ready',
    engineError: null,
    level: { id: 3, name: 'Casual' },
    startFen: START,
    game: {
      position: {
        fen: START,
        turn: 'white',
        dests: new Map(),
        lastMove: null,
        inCheck: false,
        history: [],
        startFen: START,
      },
      pendingPromotion: null,
    },
    start: vi.fn((setup: { levelId: number }) => {
      play.started = true;
      play.gameOver = null;
      play.level = { id: setup.levelId, name: `Level ${setup.levelId}` };
    }),
    resign: vi.fn(),
    playerMove: vi.fn(),
    resolvePromotion: vi.fn(),
    pgn: () => '[Event "test"]\n\n*',
    retryEngine: vi.fn(),
  };
  return play as unknown as UsePlayVsEngine;
}

const play = () => fake.play as UsePlayVsEngine & { started: boolean; gameOver: GameOver | null };

/** Renders a page; the returned function renders it again (a fresh element, so React does). */
function renderPage(Page: () => React.ReactElement) {
  const view = render(
    <MemoryRouter>
      <Page key="page" />
    </MemoryRouter>,
  );
  return () =>
    view.rerender(
      <MemoryRouter>
        <Page key="page" />
      </MemoryRouter>,
    );
}

/** The game ends with `verdict`, as the play hook reports it. */
function finish(rerender: () => void, verdict: GameOver['verdict']) {
  play().gameOver = {
    verdict,
    result: verdict === 'win' ? '1-0' : verdict === 'loss' ? '0-1' : '1/2-1/2',
    reason: verdict === 'draw' ? 'stalemate' : 'checkmate',
  };
  act(() => rerender());
}

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  fake.play = fakePlay();
  useProgress.getState().resetAll();
  useSettings.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OddsLadderPage', () => {
  it('records its games as handicap games, out of the engine ladder', () => {
    renderPage(OddsLadderPage);
    fireEvent.click(screen.getByTestId('odds-start'));
    expect(play().start).toHaveBeenCalledWith(
      expect.objectContaining({
        levelId: 8,
        fen: oddsFen(ODDS_RUNGS[0]!),
        source: 'arcade',
        event: 'Odds Ladder · Queen odds',
      }),
    );
  });

  it('lists the rungs as readable rows and counts a draw as played', () => {
    const rerender = renderPage(OddsLadderPage);
    const rungs = screen.getByRole('list', { name: 'Rungs' });
    expect(within(rungs).getAllByRole('listitem')).toHaveLength(ODDS_RUNGS.length);
    expect(screen.getByTestId('odds-rung-0')).toHaveTextContent('Queen odds');
    expect(screen.getByTestId('odds-rung-0')).toHaveTextContent('Current');
    expect(screen.getByTestId('odds-rung-1')).toHaveTextContent('Locked');
    expect(screen.getByRole('button', { name: 'Play Queen odds' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('odds-start'));
    act(() => rerender());
    finish(rerender, 'draw');
    expect(useProgress.getState().oddsLadder.results[0]).toEqual({ wins: 0, losses: 0, draws: 1 });
    expect(screen.getByTestId('odds-rung-0')).toHaveTextContent('1 draw');
    expect(screen.getByTestId('odds-result')).toHaveTextContent('only a win climbs');
    expect(screen.getByTestId('odds-next')).toHaveTextContent('Play again');
  });

  it('says so when the top rung is beaten, and offers it again', () => {
    const top = ODDS_RUNGS.length - 1;
    useProgress.getState().setOddsLadder({ rung: top, best: top, results: {} });
    const rerender = renderPage(OddsLadderPage);
    fireEvent.click(screen.getByTestId('odds-start'));
    act(() => rerender());
    finish(rerender, 'win');
    const result = screen.getByTestId('odds-result');
    expect(result).toHaveTextContent('You beat full-strength Stockfish on level terms');
    expect(result).not.toHaveTextContent('lower rung');
    const again = screen.getByTestId('odds-next');
    expect(again).toHaveTextContent('Play again');
    fireEvent.click(again);
    expect(play().start).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: 'Odds Ladder · Level game' }),
    );
  });

  it('climbing a rung offers the next one', () => {
    const rerender = renderPage(OddsLadderPage);
    fireEvent.click(screen.getByTestId('odds-start'));
    act(() => rerender());
    finish(rerender, 'win');
    expect(screen.getByTestId('odds-result')).toHaveTextContent('You climb to Rung 2 · Rook odds.');
    expect(screen.getByTestId('odds-next')).toHaveTextContent('Next rung');
  });
});

describe('ArmyDraftPage', () => {
  it('reads every change to the army out with the budget', () => {
    renderPage(ArmyDraftPage);
    const news = screen.getByTestId('army-budget-news');
    expect(news).toHaveAttribute('role', 'status');
    fireEvent.click(screen.getByRole('button', { name: 'Remove a pawn' }));
    expect(news).toHaveTextContent('Pawns: 4. 29 of 30 points spent, 1 left.');
    fireEvent.click(screen.getByRole('button', { name: 'Cavalry' }));
    expect(news).toHaveTextContent(
      'Cavalry: 1 rook, 1 bishop, 4 knights, 8 pawns. 28 of 30 points spent, 2 left.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(news).toHaveTextContent('Army cleared. 0 of 30 points spent, 30 left.');
    expect(screen.getByLabelText('Engine level')).toBeInTheDocument();
  });

  it('plays the draft as an arcade game, then again or from a new draft', () => {
    const rerender = renderPage(ArmyDraftPage);
    fireEvent.click(screen.getByTestId('army-start'));
    expect(play().start).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'arcade', event: 'Army Draft · 30 points' }),
    );
    act(() => rerender());
    finish(rerender, 'loss');
    fireEvent.click(screen.getByTestId('army-again'));
    expect(play().start).toHaveBeenCalledTimes(2);
    act(() => rerender());
    finish(rerender, 'loss');
    fireEvent.click(screen.getByTestId('army-new'));
    expect(screen.getByTestId('army-shop')).toBeInTheDocument();
  });
});

describe('BlindfoldPage', () => {
  it('hides the captured material too, and records an arcade game', () => {
    const rerender = renderPage(BlindfoldPage);
    fireEvent.change(screen.getByTestId('blindfold-level'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('blindfold-start'));
    expect(play().start).toHaveBeenCalledWith(
      expect.objectContaining({ levelId: 4, source: 'arcade', event: 'Blindfold · Level 4' }),
    );
    act(() => rerender());
    expect(screen.queryAllByRole('img', { name: /Material up for|Captured by/ })).toHaveLength(0);
  });

  it('scores nothing for a loss, however many peeks are left', () => {
    const rerender = renderPage(BlindfoldPage);
    fireEvent.click(screen.getByTestId('blindfold-start'));
    act(() => rerender());
    finish(rerender, 'loss');
    expect(useProgress.getState().arcade.blindfold).toMatchObject({ best: 0 });
    expect(screen.getByTestId('blindfold-result')).toHaveTextContent('A loss scores nothing');
  });

  it('scores a win by the engine level and the peeks to spare', () => {
    const rerender = renderPage(BlindfoldPage);
    fireEvent.change(screen.getByTestId('blindfold-level'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('blindfold-start'));
    act(() => rerender());
    fireEvent.click(screen.getByTestId('blindfold-peek'));
    finish(rerender, 'win');
    // (100 + 2 unused peeks × 15) × level 4.
    expect(useProgress.getState().arcade.blindfold).toMatchObject({
      best: 520,
      detail: 'Won vs Level 4 with 2 peeks to spare',
    });
  });

  it('offers the same game again, or a new setup', () => {
    const rerender = renderPage(BlindfoldPage);
    fireEvent.click(screen.getByTestId('blindfold-start'));
    act(() => rerender());
    finish(rerender, 'draw');
    fireEvent.click(screen.getByTestId('blindfold-new'));
    expect(screen.getByTestId('blindfold-start')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('blindfold-start'));
    expect(play().start).toHaveBeenCalledTimes(2);
  });
});
