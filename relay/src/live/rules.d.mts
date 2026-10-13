/** Types for rules.mjs, for the relay's tests and the app. */
import type { Chess, Move } from 'chess.js';
import type { Chess960Game, Chess960Played } from './chess960.mjs';

/** A game of chess (or a variant of it) on chess.js, or a Chess960 game. */
export type RulesGame = Chess | Chess960Game;

export function playUci(chess: Chess, uci: unknown): Move | null;
export function playUci(chess: Chess960Game, uci: unknown): Chess960Played | null;
export function playUci(chess: RulesGame, uci: unknown): Move | Chess960Played | null;
export function replay(moves: readonly string[], startFen?: string | null): Chess | null;
export function replay(
  moves: readonly string[],
  startFen: string | null,
  game: 'chess960',
): Chess960Game | null;
export function replay(
  moves: readonly string[],
  startFen: string | null | undefined,
  game: string | undefined,
): RulesGame | null;
export function endOf(
  chess: RulesGame,
): { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null;
export function cannotMate(chess: RulesGame, color: 'w' | 'b'): boolean;
