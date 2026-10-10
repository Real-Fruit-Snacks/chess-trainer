/** Types for rules.mjs, for the relay's tests. */
import type { Chess, Move } from 'chess.js';

export function playUci(chess: Chess, uci: unknown): Move | null;
export function replay(moves: readonly string[]): Chess | null;
export function endOf(chess: Chess): { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null;
export function cannotMate(chess: Chess, color: 'w' | 'b'): boolean;
