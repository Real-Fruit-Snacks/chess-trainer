import type { Fen, San, Uci } from '@/chess/types';
import { useLichess } from '@/store/lichess';
import { fetchWithTimeout, isTimeoutError, retryAfterSeconds } from './fetchWithTimeout';

/**
 * Optional lookups against the Lichess opening explorer: what people actually
 * play in a position and how it goes for them. Off by default
 * (settings.explorer) because it needs the network; every call is abortable,
 * gives up after 15 seconds, and results are cached per position and database
 * for the session. Lichess asks for a signed-in account: a lookup carries the
 * token of the Lichess account connected in Settings, when there is one.
 *
 * API: https://lichess.org/api#tag/Opening-Explorer
 */
export type ExplorerDatabase = 'masters' | 'lichess';

export interface ExplorerMove {
  uci: Uci;
  san: San;
  white: number;
  draws: number;
  black: number;
  total: number;
  averageRating: number | null;
  /** Share of all games in the position that continued with this move, 0–1. */
  share: number;
  /** Score for the side to move, 0–1 (wins + half the draws). */
  score: number;
}

export interface ExplorerGame {
  id: string;
  white: { name: string; rating: number | null };
  black: { name: string; rating: number | null };
  winner: 'white' | 'black' | null;
  year: number | null;
  event?: string;
}

export interface ExplorerResult {
  database: ExplorerDatabase;
  white: number;
  draws: number;
  black: number;
  total: number;
  moves: ExplorerMove[];
  opening: { eco: string; name: string } | null;
  topGames: ExplorerGame[];
}

interface ApiPlayer {
  name: string;
  rating?: number | null;
}

interface ApiGame {
  id: string;
  winner?: 'white' | 'black' | null;
  white: ApiPlayer;
  black: ApiPlayer;
  year?: number;
  month?: string;
  event?: string;
}

interface ApiMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number | null;
}

interface ApiResponse {
  white: number;
  draws: number;
  black: number;
  moves?: ApiMove[];
  topGames?: ApiGame[];
  recentGames?: ApiGame[];
  opening?: { eco: string; name: string } | null;
}

export const EXPLORER_ENDPOINT = 'https://explorer.lichess.org';
/** Lichess games: the rating bands and speeds that make up the "community" database. */
export const LICHESS_RATINGS = [1600, 1800, 2000, 2200];
export const LICHESS_SPEEDS = ['blitz', 'rapid', 'classical'];

const cache = new Map<string, ExplorerResult>();

/** The cache key: the database and the position (the FEN without its move counters). */
function cacheKey(fen: Fen, database: ExplorerDatabase): string {
  return `${database}:${fen.split(' ').slice(0, 4).join(' ')}`;
}

/** Milliseconds a lookup may take before it is given up on. */
export const EXPLORER_TIMEOUT_MS = 15_000;

/** What went wrong with a lookup, for callers that act on it (a batch waits out a 429). */
export type ExplorerErrorKind = 'rate-limited' | 'auth' | 'timeout' | 'http' | 'unreadable';

