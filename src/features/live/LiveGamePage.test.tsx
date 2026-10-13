import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocus } from '@/app/focus';
import type * as SoundModule from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import type { LiveGameView, LobbyState, LiveSource } from './types';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

/** The board is a chessground instance; a stub that hands its props to the test. */
interface BoardProps {
  fen: string;
  orientation?: string;
  className?: string;
  movableColor?: string;
  dests?: Map<string, string[]>;
  premovable?: boolean;
  chess960?: boolean;
  check?: boolean;
  lastMove?: readonly [string, string] | null;
  onMove?: (from: string, to: string, meta?: { premove: boolean }) => void;
}
const board = vi.hoisted(() => ({ props: null as BoardProps | null }));
vi.mock('@/components/board/Board', () => ({
  Board: (props: BoardProps & { ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

/** The sessions this device holds, by "source/id". */
const sessions = vi.hoisted(() => ({
  byKey: new Map<string, unknown>(),
  asked: [] as string[],
}));
vi.mock('./sessions', () => ({
  getLiveGame: (source: string, id: string) => {
    sessions.asked.push(`${source}/${id}`);
    return sessions.byKey.get(`${source}/${id}`) ?? null;
  },
  watchLiveGame: (id: string) => {
    sessions.asked.push(`watch/${id}`);
    return sessions.byKey.get(`watch/${id}`) ?? null;
  },
}));

const clearPairing = vi.hoisted(() => vi.fn());
vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({}) as LobbyState) };
});

import { playMoveSound, playSound } from '@/lib/sound';
import { useToasts } from '@/components/ui/toastStore';
import LiveGamePage from './LiveGamePage';
import { useLobby } from './lobby';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});

