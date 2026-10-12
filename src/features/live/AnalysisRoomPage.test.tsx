import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawShape } from '@/components/board/Board';
import { GameTree } from '@/chess/tree';
import { HANDOFF_PGN_KEY } from '@/lib/handoff';
import { type FakeLiveRelay, installFakeLiveRelay, type RelayClient } from '@/test/fakeLiveHub';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));
const engine = vi.hoisted(() => ({ client: () => ({}), start: () => Promise.resolve() }));
vi.mock('@/engine/useEngine', () => ({
  useEngine: () => ({ engine: engine.client, status: 'loading', error: null, start: engine.start }),
}));

/** The board is a chessground instance; a stub that hands its props to the test. */
interface BoardProps {
  fen: string;
  ariaLabel?: string;
  shapes?: DrawShape[];
  movableColor?: string;
  onMove?: (from: string, to: string) => void;
  onSelect?: (key: string) => void;
  onShapesChange?: (shapes: DrawShape[]) => void;
}
const board = vi.hoisted(() => ({ props: null as null | BoardProps }));
vi.mock('@/components/board/Board', () => ({
  Board: (props: BoardProps) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import AnalysisRoomPage from './AnalysisRoomPage';
import { analysisOptionsFor } from './analysisRoom';
import { useLivePrefs } from './prefs';
import { closeRooms } from './roomSessions';
import { makeGroupRoom } from './rooms';

let relay: FakeLiveRelay;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  relay = installFakeLiveRelay();
  useLivePrefs.getState().update({ name: 'Patient Bishop', showRating: false });
  board.props = null;
});

afterEach(() => {
  closeRooms();
  vi.unstubAllGlobals();
});

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

/** A room made on this device from `pgn`, with a friend in it. */
async function makeRoom(pgn = '[White "Calm Rook"]\n[Black "Swift Knight"]\n\n1. e4 e5 2. Nf3 *') {
  const made = makeGroupRoom('analysis', analysisOptionsFor(GameTree.fromPgn(pgn)));
  await relay.settle();
  const id = await made;
  const friend = relay.groupClient(id);
  await friend.send({ t: 'hello' });
  await friend.send({ t: 'join', name: 'Swift Knight', rating: null });
  return { id, friend };
}

async function renderRoom(id: string) {
  const router = createMemoryRouter(
    [
      { path: '/analyze/together/:roomId', element: <AnalysisRoomPage /> },
      { path: '/analyze', element: <p>The analysis board</p> },
    ],
    { initialEntries: [`/analyze/together/${id}`] },
  );
  const view = render(<RouterProvider router={router} />);
  await act(() => relay.settle());
  return { ...view, router };
}

/** What the page's board shows. */
const shown = () => board.props?.fen;

/** The node the friend reaches by these moves, in the room's ids (as its snapshot has them). */
async function nodeOf(friend: RelayClient, ucis: string[]): Promise<number> {
  await friend.send({ t: 'hello' });
  const nodes = (friend.last('room')!.state as { nodes: [number, number, string][] }).nodes;
  let at = 0;
  for (const uci of ucis) at = nodes.find(([, p, u]) => p === at && u === uci)![0];
  return at;
}

describe('AnalysisRoomPage', () => {
  it('shows the room’s game, the people, the link, and follows the shared position', async () => {
    const { id, friend } = await makeRoom();
    await renderRoom(id);
    expect(screen.getByRole('heading', { level: 1, name: 'Analyse together' })).toBeTruthy();
    expect(screen.getByTestId('together-game').textContent).toBe('Calm Rook v Swift Knight');
    const people = screen.getByTestId('together-members');
    expect(
      within(people)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Patient BishopYouHere', 'Swift KnightHere']);
    expect(screen.getByTestId('together-link').textContent).toBe(
      `${window.location.origin}/analyze/together/${id}`,
    );
    const follow = screen.getByRole<HTMLInputElement>('switch', { name: 'Follow' });
    expect(follow.checked).toBe(true);
    expect(screen.getByRole('group', { name: 'Moves' }).textContent).toContain('Nf3');

    // The friend plays a variation: this board goes there, and says who did what.
    await act(async () => {
      await friend.send({ t: 'move', node: await nodeOf(friend, ['e2e4']), uci: 'c7c5' });
      await relay.settle();
    });
    expect(screen.getByTestId('together-news').textContent).toBe('Swift Knight played 1… c5.');
    expect(shown()).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });

  it('browses alone, and comes back to the shared position', async () => {
    const { id, friend } = await makeRoom();
    await renderRoom(id);
    fireEvent.click(screen.getByRole('switch', { name: 'Follow' }));
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(shown()).toBe(AFTER_E4);
    // The others move elsewhere: this board stays.
    await act(async () => {
      await friend.send({ t: 'move', node: 0, uci: 'd2d4' });
      await relay.settle();
    });
    expect(shown()).toBe(AFTER_E4);
    expect(screen.getByText('Now at', { exact: false }).textContent).toContain('d4');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the shared position' }));
    expect(shown()).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1');
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Follow' }).checked).toBe(true);
  });

  it('plays moves on the shared board and draws for everyone, by squares too', async () => {
    const { id, friend } = await makeRoom();
    await renderRoom(id);
    act(() => board.props?.onMove?.('d2', 'd4'));
    expect(shown()).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1');
    await act(() => relay.settle());
    expect(friend.last('added')).toMatchObject({ node: [expect.any(Number), 0, 'd2d4'], at: true });
    const d4 = (friend.last('added')!.node as number[])[0];

    // Right-click drawing on the board goes to the room as it is.
    act(() => board.props?.onShapesChange?.([{ orig: 'c2', dest: 'c4', brush: 'red' }]));
    await act(() => relay.settle());
    expect(friend.last('shapes')).toMatchObject({
      node: d4,
      shapes: [{ orig: 'c2', dest: 'c4', brush: 'red' }],
    });
    expect(board.props?.shapes).toEqual([{ orig: 'c2', dest: 'c4', brush: 'red' }]);

    // Drawing by squares: the board moves nothing while it is on.
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    expect(board.props?.movableColor).toBeUndefined();
    act(() => board.props?.onSelect?.('g1'));
    expect(screen.getByText(/^From g1: now the square it points to/)).toBeTruthy();
    act(() => board.props?.onSelect?.('f3'));
    await act(() => relay.settle());
    expect(friend.last('shapes')).toMatchObject({
      shapes: [
        { orig: 'c2', dest: 'c4', brush: 'red' },
        { orig: 'g1', dest: 'f3', brush: 'green' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear drawing' }));
    await act(() => relay.settle());
    expect(friend.last('shapes')).toMatchObject({ node: d4, shapes: [] });
  });

  it('joins a room opened from its link, and opens the tree in Analyze', async () => {
    const { id, friend } = await makeRoom();
    // Another device: no membership here.
    localStorage.clear();
    useLivePrefs.getState().update({ name: 'Quiet Rook', showRating: false });
    const { router } = await renderRoom(id);
    await act(() => relay.settle());
    expect(friend.last('members')?.members).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Leave the room' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('together-open-analyze'));
    expect(router.state.location.pathname).toBe('/analyze');
    expect(router.state.location.search).toBe('?from=game');
    const handoff = JSON.parse(sessionStorage.getItem(HANDOFF_PGN_KEY)!) as { pgn: string };
    expect(handoff.pgn).toContain('[White "Calm Rook"]');
    expect(handoff.pgn).toContain('1. e4 e5 2. Nf3');
  });

  it('says so when the room has gone, or the link is not a room’s', async () => {
    await renderRoom('Q'.repeat(22));
    expect(screen.getByRole('heading', { name: 'Room not found' })).toBeTruthy();
  });
});
