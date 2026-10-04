import { Chess } from 'chess.js';
import type { Fen } from '@/chess/types';
import { shuffle } from '@/lib/random';
import type { ClassicGame } from '@/features/classics/games';
import {
  ALL_KINDS,
  type IllegalKind,
  type IllegalMove,
  illegalMoves,
  KIND_TIER,
  type PlayedMove,
  type Tier,
} from './arbiterMoves';

/**
 * Arbiter: a classic game replays at speed and one move in each round breaks
 * the rules. Call it before the next move would come. The rounds grow faster
 * and their illegal moves subtler; three strikes — a missed move or a call on
 * a legal one — end the run. The score is the illegal moves caught.
 */

export const STRIKES = 3;

/** A move of a replayed game, with the position it leaves. */
export interface ReplayMove extends PlayedMove {
  fen: Fen;
}

/** A classic game read move by move. */
export interface ReplayGame {
  id: string;
  title: string;
  /** "Morphy v Duke of Brunswick, 1858". */
  caption: string;
  /** The position before each move, and after the last: `positions[i]` follows `moves[i - 1]`. */
  positions: Fen[];
  moves: ReplayMove[];
}

export function replayGame(game: ClassicGame): ReplayGame {
  const chess = new Chess();
  const positions: Fen[] = [chess.fen()];
  const moves: ReplayMove[] = [];
  for (const san of game.moves.split(/\s+/).filter(Boolean)) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    moves.push({
      from: move.from,
      to: move.to,
      san: move.san,
      piece: move.piece,
      color: move.color,
      fen: move.after,
    });
    positions.push(move.after);
  }
  return {
    id: game.id,
    title: game.title,
    caption: `${game.white} v ${game.black}, ${game.year}`,
    positions,
    moves,
  };
}

/** One round: a stretch of a real game, then the illegal move. */
export interface ArbiterRound {
  gameId: string;
  title: string;
  caption: string;
  /** Moves already played at the start position (for the move numbers). */
  startPly: number;
  startFen: Fen;
  /** The real moves played before the illegal one. */
  lead: ReplayMove[];
  illegal: IllegalMove;
}

/** How subtle a round's illegal move is: the shapes first, then where they apply, then the king. */
export function tierForRound(round: number): Tier {
  if (round <= 3) return 1;
  if (round <= 7) return 2;
  return 3;
}

/**
 * The kind to look for next: mostly the round's own tier, now and then one
 * tier lower, never one of the last few kinds shown.
 */
export function pickKind(
  round: number,
  random: () => number,
  recent: readonly IllegalKind[] = [],
): IllegalKind {
  const tier = tierForRound(round);
  const wanted: Tier = tier > 1 && random() < 0.3 ? ((tier - 1) as Tier) : tier;
  const kinds = ALL_KINDS.filter((k) => KIND_TIER[k] === wanted);
  const fresh = kinds.filter((k) => !recent.includes(k));
  const pool = fresh.length ? fresh : kinds;
  return pool[Math.floor(random() * pool.length)] ?? 'knight-shape';
}

/** The real moves shown before the illegal one: two to six, so it never comes first. */
function leadLength(random: () => number): number {
  return 2 + Math.floor(random() * 5);
}

/** The illegal moves of one kind at position `index` of a game. */
function candidatesAt(game: ReplayGame, index: number, kind: IllegalKind): IllegalMove[] {
  const fen = game.positions[index];
  if (!fen) return [];
  return illegalMoves({ fen, history: game.moves.slice(0, index) }, kind);
}

function roundAt(
  game: ReplayGame,
  index: number,
  lead: number,
  illegal: IllegalMove,
): ArbiterRound {
  const start = index - lead;
  return {
    gameId: game.id,
    title: game.title,
    caption: game.caption,
    startPly: start,
    startFen: game.positions[start] ?? (game.positions[0] as Fen),
    lead: game.moves.slice(start, index),
    illegal,
  };
}

/**
 * Builds a round: a kind for the round's tier, a game and a position where
 * that kind can happen (rare kinds such as castling through check are looked
 * for across whole games), and the real moves that lead up to it.
 */
export function buildRound(
  games: readonly ReplayGame[],
  round: number,
  random: () => number = Math.random,
  recent: readonly IllegalKind[] = [],
): ArbiterRound | null {
  if (games.length === 0) return null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const kind = pickKind(round, random, recent);
    const game = games[Math.floor(random() * games.length)];
    if (!game) continue;
    const lead = leadLength(random);
    const indices = shuffle(
      Array.from({ length: Math.max(0, game.moves.length - lead) }, (_, i) => i + lead),
      random,
    );
    for (const index of indices) {
      const options = candidatesAt(game, index, kind);
      const pick = options[Math.floor(random() * options.length)];
      if (pick) return roundAt(game, index, lead, pick);
    }
  }
  // Whatever happens, a knight off its L or a backward pawn is always somewhere.
  for (const game of games) {
    for (let index = 2; index < game.moves.length; index++) {
      for (const kind of ['knight-shape', 'pawn-backwards', 'own-capture'] as const) {
        const pick = candidatesAt(game, index, kind)[0];
        if (pick) return roundAt(game, index, 2, pick);
      }
    }
  }
  return null;
}

export type ArbiterPace = 'normal' | 'slow';

const PACES: Record<ArbiterPace, { start: number; factor: number; floor: number }> = {
  normal: { start: 1700, factor: 0.93, floor: 650 },
  slow: { start: 3000, factor: 0.95, floor: 1400 },
};

/** Milliseconds between moves in a round: shorter every round, down to a floor. */
export function stepMs(round: number, pace: ArbiterPace): number {
  const { start, factor, floor } = PACES[pace];
  return Math.max(floor, Math.round(start * factor ** Math.max(0, round - 1)));
}

/** The start position stays up a little longer, so the eye can find its way around it. */
export function leadInMs(round: number, pace: ArbiterPace): number {
  return stepMs(round, pace) + 900;
}

/**
 * How long a call can come after the illegal move appears: as long as the
 * next move would have taken, with a quarter of a second for the hand.
 */
export function callWindowMs(round: number, pace: ArbiterPace): number {
  return stepMs(round, pace) + 250;
}

/** The arcade record's words for a run. */
export function describeArbiter(caught: number, pace: ArbiterPace = 'normal'): string {
  return `${caught} illegal move${caught === 1 ? '' : 's'} caught${pace === 'slow' ? ' at the slow pace' : ''}`;
}

/** A call's speed in words: "0.48 s". */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}
