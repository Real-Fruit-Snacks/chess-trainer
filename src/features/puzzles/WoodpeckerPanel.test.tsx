import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeShare } from '@/lib/shareCodes';
import { useProgress } from '@/store/progress';
import type { Puzzle } from './puzzleService';

const puzzle = (id: string, rating: number): Puzzle => ({
  id,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: 'e2e4 e7e5 g1f3',
  rating,
  rd: 80,
  popularity: 95,
  plays: 1000,
  themes: 'fork short',
  url: 'https://lichess.org/abc',
});

// Two chunks of the 1100–1399 band, twelve puzzles each, spanning the band (dealt round-robin).
const files = ['b1100-00.json', 'b1100-01.json'];
const chunk = (k: number) =>
  Array.from({ length: 12 }, (_, j) =>
    puzzle(`k${k}p${String(j).padStart(2, '0')}`, 1100 + j * 25),
  );
const index = {
  source: 'test',
  license: 'CC0-1.0',
  generatedAt: '2024-01-01',
  chunk: 12,
  total: 24,
  buckets: [
    {
      id: 'b1100',
      label: 'Casual',
      min: 1100,
      max: 1399,
      count: 24,
      files,
      ranges: files.map(() => ({ min: 1100, max: 1375 })),
    },
  ],
  themes: {},
};

const requested: string[] = [];
let failing = new Set<string>();
/** Delay for the puzzle chunks, as on a real network. */
let chunkDelayMs = 0;

// jsdom has no modal dialog support; the real element fires `close` on close().
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  requested.length = 0;
  failing = new Set();
  chunkDelayMs = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const file = String(input).split('/').pop() ?? '';
      requested.push(file);
      if (file === 'index.json') return Promise.resolve(Response.json(index));
      if (failing.has(file)) return Promise.reject(new TypeError('Failed to fetch'));
      const k = files.indexOf(file);
      const respond = () =>
        k < 0 ? new Response('not found', { status: 404 }) : Response.json(chunk(k));
      return chunkDelayMs > 0
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(respond()), chunkDelayMs))
        : Promise.resolve(respond());
    }),
  );
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ids = (k: number, count: number) =>
  Array.from({ length: count }, (_, j) => `k${k}p${String(j).padStart(2, '0')}`);

describe('validateSharedWoodpecker', () => {
  it('keeps the bundled ids, drops unknown ones and loads only the chunks it needs', async () => {
    const { validateSharedWoodpecker } = await import('./sharedWoodpecker');
    const found = await validateSharedWoodpecker([...ids(0, 11), 'k0p00', 'ghost'], 1250);
    expect(found).toMatchObject({ puzzleIds: ids(0, 11), unknown: 1, partial: false });

    requested.length = 0;
    const firstChunkOnly = await validateSharedWoodpecker(ids(0, 10), 1250);
    expect(firstChunkOnly?.puzzleIds).toHaveLength(10);
    // Every id was in the chunk already in memory: nothing more was fetched.
    expect(requested.filter((f) => f !== 'index.json')).toEqual([]);
  });

  it('refuses a link with fewer than ten bundled puzzles', async () => {
    const { validateSharedWoodpecker } = await import('./sharedWoodpecker');
    expect(await validateSharedWoodpecker([...ids(0, 5), 'gh001', 'gh002'], 1250)).toBeNull();
    expect(await validateSharedWoodpecker(ids(0, 9), 1250)).toBeNull();
  });

  it('keeps ids it could not check when a file is offline', async () => {
    failing = new Set(['b1100-01.json']);
    const { validateSharedWoodpecker } = await import('./sharedWoodpecker');
    const shared = [...ids(0, 6), ...ids(1, 6)];
    expect(await validateSharedWoodpecker(shared, 1250)).toMatchObject({
      puzzleIds: shared,
      unknown: 0,
      partial: true,
    });
  });
});

describe('WoodpeckerPanel', () => {
  it('keeps the cycle table in its own scrolling region, so a phone page never widens', async () => {
    const { WoodpeckerPanel } = await import('./WoodpeckerPanel');
    const { useProgress: progress } = await import('@/store/progress');
    progress.getState().resetAll();
    progress.getState().startWoodpecker(ids(0, 12), 1250);
    for (let i = 0; i < 12; i++) progress.getState().recordWoodpeckerAttempt('solved', 20_000);
    render(
      <MemoryRouter initialEntries={['/puzzles/woodpecker']}>
        <WoodpeckerPanel onContinue={vi.fn()} />
      </MemoryRouter>,
    );
    const region = screen.getByRole('region', { name: 'Woodpecker cycles' });
    expect(region).toContainElement(screen.getByTestId('woodpecker-cycles'));
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('offers a shared set in a dialog, and taking it starts cycle 1', async () => {
    const { WoodpeckerPanel } = await import('./WoodpeckerPanel');
    const { useProgress: progress } = await import('@/store/progress');
    progress.getState().resetAll();
    const fragment = await encodeShare({
      kind: 'woodpecker',
      puzzleIds: [...ids(0, 12), 'ghost'],
      rating: 1250,
    });
    const onContinue = vi.fn();
    render(
      <MemoryRouter initialEntries={[`/puzzles/woodpecker#${fragment}`]}>
        <WoodpeckerPanel onContinue={onContinue} />
      </MemoryRouter>,
    );
    const offer = await screen.findByTestId('shared-woodpecker');
    expect(offer).toHaveTextContent('set of 12 puzzles');
    expect(offer).toHaveTextContent('1 id was not in the bundled puzzles');
    fireEvent.click(screen.getByTestId('accept-shared-woodpecker'));
    expect(onContinue).toHaveBeenCalled();
    expect(progress.getState().woodpecker).toMatchObject({
      puzzleIds: ids(0, 12),
      current: { cycle: 1, index: 0 },
    });
  });
});

describe('WoodpeckerPanel with slow puzzle files', () => {
  it('still offers the set when the check outlasts clearing the link', async () => {
    chunkDelayMs = 60;
    const { WoodpeckerPanel } = await import('./WoodpeckerPanel');
    const { useProgress: progress } = await import('@/store/progress');
    const { useLocation } = await import('react-router');
    progress.getState().resetAll();
    const fragment = await encodeShare({ kind: 'woodpecker', puzzleIds: ids(0, 12), rating: 1250 });
    function Where() {
      const location = useLocation();
      return <output data-testid="where">{location.pathname + location.hash}</output>;
    }
    render(
      <MemoryRouter initialEntries={[`/puzzles/woodpecker#${fragment}`]}>
        <WoodpeckerPanel onContinue={vi.fn()} />
        <Where />
      </MemoryRouter>,
    );
    const offer = await screen.findByTestId('shared-woodpecker', {}, { timeout: 2000 });
    expect(offer).toHaveTextContent('set of 12 puzzles');
    // The link is tidied away once the set has been checked (the router may render that a
    // moment after the offer).
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/puzzles\/woodpecker$/),
    );
  });
});

// The store module used above is a fresh one per test (modules are reset); keep the
// statically imported one clean as well.
afterEach(() => {
  useProgress.getState().resetAll();
});
