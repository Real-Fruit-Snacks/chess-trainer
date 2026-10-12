import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { randomId } from '../../../relay/src/live/shared.mjs';
import type { LiveGameView } from './types';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

/** The board is a chessground instance; a stub that hands its props to the test. */
interface BoardProps {
  fen: string;
  orientation?: string;
  className?: string;
  viewOnly?: boolean;
  movableColor?: string;
  chess960?: boolean;
}
const board = vi.hoisted(() => ({ props: null as BoardProps | null }));
vi.mock('@/components/board/Board', () => ({
  Board: (props: BoardProps & { ariaLabel?: string }) => {
    board.props = props;
    return <div role="img" aria-label={props.ariaLabel} />;
  },
}));

const sessions = vi.hoisted(() => ({ byId: new Map<string, unknown>(), asked: [] as string[] }));
vi.mock('./sessions', () => ({
  watchLiveGame: (id: string) => {
    sessions.asked.push(id);
    return sessions.byId.get(id) ?? null;
  },
}));

import { playMoveSound } from '@/lib/sound';
import { rememberSeat } from './seats';
import WatchGamePage from './WatchGamePage';

const GAME = randomId(16);

function makeView(patch: Partial<LiveGameView> = {}): LiveGameView {
  return {
    source: 'relay',
    id: GAME,
    connection: 'open',
    missing: false,
    watching: true,
    you: 'white',
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: null },
    tc: '5+3',
    rated: false,
    moves: [],
    clocks: [],
    clock: { white: 300_000, black: 300_000, running: null, at: performance.now() },
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    present: { white: true, black: true },
    watchers: 1,
    open: null,
    joined: null,
    claimAt: null,
    chat: [],
    next: null,
    analysis: null,
    error: null,
    url: null,
    game: 'chess',
    opts: {},
    startFen: null,
    draft: null,
    peeks: null,
    capabilities: { phrases: true, rematch: true, takeback: true },
    ...patch,
  };
}

function hold(view: LiveGameView) {
  let current = view;
  const listeners = new Set<() => void>();
  const session = {
    getView: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    update(patch: Partial<LiveGameView>) {
      current = { ...current, ...patch };
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
  sessions.byId.set(view.id, session);
  return session;
}

function renderAt(path = `/play/watch/${GAME}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play" element={<p>Play</p>} />
        <Route path="/play/watch/:gameId" element={<WatchGamePage />} />
        <Route path="/play/online/:gameId" element={<p>Your board</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WatchGamePage', () => {
  beforeEach(() => {
    sessions.byId.clear();
    sessions.asked = [];
    board.props = null;
    localStorage.clear();
    vi.mocked(playMoveSound).mockClear();
  });

  it('shows the game read-only from White’s side, with who is to move and how many watch', () => {
    const session = hold(makeView({ moves: ['e2e4'], watchers: 4 }));
    renderAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Patient Bishop v Swift Knight' })).toBe(
      screen.getByRole('heading', { level: 1 }),
    );
    expect(screen.getByText(/5\+3 · Blitz/)).toBeVisible();
    expect(document.title).toBe(`Watching Patient Bishop v Swift Knight · ${siteConfig.name}`);
    expect(board.props).toMatchObject({ viewOnly: true, orientation: 'white' });
    expect(board.props?.movableColor).toBeUndefined();
    expect(screen.getByTestId('live-status')).toHaveTextContent('Swift Knight to move');
    expect(screen.getByTestId('live-watchers')).toHaveTextContent('4 watching');
    expect(screen.queryByRole('button', { name: /Resign|Offer draw|Abort/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Send a phrase' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Flip' }));
    expect(board.props?.orientation).toBe('black');

    // A move from here on sounds; a player who leaves shows as gone.
    session.update({ moves: ['e2e4', 'e7e5'], present: { white: true, black: false } });
    expect(playMoveSound).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('live-status')).toHaveTextContent('Patient Bishop to move');
    expect(screen.getByText('Left')).toBeVisible();
  });

  it('shows a blindfold game’s pieces, and the players’ peeks', () => {
    hold(makeView({ game: 'blindfold', peeks: { white: 1, black: 0 } }));
    renderAt();
    expect(board.props?.className).toBeUndefined();
    expect(screen.getByText(/The players cannot see the pieces; you can/)).toBeVisible();
    expect(screen.getByTestId('watch-peeks')).toHaveTextContent(
      'Peeks used: Patient Bishop 1 of 3, Swift Knight 0 of 3.',
    );
  });

  it('shows a Chess960 game from its start position, named by its number', () => {
    const session = hold(
      makeView({
        game: 'chess960',
        startFen: 'bbqnrknr/pppppppp/8/8/8/8/PPPPPPPP/BBQNRKNR w KQkq - 0 1',
        moves: ['g1h3', 'g8h6'],
      }),
    );
    renderAt();
    expect(screen.getByText('Chess960 · position 192 · 5+3')).toBeVisible();
    expect(screen.getByTestId('watch-variant')).toHaveTextContent('Chess960 · position 192');
    expect(board.props).toMatchObject({ viewOnly: true, chess960: true });
    session.update({ moves: ['g1h3', 'g8h6', 'f1h1'] });
    expect(board.props?.fen).toMatch(/\/BBQNRRK1 b kq /);
    expect(vi.mocked(playMoveSound).mock.calls.at(-1)?.[0]).toMatchObject({ san: 'O-O' });
  });

  it('says who is still buying an army in a draft', () => {
    hold(
      makeView({
        game: 'army',
        opts: { budget: 30 },
        status: 'draft',
        draft: {
          budget: 30,
          deadline: performance.now() + 60_000,
          ready: { white: true, black: false },
          armies: { white: null, black: null },
        },
      }),
    );
    renderAt();
    expect(screen.getByTestId('live-status')).toHaveTextContent(
      'The players are buying their armies.',
    );
    expect(screen.getByTestId('watch-draft')).toHaveTextContent('Patient Bishop: army chosen');
    expect(screen.getByTestId('watch-draft')).toHaveTextContent('Swift Knight: still choosing');
  });

  it('tells the result, and follows the players to their rematch', () => {
    const next = randomId(16);
    const session = hold(makeView({ moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] }));
    hold(makeView({ id: next, white: { name: 'Swift Knight', rating: null } }));
    renderAt();
    session.update({ status: 'over', result: '0-1', reason: 'checkmate' });
    expect(screen.getByTestId('live-status')).toHaveTextContent('Swift Knight won by checkmate.');
    expect(screen.queryByRole('button', { name: 'Watch the rematch' })).toBeNull();
    session.update({ next: { path: `/play/watch/${next}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Watch the rematch' }));
    expect(sessions.asked).toContain(next);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Swift Knight v Swift Knight' }),
    ).toBeVisible();
  });

  it('says when there is no such game, and is waiting while it connects', () => {
    const session = hold(makeView({ connection: 'connecting' }));
    renderAt();
    expect(screen.getByText('Connecting to the game…')).toBeInTheDocument();
    session.update({ missing: true, connection: 'closed' });
    expect(screen.getByRole('heading', { level: 1, name: 'Game not found' })).toBeVisible();
  });

  it('takes a device with a seat in the game to its own board', () => {
    rememberSeat(GAME, randomId(32), 'black');
    renderAt();
    expect(screen.getByText('Your board')).toBeInTheDocument();
    expect(sessions.asked).toEqual([]);
  });
});
