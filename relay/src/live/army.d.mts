/** Types for army.mjs, for TypeScript callers: the app (Army Draft) and the relay's tests. */

export type ArmyPiece = 'q' | 'r' | 'b' | 'n' | 'p';
export type Army = Record<ArmyPiece, number>;

export const PIECE_COST: Readonly<Record<ArmyPiece, number>>;
export const ARMY_PIECES: readonly ArmyPiece[];
export const MAX_PIECES: number;
export const MAX_PAWNS: number;
export const EMPTY_ARMY: Readonly<Army>;

export function armyCost(army: Army): number;
export function armyPieces(army: Army): number;
export function armyProblem(army: Army, budget: number): string | null;
export function parseArmy(value: unknown): Army | null;
export function randomArmy(budget: number, random?: () => number): Army;
export function placeArmy(army: Army, color: 'white' | 'black'): Map<string, ArmyPiece | 'k'>;
export function draftFen(white: Army, black: Army): string;
