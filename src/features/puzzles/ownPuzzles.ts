import { Chess } from 'chess.js';
import { toUci } from '@/chess/helpers';
import type { Fen, San, Uci } from '@/chess/types';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { EngineClient } from '@/engine/EngineClient';
import type { Score } from '@/engine/uci';
import { hashString } from '@/lib/random';
import type { Puzzle } from './puzzleService';

/** Where an own-game puzzle came from, shown in the trainer. */
export interface OwnPuzzleSource {
  /** "alice – bob, 2026-09-29" or the game's event. */
  title: string;
  /** 1-based half-move of the mistake in the source game. */
  ply: number;
  /** The move that was actually played. */
  played: San;
  judgement: 'inaccuracy' | 'mistake' | 'blunder';
  /** Win-probability swing, 0–1. */
  loss: number;
  url?: string;
}

/** A puzzle made from a mistake in the learner's own game. */
export interface OwnPuzzle extends Puzzle {
  source: OwnPuzzleSource;
  createdAt: number;
  /**
   * True when the review showed the engine's move to be clearly best (its
   * second choice at least `MIN_OWN_PUZZLE_GAP_CP` worse). Otherwise another
   * move may be just as good, and the trainer checks the solver's move with
   * the engine before calling it wrong (see `verifyOwnPuzzleMove`).
   */
  verified?: boolean;
}

/** A mistake only becomes a puzzle when the best move is clearly better than the next one. */
export const MIN_OWN_PUZZLE_GAP_CP = 100;
/** At solve time a move this close to the engine's best (depth 12) counts as a solve. */
export const OWN_PUZZLE_ALTERNATIVE_CP = 50;
export const OWN_PUZZLE_VERIFY_DEPTH = 12;

/** Centipawns from the mover's point of view; mates map to ±10000 minus the distance. */
export function scoreCp(score: Score): number {
  if (score.type === 'mate') {
    if (score.value === 0) return -10_000;
    return Math.sign(score.value) * (10_000 - Math.abs(score.value));
  }
  return score.value;
}

/** Whether a move scoring `alternativeCp` is as good as the best move for the trainer's purposes. */
export function isAcceptableAlternative(bestCp: number, alternativeCp: number): boolean {
  return alternativeCp >= bestCp - OWN_PUZZLE_ALTERNATIVE_CP;
}

/**
 * Asks the engine whether `played` is (nearly) as good as `expected` in `fen`:
 * both moves are searched at a modest depth and compared from the mover's
 * point of view. Used for own-game puzzles whose review did not show a clear
 * gap, so that an equally good alternative is not marked "Not the best move".
 */
export async function verifyOwnPuzzleMove(
  engine: Pick<EngineClient, 'search'>,
  fen: Fen,
  expected: Uci,
  played: Uci,
  depth = OWN_PUZZLE_VERIFY_DEPTH,
): Promise<boolean> {
  const result = await engine.search({ fen, depth, multipv: 2, searchmoves: [expected, played] })
    .result;
  if (result.stopped) return false;
  const lines = [...result.lines.values()];
  const scoreOf = (uci: Uci) => {
    const line = lines.find((l) => l.pv[0] === uci);
    return line ? scoreCp(line.score) : null;
  };
  const best = scoreOf(expected);
  const alternative = scoreOf(played);
  if (alternative === null) return false;
  // The engine may rank the played move first: it is then at least as good.
  if (best === null) return result.bestmove.move === played;
  return isAcceptableAlternative(best, alternative);
}

export const OWN_PUZZLE_PREFIX = 'own-';

export function isOwnPuzzleId(id: string): boolean {
  return id.startsWith(OWN_PUZZLE_PREFIX);
}

/** Stable id: the same mistake in the same position is one puzzle. */
export function ownPuzzleId(fen: Fen, solution: Uci): string {
  return `${OWN_PUZZLE_PREFIX}${hashString(`${fen}|${solution}`).toString(36)}`;
}

/** The main line of a game as positions and moves (fens[i] = position after i plies). */
export interface MainLine {
  fens: Fen[];
  sans: San[];
}

