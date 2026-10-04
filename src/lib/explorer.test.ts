import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeExplorerError,
  EXPLORER_TIMEOUT_MS,
  ExplorerError,
  explorerUrl,
  formatPercent,
  lookupExplorer,
  normalizeExplorer,
} from './explorer';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

const masters = {
  white: 300,
  draws: 500,
  black: 200,
  opening: null,
  moves: [
    { uci: 'e2e4', san: 'e4', white: 200, draws: 300, black: 100, averageRating: 2450 },
    { uci: 'd2d4', san: 'd4', white: 100, draws: 200, black: 100, averageRating: 2460 },
  ],
  topGames: [
    {
      id: 'abc',
      winner: 'white' as const,
      white: { name: 'Kasparov', rating: 2800 },
      black: { name: 'Karpov', rating: 2750 },
      year: 1990,
    },
  ],
};

describe('opening explorer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalises moves with shares and scores for the side to move', () => {
    const result = normalizeExplorer(masters, 'masters');
    expect(result.total).toBe(1000);
    expect(result.moves[0]).toMatchObject({ san: 'e4', total: 600, share: 0.6 });
    expect(result.moves[0]?.score).toBeCloseTo((200 + 150) / 600);
    expect(result.topGames[0]).toMatchObject({ id: 'abc', winner: 'white', year: 1990 });
  });

  it('builds the request URLs for both databases', () => {
    const masters = new URL(explorerUrl(START, 'masters'));
    expect(masters.origin + masters.pathname).toBe('https://explorer.lichess.ovh/masters');
    expect(masters.searchParams.get('fen')).toBe(START);
    expect(masters.searchParams.get('moves')).toBe('12');
    const lichess = new URL(explorerUrl(START, 'lichess'));
    expect(lichess.pathname).toBe('/lichess');
    expect(lichess.searchParams.get('speeds')).toBe('blitz,rapid,classical');
    expect(lichess.searchParams.get('ratings')).toBe('1600,1800,2000,2200');
  });

  it('fetches once per position and scores moves for Black when Black is to move', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(masters), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = await lookupExplorer(AFTER_E4, 'masters');
    const b = await lookupExplorer(AFTER_E4, 'masters');
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Black to move: the e4 row's score is Black's wins plus half the draws.
    expect(a.moves[0]?.score).toBeCloseTo((100 + 150) / 600);
  });

  it('reports rate limiting and failures clearly, with the wait the server asks for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 429 }))),
    );
    await expect(lookupExplorer(START, 'lichess')).rejects.toThrow(/rate-limiting.*a minute/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '30' } })),
      ),
    );
    const limited = await lookupExplorer(START, 'masters').catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(ExplorerError);
    expect((limited as Error).message).toBe(
      'The explorer is rate-limiting requests — try again in 30 seconds.',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '300' } })),
      ),
    );
    await expect(lookupExplorer(START, 'masters')).rejects.toThrow(/try again in 5 minutes/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );
    await expect(lookupExplorer('8/8/8/8/8/8/8/K6k w - - 0 1', 'lichess')).rejects.toThrow(
      /HTTP 500/,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 }))),
    );
    await expect(lookupExplorer('8/8/8/8/8/8/8/K5k1 w - - 0 1', 'lichess')).rejects.toThrow(
      /could not be read/,
    );
    expect(formatPercent(0.615)).toBe('62 %');
  });

  it('gives up after a deadline instead of hanging, and still honours the caller’s abort', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookupExplorer('8/8/8/8/8/8/8/K4k2 w - - 0 1', 'masters')).rejects.toThrow(
      'The explorer took too long to answer — try again in a moment.',
    );
    // The request carries a signal that combines the deadline with the caller's own.
    const controller = new AbortController();
    await lookupExplorer('8/8/8/8/8/8/8/K3k3 w - - 0 1', 'masters', controller.signal).catch(
      () => undefined,
    );
    const signal = fetchMock.mock.calls[1]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal).not.toBe(controller.signal);
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    expect(EXPLORER_TIMEOUT_MS).toBe(15_000);
  });

  it('describes failures for the card: offline first, then unreachable, then the error itself', () => {
    expect(describeExplorerError(new TypeError('Failed to fetch'), false)).toMatch(/offline/);
    expect(describeExplorerError(new TypeError('Failed to fetch'), true)).toMatch(
      /could not be reached/,
    );
    const failed = new ExplorerError('The explorer answered HTTP 500 — try again later.');
    expect(describeExplorerError(failed, true)).toBe(
      'The explorer answered HTTP 500 — try again later.',
    );
    expect(describeExplorerError('odd', true)).toMatch(/unavailable/);
  });
});
