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

import LivePage from './LivePage';
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

function renderPage(path = '/play/online') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/play/online"
          element={
            <>
              <LivePage />
              <Where />
            </>
          }
        />
        <Route path="/play/online/:gameId" element={<p>The board</p>} />
        <Route path="/play" element={<Where />} />
        <Route path="/settings" element={<p>Settings</p>} />
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

describe('LivePage', () => {
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
    expect(document.title).toBe(`Play online · ${siteConfig.name}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Play online' })).toBeInTheDocument();
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
      tc: '10+5',
      color: 'white',
      private: false,
      lichess: null,
    });
    expect(useLivePrefs.getState().tc).toBe('10+5');

    fireEvent.click(within(post).getByRole('switch', { name: 'Only people with the link' }));
    fireEvent.click(within(post).getByRole('button', { name: '1+0 Bullet' }));
    expect(actions.post).toHaveBeenLastCalledWith({
      tc: '1+0',
      color: 'white',
      private: true,
      lichess: null,
    });
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
      tc: '4+2',
      color: 'random',
      private: false,
      lichess: null,
    });
    expect(openDialog('Custom time control')).toBeNull();
  });

  it('looks on Lichess too when signed in, rated if asked, and never for a private game', () => {
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

    fireEvent.click(within(post).getByRole('switch', { name: 'Only people with the link' }));
    expect(within(post).getByRole('switch', { name: 'Also look on Lichess' })).toBeDisabled();
    expect(within(post).queryByRole('switch', { name: 'Rated on Lichess' })).toBeNull();
    fireEvent.click(within(post).getByRole('button', { name: '15+10 Rapid' }));
    expect(actions.post).toHaveBeenLastCalledWith(
      expect.objectContaining({ private: true, lichess: null }),
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
    expect(within(waiting).getByRole('heading', { name: 'Waiting for an opponent' })).toBeVisible();
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
    expect(lichessLive.reconnect).toHaveBeenCalledWith('/play/online');
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
      `${window.location.origin}/play/online?join=abcdefghijklmnopqrstuv`,
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
        url: `${window.location.origin}/play/online?join=abcdefghijklmnopqrstuv`,
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
    expect(screen.getByTestId('location')).toHaveTextContent('/play?opponent=humanlike');
  });

  it('lists the open games, and joins one', () => {
    resetLobby({
      players: 3,
      seeks: [
        {
          id: 'BBBBBBBBBBBBBBBBBBBBBB',
          tc: '3+2',
          color: 'white',
          name: 'Swift Knight',
          rating: 1640,
        },
        {
          id: 'CCCCCCCCCCCCCCCCCCCCCC',
          tc: '15+10',
          color: 'random',
          name: 'Calm Rook',
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
    renderPage('/play/online?join=DDDDDDDDDDDDDDDDDDDDDD');
    expect(actions.join).toHaveBeenCalledTimes(1);
    expect(actions.join).toHaveBeenCalledWith('DDDDDDDDDDDDDDDDDDDDDD');
    expect(screen.getByTestId('location').textContent).toBe('/play/online');
  });

  it('ignores a link that is not a game', () => {
    renderPage('/play/online?join=not-a-game');
    expect(actions.join).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/play/online');
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
    expect(screen.getByRole('region', { name: 'Your name' })).toHaveTextContent(
      'Nothing anyone types reaches anyone else',
    );
    unmount();

    resetLobby({ mine: seek() });
    renderPage();
    expect(screen.getByRole('button', { name: 'New name' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Show my puzzle rating' })).toBeDisabled();
    expect(screen.getByText('Cancel your posted game to change these.')).toBeVisible();
  });
});
