import { type PgnGame, PgnParseError, parsePgn, splitPgnGames } from '@/chess/pgn';
import { GameTree } from '@/chess/tree';
import { fetchWithTimeout, isTimeoutError, retryAfterSeconds } from './fetchWithTimeout';

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

/** Hosts a "view the source game" link may point at. */
const SOURCE_HOSTS = ['lichess.org', 'chess.com'];

/**
 * A URL safe to render as an outbound link: `https:` only, and (by default)
 * on lichess.org or chess.com, since that is where imported games come from.
 * Anything else — `javascript:`, custom schemes, look-alike hosts — is dropped.
 */
export function safeSourceUrl(
  value: string | null | undefined,
  hosts: readonly string[] | null = SOURCE_HOSTS,
): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (hosts) {
    const host = url.hostname.toLowerCase();
    if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  }
  return url.href;
}

/** Variants play by other rules: only standard chess (from any position) is imported. */
export function isStandardVariant(variant: string | undefined): boolean {
  if (!variant) return true;
  const name = variant.trim().toLowerCase();
  return name === '' || name === 'standard' || name === 'from position' || name === 'chess';
}

/** Why a game in a paste could not be read, with the legal moves before the problem. */
export interface PgnImportError {
  /** e.g. "Illegal move Nf7 after Qh5". */
  message: string;
  /** The game up to the illegal move, when at least one move was legal. */
  legalPrefixPgn: string | null;
}

export interface ParsedPgnGames {
  games: ImportedGame[];
  /** The first game that failed to parse, when any did. */
  firstError: PgnImportError | null;
}

/** The PGN of the moves before `ply` (variations dropped), or null when none is legal. */
function legalPrefix(game: PgnGame, ply: number): string | null {
  if (ply <= 1) return null;
  const moves = game.moves.slice(0, ply - 1).map((m) => ({ ...m, variations: [] }));
  try {
    const tree = GameTree.fromParsed({ ...game, moves, result: '*' });
    return tree.mainLine().length > 0 ? tree.toPgn() : null;
  } catch {
    return null;
  }
}

/** Splits a multi-game PGN text into games with their key headers, reporting the first failure. */
export function parsePgnGamesDetailed(text: string): ParsedPgnGames {
  const games: ImportedGame[] = [];
  let firstError: PgnImportError | null = null;
  for (const [index, chunk] of splitPgnGames(text).entries()) {
    let game: PgnGame | null = null;
    try {
      game = parsePgn(chunk);
      if (game.moves.length === 0 && !game.headers.FEN) continue;
      if (!isStandardVariant(game.headers.Variant)) continue;
      // Replaying the moves catches illegal or corrupt games (and invalid FEN headers)
      // before they reach the board.
      const tree = GameTree.fromParsed(game);
      const plies = tree.mainLine().length;
      const headers = game.headers;
      const site = safeSourceUrl(headers.Site, null);
      games.push({
        id: site ?? `game-${index + 1}`,
        pgn: chunk.trim(),
        white: headers.White ?? '?',
        black: headers.Black ?? '?',
        result: headers.Result ?? game.result,
        date: headers.UTCDate ?? headers.Date ?? '',
        event: headers.Event ?? '',
        url: safeSourceUrl(headers.Site) ?? safeSourceUrl(headers.Link),
        plies,
        speed: speedFromTimeControl(headers.TimeControl),
        rated: headers.Event ? /rated/i.test(headers.Event) : null,
        timestamp: timestampOf(headers),
        headers,
        ...(headers.FEN ? { startFen: tree.startFen } : {}),
      });
    } catch (err) {
      // Skip games that do not parse; the rest of the file is still useful.
      if (!firstError) {
        const message =
          err instanceof PgnParseError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'That text could not be read as a game.';
        firstError = {
          message,
          legalPrefixPgn:
            game && err instanceof PgnParseError && err.ply > 0 ? legalPrefix(game, err.ply) : null,
        };
      }
    }
  }
  return { games, firstError };
}

/** Splits a multi-game PGN text into games with their key headers. */
export function parsePgnGames(text: string): ImportedGame[] {
  return parsePgnGamesDetailed(text).games;
}

function validUsername(username: string): string {
  const trimmed = username.trim();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(trimmed)) {
    throw new ImportError('Enter a username (letters, digits, - and _ only).', 'invalid');
  }
  return trimmed;
}

