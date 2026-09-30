import type { Fen, San, Uci } from '@/chess/types';

/**
 * Optional lookups against the Lichess Syzygy tablebase service for positions
 * with seven pieces or fewer. Off by default (settings.tablebase) because it
 * needs the network; every call is abortable and results are cached per EPD.
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

export async function lookupTablebase(fen: Fen, signal?: AbortSignal): Promise<TablebaseResult> {
  const key = fen.split(' ').slice(0, 4).join(' ');
  const cached = cache.get(key);
  if (cached) return cached;
  const url = `${TABLEBASE_ENDPOINT}?fen=${encodeURIComponent(fen.replace(/ /g, '_'))}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Tablebase request failed (HTTP ${res.status})`);
  const result = normalizeTablebase((await res.json()) as ApiResponse);
  cache.set(key, result);
  return result;
}
