import type { Fen, San, Uci } from '@/chess/types';
import { fetchWithTimeout, isTimeoutError, retryAfterSeconds } from './fetchWithTimeout';

/**
 * Optional lookups against the Lichess Syzygy tablebase service for positions
 * with seven pieces or fewer. Off by default (settings.tablebase) because it
 * needs the network; every call is abortable, times out, and results are
 * cached per position including the halfmove clock (the 50-move categories
 * depend on it).
 *
 * API: https://github.com/lichess-org/lila-tablebase
 */
export type TablebaseCategory =
  'win' | 'cursed-win' | 'maybe-win' | 'draw' | 'blessed-loss' | 'maybe-loss' | 'loss' | 'unknown';

export interface TablebaseMove {
  uci: Uci;
  san: San;
  /** Outcome for the side making the move. */
  outcome: TablebaseCategory;
  dtz: number | null;
  dtm: number | null;
  zeroing: boolean;
  checkmate: boolean;
  stalemate: boolean;
}

export interface TablebaseResult {
  /** Outcome for the side to move. */
  category: TablebaseCategory;
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  insufficientMaterial: boolean;
  moves: TablebaseMove[];
}

interface ApiMove {
  uci: string;
  san: string;
  category: string;
  dtz: number | null;
  dtm: number | null;
  zeroing?: boolean;
  checkmate?: boolean;
  stalemate?: boolean;
}

interface ApiResponse {
  category: string;
  dtz: number | null;
  dtm: number | null;
  checkmate?: boolean;
  stalemate?: boolean;
  insufficient_material?: boolean;
  moves?: ApiMove[];
}

export const TABLEBASE_ENDPOINT = 'https://tablebase.lichess.ovh/standard';
export const TABLEBASE_MAX_PIECES = 7;

const cache = new Map<string, TablebaseResult>();

export function pieceCount(fen: Fen): number {
  const board = fen.split(' ')[0] ?? '';
  return (board.match(/[prnbqkPRNBQK]/g) ?? []).length;
}

export function isTablebasePosition(fen: Fen): boolean {
  return pieceCount(fen) <= TABLEBASE_MAX_PIECES;
}

const CATEGORIES: readonly TablebaseCategory[] = [
  'win',
  'cursed-win',
  'maybe-win',
  'draw',
  'blessed-loss',
  'maybe-loss',
  'loss',
  'unknown',
];

function toCategory(value: string): TablebaseCategory {
  return (CATEGORIES as readonly string[]).includes(value)
    ? (value as TablebaseCategory)
    : 'unknown';
}

/** Flips a category to the other side's point of view. */
export function invertCategory(category: TablebaseCategory): TablebaseCategory {
  switch (category) {
    case 'win':
      return 'loss';
    case 'loss':
      return 'win';
    case 'cursed-win':
      return 'blessed-loss';
    case 'blessed-loss':
      return 'cursed-win';
    case 'maybe-win':
      return 'maybe-loss';
    case 'maybe-loss':
      return 'maybe-win';
    default:
      return category;
  }
}

export function describeCategory(category: TablebaseCategory): string {
  switch (category) {
    case 'win':
      return 'Winning';
    case 'cursed-win':
      return 'Winning, but drawn by the 50-move rule';
    case 'maybe-win':
      return 'Probably winning';
    case 'draw':
      return 'Drawn';
    case 'blessed-loss':
      return 'Lost, but saved by the 50-move rule';
    case 'maybe-loss':
      return 'Probably lost';
    case 'loss':
      return 'Losing';
    default:
      return 'Unknown';
  }
}

/** Sort order for moves: best for the mover first. */
const RANK: Record<TablebaseCategory, number> = {
  win: 0,
  'maybe-win': 1,
  'cursed-win': 2,
  draw: 3,
  unknown: 4,
  'blessed-loss': 5,
  'maybe-loss': 6,
  loss: 7,
};

export function normalizeTablebase(data: ApiResponse): TablebaseResult {
  const moves: TablebaseMove[] = (data.moves ?? []).map((m) => ({
    uci: m.uci,
    san: m.san,
    // The API reports each move from the opponent's point of view after it is played.
    outcome: invertCategory(toCategory(m.category)),
    dtz: m.dtz,
    dtm: m.dtm,
    zeroing: !!m.zeroing,
    checkmate: !!m.checkmate,
    stalemate: !!m.stalemate,
  }));
  moves.sort((a, b) => {
    const byOutcome = RANK[a.outcome] - RANK[b.outcome];
    if (byOutcome !== 0) return byOutcome;
    // Winning: shortest mate/dtz first. Losing: longest resistance first.
    const az = Math.abs(a.dtm ?? a.dtz ?? 0);
    const bz = Math.abs(b.dtm ?? b.dtz ?? 0);
    return RANK[a.outcome] <= RANK.draw ? az - bz : bz - az;
  });
  return {
    category: toCategory(data.category),
    dtz: data.dtz,
    dtm: data.dtm,
    checkmate: !!data.checkmate,
    stalemate: !!data.stalemate,
    insufficientMaterial: !!data.insufficient_material,
    moves,
  };
}

/** Cache key: placement, side to move, castling, en passant and the halfmove clock (not the move number). */
export function tablebaseCacheKey(fen: Fen): string {
  const parts = fen.split(' ');
  return `${parts.slice(0, 4).join(' ')} ${parts[4] ?? '0'}`;
}

/** Thrown with a message fit for the panel ("Tablebase unavailable: …"). */
export class TablebaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TablebaseError';
  }
}

export const TABLEBASE_TIMEOUT_MS = 15_000;

export async function lookupTablebase(fen: Fen, signal?: AbortSignal): Promise<TablebaseResult> {
  const key = tablebaseCacheKey(fen);
  const cached = cache.get(key);
  if (cached) return cached;
  const url = `${TABLEBASE_ENDPOINT}?fen=${encodeURIComponent(fen.replace(/ /g, '_'))}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { signal, timeoutMs: TABLEBASE_TIMEOUT_MS });
  } catch (err) {
    if (isTimeoutError(err)) throw new TablebaseError('the server took too long to answer');
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new TablebaseError('could not reach the server — are you online?');
  }
  if (res.status === 429) {
    const wait = retryAfterSeconds(res);
    throw new TablebaseError(
      wait ? `rate-limited, try again in ${wait} s` : 'rate-limited, try again in a minute',
    );
  }
  if (!res.ok) throw new TablebaseError(`the server answered HTTP ${res.status}`);
  let data: ApiResponse;
  try {
    data = (await res.json()) as ApiResponse;
  } catch {
    throw new TablebaseError('the server sent an unreadable answer');
  }
  const result = normalizeTablebase(data);
  cache.set(key, result);
  return result;
}

/** "mate in N" for a DTM in half-moves (the API counts plies; players count moves). */
export function describeDtm(dtm: number): string {
  return `mate in ${Math.ceil(Math.abs(dtm) / 2)}`;
}
