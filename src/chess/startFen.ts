import type { Fen } from './types';

/**
 * The standard starting position, kept apart from the chess helpers so code
 * that only needs the constant (the stores, at start-up) does not pull in
 * chess.js.
 */
export const START_FEN: Fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
