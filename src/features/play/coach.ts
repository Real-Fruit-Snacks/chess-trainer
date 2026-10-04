import { Chess } from 'chess.js';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { Fen, Uci } from '@/chess/types';
import { cpToWinProbability, type Score } from '@/engine/uci';
import { type Explanation, explainMove } from '@/features/analyze/commentary';
import { judge } from '@/features/analyze/gameReview';

/**
 * Coach mode: right after the learner moves, the position is compared with
 * the engine's verdict on the position before the move. A mistake or blunder
 * pauses the game with an explanation and the offer to take the move back.
 */

export interface CoachEvaluation {
  fen: Fen;
  /** Score for the side to move in `fen`. */
  score: Score | null;
  best: Uci | null;
  pv: Uci[];
}

export interface CoachVerdict {
  judgement: MoveJudgement;
  /** Win probability the move gave away, 0–1. */
  loss: number;
  explanation: Explanation | null;
  bestSan: string | null;
}

/** Win probability for the side to move in a position, from its score. */
function winFor(score: Score | null): number {
  if (!score) return 0.5;
  if (score.type === 'mate') return score.value > 0 ? 1 : 0;
  return cpToWinProbability(score.value);
}

/**
 * Judges the learner's move from the evaluation before it (`before`, the
 * learner to move) and after it (`after`, the opponent to move).
 */
export function coachVerdict(
  before: CoachEvaluation,
  san: string,
  playedUci: Uci,
  after: CoachEvaluation,
): CoachVerdict {
  const winBefore = winFor(before.score);
  // `after` is scored for the opponent; the learner's chances are the complement. The engine prints
  // no line for a mated position, so a missing score there is a win, not an unknown.
  const winAfter = after.score === null && isCheckmated(after.fen) ? 1 : 1 - winFor(after.score);
  const loss = Math.max(0, winBefore - winAfter);
  const judgement: MoveJudgement = before.best === playedUci ? 'best' : judge(loss);
  const scoreAfter: Score | null = after.score
    ? { type: after.score.type, value: -after.score.value }
    : null;
  const explanation =
    judgement === 'mistake' || judgement === 'blunder' || judgement === 'inaccuracy'
      ? explainMove({
          fen: before.fen,
          san,
          judgement,
          bestUci: before.best === playedUci ? null : before.best,
          bestPv: before.pv,
          replyUci: after.best,
          replyPv: after.pv,
          scoreBefore: before.score,
          scoreAfter,
        })
      : null;
  return { judgement, loss, explanation, bestSan: explanation?.keyMove ?? null };
}

function isCheckmated(fen: Fen): boolean {
  try {
    return new Chess(fen).isCheckmate();
  } catch {
    return false;
  }
}

/** Coach mode interrupts for mistakes and blunders, and for any missed or allowed mate. */
export function coachShouldInterrupt(verdict: CoachVerdict): boolean {
  if (verdict.judgement === 'mistake' || verdict.judgement === 'blunder') return true;
  const motif = verdict.explanation?.motif;
  return motif === 'missed-mate' || motif === 'allows-mate';
}

/** Search depth for the coach's quick checks: fast, but enough to see simple tactics. */
export const COACH_DEPTH = 12;
