import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchChessComGames, fetchLichessGames, ImportError, parsePgnGames } from './gameImport';

const LICHESS_PGN = `[Event "Rated blitz game"]
[Site "https://lichess.org/abcd1234"]
[Date "2026.09.01"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[UTCDate "2026.09.01"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0


[Event "Rated rapid game"]
[Site "https://lichess.org/efgh5678"]
[Date "2026.08.30"]
[White "carol"]
[Black "alice"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1
`;

describe('parsePgnGames', () => {
  it('splits a multi-game PGN into games with headers', () => {
    const games = parsePgnGames(LICHESS_PGN);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      white: 'alice',
      black: 'bob',
      result: '1-0',
      url: 'https://lichess.org/abcd1234',
      plies: 6,
      date: '2026.09.01',
    });
    expect(games[1]?.pgn).toContain('1. d4 d5');
  });

  it('skips unparsable games and empty chunks', () => {
    const games = parsePgnGames(
      '[Event "x"]\n\n1. e4 e5 2. Ke2 Kxe2 *\n\n[Event "y"]\n\n1. e4 *\n',
    );
    expect(games).toHaveLength(1);
    expect(games[0]?.event).toBe('y');
  });
});

describe('fetchLichessGames', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests PGN and parses it', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(LICHESS_PGN, {
          status: 200,
          headers: { 'Content-Type': 'application/x-chess-pgn' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const games = await fetchLichessGames('alice', { max: 10 });
    expect(games).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/games/user/alice?max=10');
    expect((init.headers as Record<string, string>).Accept).toBe('application/x-chess-pgn');
  });

  it('maps HTTP errors to readable messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );
    await expect(fetchLichessGames('nobody')).rejects.toMatchObject({ kind: 'not-found' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 429 }))),
    );
    await expect(fetchLichessGames('busy')).rejects.toMatchObject({ kind: 'rate-limited' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(fetchLichessGames('alice')).rejects.toBeInstanceOf(ImportError);
    await expect(fetchLichessGames('bad name!')).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('fetchChessComGames', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('walks the monthly archives newest first', async () => {
    const pgn = (white: string) =>
      `[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2026.09.02"]\n[White "${white}"]\n[Black "z"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2\n`;
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/games/archives')) {
        return Promise.resolve(
          Response.json({
            archives: [
              'https://api.chess.com/pub/player/x/games/2026/08',
              'https://api.chess.com/pub/player/x/games/2026/09',
            ],
          }),
        );
      }
      if (url.endsWith('/2026/09')) {
        return Promise.resolve(
          Response.json({
            games: [
              { pgn: pgn('old'), url: 'https://www.chess.com/game/live/1', end_time: 100 },
              { pgn: pgn('new'), url: 'https://www.chess.com/game/live/2', end_time: 200 },
            ],
          }),
        );
      }
      return Promise.resolve(Response.json({ games: [{ pgn: pgn('august'), end_time: 50 }] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const games = await fetchChessComGames('Xavier', { max: 3 });
    expect(games.map((g) => g.white)).toEqual(['new', 'old', 'august']);
    expect(games[0]?.url).toBe('https://www.chess.com/game/live/2');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/player/xavier/games/archives');
  });
});
