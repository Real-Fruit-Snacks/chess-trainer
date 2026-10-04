import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';

// A scripted engine: every search answers at once with the first legal move.
vi.mock('@/engine/useEngine', async () => {
  const { Chess } = await import('chess.js');
  const client = {
    init: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    stop: () => undefined,
    search: (params: { fen: string; moves?: string[] }) => {
      const chess = new Chess(params.fen);
      for (const m of params.moves ?? []) {
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
      const move = chess.moves({ verbose: true })[0];
      return {
        id: 1,
        stop: () => undefined,
        result: Promise.resolve({
          stopped: false,
          bestmove: { move: move ? move.lan : null },
          lines: new Map(),
        }),
      };
    },
  };
  return {
    useEngine: () => ({
      engine: () => client,
      status: 'ready',
      error: null,
      start: () => Promise.resolve(),
    }),
  };
});
vi.mock('@/lib/sound', async (importOriginal) => ({
  ...(await importOriginal<typeof SoundModule>()),
  playSound: vi.fn(),
}));

import SimulPage from './SimulPage';

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // jsdom does not scroll; the summary asks to be scrolled into view.
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

/** Renders the page with a two-board simul without clocks set up, playing White everywhere. */
function renderSimul() {
  useSettings.getState().update({
    simul: {
      boards: 2,
      levelId: 1,
      rising: false,
      color: 'white',
      timeControlId: 'none',
      autoAdvance: true,
    },
  });
  const router = createMemoryRouter(
    [
      { path: '/arcade/simul', element: <SimulPage /> },
      {
        path: '/arcade',
        element: (
          <>
            <h1>Arcade hub</h1>
            <Link to="/arcade/simul">Back to the simul</Link>
          </>
        ),
      },
    ],
    { initialEntries: ['/arcade/simul'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** One of the page's confirmations, by its title. */
const dialogNamed = (name: string) => screen.getByRole('dialog', { name, hidden: true });

/** Starts the simul set up by `renderSimul`. */
function startSimul() {
  fireEvent.click(screen.getByTestId('simul-start'));
  expect(screen.getByTestId('simul-status')).toHaveTextContent('Board 1: Your move.');
}

describe('SimulPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    useSettings.getState().reset();
    // No random moves from the weak levels: the scripted engine decides.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks before leaving a simul in play; staying keeps every board', () => {
    const router = renderSimul();
    startSimul();
    fireEvent.click(screen.getByRole('link', { name: 'Arcade' }));
    const dialog = dialogNamed('Leave the simul?');
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByTestId('simul-leave-note')).toHaveTextContent(
      'The 2 boards still in play are resigned and count as losses.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay', hidden: true }));
    expect(router.state.location.pathname).toBe('/arcade/simul');
    expect(screen.getByTestId('simul-boards')).toBeInTheDocument();
    expect(useProgress.getState().games).toHaveLength(0);
  });

  it('leaving resigns what is still in play, so the record adds up', async () => {
    const router = renderSimul();
    startSimul();
    fireEvent.click(screen.getByRole('link', { name: 'Arcade' }));
    fireEvent.click(within(dialogNamed('Leave the simul?')).getByTestId('confirm-accept'));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/arcade'));
    const { games, arcade } = useProgress.getState();
    expect(games).toHaveLength(2);
    expect(games.every((g) => g.source === 'simul' && g.reason === 'resignation')).toBe(true);
    expect(arcade.simul).toMatchObject({ plays: 1, detail: '0/2 · Newcomer · no clock' });
  });

  it('lets the page go without asking once the simul is over', async () => {
    const router = renderSimul();
    startSimul();
    fireEvent.click(screen.getByTestId('simul-end'));
    fireEvent.click(within(dialogNamed('End the simul?')).getByTestId('confirm-accept'));
    expect(screen.getByTestId('simul-summary')).toBeInTheDocument();
    expect(screen.getByTestId('simul-new')).toHaveTextContent('New game');
    // The crumb (the summary has an Arcade link of its own).
    fireEvent.click(screen.getAllByRole('link', { name: 'Arcade' })[0]!);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/arcade'));
  });

  it('N keeps the keyboard on the big board when the next board comes up', async () => {
    renderSimul();
    startSimul();

    const first = screen.getByRole('application', { name: /^Board 1 of 2/ });
    act(() => first.focus());
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'n' });
    expect(screen.getByTestId('simul-status')).toHaveTextContent('Board 2: Your move.');
    // The big board was re-created for board 2: the keyboard is on it, not on the page.
    const second = screen.getByRole('application', { name: /^Board 2 of 2/ });
    await vi.waitFor(() => expect(second).toHaveFocus());
  });

  it('shows a strip of the boards under the big board, with Next', () => {
    renderSimul();
    startSimul();
    const strip = screen.getByTestId('simul-strip');
    const chips = within(strip).getAllByRole('button');
    expect(chips.map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([
      'Board 1: your move',
      'Board 2: your move',
      'Next board',
    ]);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chips[1]!);
    expect(screen.getByTestId('simul-status')).toHaveTextContent('Board 2: Your move.');
  });
});