/** A failed lookup, with a message fit for the explorer card. */
export class ExplorerError extends Error {
  constructor(
    message: string,
    readonly kind: ExplorerErrorKind = 'http',
    /** For `rate-limited`: the seconds the explorer asked to wait, when it said. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ExplorerError';
  }
}

/** The connected Lichess account's token, unless Lichess has already refused it. */
function accountToken(): string | null {
  const { account, needsReconnect } = useLichess.getState();
  return account?.token && !needsReconnect ? account.token : null;
}

/** Requests in flight, so a batch never runs alongside another lookup. */
const inFlight = new Set<Promise<unknown>>();

function track<T>(request: Promise<T>): Promise<T> {
  inFlight.add(request);
  const settle = () => inFlight.delete(request);
  void request.then(settle, settle);
  return request;
}

/** "in 30 seconds" / "in 2 minutes" for a Retry-After delay. */
function waitText(seconds: number): string {
  return seconds >= 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
}

/** Turns an API answer into the shape the app uses; exported for tests. */
export function normalizeExplorer(data: ApiResponse, database: ExplorerDatabase): ExplorerResult {
  const total = data.white + data.draws + data.black;
  const sideToMoveScore = (m: ApiMove, whiteToMove: boolean) => {
    const games = m.white + m.draws + m.black;
    if (games === 0) return 0.5;
    const wins = whiteToMove ? m.white : m.black;
    return (wins + m.draws / 2) / games;
  };
  return {
    database,
    white: data.white,
    draws: data.draws,
    black: data.black,
    total,
    moves: (data.moves ?? []).map((m) => {
      const games = m.white + m.draws + m.black;
      return {
        uci: m.uci,
        san: m.san,
        white: m.white,
        draws: m.draws,
        black: m.black,
        total: games,
        averageRating: m.averageRating ?? null,
        share: total > 0 ? games / total : 0,
        // Filled in by lookupExplorer, which knows whose move it is.
        score: sideToMoveScore(m, true),
      };
    }),
    opening: data.opening ?? null,
    topGames: (data.topGames ?? data.recentGames ?? []).slice(0, 6).map((g) => ({
      id: g.id,
      white: { name: g.white.name, rating: g.white.rating ?? null },
      black: { name: g.black.name, rating: g.black.rating ?? null },
      winner: g.winner ?? null,
      year: g.year ?? null,
      event: g.event,
    })),
  };
}

/** Recomputes each move's score for the side to move in `fen`. */
function scoreForMover(result: ExplorerResult, fen: Fen): ExplorerResult {
  const whiteToMove = fen.split(' ')[1] !== 'b';
  return {
    ...result,
    moves: result.moves.map((m) => ({
      ...m,
      score: m.total === 0 ? 0.5 : ((whiteToMove ? m.white : m.black) + m.draws / 2) / m.total,
    })),
  };
}

export function explorerUrl(fen: Fen, database: ExplorerDatabase): string {
  const params = new URLSearchParams({ fen, moves: '12', topGames: '4' });
  if (database === 'lichess') {
    params.set('variant', 'standard');
    params.set('speeds', LICHESS_SPEEDS.join(','));
    params.set('ratings', LICHESS_RATINGS.join(','));
    params.set('recentGames', '0');
  }
  return `${EXPLORER_ENDPOINT}/${database}?${params.toString()}`;
}

export async function lookupExplorer(
  fen: Fen,
  database: ExplorerDatabase,
  signal?: AbortSignal,
): Promise<ExplorerResult> {
  const key = cacheKey(fen, database);
  const cached = cache.get(key);
  if (cached) return cached;
  const token = accountToken();
  let res: Response;
  try {
    res = await track(
      fetchWithTimeout(explorerUrl(fen, database), {
        signal,
        timeoutMs: EXPLORER_TIMEOUT_MS,
        headers: token
          ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
          : { Accept: 'application/json' },
      }),
    );
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new ExplorerError(
        'The explorer took too long to answer — try again in a moment.',
        'timeout',
      );
    }
    // The caller's abort, or the network itself (described by describeExplorerError).
    throw err;
  }
  if (res.status === 429) {
    const wait = retryAfterSeconds(res);
    throw new ExplorerError(
      wait !== null && wait > 0
        ? `The explorer is rate-limiting requests — try again in ${waitText(wait)}.`
        : 'The explorer is rate-limiting requests — try again in a minute.',
      'rate-limited',
      wait,
    );
  }
  if (res.status === 401) {
    // Lichess serves the explorer to signed-in accounts only.
    throw new ExplorerError(
      token || useLichess.getState().needsReconnect
        ? 'Lichess did not accept this device’s sign-in for the explorer. Connect your Lichess account again in Settings.'
        : 'The Lichess opening explorer needs a Lichess account. Connect yours in Settings to look positions up.',
      'auth',
    );
  }
  if (!res.ok) {
    throw new ExplorerError(`The explorer answered HTTP ${res.status} — try again later.`);
  }
  let data: ApiResponse;
  try {
    data = (await res.json()) as ApiResponse;
  } catch {
    throw new ExplorerError('The explorer sent an answer that could not be read.', 'unreadable');
  }
  const result = scoreForMover(normalizeExplorer(data, database), fen);
  cache.set(key, result);
  return result;
}

/** The session's answer for a position, if it was looked up already; never a request. */
export function peekExplorer(fen: Fen, database: ExplorerDatabase): ExplorerResult | null {
  return cache.get(cacheKey(fen, database)) ?? null;
}

/** Milliseconds between two requests of a batch. */
export const EXPLORER_BATCH_PAUSE_MS = 500;
/** How long a batch waits after a 429 that names no time: a minute, as Lichess asks. */
export const EXPLORER_DEFAULT_WAIT_SECONDS = 60;
/** A batch gives up after this many 429s in a row (the explorer is overloaded, not just busy). */
const MAX_RATE_LIMITS_IN_A_ROW = 3;

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException('The lookups were stopped.', 'AbortError');
}

