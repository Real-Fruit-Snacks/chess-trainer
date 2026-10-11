import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import { siteConfig } from '@/site.config';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import type { LivePrefsState } from './prefs';
import type { LobbyState, MySeek } from './types';

/** The waiting room's store: real zustand, with the actions recorded. */
const actions = vi.hoisted(() => ({
  watch: vi.fn(),
  unwatch: vi.fn(),
  post: vi.fn(),
  cancel: vi.fn(),
  join: vi.fn(),
  clearPairing: vi.fn(),
  clearNotice: vi.fn(),
}));

vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({}) as LobbyState) };
});

vi.mock('./prefs', async () => {
  const { create } = await import('zustand');
  return { useLivePrefs: create<LivePrefsState>()(() => ({}) as LivePrefsState) };
});

const lichessLive = vi.hoisted(() => ({
  reconnect: vi.fn((_returnTo: string) => Promise.resolve()),
}));
vi.mock('./lichessLive', () => ({
  // Rapid and slower, as Lichess takes them from apps.
  lichessSeekAllowed: (tc: { initialMs: number; incrementMs: number }) =>
    tc.initialMs + 40 * tc.incrementMs >= 480_000,
  reconnectLichessForLive: (returnTo: string) => lichessLive.reconnect(returnTo),
}));

import PlayHubPage from './PlayHubPage';
import { useLobby } from './lobby';
import { useLivePrefs } from './prefs';

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

function resetLobby(patch: Partial<LobbyState> = {}) {
  useLobby.setState(
    {
      connection: 'open',
      seeks: [],
      players: 1,
      mine: null,
      pairing: null,
      notice: null,
      watch: () => {
        actions.watch();
        return actions.unwatch;
      },
      post: actions.post,
      cancel: actions.cancel,
      join: actions.join,
      clearPairing: () => {
        actions.clearPairing();
        useLobby.setState({ pairing: null });
      },
      clearNotice: () => {
        actions.clearNotice();
        useLobby.setState({ notice: null });
      },
      ...patch,
    },
    true,
  );
}

const rollName = vi.fn();

function resetPrefs() {
  useLivePrefs.setState(
    {
      name: 'Patient Bishop',
      showRating: true,
      lichess: false,
      lichessRated: false,
      color: 'random',
      tc: '5+3',
      rollName,
      update: (patch) => useLivePrefs.setState(patch),
    },
    true,
  );
}

function connectLichess() {
  useLichess.setState({
    account: { id: 'me', username: 'Me', token: 't', connectedAt: 1, expiresAt: null },
  });
}

