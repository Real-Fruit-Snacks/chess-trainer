import { afterEach, describe, expect, it, vi } from 'vitest';
import { explorerUrl, formatPercent, lookupExplorer, normalizeExplorer } from './explorer';

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

  it('reports rate limiting and failures clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 429 }))),
    );
    await expect(lookupExplorer(START, 'lichess')).rejects.toThrow(/rate-limiting/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );
    await expect(lookupExplorer('8/8/8/8/8/8/8/K6k w - - 0 1', 'lichess')).rejects.toThrow(
      /HTTP 500/,
    );
    expect(formatPercent(0.615)).toBe('62 %');
  });
});
