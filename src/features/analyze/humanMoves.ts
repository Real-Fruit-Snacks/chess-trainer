import type { Fen, Uci } from '@/chess/types';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { EngineClient, SearchParams } from '@/engine/EngineClient';
import type { MaiaMove } from '@/engine/maia/encoding';
import { cpToWinProbability, type Score } from '@/engine/uci';
import { scoreCp } from '@/features/puzzles/ownPuzzles';
import { explainMove } from './commentary';
import { judge, mateFloor } from './gameReview';

/**
 * Human moves in Analyze: what players of a rating play in a position (the
 * human-like model's share for each move), with the engine's verdict on each
 * and a warning when the move most of them choose is a mistake — a trap at
 * that level.
 */

/** Moves fewer players than this choose are left out… */
export const HUMAN_MOVE_FLOOR = 0.03;
/** …and at most this many are shown. */
export const HUMAN_MOVE_LIMIT = 5;
/** How deep the engine looks at the moves: a short search, all of them in one. */
export const HUMAN_CHECK_DEPTH = 12;

/** The moves worth showing: the likeliest few (the first always, however rare). */
export function topHumanMoves(moves: readonly MaiaMove[]): MaiaMove[] {
  return moves
    .filter((m, i) => i === 0 || m.probability >= HUMAN_MOVE_FLOOR)
    .slice(0, HUMAN_MOVE_LIMIT);
}

/** Whether `uci` is legal by the board's destinations (a line left over from another position is not). */
export function legalIn(dests: ReadonlyMap<string, readonly string[]>, uci: Uci): boolean {
  return dests.get(uci.slice(0, 2))?.includes(uci.slice(2, 4)) ?? false;
}

/** One move as the engine sees it: its score for the side to move, and the line that follows. */
export interface EngineLine {
  uci: Uci;
  score: Score;
  pv: Uci[];
}

/** The engine's look at some of a position's moves, all searched together. */
export interface PositionCheck {
  depth: number;
  /** The strongest move searched: the engine's own choice. */
  best: EngineLine;
  /** Every move searched, the best included. */
  lines: Map<Uci, EngineLine>;
}

export interface HumanVerdict {
  judgement: NonNullable<MoveJudgement>;
  /** Win probability given away against the engine's choice, 0–1. */
  loss: number;
  /** The move's score, for the side to move. */
  score: Score;
}

/**
 * The engine's verdict on a move, judged like the game review judges a move:
 * by the winning chances it gives away against the best move (mates count
 * for more). Null when the move was not searched.
 */
export function verdictOf(check: PositionCheck, uci: Uci): HumanVerdict | null {
  const line = check.lines.get(uci);
  if (!line) return null;
  if (uci === check.best.uci) return { judgement: 'best', loss: 0, score: line.score };
  const bestCp = Math.max(scoreCp(check.best.score), scoreCp(line.score));
  const loss = Math.max(0, cpToWinProbability(bestCp) - cpToWinProbability(scoreCp(line.score)));
  const judgement = mateFloor(judge(loss), check.best.score, line.score) ?? 'good';
  return { judgement, loss, score: line.score };
}

/**
 * "A trap at 1500: most players choose Qxb7 (52%), a blunder. Leaves the
 * queen on b7 hanging: Rb1 traps it." — when the move players of the rating
 * choose most is a mistake or a blunder; null otherwise.
 */
export function trapNote(
  fen: Fen,
  top: MaiaMove,
  check: PositionCheck,
  rating: number,
): string | null {
  const verdict = verdictOf(check, top.uci);
  if (verdict?.judgement !== 'mistake' && verdict?.judgement !== 'blunder') return null;
  const line = check.lines.get(top.uci);
  const share = `${Math.round(top.probability * 100)}%`;
  const lead =
    top.probability >= 0.5
      ? `most players choose ${top.san} (${share})`
      : `the most popular move is ${top.san} (${share})`;
  const explanation = line
    ? explainMove({
        fen,
        san: top.san,
        judgement: verdict.judgement,
        bestUci: check.best.uci,
        bestPv: check.best.pv,
        replyUci: line.pv[1] ?? null,
        replyPv: line.pv.slice(1),
        scoreBefore: check.best.score,
        scoreAfter: line.score,
      })
    : null;
  return `A trap at ${rating}: ${lead}, ${verdict.judgement === 'blunder' ? 'a blunder' : 'a mistake'}.${explanation ? ` ${explanation.text}` : ''}`;
}

/**
 * Searches `moves` in `fen` together with the engine's choice, so they are
 * judged at one depth against the same best move. The choice is `known.best`
 * when the position was checked before, else `hint` (the analysis's best
 * move), else what a first search finds. Moves already in `known` are not
 * searched again. Null when a search was stopped (another search took the
 * engine) or `wanted()` turns false in between.
 */
export async function checkMoves(
  engine: Pick<EngineClient, 'search'>,
  fen: Fen,
  moves: readonly Uci[],
  options: {
    known?: PositionCheck | null;
    hint?: Uci | null;
    depth?: number;
    /** Aborting stops the search under way (and the check comes back null). */
    signal?: AbortSignal;
  } = {},
): Promise<PositionCheck | null> {
  const depth = options.depth ?? HUMAN_CHECK_DEPTH;
  const { signal } = options;
  const known = options.known ?? null;
  const search = async (params: SearchParams) => {
    const handle = engine.search(params);
    const stop = () => handle.stop();
    signal?.addEventListener('abort', stop, { once: true });
    try {
      return await handle.result;
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  };
  if (signal?.aborted) return null;
  let best = known?.best.uci ?? options.hint ?? null;
  if (!best) {
    const first = await search({ fen, depth, multipv: 1 });
    if (first.stopped) return null;
    best = first.bestmove.move ?? first.lines.get(1)?.pv[0] ?? null;
    if (!best) return null;
  }
  const missing = moves.filter((uci) => !known?.lines.has(uci));
  const searchmoves = [...new Set([best, ...missing])];
  if (signal?.aborted) return null;
  const result = await search({ fen, depth, multipv: searchmoves.length, searchmoves });
  if (result.stopped || signal?.aborted) return null;
  const lines = new Map(known?.lines ?? []);
  for (const info of result.lines.values()) {
    const uci = info.pv[0];
    if (uci && searchmoves.includes(uci)) lines.set(uci, { uci, score: info.score, pv: info.pv });
  }
  let top: EngineLine | null = null;
  for (const line of lines.values()) {
    if (!top || scoreCp(line.score) > scoreCp(top.score)) top = line;
  }
  if (!top) return null;
  return { depth, best: top, lines };
}
