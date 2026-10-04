import { Chess, type Square } from 'chess.js';
import type { Fen, LongColor } from '@/chess/types';

/**
 * Army Draft: both sides buy an army from a points budget and place it on
 * their first two ranks, then play. Kings are free and always on e1/e8;
 * nobody can castle.
 */
export type ArmyPiece = 'q' | 'r' | 'b' | 'n' | 'p';
export type Army = Record<ArmyPiece, number>;

export const PIECE_COST: Record<ArmyPiece, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
export const PIECE_NAME: Record<ArmyPiece, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};
export const ARMY_PIECES: readonly ArmyPiece[] = ['q', 'r', 'b', 'n', 'p'];
/** The back rank has seven squares beside the king; the second rank eight. */
export const MAX_PIECES = 7;
export const MAX_PAWNS = 8;
export const BUDGETS = [20, 30, 39] as const;
export const DEFAULT_BUDGET = 30;

export const EMPTY_ARMY: Army = { q: 0, r: 0, b: 0, n: 0, p: 0 };

export function armyCost(army: Army): number {
  return ARMY_PIECES.reduce((sum, piece) => sum + army[piece] * PIECE_COST[piece], 0);
}

export function armyPieces(army: Army): number {
  return army.q + army.r + army.b + army.n;
}

/** The budget in words, for screen readers: "28 of 30 points spent, 2 left." */
export function describeBudget(army: Army, budget: number): string {
  const cost = armyCost(army);
  if (cost > budget) return `${cost} of ${budget} points: ${cost - budget} over budget.`;
  return `${cost} of ${budget} points spent, ${budget - cost} left.`;
}

/** Why an army cannot be fielded, or null when it can. */
export function armyProblem(army: Army, budget: number): string | null {
  if (armyCost(army) > budget) return `Over budget by ${armyCost(army) - budget}.`;
  if (armyPieces(army) > MAX_PIECES) return `Only ${MAX_PIECES} pieces fit beside the king.`;
  if (army.p > MAX_PAWNS) return `Only ${MAX_PAWNS} pawns fit on the second rank.`;
  if (armyCost(army) === 0) return 'Buy at least one piece or pawn.';
  return null;
}

/** Can one more of `piece` be added within the budget and the board? */
export function canAdd(army: Army, piece: ArmyPiece, budget: number): boolean {
  return armyProblem({ ...army, [piece]: army[piece] + 1 }, budget) === null;
}

export interface ArmyPreset {
  id: string;
  name: string;
  army: Army;
  budget: number;
}

export const ARMY_PRESETS: readonly ArmyPreset[] = [
  { id: 'balanced', name: 'Balanced', army: { q: 1, r: 2, b: 1, n: 1, p: 5 }, budget: 30 },
  { id: 'cavalry', name: 'Cavalry', army: { q: 0, r: 1, b: 1, n: 4, p: 8 }, budget: 30 },
  { id: 'towers', name: 'Towers', army: { q: 0, r: 4, b: 0, n: 0, p: 8 }, budget: 30 },
  { id: 'queens', name: 'Three queens', army: { q: 3, r: 0, b: 0, n: 0, p: 3 }, budget: 30 },
  { id: 'phalanx', name: 'Phalanx', army: { q: 1, r: 0, b: 3, n: 1, p: 8 }, budget: 30 },
  { id: 'standard', name: 'Standard set', army: { q: 1, r: 2, b: 2, n: 2, p: 8 }, budget: 39 },
];

/** A random army for the engine: buys piece by piece until nothing more fits. */
export function randomArmy(budget: number, random: () => number = Math.random): Army {
  const army: Army = { ...EMPTY_ARMY };
  const weights: Record<ArmyPiece, number> = { q: 1, r: 2, b: 2.5, n: 2.5, p: 4 };
  for (let guard = 0; guard < 60; guard++) {
    const options = ARMY_PIECES.filter((piece) => {
      const next = { ...army, [piece]: army[piece] + 1 };
      return (
        armyCost(next) <= budget &&
        armyPieces(next) <= MAX_PIECES &&
        next.p <= MAX_PAWNS &&
        (piece !== 'q' || army.q < 2)
      );
    });
    if (options.length === 0) break;
    const total = options.reduce((sum, p) => sum + weights[p], 0);
    let r = random() * total;
    let chosen: ArmyPiece = options[options.length - 1] as ArmyPiece;
    for (const piece of options) {
      r -= weights[piece];
      if (r <= 0) {
        chosen = piece;
        break;
      }
    }
    army[chosen] += 1;
  }
  return army;
}

/** Back-rank squares in the order pieces are placed (rooks first, from the corners). */
const BACK_RANK_ORDER: Record<ArmyPiece, string[]> = {
  r: ['a', 'h', 'd', 'c', 'f', 'b', 'g'],
  n: ['b', 'g', 'c', 'f', 'd', 'a', 'h'],
  b: ['c', 'f', 'd', 'b', 'g', 'a', 'h'],
  q: ['d', 'c', 'f', 'b', 'g', 'a', 'h'],
  p: [],
};
/** Pawns fill the second rank from the centre outwards. */
const PAWN_ORDER = ['e', 'd', 'f', 'c', 'g', 'b', 'h', 'a'];
/** Pieces are placed in this order so the big ones get their favourite squares. */
const PLACEMENT_ORDER: readonly ArmyPiece[] = ['r', 'q', 'b', 'n'];

/** Where each man of `army` stands for `color`. */
export function placeArmy(army: Army, color: LongColor): Map<Square, ArmyPiece | 'k'> {
  const back = color === 'white' ? '1' : '8';
  const second = color === 'white' ? '2' : '7';
  const placed = new Map<Square, ArmyPiece | 'k'>();
  placed.set(`e${back}` as Square, 'k');
  for (const piece of PLACEMENT_ORDER) {
    for (let i = 0; i < army[piece]; i++) {
      const file = BACK_RANK_ORDER[piece].find((f) => !placed.has(`${f}${back}` as Square));
      if (!file) break;
      placed.set(`${file}${back}` as Square, piece);
    }
  }
  for (let i = 0; i < Math.min(army.p, MAX_PAWNS); i++) {
    const file = PAWN_ORDER[i];
    if (file) placed.set(`${file}${second}` as Square, 'p');
  }
  return placed;
}

/** The starting position of a draft: White's army against Black's, White to move. */
export function draftFen(white: Army, black: Army): Fen {
  const chess = new Chess();
  chess.clear();
  for (const [square, piece] of placeArmy(white, 'white')) {
    chess.put({ type: piece, color: 'w' }, square);
  }
  for (const [square, piece] of placeArmy(black, 'black')) {
    chess.put({ type: piece, color: 'b' }, square);
  }
  // Nobody castles from a drafted position.
  const parts = chess.fen().split(' ');
  parts[2] = '-';
  return parts.join(' ');
}

export function describeArmy(army: Army): string {
  const parts = ARMY_PIECES.filter((p) => army[p] > 0).map(
    (p) => `${army[p]} ${PIECE_NAME[p].toLowerCase()}${army[p] === 1 ? '' : 's'}`,
  );
  return parts.length ? parts.join(', ') : 'a lone king';
}