function seek(patch: Partial<MySeek> = {}): MySeek {
  return {
    id: 'AAAAAAAAAAAAAAAAAAAAAA',
    game: 'chess',
    opts: {},
    tc: '5+3',
    color: 'random',
    private: false,
    postedAt: Date.now(),
    relay: 'posted',
    lichess: { status: 'off', rated: false, message: null },
    ...patch,
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(path = '/play') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/play"
          element={
            <>
              <PlayHubPage />
              <Where />
            </>
          }
        />
        <Route path="/play/online/:gameId" element={<p>The board</p>} />
        <Route path="/play/duel/:gameId" element={<p>The duel</p>} />
        <Route path="/play/computer" element={<Where />} />
        <Route path="/settings" element={<p>Settings</p>} />
        <Route path="/arcade/*" element={<Where />} />
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

describe('PlayHubPage', () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockClear();
    rollName.mockClear();
    lichessLive.reconnect.mockClear();
    resetLobby();
    resetPrefs();
    useLichess.setState({ account: null });
    useProgress.setState({ puzzleRating: 1523.4 });
    useToasts.setState({ toasts: [] });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('keeps the waiting room connected while it shows', () => {
    const { unmount } = renderPage();
    expect(document.title).toBe(`Play · ${siteConfig.name}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Play' })).toBeInTheDocument();
    expect(actions.watch).toHaveBeenCalledTimes(1);
    expect(actions.unwatch).not.toHaveBeenCalled();
    unmount();
    expect(actions.unwatch).toHaveBeenCalledTimes(1);
  });

  it('posts a game at a tap, in the colour chosen', () => {
    renderPage();
    const post = screen.getByTestId('live-post');
    const tiles = within(within(post).getByRole('group')).getAllByRole('button');
    expect(tiles.map((t) => t.textContent)).toEqual([
      '1+0 Bullet',
      '2+1 Bullet',
      '3+0 Blitz',
      '3+2 Blitz',
      '5+0 Blitz',
      '5+3 Blitz',
      '10+0 Rapid',
      '10+5 Rapid',
      '15+10 Rapid',
      '30+0 Classical',
      '30+20 Classical',
      'Custom Set your own',
    ]);

    fireEvent.click(within(post).getByRole('radio', { name: 'White' }));
    expect(useLivePrefs.getState().color).toBe('white');
    fireEvent.click(within(post).getByRole('button', { name: '10+5 Rapid' }));
    expect(actions.post).toHaveBeenCalledWith({
      game: 'chess',
      tc: '10+5',
      color: 'white',
      private: false,
      lichess: null,
    });
    expect(useLivePrefs.getState().tc).toBe('10+5');
  });

  it('posts a custom time control within the limits', async () => {
    useLivePrefs.setState({ tc: '15+10' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Custom Set your own' }));
    const dialog = openDialog('Custom time control')!;
    const minutes = within(dialog).getByLabelText('Minutes per side');
    const seconds = within(dialog).getByLabelText('Seconds added per move');
    // It starts from the last time control posted.
    expect(minutes).toHaveValue(15);
    expect(seconds).toHaveValue(10);
    expect(within(dialog).getByTestId('live-custom-preview')).toHaveTextContent('15+10 · Rapid');

    fireEvent.change(minutes, { target: { value: '0' } });
    const postButton = within(dialog).getByRole('button', { name: 'Post' });
    expect(postButton).toBeDisabled();
    fireEvent.change(minutes, { target: { value: '181' } });
    expect(postButton).toBeDisabled();
    fireEvent.change(minutes, { target: { value: '4' } });
    fireEvent.change(seconds, { target: { value: '2' } });
    expect(within(dialog).getByTestId('live-custom-preview')).toHaveTextContent('4+2 · Blitz');
    fireEvent.click(postButton);
    await nextTask();
    expect(actions.post).toHaveBeenCalledWith({
      game: 'chess',
      tc: '4+2',
      color: 'random',
      private: false,
      lichess: null,
    });
    expect(openDialog('Custom time control')).toBeNull();
  });

  it('looks on Lichess too when signed in, rated if asked, and never for a friend’s game', async () => {
    connectLichess();
    renderPage();
    const post = screen.getByTestId('live-post');
    const also = within(post).getByRole('switch', { name: 'Also look on Lichess' });
    expect(also).not.toBeChecked();
    expect(within(post).queryByRole('switch', { name: 'Rated on Lichess' })).toBeNull();
    expect(post).toHaveTextContent('whoever accepts first plays you');

    fireEvent.click(also);
    expect(useLivePrefs.getState().lichess).toBe(true);
    fireEvent.click(within(post).getByRole('button', { name: '10+5 Rapid' }));
    expect(actions.post).toHaveBeenLastCalledWith(
      expect.objectContaining({ tc: '10+5', lichess: { rated: false } }),
    );

    fireEvent.click(within(post).getByRole('switch', { name: 'Rated on Lichess' }));
    expect(useLivePrefs.getState().lichessRated).toBe(true);
    fireEvent.click(within(post).getByRole('button', { name: '15+10 Rapid' }));
    expect(actions.post).toHaveBeenLastCalledWith(
      expect.objectContaining({ tc: '15+10', lichess: { rated: true } }),
    );

    fireEvent.click(within(post).getByRole('button', { name: 'Invite a friend' }));
    const invite = openDialog('Invite a friend')!;
    fireEvent.click(within(invite).getByRole('button', { name: 'Create the link' }));
    await nextTask();
    expect(actions.post).toHaveBeenLastCalledWith(
      expect.objectContaining({ game: 'chess', private: true, lichess: null }),
    );
  });

  it('points to Settings when no Lichess account is connected', () => {
    renderPage();
    expect(screen.queryByRole('switch', { name: 'Also look on Lichess' })).toBeNull();
    const link = screen.getByRole('link', { name: 'Sign in to Lichess in Settings' });
    expect(link).toHaveAttribute('href', '/settings#lichess');
    expect(link.closest('p')).toHaveTextContent(
      'Sign in to Lichess in Settings to look for opponents there too.',
    );
  });

  it('shows the posted game in place of the grid, where it is posted, and cancels it', () => {
    resetLobby({
      mine: seek({
        relay: 'posted',
        private: true,
        lichess: { status: 'posting', rated: true, message: null },
      }),
    });
    renderPage();
    expect(screen.queryByTestId('live-post')).toBeNull();
    const waiting = screen.getByTestId('live-waiting');
    expect(within(waiting).getByRole('heading', { name: 'Waiting for your friend' })).toBeVisible();
    expect(waiting).toHaveTextContent('5+3 · Blitz · Random colour · Only people with the link');
    expect(within(waiting).getByTestId('live-elapsed')).toHaveTextContent('0:00');
    const places = within(waiting)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(places).toEqual(['Here: posted', 'On Lichess: posting…']);
    expect(waiting).toHaveTextContent(
      'You can leave this page: your game stays posted while the app is open.',
    );
    expect(within(waiting).queryByTestId('live-nudge')).toBeNull();

    fireEvent.click(within(waiting).getByRole('button', { name: 'Cancel' }));
    expect(actions.cancel).toHaveBeenCalledTimes(1);
  });

  it('says what stands in the way on Lichess, and asks for the permission to play', () => {
    resetLobby({
      mine: seek({
        tc: '10+0',
        lichess: {
          status: 'needs-permission',
          rated: false,
          message: 'Your sign-in may not play games yet.',
        },
      }),
    });
    renderPage();
    const waiting = screen.getByTestId('live-waiting');
    expect(waiting).toHaveTextContent('On Lichess: Your sign-in may not play games yet.');
    fireEvent.click(within(waiting).getByRole('button', { name: 'Allow live games on Lichess' }));
    expect(lichessLive.reconnect).toHaveBeenCalledWith('/play');
  });

  it('shows a failed Lichess post with its reason', () => {
    resetLobby({
      mine: seek({
        relay: 'failed',
        lichess: { status: 'failed', rated: false, message: 'Lichess did not answer.' },
      }),
    });
    renderPage();
    const waiting = screen.getByTestId('live-waiting');
    expect(
      within(waiting)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Here: failed', 'On Lichess: failed: Lichess did not answer.']);
    expect(within(waiting).queryByRole('button', { name: /Allow live games/ })).toBeNull();
  });

  it('copies the link to the posted game where the device cannot share', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    resetLobby({ mine: seek({ id: 'abcdefghijklmnopqrstuv' }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
    await nextTask();
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/play?join=abcdefghijklmnopqrstuv`,
    );
    expect(useToasts.getState().toasts.map((t) => t.message)).toContain('Link copied.');
  });

  it('shares the link where the device can', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    resetLobby({ mine: seek({ id: 'abcdefghijklmnopqrstuv' }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
    await nextTask();
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${window.location.origin}/play?join=abcdefghijklmnopqrstuv`,
      }),
    );
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('suggests the human-like computer after three minutes with nobody', () => {
    resetLobby({ mine: seek({ postedAt: Date.now() - 181_000 }) });
    renderPage();
    const nudge = screen.getByTestId('live-nudge');
    expect(nudge).toHaveTextContent(
      'Nobody yet. Play the human-like computer while you wait? Your game stays posted.',
    );
    fireEvent.click(within(nudge).getByRole('link', { name: 'Play the human-like computer' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/play/computer?opponent=humanlike');
  });

  it('lists the open games, and joins one', () => {
    resetLobby({
      players: 3,
      seeks: [
        {
          id: 'BBBBBBBBBBBBBBBBBBBBBB',
          game: 'chess',
          opts: {},
          tc: '3+2',
          color: 'white',
          name: 'Swift Knight',
          rating: 1640,
        },
        {
          id: 'CCCCCCCCCCCCCCCCCCCCCC',
          game: 'chess',
          opts: {},
          tc: '15+10',
          color: 'random',
          name: 'Calm Rook',
          rating: null,
        },
        {
          id: 'FFFFFFFFFFFFFFFFFFFFFF',
          game: 'race',
          opts: { format: 'best3', level: 1500 },
          tc: null,
          color: 'random',
          name: 'Quiet Rook',
          rating: null,
        },
      ],
    });
    renderPage();
    expect(screen.getByTestId('live-players')).toHaveTextContent('2 other players here');
    const list = within(screen.getByRole('region', { name: 'Open games' })).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Swift Knight 1640');
    expect(items[0]).toHaveTextContent('3+2 · Blitz · Plays white');
    expect(items[1]).toHaveTextContent('15+10 · Rapid · Random colour');
    expect(items[1]).not.toHaveTextContent('null');
    expect(items[2]).toHaveTextContent('Puzzle race · Best of three · 1500');
    expect(
      within(items[2]!).getByRole('button', { name: 'Join Quiet Rook’s puzzle race' }),
    ).toBeEnabled();

    const join = within(items[1]!).getByRole('button', { name: 'Join Calm Rook’s 15+10 game' });
    expect(join).not.toHaveAttribute('title');
    fireEvent.click(join);
    expect(actions.join).toHaveBeenCalledWith('CCCCCCCCCCCCCCCCCCCCCC');
  });

  it('says that joining withdraws a posted game', () => {
    resetLobby({
      mine: seek(),
      seeks: [
        {
          id: 'BBBBBBBBBBBBBBBBBBBBBB',
          game: 'chess',
          opts: {},
          tc: '3+2',
          color: 'black',
          name: 'Swift Knight',
          rating: null,
        },
      ],
    });
    renderPage();
    const region = screen.getByRole('region', { name: 'Open games' });
    expect(region).toHaveTextContent('Joining a game withdraws your own.');
    expect(within(region).getByRole('button', { name: /^Join Swift Knight/ })).toHaveAttribute(
      'title',
      'Joining withdraws your own posted game.',
    );
  });

  it('invites a post when nobody is waiting', () => {
    renderPage();
    expect(screen.getByTestId('live-players')).toHaveTextContent('Nobody else is here right now');
    const region = screen.getByRole('region', { name: 'Open games' });
    expect(within(region).getByRole('heading', { name: 'No open games right now' })).toBeVisible();
    expect(region).toHaveTextContent(
      'Post one: it stays up while you use the rest of the app, and you will hear when someone joins.',
    );
  });

  it('joins the game of a shared link once, and leaves the address bar clean', () => {
    renderPage('/play?join=DDDDDDDDDDDDDDDDDDDDDD');
    expect(actions.join).toHaveBeenCalledTimes(1);
    expect(actions.join).toHaveBeenCalledWith('DDDDDDDDDDDDDDDDDDDDDD');
    expect(screen.getByTestId('location').textContent).toBe('/play');
  });

  it('ignores a link that is not a game', () => {
    renderPage('/play?join=not-a-game');
    expect(actions.join).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/play');
    expect(useToasts.getState().toasts.map((t) => t.message)).toContain(
      'That link does not lead to a game.',
    );
  });

  it('shows a notice until it is dismissed', () => {
    resetLobby({ notice: 'That game is no longer open.' });
    renderPage();
    const notice = screen.getByTestId('live-notice');
    expect(notice).toHaveTextContent('That game is no longer open.');
    fireEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(actions.clearNotice).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('live-notice')).toBeNull();
  });

  it('says when the waiting room is connecting or reconnecting', () => {
    resetLobby({ connection: 'connecting' });
    renderPage();
    expect(screen.getByTestId('live-connection')).toHaveTextContent(
      'Connecting to the waiting room…',
    );
    expect(screen.queryByTestId('live-players')).toBeNull();
    act(() => useLobby.setState({ connection: 'retrying' }));
    expect(screen.getByTestId('live-connection')).toHaveTextContent('Reconnecting…');
    act(() => useLobby.setState({ connection: 'open' }));
    expect(screen.queryByTestId('live-connection')).toBeNull();
  });

  it('says when the relay has no live games, and posts only what Lichess takes', () => {
    resetLobby({ connection: 'unavailable' });
    const { unmount } = renderPage();
    expect(screen.getByText('Live games are not set up on this relay yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10+5 Rapid' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '1+0 Bullet' })).toBeDisabled();
    unmount();

    connectLichess();
    useLivePrefs.setState({ lichess: true });
    renderPage();
    expect(screen.getByRole('button', { name: '10+5 Rapid' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '1+0 Bullet' })).toBeDisabled();
  });

  it('says when this copy of the app has no relay at all', () => {
    const config = siteConfig as { syncRelay: string };
    const relay = config.syncRelay;
    config.syncRelay = '';
    try {
      resetLobby({ connection: 'unavailable' });
      renderPage();
      expect(screen.getByText('This copy of the app has no relay for live games.')).toBeVisible();
    } finally {
      config.syncRelay = relay;
    }
  });

  it('goes to the board as soon as a game is paired', () => {
    renderPage();
    act(() =>
      useLobby.setState({
        pairing: {
          source: 'relay',
          game: 'EEEEEEEEEEEEEEEEEEEEEE',
          kind: 'chess',
          opts: {},
          color: 'white',
          tc: '5+3',
          opponent: { name: 'Swift Knight', rating: null },
          at: Date.now(),
          path: '/play/online/EEEEEEEEEEEEEEEEEEEEEE',
        },
      }),
    );
    expect(screen.getByText('The board')).toBeInTheDocument();
    expect(actions.clearPairing).toHaveBeenCalledTimes(1);
  });

  it('shows the name and the rating, both fixed while a game is posted', () => {
    const { unmount } = renderPage();
    expect(screen.getByTestId('live-name')).toHaveTextContent('You play as Patient Bishop');
    const rating = screen.getByRole('switch', { name: 'Show my puzzle rating' });
    expect(rating).toBeChecked();
    expect(rating).toHaveAccessibleDescription('1523, shown beside your name.');
    fireEvent.click(rating);
    expect(useLivePrefs.getState().showRating).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'New name' }));
    expect(rollName).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Your name online' })).toHaveTextContent(
      'Nothing anyone types reaches anyone else',
    );
    unmount();

    resetLobby({ mine: seek() });
    renderPage();
    expect(screen.getByRole('button', { name: 'New name' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Show my puzzle rating' })).toBeDisabled();
    expect(screen.getByText('Cancel your posted game to change these.')).toBeVisible();
  });

  it('sends an old link to a game against the computer on to it', () => {
    renderPage(`/play?fen=${encodeURIComponent('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')}&color=white`);
    expect(screen.getByTestId('location').textContent).toBe(
      `/play/computer?fen=${encodeURIComponent('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')}&color=white`,
    );
  });

  it('starts a game against the computer, or between two players at this device', () => {
    renderPage();
    const computer = screen.getByRole('region', { name: 'Play the computer' });
    expect(within(computer).getByRole('link', { name: 'New game' })).toHaveAttribute(
      'href',
      '/play/computer',
    );
    fireEvent.click(within(computer).getByRole('link', { name: 'Pass and play' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/play/computer?opponent=human');
  });

  it('lists the games for two, each with a way to practise alone', () => {
    renderPage();
    const games = screen.getByTestId('hub-games');
    expect(
      within(games)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Puzzle race',
      'Arbiter duel',
      'Who Stands Better? duel',
      'Army Draft',
      'Blindfold',
    ]);
    expect(
      within(screen.getByTestId('hub-game-arbiter')).getByRole('link', { name: 'Practise alone' }),
    ).toHaveAttribute('href', '/arcade/arbiter');
  });

  it('posts a game for two with the options chosen', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Play Puzzle race' }));
    const dialog = openDialog('Puzzle race')!;
    expect(dialog).toHaveTextContent('Both players get the same puzzles at the same moment.');
    // No clock and no colour for a duel.
    expect(within(dialog).queryByLabelText('Time control')).toBeNull();
    expect(within(dialog).queryByRole('radiogroup', { name: 'Your colour' })).toBeNull();
    // The level starts near the player's puzzle rating.
    expect(within(dialog).getByLabelText('Puzzle rating')).toHaveValue('1500');
    fireEvent.change(within(dialog).getByLabelText('Format'), { target: { value: 'timed' } });
    expect(within(dialog).getByLabelText('Format')).toHaveAccessibleDescription(
      /the most solved in three minutes wins/,
    );
    fireEvent.change(within(dialog).getByLabelText('Puzzle rating'), { target: { value: '1800' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post' }));
    await nextTask();
    expect(actions.post).toHaveBeenCalledWith({
      game: 'race',
      opts: { format: 'timed', level: 1800 },
      tc: null,
      color: 'random',
      private: false,
      lichess: null,
    });
    expect(openDialog('Puzzle race')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Play Army Draft' }));
    const army = openDialog('Army Draft')!;
    fireEvent.click(within(army).getByRole('radio', { name: '20 points' }));
    fireEvent.change(within(army).getByLabelText('Time control'), { target: { value: '3+2' } });
    fireEvent.click(within(army).getByRole('radio', { name: 'Black' }));
    fireEvent.click(within(army).getByRole('switch', { name: 'Only people with the link' }));
    fireEvent.click(within(army).getByRole('button', { name: 'Create the link' }));
    await nextTask();
    expect(actions.post).toHaveBeenLastCalledWith({
      game: 'army',
      opts: { budget: 20 },
      tc: '3+2',
      color: 'black',
      private: true,
      lichess: null,
    });
  });

  it('invites a friend to any of the games', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Invite a friend' }));
    const dialog = openDialog('Invite a friend')!;
    expect(within(dialog).queryByRole('switch', { name: 'Only people with the link' })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Game'), { target: { value: 'arbiter' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Slow pace' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create the link' }));
    await nextTask();
    expect(actions.post).toHaveBeenCalledWith({
      game: 'arbiter',
      opts: { pace: 'slow' },
      tc: null,
      color: 'random',
      private: true,
      lichess: null,
    });
  });

  it('opens the game an arcade page links to, and leaves the address bar clean', () => {
    renderPage('/play?play=judge');
    expect(openDialog('Who Stands Better? duel')).not.toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/play');
  });

  it('shows a posted duel with its game, and goes to the duel when paired', () => {
    resetLobby({
      mine: seek({ game: 'arbiter', opts: { pace: 'normal' }, tc: null, private: false }),
    });
    renderPage();
    const waiting = screen.getByTestId('live-waiting');
    expect(within(waiting).getByRole('heading', { name: 'Waiting for an opponent' })).toBeVisible();
    expect(waiting).toHaveTextContent('Arbiter duel · Normal pace');
    act(() =>
      useLobby.setState({
        mine: null,
        pairing: {
          source: 'relay',
          game: 'GGGGGGGGGGGGGGGGGGGGGG',
          kind: 'arbiter',
          opts: { pace: 'normal' },
          color: 'white',
          tc: null,
          opponent: { name: 'Swift Knight', rating: null },
          at: Date.now(),
          path: '/play/duel/GGGGGGGGGGGGGGGGGGGGGG',
        },
      }),
    );
    expect(screen.getByText('The duel')).toBeInTheDocument();
  });
});
