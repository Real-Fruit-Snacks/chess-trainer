import type { Fen, San, Uci } from '@/chess/types';
import { fetchWithTimeout, isTimeoutError, retryAfterSeconds } from './fetchWithTimeout';

/**
 * Optional lookups against the Lichess opening explorer: what people actually
 * play in a position and how it goes for them. Off by default
 * (settings.explorer) because it needs the network; every call is abortable,
 * gives up after 15 seconds, and results are cached per position and database.
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

export const EXPLORER_ENDPOINT = 'https://explorer.lichess.ovh';
/** Lichess games: the rating bands and speeds that make up the "community" database. */
export const LICHESS_RATINGS = [1600, 1800, 2000, 2200];
export const LICHESS_SPEEDS = ['blitz', 'rapid', 'classical'];

const cache = new Map<string, ExplorerResult>();

/** Milliseconds a lookup may take before it is given up on. */
export const EXPLORER_TIMEOUT_MS = 15_000;

/** A failed lookup, with a message fit for the explorer card. */
export class ExplorerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExplorerError';
  }
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
  const key = `${database}:${fen.split(' ').slice(0, 4).join(' ')}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let res: Response;
  try {
    res = await fetchWithTimeout(explorerUrl(fen, database), {
      signal,
      timeoutMs: EXPLORER_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new ExplorerError('The explorer took too long to answer — try again in a moment.');
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
    );
  }
  if (!res.ok) {
    throw new ExplorerError(`The explorer answered HTTP ${res.status} — try again later.`);
  }
  let data: ApiResponse;
  try {
    data = (await res.json()) as ApiResponse;
  } catch {
    throw new ExplorerError('The explorer sent an answer that could not be read.');
  }
  const result = scoreForMover(normalizeExplorer(data, database), fen);
  cache.set(key, result);
  return result;
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
