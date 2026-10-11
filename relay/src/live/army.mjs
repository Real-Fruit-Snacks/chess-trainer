/**
 * Army Draft's rules, shared by the relay's game rooms (a draft played online)
 * and the app (the arcade game against the engine, and the online draft's
 * builder): each side buys an army from a points budget and stands it on its
 * first two ranks, the king on e1 or e8. Nobody can castle.
 */
import { Chess } from 'chess.js';

/** @typedef {'q' | 'r' | 'b' | 'n' | 'p'} ArmyPiece */
/** @typedef {Record<ArmyPiece, number>} Army */

/** @type {Readonly<Record<ArmyPiece, number>>} */
export const PIECE_COST = Object.freeze({ q: 9, r: 5, b: 3, n: 3, p: 1 });
/** @type {readonly ArmyPiece[]} */
export const ARMY_PIECES = Object.freeze(['q', 'r', 'b', 'n', 'p']);
/** The back rank has seven squares beside the king; the second rank eight. */
export const MAX_PIECES = 7;
export const MAX_PAWNS = 8;
/** @type {Readonly<Army>} */
export const EMPTY_ARMY = Object.freeze({ q: 0, r: 0, b: 0, n: 0, p: 0 });

/** @param {Army} army */
export function armyCost(army) {
  return ARMY_PIECES.reduce((sum, piece) => sum + army[piece] * PIECE_COST[piece], 0);
}

/** Pieces other than pawns (and the king, which is free). @param {Army} army */
export function armyPieces(army) {
  return army.q + army.r + army.b + army.n;
}

/**
 * Why an army cannot be fielded, or null when it can.
 * @param {Army} army
 * @param {number} budget
 */
export function armyProblem(army, budget) {
  if (armyCost(army) > budget) return `Over budget by ${armyCost(army) - budget}.`;
  if (armyPieces(army) > MAX_PIECES) return `Only ${MAX_PIECES} pieces fit beside the king.`;
  if (army.p > MAX_PAWNS) return `Only ${MAX_PAWNS} pawns fit on the second rank.`;
  if (armyCost(army) === 0) return 'Buy at least one piece or pawn.';
  return null;
}

/**
 * An army from a message: five whole counts, nothing else; null otherwise.
 * @param {unknown} value
 * @returns {Army | null}
 */
export function parseArmy(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(record).some((key) => !ARMY_PIECES.includes(/** @type {ArmyPiece} */ (key)))) {
    return null;
  }
  /** @type {Army} */
  const army = { ...EMPTY_ARMY };
  for (const piece of ARMY_PIECES) {
    const count = record[piece] ?? 0;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 16) {
      return null;
    }
    army[piece] = count;
  }
  return army;
}

/**
 * A random army: buys piece by piece until nothing more fits (at most two queens).
 * @param {number} budget
 * @param {() => number} [random]
 * @returns {Army}
 */
export function randomArmy(budget, random = Math.random) {
  /** @type {Army} */
  const army = { ...EMPTY_ARMY };
  /** @type {Record<ArmyPiece, number>} */
  const weights = { q: 1, r: 2, b: 2.5, n: 2.5, p: 4 };
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
    let chosen = /** @type {ArmyPiece} */ (options[options.length - 1]);
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

/** Back-rank files in the order pieces take them (rooks first, from the corners). */
/** @type {Record<ArmyPiece, string[]>} */
const BACK_RANK_ORDER = {
  r: ['a', 'h', 'd', 'c', 'f', 'b', 'g'],
  n: ['b', 'g', 'c', 'f', 'd', 'a', 'h'],
  b: ['c', 'f', 'd', 'b', 'g', 'a', 'h'],
  q: ['d', 'c', 'f', 'b', 'g', 'a', 'h'],
  p: [],
};
/** Pawns fill the second rank from the centre outwards. */
const PAWN_ORDER = ['e', 'd', 'f', 'c', 'g', 'b', 'h', 'a'];
/** Pieces are placed in this order so the big ones get their favourite squares. */
/** @type {readonly ArmyPiece[]} */
const PLACEMENT_ORDER = ['r', 'q', 'b', 'n'];

/**
 * Where each man of `army` stands for `color`: square → piece ('k' for the king).
 * @param {Army} army
 * @param {'white' | 'black'} color
 * @returns {Map<string, ArmyPiece | 'k'>}
 */
export function placeArmy(army, color) {
  const back = color === 'white' ? '1' : '8';
  const second = color === 'white' ? '2' : '7';
  /** @type {Map<string, ArmyPiece | 'k'>} */
  const placed = new Map();
  placed.set(`e${back}`, 'k');
  for (const piece of PLACEMENT_ORDER) {
    for (let i = 0; i < army[piece]; i++) {
      const file = BACK_RANK_ORDER[piece].find((f) => !placed.has(`${f}${back}`));
      if (!file) break;
      placed.set(`${file}${back}`, piece);
    }
  }
  for (let i = 0; i < Math.min(army.p, MAX_PAWNS); i++) {
    const file = PAWN_ORDER[i];
    if (file) placed.set(`${file}${second}`, 'p');
  }
  return placed;
}

/**
 * The starting position of a draft: White's army against Black's, White to move.
 * @param {Army} white
 * @param {Army} black
 */
export function draftFen(white, black) {
  const chess = new Chess();
  chess.clear();
  for (const [square, piece] of placeArmy(white, 'white')) {
    chess.put({ type: piece, color: 'w' }, /** @type {import('chess.js').Square} */ (square));
  }
  for (const [square, piece] of placeArmy(black, 'black')) {
    chess.put({ type: piece, color: 'b' }, /** @type {import('chess.js').Square} */ (square));
  }
  // Nobody castles from a drafted position.
  const parts = chess.fen().split(' ');
  parts[2] = '-';
  return parts.join(' ');
}
