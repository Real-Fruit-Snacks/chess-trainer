import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveGame } from './sessions';
import type { LobbyState } from './types';

vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({ pairing: null, mine: null }) as LobbyState) };
});

vi.mock('./sessions', async () => {
  const { create } = await import('zustand');
  return {
    useActiveGames: create<{ games: ActiveGame[] }>()(() => ({ games: [] })),
    checkOnLiveGames: vi.fn(),
    checkOnCorrespondence: vi.fn(),
  };
});

const checks = vi.hoisted(() => ({ rooms: vi.fn() }));
vi.mock('./roomSessions', async () => {
  const { create } = await import('zustand');
  return {
    useActiveRooms: create<{
      rooms: { id: string; kind: string; path: string; racing: boolean }[];
    }>()(() => ({ rooms: [] })),
    checkOnRooms: checks.rooms,
  };
});

import LiveBar from './LiveBar';
import { useActiveRooms } from './roomSessions';
import { useActiveGames } from './sessions';

const ROOM = {
  id: 'R'.repeat(22),
  kind: 'race' as const,
  path: `/play/race/${'R'.repeat(22)}`,
  racing: false,
};
const ANALYSIS = {
  id: 'A'.repeat(22),
  kind: 'analysis' as const,
  path: `/analyze/together/${'A'.repeat(22)}`,
  racing: false,
};

function renderBar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LiveBar />
    </MemoryRouter>,
  );
}

describe('LiveBar and group rooms', () => {
  beforeEach(() => {
    useActiveRooms.setState({ rooms: [] });
    useActiveGames.setState({ games: [] });
    checks.rooms.mockClear();
  });

  it('leads back to the room the player is in, and says when a race is on there', () => {
    useActiveRooms.setState({ rooms: [ROOM] });
    renderBar('/puzzles');
    expect(checks.rooms).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('live-bar-room').textContent).toBe('You are in a puzzle race room.');
    expect(screen.getByRole('link', { name: 'Back to the room' }).getAttribute('href')).toBe(
      ROOM.path,
    );
    act(() => useActiveRooms.setState({ rooms: [{ ...ROOM, racing: true }] }));
    expect(screen.getByTestId('live-bar-room').textContent).toBe(
      'A race is on in your puzzle race room.',
    );
    expect(screen.getByRole('link', { name: 'Back to the race' })).toBeTruthy();
  });

  it('leads back to the analysis room the player is in', () => {
    useActiveRooms.setState({ rooms: [ANALYSIS] });
    const { unmount } = renderBar('/puzzles');
    expect(screen.getByTestId('live-bar-room').textContent).toBe('You are in an analysis room.');
    expect(screen.getByRole('link', { name: 'Back to the analysis' }).getAttribute('href')).toBe(
      ANALYSIS.path,
    );
    unmount();
    renderBar(ANALYSIS.path);
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });

  it('hides on the room’s own page, and gives way to a game in progress', () => {
    useActiveRooms.setState({ rooms: [ROOM] });
    const { unmount } = renderBar(ROOM.path);
    expect(screen.queryByTestId('live-bar')).toBeNull();
    unmount();
    useActiveGames.setState({
      games: [
        {
          source: 'relay',
          id: 'GAME',
          path: '/play/online/GAME',
          you: 'white',
          opponent: 'Calm Rook',
          kind: 'chess',
        },
      ],
    });
    renderBar('/puzzles');
    expect(screen.queryByTestId('live-bar-room')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the board' })).toBeTruthy();
  });
});