/** Resolves after `ms`, or rejects at once when `signal` aborts. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      if (signal) reject(abortError(signal));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface ExplorerBatchOptions {
  signal?: AbortSignal;
  /** Each position's answer as it comes (from the cache or the network), with its index. */
  onResult?: (result: ExplorerResult, index: number) => void;
  /** Before a wait the explorer asked for (a 429): its length in seconds; null once it is over. */
  onWait?: (seconds: number | null) => void;
  pauseMs?: number;
  /** The lookup, the cache and the clock: replaceable in tests. */
  lookup?: (fen: Fen, database: ExplorerDatabase, signal?: AbortSignal) => Promise<ExplorerResult>;
  cached?: (fen: Fen, database: ExplorerDatabase) => ExplorerResult | null;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Looks many positions up one after another, as Lichess asks of API clients:
 * one request at a time (never alongside another lookup of the app), a short
 * pause between requests, and after a 429 a wait as long as its Retry-After
 * says (a minute when it says nothing) before the same position is asked
 * again. Positions already in the session's cache cost no request and no
 * pause. Resolves when every position has its answer; rejects with the first
 * other failure, or with the abort when `signal` aborts. The answers that came
 * before stay with the caller (`onResult`).
 */
export async function lookupExplorerBatch(
  fens: readonly Fen[],
  database: ExplorerDatabase,
  {
    signal,
    onResult,
    onWait,
    pauseMs = EXPLORER_BATCH_PAUSE_MS,
    lookup = lookupExplorer,
    cached = peekExplorer,
    sleep = pause,
  }: ExplorerBatchOptions = {},
): Promise<void> {
  /** A request went out: the next one waits a moment first. */
  let requested = false;
  let limitedInARow = 0;
  let index = 0;
  while (index < fens.length) {
    if (signal?.aborted) throw abortError(signal);
    const fen = fens[index];
    if (fen === undefined) break;
    const hit = cached(fen, database);
    if (hit) {
      onResult?.(hit, index);
      index += 1;
      continue;
    }
    if (requested) await sleep(pauseMs, signal);
    while (inFlight.size) await Promise.allSettled([...inFlight]);
    if (signal?.aborted) throw abortError(signal);
    requested = true;
    try {
      const result = await lookup(fen, database, signal);
      limitedInARow = 0;
      onResult?.(result, index);
      index += 1;
    } catch (err) {
      if (signal?.aborted) throw abortError(signal);
      const limited = err instanceof ExplorerError && err.kind === 'rate-limited';
      if (!limited || limitedInARow >= MAX_RATE_LIMITS_IN_A_ROW - 1) throw err;
      limitedInARow += 1;
      const seconds = Math.max(1, err.retryAfter ?? EXPLORER_DEFAULT_WAIT_SECONDS);
      onWait?.(seconds);
      await sleep(seconds * 1000, signal);
      onWait?.(null);
      // The wait was the pause.
      requested = false;
    }
  }
}

/**
 * A message for the card when a lookup fails: offline and unreachable are said
 * plainly instead of the browser's raw "Failed to fetch".
 */
export function describeExplorerError(err: unknown, online = navigator.onLine): string {
  if (!online) return 'You are offline — the explorer needs a network connection.';
  if (err instanceof TypeError) return 'The explorer could not be reached — check your connection.';
  if (err instanceof Error && err.message) return err.message;
  return 'The explorer is unavailable right now.';
}

/** "62 %" style formatting of a 0–1 share. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
