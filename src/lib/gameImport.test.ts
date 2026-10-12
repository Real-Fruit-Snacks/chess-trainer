import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchChessComGames,
  fetchChessComGamesPage,
  fetchLichessGames,
  fetchLichessGamesPage,
  ImportError,
  isImportableVariant,
  isStandardVariant,
  LICHESS_PERFS,
  parseChessComCursor,
  parsePgnGames,
  parsePgnGamesDetailed,
  safeSourceUrl,
} from './gameImport';

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
              'https://api.chess.com/pub/player/xavier/games/2026/08',
              'https://api.chess.com/pub/player/xavier/games/2026/09',
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

describe('parsePgnGamesDetailed', () => {
  it('names the first illegal move and offers the legal prefix', () => {
    const { games, firstError } = parsePgnGamesDetailed(
      '[Event "x"]\n\n1. e4 e5 2. Qh5 Nc6 3. Nf7 *\n',
    );
    expect(games).toHaveLength(0);
    expect(firstError?.message).toBe('Illegal move Nf7 after Nc6');
    expect(firstError?.legalPrefixPgn).toContain('1. e4 e5 2. Qh5 Nc6');
    expect(firstError?.legalPrefixPgn).not.toContain('Nf7');
    expect(parsePgnGamesDetailed('1. e4 e5 *').firstError).toBeNull();
  });

  it('keeps standard chess and Chess960, and skips other variants', () => {
    const text =
      '[Variant "Chess960"]\n[FEN "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1"]\n\n1. e4 *\n\n[Variant "Standard"]\n\n1. d4 *\n\n[Variant "From Position"]\n[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. O-O *\n\n[Variant "King of the Hill"]\n\n1. e4 e5 *\n';
    const games = parsePgnGames(text);
    expect(games.map((g) => g.pgn.split('\n\n')[1])).toEqual(['1. e4 *', '1. d4 *', '1. O-O *']);
    expect(games[0]?.startFen).toBe('bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1');
    expect(isStandardVariant(undefined)).toBe(true);
    expect(isStandardVariant('Three-check')).toBe(false);
    expect(isImportableVariant('Chess960')).toBe(true);
    expect(isImportableVariant('Crazyhouse')).toBe(false);
  });

  it('replays a Chess960 game by its rules, castling and all', () => {
    // Position 274 (BNRKNBRQ): both sides castle long at once, the king and rook swapping.
    const games = parsePgnGames(
      '[Variant "Chess960"]\n[FEN "bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w KQkq - 0 1"]\n[SetUp "1"]\n\n1. O-O-O O-O-O 2. e4 *\n',
    );
    expect(games).toHaveLength(1);
    expect(games[0]?.plies).toBe(3);
    // An illegal castling (White's king cannot reach g1 yet) keeps the game out, with the reason.
    const { games: none, firstError } = parsePgnGamesDetailed(
      '[FEN "bnrknbrq/pppppppp/8/8/8/8/PPPPPPPP/BNRKNBRQ w KQkq - 0 1"]\n[Variant "Chess960"]\n\n1. O-O *\n',
    );
    expect(none).toHaveLength(0);
    expect(firstError?.message).toBe('Illegal move O-O at the start');
  });

  it('only keeps https links on lichess.org or chess.com as source URLs', () => {
    const game = (site: string) => `[Site "${site}"]\n\n1. e4 *\n`;
    expect(parsePgnGames(game('https://lichess.org/abcd1234'))[0]?.url).toBe(
      'https://lichess.org/abcd1234',
    );
    expect(parsePgnGames(game('https://www.chess.com/game/live/1'))[0]?.url).toBe(
      'https://www.chess.com/game/live/1',
    );
    expect(parsePgnGames(game('http://lichess.org/abcd1234'))[0]?.url).toBeNull();
    expect(parsePgnGames(game('javascript:alert(1)'))[0]?.url).toBeNull();
    expect(parsePgnGames(game('https://lichess.org.evil.example/x'))[0]?.url).toBeNull();
    expect(parsePgnGames('[Link "https://evil.example/"]\n\n1. e4 *\n')[0]?.url).toBeNull();
    expect(safeSourceUrl('https://user:pw@lichess.org/x')).toBeNull();
    expect(safeSourceUrl('https://example.org/x', null)).toBe('https://example.org/x');
  });
});

