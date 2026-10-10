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
  movableColor?: string;
  dests?: Map<string, string[]>;
  lastMove?: readonly [string, string] | null;
  onMove?: (from: string, to: string) => void;
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
}));

const clearPairing = vi.hoisted(() => vi.fn());
vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({}) as LobbyState) };
});

import { playMoveSound, playSound } from '@/lib/sound';
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
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    claimAt: null,
    chat: [],
    next: null,
    error: null,
    url: null,
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
    close: vi.fn(),
  };
}

type FakeSession = ReturnType<typeof makeSession>;

function hold(source: LiveSource, id: string, view: LiveGameView): FakeSession {
  const session = makeSession(view);
  sessions.byKey.set(`${source}/${id}`, session);
  return session;
}

function renderGame(path = '/play/online/GAME') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play/online" element={<p>Waiting room</p>} />
        <Route path="/play/online/:gameId" element={<LiveGamePage source="relay" />} />
        <Route path="/play/online/lichess/:gameId" element={<LiveGamePage source="lichess" />} />
        <Route path="/games" element={<p>My games</p>} />
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
        clearNotice: vi.fn(),
      },
      true,
    );
    useSettings.getState().reset();
    useFocus.setState({ active: false });
  });

  it('says so when this device has no seat in the game', () => {
    renderGame('/play/online/NOPE');
    expect(sessions.asked).toEqual(['relay/NOPE']);
    expect(screen.getByRole('heading', { level: 1, name: 'No seat in this game' })).toBeVisible();
    expect(screen.getByTestId('live-absent')).toHaveTextContent(
      'This device has no seat in this game. A game belongs to the two players the waiting room paired.',
    );
    fireEvent.click(screen.getByRole('link', { name: 'Go to the waiting room' }));
    expect(screen.getByText('Waiting room')).toBeInTheDocument();
    expect(document.title).toBe(`Live game · ${siteConfig.name}`);
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
    expect(board.props?.movableColor).toBeUndefined();
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
    expect(screen.getByTestId('live-status')).toHaveTextContent(
      'The connection to this game has closed.',
    );
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
      '/play/online',
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
        capabilities: { phrases: false, rematch: false, takeback: true },
      }),
    );
    renderGame('/play/online/lichess/abcd1234');
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
});
