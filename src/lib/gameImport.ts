import { parsePgn, splitPgnGames } from '@/chess/pgn';
import { GameTree } from '@/chess/tree';

/**
 * Importing games from public APIs. Both Lichess and chess.com allow browser
 * requests from any origin, so no proxy is needed; nothing is stored beyond
 * the games the user chooses to open.
 */
export interface ImportedGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  result: string;
  /** YYYY.MM.DD (PGN style) when known. */
  date: string;
  event: string;
  /** Link back to the source when known. */
  url: string | null;
  /** Number of half-moves, for display. */
  plies: number;
  /** bullet / blitz / rapid / classical / correspondence, when the time control is known. */
  speed: GameSpeed | null;
  /** Rated game, when the source says. */
  rated: boolean | null;
  /** All PGN tags, for imports that need more than the standard ones (studies). */
  headers?: Record<string, string>;
  /** Starting position when the game has a FEN tag. */
  startFen?: string;
  /** Start (or end) time in ms since the epoch, when known; used for paging. */
  timestamp: number | null;
}

export type GameSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface GameFilters {
  rated?: boolean;
  speed?: GameSpeed | 'all';
  color?: 'white' | 'black' | 'all';
}

/** One page of a player's games plus an opaque cursor for the next (older) page. */
export interface GamePage {
  games: ImportedGame[];
  next: string | null;
}

/** Classifies a PGN TimeControl ("300+3", "600", "-") the way Lichess does. */
export function speedFromTimeControl(timeControl: string | undefined): GameSpeed | null {
  if (!timeControl) return null;
  if (timeControl === '-' || /^\d+\/\d+$/.test(timeControl)) return 'correspondence';
  const match = /^(\d+)(?:\+(\d+))?$/.exec(timeControl.trim());
  if (!match) return null;
  const base = Number(match[1]);
  const increment = Number(match[2] ?? 0);
  const estimated = base + 40 * increment;
  if (estimated < 180) return 'bullet';
  if (estimated < 480) return 'blitz';
  if (estimated < 1500) return 'rapid';
  return 'classical';
}

function timestampOf(headers: Record<string, string>): number | null {
  const date = headers.UTCDate ?? headers.Date;
  if (!date || !/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return null;
  const time = headers.UTCTime ?? headers.StartTime ?? '00:00:00';
  const [y, m, d] = date.split('.').map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(':').map(Number);
  const value = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh, mm, ss);
  return Number.isFinite(value) ? value : null;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-found' | 'rate-limited' | 'network' | 'empty' | 'invalid',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

const LICHESS_API = 'https://lichess.org/api';
const CHESSCOM_API = 'https://api.chess.com/pub';

/** Splits a multi-game PGN text into games with their key headers. */
export function parsePgnGames(text: string): ImportedGame[] {
  const games: ImportedGame[] = [];
  for (const [index, chunk] of splitPgnGames(text).entries()) {
    try {
      const game = parsePgn(chunk);
      if (game.moves.length === 0 && !game.headers.FEN) continue;
      // Replaying the moves catches illegal or corrupt games before they reach the board.
      const plies = GameTree.fromParsed(game).mainLine().length;
      const headers = game.headers;
      games.push({
        id: headers.Site && /https?:\/\//.test(headers.Site) ? headers.Site : `game-${index + 1}`,
        pgn: chunk.trim(),
        white: headers.White ?? '?',
        black: headers.Black ?? '?',
        result: headers.Result ?? game.result,
        date: headers.UTCDate ?? headers.Date ?? '',
        event: headers.Event ?? '',
        url:
          headers.Site && /https?:\/\//.test(headers.Site) ? headers.Site : (headers.Link ?? null),
        plies,
        speed: speedFromTimeControl(headers.TimeControl),
        rated: headers.Event ? /rated/i.test(headers.Event) : null,
        timestamp: timestampOf(headers),
        headers,
        ...(headers.FEN ? { startFen: headers.FEN } : {}),
      });
    } catch {
      // Skip games that do not parse; the rest of the file is still useful.
    }
  }
  return games;
}

function validUsername(username: string): string {
  const trimmed = username.trim();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(trimmed)) {
    throw new ImportError('Enter a username (letters, digits, - and _ only).', 'invalid');
  }
  return trimmed;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ImportError('Could not reach the server. Are you online?', 'network');
  }
  if (res.status === 404) throw new ImportError('No player with that username.', 'not-found');
  if (res.status === 429) {
    throw new ImportError(
      'The server is rate-limiting requests — try again in a minute.',
      'rate-limited',
    );
  }
  if (!res.ok) throw new ImportError(`Request failed (HTTP ${res.status}).`, 'network');
  return res;
}

const LICHESS_PERF: Record<GameSpeed, string> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'correspondence',
};

/** Applies the client-side part of the filters (the APIs cover the rest, unevenly). */
export function applyGameFilters(
  games: ImportedGame[],
  filters: GameFilters | undefined,
  player: string,
): ImportedGame[] {
  if (!filters) return games;
  const me = player.trim().toLowerCase();
  return games.filter((g) => {
    if (filters.rated && g.rated === false) return false;
    if (filters.speed && filters.speed !== 'all' && g.speed && g.speed !== filters.speed) {
      return false;
    }
    if (filters.color && filters.color !== 'all' && me) {
      const mine = filters.color === 'white' ? g.white : g.black;
      if (mine.toLowerCase() !== me) return false;
    }
    return true;
  });
}

