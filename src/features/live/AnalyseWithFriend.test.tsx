import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameTree } from '@/chess/tree';
import { type FakeLiveRelay, installFakeLiveRelay } from '@/test/fakeLiveHub';
import { AnalyseWithFriend } from './AnalyseWithFriend';
import { useLivePrefs } from './prefs';
import { membershipOf } from './rooms';

// jsdom has no modal dialogs: enough of one for the question to run.
vi.hoisted(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

let relay: FakeLiveRelay;

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  useLivePrefs.getState().update({ name: 'Patient Bishop', showRating: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBoard(tree: GameTree, path = '/analyze') {
  const router = createMemoryRouter(
    [
      { path: '/analyze', element: <AnalyseWithFriend tree={tree} /> },
      { path: '/analyze/together/:roomId', element: <p>The analysis room</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const settle = () =>
  act(async () => {
    // The room's code loads on demand: a few turns before the relay hears of it.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await relay.settle();
    }
  });

describe('Analyse with a friend', () => {
  it('makes a room with the board’s game and goes there, the link copied', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const tree = GameTree.fromPgn('1. e4 e5 (1... c5) 2. Nf3');
    const router = renderBoard(tree);
    fireEvent.click(screen.getByRole('button', { name: 'Analyse with a friend' }));
    const dialog = screen.getByRole('dialog', { name: 'Analyse with a friend' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make the room' }));
    await settle();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/analyze\/together\//),
    );
    const id = router.state.location.pathname.split('/').at(-1)!;
    expect(membershipOf(id)?.kind).toBe('analysis');
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/analyze/together/${id}`);
    const look = relay.groupClient(id);
    await look.send({ t: 'hello' });
    expect(look.last('room')).toMatchObject({
      kind: 'analysis',
      state: {
        nodes: [
          [1, 0, 'e2e4'],
          [2, 1, 'e7e5'],
          [4, 2, 'g1f3'],
          [3, 1, 'c7c5'],
        ],
      },
    });
  });

  it('opens from quick search, and says when the room cannot be made', async () => {
    relay.offline = true;
    const router = renderBoard(new GameTree(), '/analyze?together=1');
    const dialog = await screen.findByRole('dialog', { name: 'Analyse with a friend' });
    expect(router.state.location.search).toBe('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make the room' }));
    await settle();
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'The room could not be made: the relay could not be reached.',
      ),
    );
    expect(router.state.location.pathname).toBe('/analyze');
  });
});
