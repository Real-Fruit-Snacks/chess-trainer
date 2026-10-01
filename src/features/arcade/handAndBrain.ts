import type { Chess, PieceSymbol, Square } from 'chess.js';
import type { Score } from '@/engine/uci';

/**
 * Hand & Brain: the partner names only the piece type ("knight!"), the other
 * side of the partnership finds the move. Every call is scored against the
 * engine's real best move.
 */
export type Role = 'brain' | 'hand';
export type PieceType = PieceSymbol;

export const PIECE_LABEL: Record<PieceType, string> = {
  k: 'King',
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};

export const PIECE_ORDER: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

/** Search depth for the partner and for grading. */
export const PARTNER_DEPTH = 12;

/** The piece types the side to move can legally move, in display order. */
export function movableTypes(chess: Chess, dests: Map<Square, Square[]>): PieceType[] {
  const types = new Set<PieceType>();
  for (const [from, to] of dests) {
    if (to.length === 0) continue;
    const piece = chess.get(from);
    if (piece) types.add(piece.type);
  }
  return PIECE_ORDER.filter((t) => types.has(t));
}

/** Legal destinations restricted to pieces of one type. */
export function destsForType(
  chess: Chess,
  dests: Map<Square, Square[]>,
  type: PieceType,
): Map<Square, Square[]> {
  const out = new Map<Square, Square[]>();
  for (const [from, to] of dests) {
    if (chess.get(from)?.type === type) out.set(from, to);
  }
  return out;
}

/** The legal moves (UCI) of pieces of one type. */
export function movesForType(chess: Chess, type: PieceType): string[] {
  return chess
    .moves({ verbose: true })
    .filter((m) => m.piece === type)
    .map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
}

/** An engine score as centipawns from the side to move's view; mates count as ±10000 minus the distance. */
export function scoreToCp(score: Score | null | undefined): number {
  if (!score) return 0;
  if (score.type === 'mate') {
    return score.value > 0 ? 10_000 - score.value : -10_000 - score.value;
  }
  return score.value;
}

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** How much the call gave away compared with the engine's best, in words. */
export function gradeLoss(lossCp: number): Grade {
  if (lossCp <= 0) return 'best';
  if (lossCp <= 40) return 'good';
  if (lossCp <= 100) return 'inaccuracy';
  if (lossCp <= 300) return 'mistake';
  return 'blunder';
}

/** 100 for the best move, falling to 0 at a 200-centipawn loss. */
export function callAccuracy(lossCp: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - lossCp / 2)));
}

export interface CallRecord {
  ply: number;
  /** The piece type called (by the Brain, or by the partner for the Hand). */
  type: PieceType;
  /** The move that was played, in SAN. */
  san: string;
  /** The engine's own best move, in SAN, and the piece it moves. */
  bestSan: string;
  bestType: PieceType;
  lossCp: number;
  grade: Grade;
}

export interface CallSummary {
  calls: number;
  accuracy: number;
  counts: Record<Grade, number>;
}

export function summarizeCalls(calls: readonly CallRecord[]): CallSummary {
  const counts: Record<Grade, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  let total = 0;
  for (const call of calls) {
    counts[call.grade] += 1;
    total += callAccuracy(call.lossCp);
  }
  return {
    calls: calls.length,
    accuracy: calls.length ? Math.round(total / calls.length) : 0,
    counts,
  };
}

export function describeCall(call: CallRecord, role: Role): string {
  const label = PIECE_LABEL[call.type];
  switch (call.grade) {
    case 'best':
      if (call.san !== call.bestSan) {
        return `${call.san} is every bit as good as the engine's ${call.bestSan}.`;
      }
      return role === 'brain'
        ? `${label}: the engine agrees — ${call.san} was its move too.`
        : `${call.san}: exactly the engine's move.`;
    case 'good':
      return role === 'brain'
        ? `${label}: ${call.san} is nearly as good as the best, ${call.bestSan}.`
        : `${call.san} is nearly as good as the best, ${call.bestSan}.`;
    case 'inaccuracy':
      return role === 'brain'
        ? `${label} was a little off: ${call.bestSan} (${PIECE_LABEL[call.bestType].toLowerCase()}) was better.`
        : `${call.san} was a little off: ${call.bestSan} was the move.`;
    case 'mistake':
      return role === 'brain'
        ? `${label} was a mistake: ${PIECE_LABEL[call.bestType].toLowerCase()} was the piece (${call.bestSan}).`
        : `${call.san} was a mistake: ${call.bestSan} was the move.`;
    default:
      return role === 'brain'
        ? `${label} was a blunder: ${call.bestSan} was needed.`
        : `${call.san} was a blunder: ${call.bestSan} was needed.`;
  }
}
