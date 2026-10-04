import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { getClassicGame } from '@/features/classics/games';
import type * as ArbiterModule from './arbiter';
import type { ArbiterRound } from './arbiter';
import { illegalMoves } from './arbiterMoves';

// Every round is the same: the Opera Game's first three moves, then a knight off its L.
const fixed = vi.hoisted(() => ({ round: null as ArbiterRound | null }));

vi.mock('./arbiter', async (importOriginal) => {
  const actual = await importOriginal<typeof ArbiterModule>();
  return { ...actual, buildRound: () => fixed.round };
});
vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

import ArbiterPage from './ArbiterPage';
import { callWindowMs, leadInMs, replayGame, stepMs } from './arbiter';

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  const opera = getClassicGame('opera-game');
  if (!opera) throw new Error('missing game');
  const game = replayGame(opera);
  const illegal = illegalMoves(
    { fen: game.positions[3] ?? '', history: game.moves.slice(0, 3) },
    'knight-shape',
  )[0];
  if (!illegal) throw new Error('no illegal move');
  fixed.round = {
    gameId: game.id,
    title: game.title,
    caption: game.caption,
    startPly: 0,
    startFen: game.positions[0] ?? '',
    lead: game.moves.slice(0, 3),
    illegal,
  };
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Renders the page and starts a run once the games are read (then the clock is the test's). */
async function start() {
  render(
    <MemoryRouter>
      <ArbiterPage />
    </MemoryRouter>,
  );
  const button = await screen.findByTestId('arbiter-start');
  await vi.waitFor(() => expect(button).toBeEnabled());
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  fireEvent.click(button);
}

/** Plays the round's three real moves; the illegal one is next. */
function playLead(round = 1) {
  advance(leadInMs(round, 'normal'));
  advance(stepMs(round, 'normal'));
  advance(stepMs(round, 'normal'));
}

describe('ArbiterPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the game and every move it shows', async () => {
    await start();
    expect(screen.getByText('The Opera Game')).toBeInTheDocument();
    expect(screen.getByTestId('arbiter-status')).toHaveTextContent('Watch the board');
    advance(leadInMs(1, 'normal'));
    expect(screen.getByTestId('arbiter-status')).toHaveTextContent('1.e4');
    advance(stepMs(1, 'normal'));
    expect(screen.getByTestId('arbiter-status')).toHaveTextContent('1...e5');
    // The pace is chosen before a run, not during one.
    expect(screen.queryByRole('radiogroup', { name: 'Pace' })).not.toBeInTheDocument();
  });

  it('catches the illegal move with Space, explains it and goes on with Enter', async () => {
    await start();
    playLead();
    advance(stepMs(1, 'normal'));
    const illegal = fixed.round?.illegal;
    expect(screen.getByTestId('arbiter-status')).toHaveTextContent(`2...${illegal?.san ?? ''}`);
    advance(400);
    fireEvent.keyDown(window, { key: ' ' });
    const verdict = screen.getByTestId('arbiter-verdict');
    expect(verdict).toHaveTextContent('Caught in 0.40 s');
    expect(verdict).toHaveTextContent('A knight left its L');
    expect(screen.getByTestId('arbiter-reason')).toHaveTextContent('not an L');
    expect(screen.getByTestId('arbiter-caught')).toHaveTextContent('Caught: 1');
    // The keyboard is taken to the way on.
    expect(document.activeElement).toBe(screen.getByTestId('arbiter-next'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.queryByTestId('arbiter-verdict')).not.toBeInTheDocument();
  });

  it('strikes a legal move called, and says so under the call', async () => {
    await start();
    advance(leadInMs(1, 'normal'));
    fireEvent.click(screen.getByTestId('arbiter-call'));
    expect(screen.getByTestId('arbiter-false-alarm')).toHaveTextContent(
      '1.e4 was legal — a strike.',
    );
    expect(screen.getByTestId('arbiter-strikes')).toHaveTextContent('1 of 3 strikes');
  });

  it('hides the board while paused', async () => {
    await start();
    advance(leadInMs(1, 'normal'));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByTestId('arbiter-paused')).toHaveTextContent('Paused');
    expect(screen.getByTestId('arbiter-call')).toBeDisabled();
    advance(60_000);
    expect(screen.getByTestId('arbiter-status')).toHaveTextContent('Paused');
    fireEvent.click(screen.getByTestId('arbiter-resume'));
    expect(screen.queryByTestId('arbiter-paused')).not.toBeInTheDocument();
    advance(stepMs(1, 'normal'));
    expect(screen.getByTestId('arbiter-status')).toHaveTextContent('1...e5');
  });

  it('ends after three misses and keeps the score', async () => {
    await start();
    for (let round = 1; round <= 3; round++) {
      playLead(round);
      advance(stepMs(round, 'normal'));
      advance(callWindowMs(round, 'normal'));
      expect(screen.getByTestId('arbiter-verdict')).toHaveTextContent('Missed');
      fireEvent.click(screen.getByTestId('arbiter-next'));
    }
    const card = screen.getByTestId('arbiter-card');
    expect(card).toHaveTextContent('Run over');
    expect(card).toHaveTextContent('Play again');
    expect(useProgress.getState().arcade.arbiter).toMatchObject({
      best: 0,
      plays: 1,
      detail: '0 illegal moves caught',
    });
  });
});
