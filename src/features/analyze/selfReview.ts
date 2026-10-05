import { sanToUci } from '@/chess/helpers';
import type { Fen, San, Uci } from '@/chess/types';
import type { EngineClient } from '@/engine/EngineClient';
import { cpToWinProbability } from '@/engine/uci';
import { scoreCp } from '@/features/puzzles/ownPuzzles';
import type { ReviewedMove, ReviewSummary } from './gameReview';

/**
 * Self-analysis before the engine's: the learner goes through a game with the
 * engine out of sight, marks the moves where they think it turned, and says
 * what they would have played instead. The engine's review then scores the
 * attempt: how many of its turning points (mistakes and blunders, either
 * side) the learner caught, how many marks were false alarms, and how good
 * the suggested moves were. Pure scoring here; the page drives it.
 */

/** A move the learner marked as a turning point. */
export interface SelfMark {
  /** 1-based ply on the main line. */
  ply: number;
  /** The move at that ply when it was marked (a changed main line drops the mark). */
  san: San;
  /** What the learner would have played instead, in the position before the move. */
  suggestion?: { uci: Uci; san: San };
}

/** What became of one of the engine's turning points. */
export type MomentOutcome = 'found' | 'late' | 'missed';
/** What became of one of the learner's marks. */
export type MarkOutcome = 'found' | 'late' | 'minor' | 'false-alarm';

export interface ScoredMoment {
  ply: number;
  san: San;
  mover: 'white' | 'black';
  judgement: 'mistake' | 'blunder';
  best: San | null;
  outcome: MomentOutcome;
}

export interface ScoredMark {
  ply: number;
  san: San;
  outcome: MarkOutcome;
}

export interface SelfReviewScore {
  moments: ScoredMoment[];
  marks: ScoredMark[];
  /** Turning points caught, on the move or one move late. */
  found: number;
  /** Of those, caught one move late. */
  late: number;
  total: number;
  /** Marks on moves the engine found nothing wrong with. */
  falseAlarms: number;
}

/**
 * Scores the marks against the review. A turning point counts as found when
 * its move is marked, or the move right after it (the swing noticed a move
 * late, when the reply showed it). A mark on an inaccuracy is neither a find
 * nor a false alarm: the learner saw something, just not a turning point.
 */
export function scoreSelfReview(
  review: ReviewSummary,
  marks: readonly SelfMark[],
): SelfReviewScore {
  const byPly = new Map(review.moves.map((m) => [m.ply, m]));
  // Only marks that still describe the main line count.
  const valid = marks.filter((m) => byPly.get(m.ply)?.san === m.san);
  const marked = new Set(valid.map((m) => m.ply));
  const used = new Map<number, MarkOutcome>();
  const turning = review.moves.filter(
    (m) => m.judgement === 'mistake' || m.judgement === 'blunder',
  );

  const outcomes = new Map<number, MomentOutcome>();
  // Exact marks first, so a mark on a turning point is never spent on its neighbour.
  for (const m of turning) {
    if (marked.has(m.ply)) {
      outcomes.set(m.ply, 'found');
      used.set(m.ply, 'found');
    }
  }
  for (const m of turning) {
    if (outcomes.has(m.ply)) continue;
    const next = m.ply + 1;
    if (marked.has(next) && !used.has(next)) {
      outcomes.set(m.ply, 'late');
      used.set(next, 'late');
    } else {
      outcomes.set(m.ply, 'missed');
    }
  }

  const moments: ScoredMoment[] = turning.map((m) => ({
    ply: m.ply,
    san: m.san,
    mover: m.mover,
    judgement: m.judgement as 'mistake' | 'blunder',
    best: m.best,
    outcome: outcomes.get(m.ply) ?? 'missed',
  }));
  const scoredMarks: ScoredMark[] = [...valid]
    .sort((a, b) => a.ply - b.ply)
    .map((mark) => ({
      ply: mark.ply,
      san: mark.san,
      outcome:
        used.get(mark.ply) ??
        (byPly.get(mark.ply)?.judgement === 'inaccuracy' ? 'minor' : 'false-alarm'),
    }));
  const found = moments.filter((m) => m.outcome !== 'missed').length;
  return {
    moments,
    marks: scoredMarks,
    found,
    late: moments.filter((m) => m.outcome === 'late').length,
    total: moments.length,
    falseAlarms: scoredMarks.filter((m) => m.outcome === 'false-alarm').length,
  };
}

export type SuggestionVerdict = 'best' | 'good' | 'ok' | 'worse';

/** A suggestion losing at most this much win probability against the engine's move is good… */
export const SUGGESTION_GOOD_LOSS = 0.05;
/** …and at most this much, playable. */
export const SUGGESTION_OK_LOSS = 0.1;
/** The depth suggestions are judged at. */
export const SUGGESTION_DEPTH = 14;

export function suggestionVerdict(loss: number, sameAsBest: boolean): SuggestionVerdict {
  if (sameAsBest || loss <= 0.02) return 'best';
  if (loss <= SUGGESTION_GOOD_LOSS) return 'good';
  if (loss <= SUGGESTION_OK_LOSS) return 'ok';
  return 'worse';
}

/**
 * The engine's move in the position a reviewed move was played from: its own
 * choice, or the move played when that was the engine's choice too (the
 * review leaves `bestUci` empty then). Null when the review has neither.
 */
export function engineMoveOf(
  move: Pick<ReviewedMove, 'bestUci' | 'judgement' | 'fen' | 'san'>,
): Uci | null {
  if (move.bestUci) return move.bestUci;
  return move.judgement === 'best' ? sanToUci(move.fen, move.san) : null;
}

export interface JudgedSuggestion {
  verdict: SuggestionVerdict;
  /** Win probability lost against the engine's move, from the mover's side (0–1). */
  loss: number;
  /** The engine's move in that position. */
  best: Uci | null;
}

/**
 * Judges a suggested move against the engine's choice in the same position:
 * both are searched together (searchmoves), and the suggestion is scored by
 * the win probability it gives up. Null when there is nothing to compare
 * with or the search was stopped.
 */
export async function judgeSuggestion(
  engine: Pick<EngineClient, 'search'>,
  fen: Fen,
  suggestion: Uci,
  best: Uci | null,
): Promise<JudgedSuggestion | null> {
  if (!best) return null;
  if (suggestion === best) return { verdict: 'best', loss: 0, best };
  const result = await engine.search({
    fen,
    depth: SUGGESTION_DEPTH,
    multipv: 2,
    searchmoves: [best, suggestion],
  }).result;
  if (result.stopped) return null;
  const cpOf = new Map<Uci, number>();
  for (const line of result.lines.values()) {
    const first = line.pv[0];
    if (first) cpOf.set(first, scoreCp(line.score));
  }
  const suggestionCp = cpOf.get(suggestion);
  if (suggestionCp === undefined) return null;
  // At this depth the suggestion may even look better than the review's choice.
  const bestCp = Math.max(cpOf.get(best) ?? suggestionCp, suggestionCp);
  // Both scores are the side to move's, so this is the mover's win probability.
  const loss = Math.max(0, cpToWinProbability(bestCp) - cpToWinProbability(suggestionCp));
  return { verdict: suggestionVerdict(loss, false), loss, best };
}