export interface MomentLike {
  ply: number;
  san: San;
  mover: 'white' | 'black';
  judgement: MoveJudgement;
  loss: number;
  bestUci: Uci | null;
  /**
   * How much worse the engine's second choice was than its best move, in
   * centipawns (from a MultiPV 2 review). When the review recorded it, a small
   * gap means the position has several good moves and makes no puzzle.
   */
  bestGapCp?: number | null;
}

export interface OwnPuzzleMeta {
  title: string;
  url?: string;
  /** Difficulty label; the learner's puzzle rating is a reasonable default. */
  rating: number;
}

/**
 * Turns a reviewed mistake into a puzzle in the Lichess format: the position
 * before the opponent's last move, that move, then the engine's best reply.
 * Returns null for a first move (there is no opponent move to set the scene)
 * or when the review has no better move to offer.
 */
export function ownPuzzleFromMoment(
  line: MainLine,
  moment: MomentLike,
  meta: OwnPuzzleMeta,
  now = Date.now(),
): OwnPuzzle | null {
  if (
    moment.judgement !== 'inaccuracy' &&
    moment.judgement !== 'mistake' &&
    moment.judgement !== 'blunder'
  ) {
    return null;
  }
  if (!moment.bestUci || moment.ply < 2) return null;
  // Several moves about as good: there is no single answer to find.
  if (typeof moment.bestGapCp === 'number' && moment.bestGapCp < MIN_OWN_PUZZLE_GAP_CP) {
    return null;
  }
  const setupFen = line.fens[moment.ply - 2];
  const setupSan = line.sans[moment.ply - 2];
  const puzzleFen = line.fens[moment.ply - 1];
  if (!setupFen || !setupSan || !puzzleFen) return null;
  let setupUci: Uci;
  try {
    const chess = new Chess(setupFen);
    setupUci = toUci(chess.move(setupSan));
    const probe = new Chess(puzzleFen);
    probe.move({
      from: moment.bestUci.slice(0, 2),
      to: moment.bestUci.slice(2, 4),
      promotion: moment.bestUci[4],
    });
  } catch {
    return null;
  }
  return {
    id: ownPuzzleId(puzzleFen, moment.bestUci),
    fen: setupFen,
    moves: `${setupUci} ${moment.bestUci}`,
    rating: meta.rating,
    rd: 0,
    popularity: 0,
    plays: 0,
    themes: `ownGame ${moment.judgement}`,
    url: meta.url ?? '',
    source: {
      title: meta.title,
      ply: moment.ply,
      played: moment.san,
      judgement: moment.judgement,
      loss: moment.loss,
      url: meta.url,
    },
    createdAt: now,
    verified: typeof moment.bestGapCp === 'number',
  };
}

export type OwnPuzzleSide = 'both' | 'white' | 'black';

/**
 * Every mistake and blunder of a reviewed game (optionally one side only) as
 * puzzles, biggest swing first.
 */
export function ownPuzzlesFromReview(
  line: MainLine,
  review: { moves: MomentLike[] },
  meta: OwnPuzzleMeta,
  options: { side?: OwnPuzzleSide; includeInaccuracies?: boolean } = {},
  now = Date.now(),
): OwnPuzzle[] {
  const side = options.side ?? 'both';
  return review.moves
    .filter((m) => side === 'both' || m.mover === side)
    .filter(
      (m) =>
        m.judgement === 'blunder' ||
        m.judgement === 'mistake' ||
        (options.includeInaccuracies === true && m.judgement === 'inaccuracy'),
    )
    .sort((a, b) => b.loss - a.loss)
    .map((m) => ownPuzzleFromMoment(line, m, meta, now))
    .filter((p): p is OwnPuzzle => p !== null);
}

/** Title for a puzzle's source, from PGN-style headers. */
export function gameTitle(headers: Record<string, string>): string {
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  const date = headers.Date?.replace(/\?/g, '').replace(/\.$/, '').trim();
  const players =
    white && black ? `${white} – ${black}` : (headers.Event?.trim() ?? 'Analysed game');
  return date && date.length >= 4 ? `${players}, ${date}` : players;
}