function makeView(patch: Partial<LiveGameView> = {}): LiveGameView {
  return {
    source: 'relay',
    id: 'GAME',
    connection: 'open',
    missing: false,
    you: 'white',
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: null },
    tc: '5+3',
    rated: false,
    moves: [],
    clocks: [],
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    present: { white: true, black: true },
    watching: false,
    watchers: 0,
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

/** A session as sessions.ts hands it out: the view, its listeners, and the actions recorded. */
function makeSession(initial: LiveGameView) {
  let view = initial;
  const listeners = new Set<() => void>();
  return {
    getView: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** A change from the source: a new view, as the session would publish it. */
    update(patch: Partial<LiveGameView>) {
      view = { ...view, ...patch };
      act(() => {
        for (const listener of listeners) listener();
      });
    },
    move: vi.fn(),
    resign: vi.fn(),
    abort: vi.fn(),
    draw: vi.fn(),
    takeback: vi.fn(),
    rematch: vi.fn(),
    claim: vi.fn(),
    say: vi.fn(),
    army: vi.fn(),
    peek: vi.fn(),
    join: vi.fn(),
    analyse: vi.fn(),
    close: vi.fn(),
  };
}

type FakeSession = ReturnType<typeof makeSession>;

/** A session for a game this device plays (`source`), or watches ('watch'). */
function hold(source: LiveSource | 'watch', id: string, view: LiveGameView): FakeSession {
  const session = makeSession(view);
  sessions.byKey.set(`${source}/${id}`, session);
  return session;
}

function renderGame(path = '/play/online/GAME') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play" element={<p>Play</p>} />
        <Route path="/play/online/:gameId" element={<LiveGamePage source="relay" />} />
        <Route path="/play/online/lichess/:gameId" element={<LiveGamePage source="lichess" />} />
        <Route path="/games" element={<p>My games</p>} />
        <Route path="/analyze/together/:roomId" element={<p>The analysis room</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The open dialog with this heading, or null. */
function openDialog(title: string): HTMLElement | null {
  for (const dialog of document.querySelectorAll<HTMLElement>('dialog[open]')) {
    if (dialog.querySelector('h2')?.textContent === title) return dialog;
  }
  return null;
}

const nextTask = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

/** Moves that leave White a pawn on b7, ready to take on a8 and promote. */
const PROMOTION_READY = ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6'];
/** Moves that leave White ready to castle short. */
const CASTLE_READY = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'];
/** Chess960 position 192: the kings on f1 and f8, a knight and a rook beside each. */
const P192 = 'bbqnrknr/pppppppp/8/8/8/8/PPPPPPPP/BBQNRKNR w KQkq - 0 1';

describe('LiveGamePage', () => {
  beforeEach(() => {
    sessions.byKey.clear();
    sessions.asked = [];
    board.props = null;
    vi.mocked(playSound).mockClear();
    vi.mocked(playMoveSound).mockClear();
    clearPairing.mockClear();
    useLobby.setState(
      {
        connection: 'idle',
        seeks: [],
        players: 0,
        mine: null,
        pairing: null,
        notice: null,
        watch: () => () => undefined,
        post: vi.fn(),
        cancel: vi.fn(),
        join: vi.fn(),
        clearPairing,
        invite: vi.fn(),
        invited: null,
        clearInvited: vi.fn(),
        clearNotice: vi.fn(),
      },
      true,
    );
    useSettings.getState().reset();
    useFocus.setState({ active: false });
  });

  it('watches a game this device has no seat in, and says when there is no such game', () => {
    hold('watch', 'GAME', makeView({ watching: true, moves: ['e2e4'], watchers: 3 }));
    const { unmount } = renderGame('/play/online/GAME');
    expect(sessions.asked).toEqual(['relay/GAME', 'watch/GAME']);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Patient Bishop v Swift Knight' }),
    ).toBeVisible();
    expect(screen.getByTestId('live-status')).toHaveTextContent('Swift Knight to move');
    expect(screen.getByTestId('live-watchers')).toHaveTextContent('3 watching');
    unmount();

    renderGame('/play/online/NOPE');
    expect(screen.getByRole('heading', { level: 1, name: 'Game not found' })).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'Back to Play' }));
    expect(screen.getByText('Play')).toBeInTheDocument();
    expect(document.title).toBe(`Live game · ${siteConfig.name}`);
  });

  it('plays a correspondence game: its link while a seat is open, then days left, no premoves', async () => {
    const DAY = 86_400_000;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const session = hold(
      'relay',
      'GAME',
      makeView({
        id: 'GAME',
        tc: '3d',
        open: 'black',
        black: { name: '', rating: null },
        clock: { white: 3 * DAY, black: 3 * DAY, running: null, at: performance.now() },
      }),
    );
    renderGame();
    expect(screen.getByRole('heading', { level: 1, name: 'Correspondence game' })).toBeVisible();
    expect(screen.getByText('Correspondence')).toBeVisible();
    expect(screen.getByTestId('live-status')).toHaveTextContent(
      'Waiting for your friend to take the other seat',
    );
    expect(screen.getByText('Your friend, once they join')).toBeVisible();
    expect(board.props?.movableColor).toBeUndefined();
    expect(screen.queryByTestId('focus-toggle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy watch link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the link' }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/online/GAME`),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Call off the invitation' }));
    expect(session.abort).toHaveBeenCalledTimes(1);

    // Taken: the game is on, with the days left for the side to move.
    session.update({
      open: null,
      black: { name: 'Swift Knight', rating: null },
      clock: {
        white: 2 * DAY + 5 * 3_600_000 + 1000,
        black: 3 * DAY,
        running: 'white',
        at: performance.now(),
      },
    });
    expect(screen.getByTestId('live-status')).toHaveTextContent('Your move');
    expect(screen.getByTestId('live-days-left')).toHaveTextContent('2 days 5 h');
    expect(screen.queryByTestId('live-invite')).toBeNull();
    expect(board.props).toMatchObject({ movableColor: 'white', premovable: false });
    session.update({
      moves: ['e2e4'],
      opponentPresent: false,
      clock: { white: 3 * DAY, black: 3 * DAY, running: 'black', at: performance.now() },
    });
    expect(board.props).toMatchObject({ movableColor: undefined, premovable: false });
    // Away over days is no news.
    expect(screen.queryByText('Left')).toBeNull();
  });

  it('takes a correspondence invitation’s open seat from its link, and becomes the board', () => {
    const watching = hold(
      'watch',
      'GAME',
      makeView({
        watching: true,
        tc: '3d',
        open: 'black',
        black: { name: '', rating: null },
      }),
    );
    renderGame();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Patient Bishop invites you to a correspondence game',
      }),
    ).toBeVisible();
    expect(screen.getByTestId('live-join')).toHaveTextContent(
      '3 days a move: each of you has these days for every move, and plays whenever suits. You play black.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join this game' }));
    expect(watching.join).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
    // Refused (someone was quicker): the button may be tried again.
    watching.update({ error: 'This game has both its players.' });
    expect(screen.getByRole('button', { name: 'Join this game' })).toBeEnabled();

    // The seat is this device's: its board takes over.
    hold('relay', 'GAME', makeView({ tc: '3d', you: 'black' }));
    watching.update({ joined: 'black', error: null });
    expect(sessions.asked).toEqual(['relay/GAME', 'watch/GAME', 'relay/GAME']);
    // The connection that watched goes at once: the players no longer count it as watching.
    expect(watching.close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Correspondence game' })).toBeVisible();
    expect(screen.getByTestId('live-status')).toHaveTextContent('Patient Bishop to move');
  });

  it('invites to a Chess960 game by correspondence, and plays it over days', () => {
    hold(
      'watch',
      'GAME',
      makeView({
        watching: true,
        tc: '3d',
        open: 'black',
        black: { name: '', rating: null },
        game: 'chess960',
        startFen: P192,
      }),
    );
    const { unmount } = renderGame();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Patient Bishop invites you to a Chess960 correspondence game',
      }),
    ).toBeVisible();
    expect(screen.getByTestId('live-join-variant')).toHaveTextContent(
      'Chess960 · position 192: the pieces start in the same shuffled order for both of you.',
    );
    unmount();

    sessions.byKey.clear();
    hold('relay', 'GAME', makeView({ tc: '3d', game: 'chess960', startFen: P192 }));
    renderGame();
    expect(screen.getByRole('heading', { level: 1, name: 'Correspondence game' })).toBeVisible();
    expect(screen.getByTestId('live-variant')).toHaveTextContent('Chess960 · position 192');
    expect(screen.getByText(/3 days a move: play whenever suits/)).toBeVisible();
    expect(board.props).toMatchObject({ chess960: true, premovable: false });
  });

  it('offers a link to watch while the game is on, and says how many watch', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const session = hold('relay', 'GAME', makeView({ id: 'GAME', moves: ['e2e4'] }));
    renderGame();
    expect(screen.queryByTestId('live-watchers')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy watch link' }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/watch/GAME`),
    );
    session.update({ watchers: 2 });
    expect(screen.getByTestId('live-watchers')).toHaveTextContent('2 watching');
    session.update({ status: 'over', result: '1-0', reason: 'resign' });
    expect(screen.queryByRole('button', { name: 'Copy watch link' })).toBeNull();
  });

  it('asks for a Lichess sign-in for a Lichess game it cannot open', () => {
    renderGame('/play/online/lichess/abcd1234');
    expect(sessions.asked).toEqual(['lichess/abcd1234']);
    expect(screen.getByTestId('live-absent')).toHaveTextContent(
      'Sign in to Lichess to play your Lichess games here.',
    );
    expect(screen.getByRole('link', { name: 'Lichess in Settings' })).toHaveAttribute(
      'href',
      '/settings#lichess',
    );
  });

  it('says when the game is gone', () => {
    hold('relay', 'GAME', makeView({ missing: true }));
    renderGame();
    expect(screen.getByTestId('live-absent')).toHaveTextContent(
      'This game is over and gone, or it was never yours.',
    );
  });

  it('lets the pieces move only on your turn, while the game is on and connected', () => {
    const session = hold('relay', 'GAME', makeView());
    renderGame();
    expect(screen.getByRole('heading', { level: 2, name: 'Swift Knight · 5+3' })).toBeVisible();
    expect(screen.getByText('Casual')).toBeVisible();
    expect(screen.getByTestId('live-status')).toHaveTextContent('Your move');
    expect(document.title).toBe(`Your move · Live game · ${siteConfig.name}`);
    expect(board.props?.orientation).toBe('white');
    expect(board.props?.movableColor).toBe('white');
    expect(board.props?.dests?.get('e2')).toEqual(['e3', 'e4']);

    act(() => board.props?.onMove?.('e2', 'e4'));
    expect(session.move).toHaveBeenCalledWith('e2e4');

    session.update({ moves: ['e2e4'] });
    // The opponent's turn: your pieces stay yours to premove with, and no move is legal now.
    expect(board.props?.movableColor).toBe('white');
    expect(board.props?.premovable).toBe(true);
    expect(board.props?.dests?.size).toBe(0);
    expect(board.props?.lastMove).toEqual(['e2', 'e4']);
    expect(screen.getByTestId('live-status')).toHaveTextContent('Swift Knight to move');
    expect(document.title).toBe(`Live game · ${siteConfig.name}`);
    // Not your turn: a stray drop sends nothing.
    act(() => board.props?.onMove?.('d2', 'd4'));
    expect(session.move).toHaveBeenCalledTimes(1);

    session.update({ moves: ['e2e4', 'e7e5'] });
    expect(board.props?.movableColor).toBe('white');
    session.update({ connection: 'reconnecting' });
    expect(screen.getByTestId('live-status')).toHaveTextContent('Reconnecting…');
    expect(board.props?.movableColor).toBe('white');
    session.update({ connection: 'closed' });
    expect(board.props?.movableColor).toBeUndefined();
    expect(board.props?.premovable).toBe(false);
    expect(screen.getByTestId('live-status')).toHaveTextContent(
      'The connection to this game has closed.',
    );
  });

  it('premoves while the opponent thinks, unless switched off or the pieces are hidden', () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4'] }));
    const { unmount } = renderGame();
    expect(board.props).toMatchObject({ movableColor: 'white', premovable: true });
    // The premove is played by the board once the reply is in: it comes as a move of yours.
    session.update({ moves: ['e2e4', 'e7e5'] });
    act(() => board.props?.onMove?.('g1', 'f3', { premove: true }));
    expect(session.move).toHaveBeenCalledWith('g1f3');
    // Over: nothing left to premove.
    session.update({ status: 'over', result: '1-0', reason: 'resign' });
    expect(board.props).toMatchObject({ movableColor: undefined, premovable: false });
    unmount();

    useSettings.getState().update({ livePremoves: false });
    hold('relay', 'GAME', makeView({ moves: ['e2e4'] }));
    const off = renderGame();
    expect(board.props).toMatchObject({ movableColor: undefined, premovable: false });
    off.unmount();
    useSettings.getState().update({ livePremoves: true });

    hold('relay', 'GAME', makeView({ game: 'blindfold', peeks: { white: 0, black: 0 } }));
    renderGame();
    expect(board.props).toMatchObject({ movableColor: 'white', premovable: false });
  });

  it('plays a premoved promotion as a queen, without asking', () => {
    const session = hold('relay', 'GAME', makeView({ moves: PROMOTION_READY }));
    renderGame();
    act(() => board.props?.onMove?.('b7', 'a8', { premove: true }));
    expect(session.move).toHaveBeenCalledWith('b7a8q');
    expect(screen.queryByRole('dialog', { name: 'Choose a piece to promote to' })).toBeNull();
  });

  it('plays Black from the other side, and flips on request', () => {
    hold('relay', 'GAME', makeView({ you: 'black', moves: ['d2d4'] }));
    renderGame();
    expect(board.props?.orientation).toBe('black');
    expect(board.props?.movableColor).toBe('black');
    expect(screen.getByRole('heading', { level: 2, name: 'Patient Bishop · 5+3' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }));
    expect(board.props?.orientation).toBe('white');
  });

  it('sends castling as the king’s move and a promotion with its piece', () => {
    const session = hold('relay', 'GAME', makeView({ moves: CASTLE_READY }));
    const { unmount } = renderGame();
    act(() => board.props?.onMove?.('e1', 'g1'));
    expect(session.move).toHaveBeenLastCalledWith('e1g1');
    unmount();

    const promoting = hold('relay', 'GAME', makeView({ moves: PROMOTION_READY }));
    renderGame();
    act(() => board.props?.onMove?.('b7', 'a8'));
    expect(promoting.move).not.toHaveBeenCalled();
    const picker = screen.getByRole('dialog', { name: 'Choose a piece to promote to' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(promoting.move).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Choose a piece to promote to' })).toBeNull();

    act(() => board.props?.onMove?.('b7', 'a8'));
    fireEvent.click(screen.getByRole('button', { name: 'Knight' }));
    expect(promoting.move).toHaveBeenCalledWith('b7a8n');
  });

  it('plays Chess960 by its rules: the position named, castling onto the rook, premoves', () => {
    const session = hold(
      'relay',
      'GAME',
      makeView({ game: 'chess960', startFen: P192, moves: ['g1h3', 'g8h6'] }),
    );
    renderGame();
    expect(screen.getByRole('heading', { level: 1, name: 'Chess960' })).toBeVisible();
    expect(screen.getByTestId('live-variant')).toHaveTextContent('Chess960 · position 192');
    expect(document.title).toBe(`Your move · Chess960 · ${siteConfig.name}`);
    expect(board.props).toMatchObject({ chess960: true, movableColor: 'white' });
    expect(board.props?.fen).toMatch(/^bbqnrk1r\/.*\/BBQNRK1R w KQkq /);
    // The king castles onto its rook (h1), or steps to g1: two different moves.
    expect(board.props?.dests?.get('f1')).toEqual(expect.arrayContaining(['g1', 'h1']));
    act(() => board.props?.onMove?.('f1', 'h1'));
    expect(session.move).toHaveBeenLastCalledWith('f1h1');

    session.update({ moves: ['g1h3', 'g8h6', 'f1h1'] });
    expect(vi.mocked(playMoveSound).mock.calls.at(-1)?.[0]).toMatchObject({ san: 'O-O' });
    expect(screen.getByRole('region', { name: 'Move list' })).toHaveTextContent('1.Nh3Nh62.O-O');
    expect(board.props?.fen).toMatch(/\/BBQNRRK1 b kq /);
    // The opponent's turn: premoves, Chess960's castling among them, wait for it.
    expect(board.props).toMatchObject({ premovable: true, dests: new Map() });
    session.update({ moves: ['g1h3', 'g8h6', 'f1h1', 'f8h8'] });
    act(() => board.props?.onMove?.('h3', 'g5', { premove: true }));
    expect(session.move).toHaveBeenLastCalledWith('h3g5');
  });

  it('asks for the promotion piece in Chess960 too', () => {
    const session = hold(
      'relay',
      'GAME',
      makeView({
        game: 'chess960',
        startFen: P192,
        moves: ['b2b4', 'a7a5', 'b4a5', 'b7b6', 'a5b6', 'c8a6', 'b6b7', 'h7h6'],
      }),
    );
    renderGame();
    act(() => board.props?.onMove?.('b7', 'a8'));
    fireEvent.click(screen.getByRole('button', { name: 'Queen' }));
    expect(session.move).toHaveBeenCalledWith('b7a8q');
  });

  it('counts down the first move, and offers to abort before both sides have moved', () => {
    const session = hold(
      'relay',
      'GAME',
      makeView({ firstMove: { color: 'white', deadline: performance.now() + 41_500 } }),
    );
    renderGame();
    expect(screen.getByTestId('live-first-move')).toHaveTextContent(
      'White must move within 0:42, or the game is aborted.',
    );
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Offer draw' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abort' }));
    expect(session.abort).toHaveBeenCalledTimes(1);
  });

  it('shows both clocks, the running one counting down', () => {
    hold(
      'relay',
      'GAME',
      makeView({
        moves: ['e2e4', 'e7e5'],
        clock: { white: 65_000, black: 300_000, running: 'white', at: performance.now() },
      }),
    );
    renderGame();
    const clocks = screen.getAllByRole('timer').map((t) => t.textContent);
    // Swift Knight (Black) at the top, you at the bottom.
    expect(clocks).toEqual(['5:00', '1:05']);
    expect(playSound).not.toHaveBeenCalledWith('lowTime');
  });

  it('warns once when your clock runs under ten seconds', () => {
    const session = hold(
      'relay',
      'GAME',
      makeView({
        moves: ['e2e4', 'e7e5'],
        clock: { white: 9_000, black: 300_000, running: 'white', at: performance.now() },
      }),
    );
    renderGame();
    expect(playSound).toHaveBeenCalledWith('lowTime');
    session.update({
      clock: { white: 8_000, black: 300_000, running: 'white', at: performance.now() },
    });
    expect(vi.mocked(playSound).mock.calls.filter(([name]) => name === 'lowTime')).toHaveLength(1);
  });

  it('offers a draw and a takeback, resigns after asking, and answers the opponent’s offers', async () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5', 'g1f3'] }));
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Offer draw' }));
    expect(session.draw).toHaveBeenCalledWith('offer');
    session.update({ offers: { draw: 'white', takeback: null, rematch: null } });
    expect(screen.getByRole('button', { name: 'Draw offered' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Takeback' }));
    expect(session.takeback).toHaveBeenCalledWith('offer');
    session.update({ offers: { draw: null, takeback: 'white', rematch: null } });
    expect(screen.getByRole('button', { name: 'Takeback asked' })).toBeDisabled();

    session.update({
      moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      offers: { draw: 'black', takeback: 'black', rematch: null },
    });
    const draw = screen.getByTestId('live-draw-offer');
    expect(draw).toHaveTextContent('Swift Knight offers a draw.');
    fireEvent.click(within(draw).getByRole('button', { name: 'Decline' }));
    expect(session.draw).toHaveBeenLastCalledWith('decline');
    fireEvent.click(within(draw).getByRole('button', { name: 'Accept' }));
    expect(session.draw).toHaveBeenLastCalledWith('accept');
    const takeback = screen.getByTestId('live-takeback-offer');
    expect(takeback).toHaveTextContent('Swift Knight asks to take back a move.');
    fireEvent.click(within(takeback).getByRole('button', { name: 'Accept' }));
    expect(session.takeback).toHaveBeenLastCalledWith('accept');

    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    const confirm = openDialog('Resign this game?')!;
    fireEvent.click(within(confirm).getByTestId('confirm-cancel'));
    await nextTask();
    expect(session.resign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    fireEvent.click(within(openDialog('Resign this game?')!).getByTestId('confirm-accept'));
    await nextTask();
    expect(session.resign).toHaveBeenCalledTimes(1);
  });

  it('drops the question about resigning when the game ends meanwhile', async () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    expect(openDialog('Resign this game?')).not.toBeNull();
    session.update({ status: 'over', result: '1-0', reason: 'time' });
    await nextTask();
    expect(openDialog('Resign this game?')).toBeNull();
    expect(openDialog('You won!')).not.toBeNull();
    expect(session.resign).not.toHaveBeenCalled();
  });

  it('does not ask for a takeback the relay cannot grant', () => {
    hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    renderGame();
    expect(screen.getByRole('button', { name: 'Takeback' })).toBeDisabled();
  });

  it('lets you claim the game once the opponent has been gone long enough', () => {
    const session = hold(
      'relay',
      'GAME',
      makeView({
        moves: ['e2e4', 'e7e5'],
        opponentPresent: false,
        claimAt: performance.now() + 22_500,
      }),
    );
    renderGame();
    expect(screen.getByText('Left')).toBeVisible();
    const left = screen.getByTestId('live-left');
    expect(left).toHaveTextContent('Swift Knight has left the game.');
    expect(left).toHaveTextContent('You can claim the game in 0:23.');
    expect(within(left).queryByRole('button')).toBeNull();

    session.update({ claimAt: performance.now() - 1 });
    const ready = screen.getByTestId('live-left');
    fireEvent.click(within(ready).getByRole('button', { name: 'Claim the win' }));
    expect(session.claim).toHaveBeenCalledWith('win');
    fireEvent.click(within(ready).getByRole('button', { name: 'Call it a draw' }));
    expect(session.claim).toHaveBeenCalledWith('draw');

    session.update({ opponentPresent: true, claimAt: null });
    expect(screen.queryByTestId('live-left')).toBeNull();
    expect(screen.queryByText('Left')).toBeNull();
  });

  it('sends set phrases and shows the latest', () => {
    const session = hold('relay', 'GAME', makeView());
    renderGame();
    const phrases = screen.getByRole('group', { name: 'Send a phrase' });
    expect(
      within(phrases)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Hello', 'Good luck', 'Have fun', 'Well played', 'Good game', 'Thank you', 'Oops']);
    expect(screen.getByText('Only these set phrases can be sent.')).toBeVisible();
    fireEvent.click(within(phrases).getByRole('button', { name: 'Good luck' }));
    expect(session.say).toHaveBeenCalledWith('luck');

    session.update({
      chat: [
        { by: 'white', text: 'Hello' },
        { by: 'black', text: 'Good luck' },
      ],
    });
    const chat = screen.getByRole('list', { name: 'Messages so far' });
    expect(chat).toHaveAttribute('aria-live', 'polite');
    expect(
      within(chat)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['You: Hello', 'Swift Knight: Good luck']);
  });

  it('shows the moves in the move list', () => {
    hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5', 'g1f3'] }));
    renderGame();
    const list = screen.getByRole('region', { name: 'Move list' });
    expect(list).toHaveTextContent('1.e4e52.Nf3');
  });

  it('plays a sound for each new move and for the end, but not for what came before', () => {
    const session = hold('relay', 'GAME', makeView({ connection: 'connecting' }));
    renderGame();
    // The snapshot on connecting is not news.
    session.update({ connection: 'open', moves: ['e2e4'] });
    expect(playMoveSound).not.toHaveBeenCalled();

    session.update({ moves: ['e2e4', 'e7e5'] });
    expect(playMoveSound).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playMoveSound).mock.calls[0]?.[0]).toMatchObject({ san: 'e5' });

    session.update({ moves: ['e2e4', 'e7e5', 'd1h5'] });
    expect(playMoveSound).toHaveBeenCalledTimes(2);

    session.update({ status: 'over', result: '0-1', reason: 'resign' });
    expect(playSound).toHaveBeenCalledWith('gameLost');
  });

  it('turns focus mode on while the game is on, if the setting is', () => {
    useSettings.getState().update({ playFocus: true });
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4'] }));
    renderGame();
    expect(useFocus.getState().active).toBe(true);
    session.update({ status: 'over', result: '1-0', reason: 'resign' });
    expect(useFocus.getState().active).toBe(false);
  });

  it('says how the game ended, from your side', async () => {
    const cases: [Partial<LiveGameView>, string, string][] = [
      [{ result: '1-0', reason: 'checkmate' }, 'You won!', 'By checkmate.'],
      [{ result: '0-1', reason: 'time' }, 'You lost', 'On time.'],
      [{ result: '1-0', reason: 'resign', you: 'black' }, 'You lost', 'You resigned.'],
      [{ result: '1-0', reason: 'resign' }, 'You won!', 'Swift Knight resigned.'],
      [{ result: '1/2-1/2', reason: 'agreement' }, 'Draw', 'By agreement.'],
      [{ result: '1/2-1/2', reason: 'abandoned' }, 'Draw', 'Drawn: Swift Knight left the game.'],
      [{ result: '1-0', reason: 'abandoned' }, 'You won!', 'Swift Knight left the game.'],
      [{ result: '1/2-1/2', reason: 'repetition' }, 'Draw', 'By threefold repetition.'],
      [{ result: null, reason: 'no-start' }, 'Game aborted', 'Nobody moved in time.'],
    ];
    for (const [patch, title, sentence] of cases) {
      const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
      const { unmount } = renderGame();
      session.update({ status: 'over', ...patch });
      const dialog = openDialog(title);
      expect(dialog, title).not.toBeNull();
      expect(within(dialog!).getByTestId('live-end-sentence')).toHaveTextContent(sentence);
      unmount();
      await nextTask();
    }
  });

  it('closes the result to show the board, and keeps the way on in the panel', async () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    renderGame();
    session.update({ status: 'over', result: '1-0', reason: 'checkmate' });
    const dialog = openDialog('You won!')!;
    expect(within(dialog).getByRole('link', { name: 'Review in My games' })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(within(dialog).getByRole('link', { name: 'New opponent' })).toHaveAttribute(
      'href',
      '/play',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show the board' }));
    await nextTask();
    expect(openDialog('You won!')).toBeNull();
    expect(screen.getByTestId('live-status')).toHaveTextContent('You won. By checkmate.');
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull();
    expect(board.props?.movableColor).toBeUndefined();
  });

  it('keeps an aborted game out of My games', () => {
    const session = hold('relay', 'GAME', makeView());
    renderGame();
    session.update({ status: 'over', result: null, reason: 'aborted' });
    const dialog = openDialog('Game aborted')!;
    expect(within(dialog).queryByRole('link', { name: 'Review in My games' })).toBeNull();
  });

  it('offers a rematch, and goes to it once it is agreed', () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    const next = hold('relay', 'NEXT', makeView({ id: 'NEXT', you: 'black' }));
    renderGame();
    session.update({ status: 'over', result: '1/2-1/2', reason: 'agreement' });
    const dialog = openDialog('Draw')!;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rematch' }));
    expect(session.rematch).toHaveBeenCalledWith('offer');
    session.update({ offers: { draw: null, takeback: null, rematch: 'white' } });
    expect(within(dialog).getByRole('button', { name: 'Rematch offered' })).toBeDisabled();

    session.update({ next: { path: '/play/online/NEXT' } });
    expect(playSound).toHaveBeenCalledWith('notify');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play the rematch' }));
    expect(sessions.asked).toContain('relay/NEXT');
    expect(next.getView().you).toBe('black');
    expect(board.props?.orientation).toBe('black');
    expect(openDialog('Draw')).toBeNull();
  });

  it('goes to the game’s analysis room, and says when the opponent is there', async () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    renderGame();
    // Not while the game is on.
    expect(screen.queryByTestId('analyse-together')).toBeNull();
    session.update({ status: 'over', result: '1-0', reason: 'resign' });
    let dialog = openDialog('You won!')!;
    session.analyse.mockRejectedValueOnce(new Error('The analysis room could not be made.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Analyse together' }));
    await nextTask();
    expect(useToasts.getState().toasts.map((t) => t.message)).toContain(
      'The analysis room could not be made.',
    );

    session.update({ analysis: { room: 'A'.repeat(22), by: 'black' } });
    dialog = openDialog('You won!')!;
    expect(dialog).toHaveTextContent('Swift Knight is analysing the game: join them.');
    session.analyse.mockResolvedValueOnce('A'.repeat(22));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join the analysis' }));
    await nextTask();
    expect(session.analyse).toHaveBeenCalledTimes(2);
    expect(screen.getByText('The analysis room')).toBeInTheDocument();
  });

  it('says in the result why a rematch was refused, and on the board once it is shown', async () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    renderGame();
    session.update({ status: 'over', result: '1-0', reason: 'resign' });
    const dialog = openDialog('You won!')!;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rematch' }));
    const words = 'No more rematches after 30 in a row: start a new game from Play.';
    session.update({ error: words });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(words);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(dialog).getByRole('link', { name: 'New opponent' })).toHaveAttribute(
      'href',
      '/play',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show the board' }));
    await nextTask();
    expect(screen.getByRole('alert')).toHaveTextContent(words);
  });

  it('answers the opponent’s rematch offer', () => {
    const session = hold('relay', 'GAME', makeView({ moves: ['e2e4', 'e7e5'] }));
    renderGame();
    session.update({
      status: 'over',
      result: '1-0',
      reason: 'resign',
      offers: { draw: null, takeback: null, rematch: 'black' },
    });
    const dialog = openDialog('You won!')!;
    expect(dialog).toHaveTextContent('Swift Knight wants a rematch.');
    const offer = screen.getByTestId('live-rematch-offer');
    expect(offer).toHaveTextContent('Swift Knight wants a rematch.');
    fireEvent.click(within(offer).getByRole('button', { name: 'Decline' }));
    expect(session.rematch).toHaveBeenLastCalledWith('decline');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept the rematch' }));
    expect(session.rematch).toHaveBeenLastCalledWith('accept');
  });

  it('plays a Lichess game with Lichess’s links and without phrases or rematches', () => {
    const session = hold(
      'lichess',
      'abcd1234',
      makeView({
        source: 'lichess',
        id: 'abcd1234',
        rated: true,
        white: { name: 'Magnus', rating: 2850, title: 'GM' },
        black: { name: 'me', rating: 1600 },
        you: 'black',
        moves: ['e2e4'],
        url: 'https://lichess.org/abcd1234',
        game: 'chess',
        opts: {},
        startFen: null,
        draft: null,
        peeks: null,
        capabilities: { phrases: false, rematch: false, takeback: true },
      }),
    );
    renderGame('/play/online/lichess/abcd1234');
    // Premoves work on Lichess too: Black has replied, and may premove while White thinks.
    session.update({ moves: ['e2e4', 'c7c5'] });
    expect(board.props).toMatchObject({ movableColor: 'black', premovable: true });
    expect(screen.getByText('Rated on Lichess')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Magnus · 5+3' })).toBeVisible();
    expect(screen.getByText('GM')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Send a phrase' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open on Lichess' })).toHaveAttribute(
      'href',
      'https://lichess.org/abcd1234',
    );
    session.update({ status: 'over', result: '1/2-1/2', reason: 'draw' });
    const dialog = openDialog('Draw')!;
    expect(dialog).toHaveTextContent('The game was drawn.');
    expect(within(dialog).queryByRole('button', { name: /Rematch/ })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Open on Lichess' })).toHaveAttribute(
      'href',
      'https://lichess.org/abcd1234',
    );
  });

  it('shows what the game refused', () => {
    const session = hold('relay', 'GAME', makeView());
    renderGame();
    session.update({ error: 'That move is not legal.' });
    expect(screen.getByRole('alert')).toHaveTextContent('That move is not legal.');
  });

  it('clears the waiting room’s news of this game once its board shows', () => {
    useLobby.setState({
      pairing: {
        source: 'relay',
        game: 'GAME',
        kind: 'chess',
        opts: {},
        color: 'white',
        tc: '5+3',
        opponent: { name: 'Swift Knight', rating: null },
        at: Date.now(),
        path: '/play/online/GAME',
      },
    });
    hold('relay', 'GAME', makeView());
    renderGame();
    expect(clearPairing).toHaveBeenCalledTimes(1);
  });

  it('lets each player buy an army while the draft is on, and starts the board once both are in', () => {
    const draft = {
      budget: 30,
      deadline: performance.now() + 90_000,
      ready: { white: false, black: false },
      armies: { white: null, black: null },
    };
    const session = hold(
      'relay',
      'GAME',
      makeView({ game: 'army', opts: { budget: 30 }, status: 'draft', draft }),
    );
    renderGame();
    expect(screen.getByRole('heading', { level: 1, name: 'Army Draft' })).toBeVisible();
    expect(screen.getByText(/^30 points · Kings are free/)).toBeVisible();
    expect(screen.getByTestId('draft-time')).toHaveTextContent('1:30');
    expect(screen.getByTestId('draft-theirs')).toHaveTextContent('Swift Knight is choosing…');
    // The balanced army to start from: a queen, two rooks, a bishop, a knight and five pawns.
    expect(screen.getByTestId('army-budget')).toHaveTextContent('30 / 30');
    fireEvent.click(screen.getByRole('button', { name: 'Remove a queen' }));
    expect(screen.getByTestId('army-budget')).toHaveTextContent('21 / 30');
    fireEvent.click(screen.getByTestId('draft-ready'));
    expect(session.army).toHaveBeenCalledWith({ q: 0, r: 2, b: 1, n: 1, p: 5 });
    session.update({
      draft: {
        ...draft,
        ready: { white: true, black: true },
        armies: { ...draft.armies, white: { q: 0, r: 2, b: 1, n: 1, p: 5 } },
      },
    });
    expect(screen.getByTestId('draft-mine')).toHaveTextContent('Your army is in.');
    expect(screen.getByTestId('draft-theirs')).toHaveTextContent('Swift Knight’s army is in.');
    expect(screen.queryByTestId('draft-ready')).toBeNull();
    // The game starts from both armies.
    const startFen = '1nb1kbnr/3pp3/8/8/8/8/1PPPPPP1/R1B1KN1R w - - 0 1';
    session.update({
      status: 'playing',
      startFen,
      draft: {
        ...draft,
        deadline: null,
        ready: { white: true, black: true },
        armies: {
          white: { q: 0, r: 2, b: 1, n: 1, p: 5 },
          black: { q: 0, r: 0, b: 2, n: 2, p: 2 },
        },
      },
    });
    expect(board.props?.fen).toBe(startFen);
    expect(screen.getByTestId('live-armies')).toHaveTextContent(
      'You: 2 rooks, 1 bishop, 1 knight, 5 pawns. Swift Knight: 2 bishops, 2 knights, 2 pawns.',
    );
  });

  it('hides the pieces in a blindfold game but for a peek, and takes moves typed in', () => {
    vi.useFakeTimers();
    try {
      const session = hold(
        'relay',
        'GAME',
        makeView({ game: 'blindfold', peeks: { white: 1, black: 0 }, moves: ['e2e4', 'e7e5'] }),
      );
      renderGame();
      expect(screen.getByRole('heading', { level: 1, name: 'Blindfold game' })).toBeVisible();
      expect(board.props?.className).toBe('board--blindfold');
      expect(screen.getByTestId('blindfold-bar')).toHaveTextContent('Last move: 1… e5');
      expect(screen.getByTestId('blindfold-peeks')).toHaveTextContent(
        'You have 2 peeks left; Swift Knight has used 0.',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Peek' }));
      expect(session.peek).toHaveBeenCalledTimes(1);
      expect(board.props?.className).toBeUndefined();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(board.props?.className).toBe('board--blindfold');
      const input = screen.getByPlaceholderText('Type a move, e.g. Nf3 or e2e4');
      fireEvent.change(input, { target: { value: 'Nf3' } });
      fireEvent.submit(input.closest('form')!);
      expect(session.move).toHaveBeenCalledWith('g1f3');
      // No peeks left: the button says so by being off.
      session.update({ peeks: { white: 3, black: 0 } });
      expect(screen.getByRole('button', { name: 'Peek' })).toBeDisabled();
      // Over: the pieces show again.
      session.update({ status: 'over', result: '1-0', reason: 'resign' });
      expect(board.props?.className).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