/**
 * One page of a Lichess player's games, newest first. `cursor` is the value
 * returned as `next` by the previous page.
 */
export async function fetchLichessGamesPage(
  username: string,
  options: {
    max?: number;
    signal?: AbortSignal;
    filters?: GameFilters;
    cursor?: string | null;
  } = {},
): Promise<GamePage> {
  const user = validUsername(username);
  const max = options.max ?? 30;
  const params = new URLSearchParams({
    max: String(max),
    opening: 'true',
    clocks: 'false',
    evals: 'false',
    literate: 'false',
  });
  const filters = options.filters;
  if (filters?.rated) params.set('rated', 'true');
  if (filters?.speed && filters.speed !== 'all') {
    params.set('perfType', LICHESS_PERF[filters.speed]);
  }
  if (filters?.color && filters.color !== 'all') params.set('color', filters.color);
  if (options.cursor) params.set('until', options.cursor);
  const url = `${LICHESS_API}/games/user/${encodeURIComponent(user)}?${params.toString()}`;
  const res = await request(url, {
    headers: { Accept: 'application/x-chess-pgn' },
    signal: options.signal,
  });
  const games = applyGameFilters(parsePgnGames(await res.text()), filters, user);
  const oldest = games.reduce<number | null>(
    (acc, g) => (g.timestamp !== null && (acc === null || g.timestamp < acc) ? g.timestamp : acc),
    null,
  );
  return {
    games,
    next: games.length >= max && oldest !== null ? String(oldest - 1) : null,
  };
}

/** The most recent games of a Lichess player, newest first. */
export async function fetchLichessGames(
  username: string,
  options: { max?: number; signal?: AbortSignal; filters?: GameFilters } = {},
): Promise<ImportedGame[]> {
  const { games } = await fetchLichessGamesPage(username, options);
  if (games.length === 0) throw new ImportError('That player has no games yet.', 'empty');
  return games;
}

interface ChessComArchiveGame {
  pgn?: string;
  url?: string;
  end_time?: number;
  rated?: boolean;
  time_class?: string;
  white?: { username?: string };
  black?: { username?: string };
}

const CHESSCOM_SPEED: Record<string, GameSpeed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'correspondence',
};

/**
 * One page of a chess.com player's games, newest first, walking the monthly
 * archives from the most recent. `cursor` is the end time (seconds) of the
 * oldest game already seen.
 */
export async function fetchChessComGamesPage(
  username: string,
  options: {
    max?: number;
    signal?: AbortSignal;
    filters?: GameFilters;
    cursor?: string | null;
  } = {},
): Promise<GamePage> {
  const user = validUsername(username).toLowerCase();
  const max = options.max ?? 30;
  const before = options.cursor ? Number(options.cursor) : Number.POSITIVE_INFINITY;
  const archivesRes = await request(
    `${CHESSCOM_API}/player/${encodeURIComponent(user)}/games/archives`,
    { signal: options.signal },
  );
  const { archives } = (await archivesRes.json()) as { archives?: string[] };
  const months = [...(archives ?? [])].reverse();
  if (months.length === 0) throw new ImportError('That player has no games yet.', 'empty');
  const collected: ImportedGame[] = [];
  let exhausted = true;
  for (const month of months) {
    if (collected.length >= max) {
      exhausted = false;
      break;
    }
    const res = await request(month, { signal: options.signal });
    const { games } = (await res.json()) as { games?: ChessComArchiveGame[] };
    const parsed = (games ?? [])
      .filter((g): g is ChessComArchiveGame & { pgn: string } => typeof g.pgn === 'string')
      .filter((g) => (g.end_time ?? 0) < before)
      .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
      .flatMap((g) =>
        parsePgnGames(g.pgn).map((game) => ({
          ...game,
          url: g.url ?? game.url,
          rated: typeof g.rated === 'boolean' ? g.rated : game.rated,
          speed: (g.time_class ? CHESSCOM_SPEED[g.time_class] : undefined) ?? game.speed,
          timestamp: g.end_time ? g.end_time * 1000 : game.timestamp,
        })),
      );
    collected.push(...applyGameFilters(parsed, options.filters, user));
  }
  const page = collected.slice(0, max);
  const oldest = page[page.length - 1];
  const hasMore = collected.length > max || !exhausted;
  return {
    games: page,
    next: hasMore && oldest?.timestamp ? String(Math.floor(oldest.timestamp / 1000)) : null,
  };
}

/** The most recent games of a chess.com player, newest first. */
export async function fetchChessComGames(
  username: string,
  options: { max?: number; signal?: AbortSignal; filters?: GameFilters } = {},
): Promise<ImportedGame[]> {
  const { games } = await fetchChessComGamesPage(username, options);
  if (games.length === 0) throw new ImportError('That player has no games yet.', 'empty');
  return games;
}