/** Milliseconds a request may take before it is given up on. */
export const REQUEST_TIMEOUT_MS = 15_000;

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { ...init, timeoutMs: REQUEST_TIMEOUT_MS });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new ImportError('The server took too long to answer. Try again later.', 'network');
    }
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ImportError('Could not reach the server. Are you online?', 'network');
  }
  if (res.status === 404) throw new ImportError('No player with that username.', 'not-found');
  if (res.status === 429) {
    const wait = retryAfterSeconds(res);
    throw new ImportError(
      wait !== null && wait > 0
        ? `The server is rate-limiting requests — try again in ${wait >= 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`}.`
        : 'The server is rate-limiting requests — try again in a minute.',
      'rate-limited',
    );
  }
  if (!res.ok) throw new ImportError(`Request failed (HTTP ${res.status}).`, 'network');
  return res;
}

const LICHESS_PERF: Record<GameSpeed, string> = {
  bullet: 'ultraBullet,bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'correspondence',
};

/** Every standard-chess perf, so variant games (Crazyhouse, Chess960…) are never requested. */
export const LICHESS_STANDARD_PERFS = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';

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
  params.set(
    'perfType',
    filters?.speed && filters.speed !== 'all'
      ? LICHESS_PERF[filters.speed]
      : LICHESS_STANDARD_PERFS,
  );
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
  /** "chess" for standard games; variants ("chess960", "kingofthehill"…) are skipped. */
  rules?: string;
  white?: { username?: string };
  black?: { username?: string };
}

const CHESSCOM_SPEED: Record<string, GameSpeed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'correspondence',
};

/** Monthly archives read per page: a rare filter cannot walk a whole account at once. */
export const CHESSCOM_ARCHIVES_PER_PAGE = 6;

/** Only archive URLs under the player's own games path are fetched. */
export function chessComArchivePrefix(user: string): string {
  return `${CHESSCOM_API}/player/${encodeURIComponent(user)}/games/`;
}

/**
 * Reads a chess.com paging cursor: the end time (seconds) of the oldest game
 * already seen and the index of the next monthly archive to read (newest = 0).
 * Older cursors carried the time alone.
 */
export function parseChessComCursor(cursor: string | null | undefined): {
  before: number;
  month: number;
} {
  if (!cursor) return { before: Number.POSITIVE_INFINITY, month: 0 };
  const [time = '', month = '0'] = cursor.split(':');
  const before = Number(time);
  const index = Number(month);
  return {
    before: Number.isFinite(before) ? before : Number.POSITIVE_INFINITY,
    month: Number.isInteger(index) && index >= 0 ? index : 0,
  };
}

/**
 * One page of a chess.com player's games, newest first, walking the monthly
 * archives from the most recent. `cursor` comes from the previous page's `next`.
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
  const { before, month: firstMonth } = parseChessComCursor(options.cursor);
  const prefix = chessComArchivePrefix(user);
  const archivesRes = await request(`${prefix}archives`, { signal: options.signal });
  const { archives } = (await archivesRes.json()) as { archives?: unknown };
  const months = (Array.isArray(archives) ? archives : [])
    .filter((m): m is string => typeof m === 'string' && m.startsWith(prefix))
    .reverse();
  if (months.length === 0) throw new ImportError('That player has no games yet.', 'empty');
  const collected: ImportedGame[] = [];
  let monthIndex = firstMonth;
  let read = 0;
  // The month whose games fill the page may hold more: it is read again next page.
  let lastMonthRead = firstMonth;
  while (monthIndex < months.length && read < CHESSCOM_ARCHIVES_PER_PAGE) {
    if (collected.length >= max) break;
    const month = months[monthIndex];
    if (!month) break;
    const res = await request(month, { signal: options.signal });
    const { games } = (await res.json()) as { games?: ChessComArchiveGame[] };
    const parsed = (games ?? [])
      .filter((g): g is ChessComArchiveGame & { pgn: string } => typeof g.pgn === 'string')
      .filter((g) => !g.rules || g.rules === 'chess')
      .filter((g) => (g.end_time ?? 0) < before)
      .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
      .flatMap((g) =>
        parsePgnGames(g.pgn).map((game) => ({
          ...game,
          url: safeSourceUrl(g.url) ?? game.url,
          rated: typeof g.rated === 'boolean' ? g.rated : game.rated,
          speed: (g.time_class ? CHESSCOM_SPEED[g.time_class] : undefined) ?? game.speed,
          timestamp: g.end_time ? g.end_time * 1000 : game.timestamp,
        })),
      );
    collected.push(...applyGameFilters(parsed, options.filters, user));
    lastMonthRead = monthIndex;
    monthIndex += 1;
    read += 1;
  }
  const page = collected.slice(0, max);
  const oldest = page[page.length - 1];
  const overflow = collected.length > max;
  const hasMore = overflow || monthIndex < months.length;
  if (!hasMore || !oldest?.timestamp) return { games: page, next: null };
  // Continue from the month that overflowed (older games of it remain) or from the next one.
  const nextMonth = overflow ? lastMonthRead : monthIndex;
  return { games: page, next: `${Math.floor(oldest.timestamp / 1000)}:${nextMonth}` };
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