describe('request limits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Lichess for standard and Chess960 perfs only', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(LICHESS_PGN, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await fetchLichessGamesPage('alice', { filters: { speed: 'all' } });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(decodeURIComponent(url)).toContain(`perfType=${LICHESS_PERFS}`);
    expect(LICHESS_PERFS).toContain('chess960');
    await fetchLichessGamesPage('alice', { filters: { speed: 'blitz' } });
    expect(decodeURIComponent(String(fetchMock.mock.calls[1]?.[0]))).toContain(
      'perfType=blitz,chess960',
    );
  });

  it('keeps a speed filter’s own Chess960 games, and pages by what Lichess sent', async () => {
    const game = (n: number, tc: string, variant = '') =>
      `[Event "Rated game"]\n[Site "https://lichess.org/g${n}"]\n[UTCDate "2026.09.0${n}"]\n[UTCTime "12:00:00"]\n[White "alice"]\n[Black "bob"]\n[Result "*"]\n[TimeControl "${tc}"]\n${variant}\n1. e4 *\n`;
    const chess960 =
      '[Variant "Chess960"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n';
    const pgn = [game(3, '300+0'), game(2, '60+0', chess960), game(1, '180+2', chess960)].join(
      '\n',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(pgn, { status: 200 }))),
    );
    const page = await fetchLichessGamesPage('alice', { max: 3, filters: { speed: 'blitz' } });
    // The bullet Chess960 game is left out; the page was full, so there is more to load.
    expect(page.games.map((g) => g.url)).toEqual([
      'https://lichess.org/g3',
      'https://lichess.org/g1',
    ]);
    expect(page.next).not.toBeNull();
  });

  it('honours Retry-After on 429 and passes a timeout signal', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '120' } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchLichessGames('busy')).rejects.toMatchObject({
      kind: 'rate-limited',
      message: expect.stringContaining('2 minutes') as string,
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a timed-out request as a network problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))),
    );
    await expect(fetchLichessGames('alice')).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('too long') as string,
    });
  });

  it('ignores chess.com archive URLs outside the player’s games path, and keeps Chess960 games', async () => {
    const pgn = `[Event "Live Chess"]\n[Site "Chess.com"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n1. e4 e5 *\n`;
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/games/archives')) {
        return Promise.resolve(
          Response.json({
            archives: [
              'https://evil.example/pub/player/xo/games/2026/08',
              'https://api.chess.com/pub/player/yo/games/2026/08',
              'https://api.chess.com/pub/player/xo/games/2026/09',
            ],
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          games: [
            { pgn, end_time: 300, rules: 'kingofthehill', url: 'https://www.chess.com/game/1' },
            { pgn, end_time: 200, rules: 'chess960', url: 'https://www.chess.com/game/live/9' },
            { pgn, end_time: 100, rules: 'chess', url: 'javascript:alert(1)' },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const games = await fetchChessComGames('xo', { max: 5 });
    expect(games.map((g) => g.url)).toEqual(['https://www.chess.com/game/live/9', null]);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://api.chess.com/pub/player/xo/games/archives',
      'https://api.chess.com/pub/player/xo/games/2026/09',
    ]);
  });

  it('pages through at most six archives at a time and carries the month in the cursor', async () => {
    const pgn = `[Event "Live Chess"]\n[Site "Chess.com"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n1. e4 e5 *\n`;
    const months = Array.from({ length: 9 }, (_, i) => `2025/${String(i + 1).padStart(2, '0')}`);
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/games/archives')) {
        return Promise.resolve(
          Response.json({
            archives: months.map((m) => `https://api.chess.com/pub/player/xo/games/${m}`),
          }),
        );
      }
      const index = months.findIndex((m) => url.endsWith(m));
      // One game a month, newer months have later times; the eighth month is empty.
      return Promise.resolve(
        Response.json({ games: index === 7 ? [] : [{ pgn, end_time: (index + 1) * 1000 }] }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchChessComGamesPage('xo', { max: 30 });
    // Months 9, 8 (empty), 7, 6, 5, 4 were read: five games, more to come.
    expect(first.games).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(first.next).toBe('4000:6');
    expect(parseChessComCursor(first.next)).toEqual({ before: 4000, month: 6 });
    const second = await fetchChessComGamesPage('xo', { max: 30, cursor: first.next });
    expect(second.games.map((g) => g.timestamp)).toEqual([3000_000, 2000_000, 1000_000]);
    expect(second.next).toBeNull();
    // Old cursors (time only) still work.
    expect(parseChessComCursor('4000')).toEqual({ before: 4000, month: 0 });
  });
});
