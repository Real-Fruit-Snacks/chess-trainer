import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AuthModule from '@/lib/lichess/auth';
import type * as SyncModule from '@/lib/lichess/sync';
import { useLichessSync } from '@/lib/lichess/sync';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';

vi.hoisted(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const beginLogin = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const revoke = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/lib/lichess/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthModule>();
  return { ...actual, beginLichessLogin: beginLogin, revokeLichessToken: revoke };
});
const syncNow = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/lib/lichess/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof SyncModule>();
  return { ...actual, syncNow };
});

import { LichessCard } from './LichessCard';

function connect(now = Date.now()) {
  useLichess.getState().connect(
    { id: 'learner', username: 'Learner', token: 'lip_card', expiresAt: null },
    {
      puzzle: { rating: 1720, rd: 60, games: 10, prov: false },
      bullet: null,
      blitz: null,
      rapid: null,
      classical: null,
      at: 0,
    },
    now,
  );
}

const renderCard = () =>
  render(
    <MemoryRouter>
      <LichessCard />
    </MemoryRouter>,
  );

describe('Settings → Lichess account', () => {
  beforeEach(() => {
    localStorage.clear();
    beginLogin.mockClear();
    revoke.mockClear();
    syncNow.mockClear();
    useLichess.getState().forget();
    useProgress.getState().resetAll();
    useLichessSync.setState({
      phase: 'idle',
      step: null,
      error: null,
      retryAt: null,
      report: null,
    });
  });

  it('explains the sync and starts the sign-in on lichess.org', () => {
    renderCard();
    expect(screen.getByText(/Puzzle results count on Lichess/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lichess-connect'));
    expect(beginLogin).toHaveBeenCalledTimes(1);
  });

  it('shows the account, syncs on request and keeps the choices', () => {
    connect();
    renderCard();
    expect(screen.getByTestId('lichess-username')).toHaveAttribute(
      'href',
      'https://lichess.org/@/Learner',
    );
    expect(screen.getByText(/puzzle rating 1720/)).toBeInTheDocument();
    expect(screen.getByTestId('lichess-status')).toHaveTextContent('Not synced yet.');
    fireEvent.click(screen.getByTestId('lichess-sync-now'));
    expect(syncNow).toHaveBeenCalledWith({ force: true });

    const puzzles = screen.getByRole('switch', { name: 'Puzzles' });
    const rating = screen.getByRole('switch', { name: 'Puzzle rating from Lichess' });
    expect(rating).toBeEnabled();
    fireEvent.click(puzzles);
    expect(useLichess.getState().options.puzzles).toBe(false);
    expect(rating).toBeDisabled();
    expect(rating).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Repertoires and analyses' }));
    expect(useLichess.getState().options.studies).toBe(false);
  });

  it('says what the last sync did, what waits, and what stays here', () => {
    connect();
    useLichess.getState().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true });
    useLichess.getState().markSynced(Date.now() - 5 * 60_000);
    useLichessSync.setState({
      phase: 'done',
      report: {
        at: Date.now(),
        puzzlesSent: 12,
        roundsAdded: 30,
        reviewsAdded: 4,
        gamesSent: 1,
        gamesAdded: 0,
        studies: {
          pulled: 2,
          pushed: 3,
          copies: 1,
          heldBack: ['Huge'],
          notPulled: 0,
          skipped: false,
        },
        problems: [],
      },
    });
    renderCard();
    expect(screen.getByTestId('lichess-status')).toHaveTextContent(
      'Synced 5 minutes ago. 12 puzzle results sent, 30 puzzles from your Lichess history (4 to review), 1 game sent, 2 repertoires and analyses updated here, 3 changes sent to your studies.',
    );
    expect(screen.getByTestId('lichess-waiting')).toHaveTextContent('1 puzzle result');
    expect(screen.getByTestId('lichess-held-back')).toHaveTextContent('“Huge”');
    expect(screen.getByText(/both versions are kept/)).toBeInTheDocument();
  });

  it('offers what was recorded before connecting, once', () => {
    useProgress.getState().recordPuzzle({
      id: 'AAAAA',
      puzzleRating: 1500,
      outcome: 'solved',
      hintUsed: false,
      themes: 'fork',
      durationMs: 3000,
      rated: true,
    });
    connect(Date.now() + 1000);
    renderCard();
    expect(screen.getByTestId('lichess-backlog')).toHaveTextContent('1 earlier puzzle result');
    fireEvent.click(screen.getByTestId('lichess-backlog-send'));
    expect(useLichess.getState().outbox.puzzles.map((p) => p.id)).toEqual(['AAAAA']);
    expect(syncNow).toHaveBeenCalled();
    expect(screen.queryByTestId('lichess-backlog')).toBeNull();
  });

  it('asks to connect again when Lichess refused the sign-in', () => {
    connect();
    useLichess.getState().setNeedsReconnect(true);
    renderCard();
    expect(screen.getByText(/no longer accepts this device’s sign-in/)).toBeInTheDocument();
    expect(screen.getByTestId('lichess-sync-now')).toBeDisabled();
    fireEvent.click(screen.getByTestId('lichess-reconnect'));
    expect(beginLogin).toHaveBeenCalled();
  });

  it('disconnects after asking, withdrawing the permission on Lichess', () => {
    connect();
    useLichess.getState().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true });
    renderCard();
    fireEvent.click(screen.getByTestId('lichess-disconnect'));
    const dialog = screen.getByRole('dialog', { name: 'Disconnect from Lichess?' });
    expect(within(dialog).getByText(/1 puzzle result\) stays here/)).toBeInTheDocument();
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    });
    expect(useLichess.getState().account).toBeNull();
    expect(revoke).toHaveBeenCalledWith('lip_card');
    expect(screen.getByTestId('lichess-connect')).toBeInTheDocument();
  });
});
