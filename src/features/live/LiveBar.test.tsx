import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveGame } from './sessions';
import type { LobbyState, MySeek, Pairing } from './types';

const actions = vi.hoisted(() => ({ cancel: vi.fn(), clearPairing: vi.fn() }));

vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({}) as LobbyState) };
});

vi.mock('./sessions', async () => {
  const { create } = await import('zustand');
  return {
    useActiveGames: create<{ games: ActiveGame[] }>()(() => ({ games: [] })),
    checkOnLiveGames: vi.fn(),
  };
});

import { useLiveBar } from '@/app/liveBar';
import { Shell } from '@/app/Shell';
import LiveBar from './LiveBar';
import { useLobby } from './lobby';
import { checkOnLiveGames, useActiveGames } from './sessions';

const PAIRING: Pairing = {
  source: 'relay',
  game: 'PAIRED',
  color: 'black',
  tc: '5+3',
  opponent: { name: 'Swift Knight', rating: 1640 },
  at: Date.now(),
  path: '/play/online/PAIRED',
};

const GAME: ActiveGame = {
  source: 'relay',
  id: 'ONGOING',
  path: '/play/online/ONGOING',
  you: 'white',
  opponent: 'Calm Rook',
};

function posted(patch: Partial<MySeek> = {}): MySeek {
  return {
    id: 'AAAAAAAAAAAAAAAAAAAAAA',
    tc: '10+5',
    color: 'random',
    private: false,
    postedAt: Date.now(),
    relay: 'posted',
    lichess: { status: 'off', rated: false, message: null },
    ...patch,
  };
}

function Where() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderBar(path = '/puzzles') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LiveBar />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LiveBar', () => {
  beforeEach(() => {
    actions.cancel.mockClear();
    actions.clearPairing.mockClear();
    useLobby.setState(
      {
        connection: 'open',
        seeks: [],
        players: 1,
        mine: null,
        pairing: null,
        notice: null,
        watch: () => () => undefined,
        post: vi.fn(),
        cancel: actions.cancel,
        join: vi.fn(),
        clearPairing: () => {
          actions.clearPairing();
          useLobby.setState({ pairing: null });
        },
        clearNotice: vi.fn(),
      },
      true,
    );
    useActiveGames.setState({ games: [] }, true);
  });

  it('says nothing when there is nothing to say', () => {
    renderBar();
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });

  it('checks on the games that may still be on since before this start, once loaded', () => {
    vi.mocked(checkOnLiveGames).mockClear();
    renderBar();
    expect(checkOnLiveGames).toHaveBeenCalledTimes(1);
  });

  it('shows the posted game, how long it has waited, and cancels it', () => {
    useLobby.setState({ mine: posted({ postedAt: Date.now() - 133_500 }) });
    renderBar();
    const bar = screen.getByRole('region', { name: 'Live game' });
    expect(within(bar).getByRole('status')).toHaveTextContent('Waiting for an opponent · 10+5');
    expect(within(bar).getByRole('timer')).toHaveTextContent('2:13');
    fireEvent.click(within(bar).getByRole('button', { name: 'Cancel' }));
    expect(actions.cancel).toHaveBeenCalledTimes(1);
    fireEvent.click(within(bar).getByRole('link', { name: 'Waiting room' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/play/online');
    // The waiting room says all this itself.
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });

  it('leads to the board of a game just paired', () => {
    // Paired: the posted game is gone.
    useLobby.setState({ mine: null, pairing: PAIRING });
    renderBar();
    const bar = screen.getByTestId('live-bar');
    expect(within(bar).getByRole('status')).toHaveTextContent('Swift Knight joined your 5+3 game.');
    expect(within(bar).queryByRole('timer')).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: 'Go to the board' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/play/online/PAIRED');
    expect(actions.clearPairing).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });

  it('puts a pairing before a game in progress, and a game in progress before a posted game', () => {
    useActiveGames.setState({ games: [GAME] });
    useLobby.setState({ mine: posted(), pairing: PAIRING });
    renderBar();
    expect(screen.getByRole('status')).toHaveTextContent('Swift Knight joined your 5+3 game.');
    act(() => useLobby.setState({ pairing: null }));
    expect(screen.getByRole('status')).toHaveTextContent('Your game against Calm Rook is on.');
    expect(screen.getByRole('link', { name: 'Back to the board' })).toHaveAttribute(
      'href',
      '/play/online/ONGOING',
    );
    act(() => useActiveGames.setState({ games: [] }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for an opponent');
  });

  it('leads back to a game in progress, and hides on its board', () => {
    useActiveGames.setState({ games: [GAME] });
    renderBar('/learn');
    fireEvent.click(screen.getByRole('link', { name: 'Back to the board' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/play/online/ONGOING');
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });

  it('is loaded by the shell, under the header, only while live games turn it on', async () => {
    // The shell follows the system's colour scheme; jsdom has no media queries.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    // The shell restores the scroll position on navigation; jsdom cannot scroll.
    vi.stubGlobal('scrollTo', vi.fn());
    try {
      useLobby.setState({ mine: posted() });
      const router = createMemoryRouter(
        [{ path: '/', element: <Shell />, children: [{ path: '*', element: <p>A page</p> }] }],
        { initialEntries: ['/puzzles'] },
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('A page')).toBeInTheDocument();
      expect(screen.queryByTestId('live-bar')).toBeNull();

      act(() => useLiveBar.getState().set(true));
      const bar = await screen.findByTestId('live-bar');
      expect(bar.previousElementSibling).toBe(screen.getByRole('banner'));
      expect(within(bar).getByRole('status')).toHaveTextContent('Waiting for an opponent');

      act(() => useLiveBar.getState().set(false));
      expect(screen.queryByTestId('live-bar')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('hides in the waiting room and on the board it would lead to', () => {
    useLobby.setState({ mine: posted() });
    const { unmount } = renderBar('/play/online');
    expect(screen.queryByTestId('live-bar')).toBeNull();
    unmount();

    useLobby.setState({ pairing: PAIRING });
    const paired = renderBar('/play/online/PAIRED');
    expect(screen.queryByTestId('live-bar')).toBeNull();
    paired.unmount();

    renderBar('/play/online/');
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });
});
