import type { Square } from 'chess.js';
import type { Fen, LongColor } from '@/chess/types';
import {
  ARMY_PIECES,
  type Army,
  type ArmyPiece,
  armyCost,
  armyPieces,
  armyProblem,
  draftFen as relayDraftFen,
  EMPTY_ARMY,
  MAX_PAWNS,
  MAX_PIECES,
  PIECE_COST,
  placeArmy as relayPlaceArmy,
  randomArmy,
} from '../../../relay/src/live/army.mjs';
import { ARMY_BUDGETS } from '../../../relay/src/live/shared.mjs';

/**
 * Army Draft: both sides buy an army from a points budget and place it on
 * their first two ranks, then play. Kings are free and always on e1/e8;
 * nobody can castle. The rules themselves are the relay's (relay/src/live/
 * army.mjs), so a draft against the engine and one against a person online
 * are the same game.
 */
export type { Army, ArmyPiece };
export {
  ARMY_PIECES,
  armyCost,
  armyPieces,
  armyProblem,
  EMPTY_ARMY,
  MAX_PAWNS,
  MAX_PIECES,
  PIECE_COST,
  randomArmy,
};

export const PIECE_NAME: Record<ArmyPiece, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};
export const BUDGETS = ARMY_BUDGETS;
export const DEFAULT_BUDGET = 30;

/** The budget in words, for screen readers: "28 of 30 points spent, 2 left." */
export function describeBudget(army: Army, budget: number): string {
  const cost = armyCost(army);
  if (cost > budget) return `${cost} of ${budget} points: ${cost - budget} over budget.`;
  return `${cost} of ${budget} points spent, ${budget - cost} left.`;
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

/** Where each man of `army` stands for `color`. */
export function placeArmy(army: Army, color: LongColor): Map<Square, ArmyPiece | 'k'> {
  return relayPlaceArmy(army, color) as Map<Square, ArmyPiece | 'k'>;
}

/** The starting position of a draft: White's army against Black's, White to move. */
export function draftFen(white: Army, black: Army): Fen {
  return relayDraftFen(white, black);
}

export function describeArmy(army: Army): string {
  const parts = ARMY_PIECES.filter((p) => army[p] > 0).map(
    (p) => `${army[p]} ${PIECE_NAME[p].toLowerCase()}${army[p] === 1 ? '' : 's'}`,
  );
  return parts.length ? parts.join(', ') : 'a lone king';
}
