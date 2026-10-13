import { Chess } from 'chess.js';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { ReviewedMove, ReviewSummary } from '@/features/analyze/gameReview';

/**
 * A game review for tests: the moves of `sans` from the start, each judged
 * "good" unless `verdicts` says otherwise for its ply (with the better move,
 * in UCI, when there is one).
 */
export function reviewOf(
  sans: string[],
  verdicts: Record<number, { judgement: MoveJudgement; best?: string }>,
): ReviewSummary {
  const chess = new Chess();
  const moves: ReviewedMove[] = sans.map((san, i) => {
    const fen = chess.fen();
    const mover = chess.turn() === 'w' ? 'white' : 'black';
    const verdict = verdicts[i + 1];
    let bestSan: string | null = null;
    if (verdict?.best) {
      const probe = new Chess(fen);
      bestSan = probe.move({
        from: verdict.best.slice(0, 2),
        to: verdict.best.slice(2, 4),
        promotion: verdict.best[4],
      }).san;
    }
    chess.move(san);
    return {
      ply: i + 1,
      san,
      mover,
      winBefore: 0.5,
      winAfter: 0.5,
      loss: verdict ? 0.3 : 0,
      judgement: verdict?.judgement ?? 'good',
      best: bestSan,
      bestUci: verdict?.best ?? null,
      scoreBefore: { type: 'cp', value: 0 },
      fen,
      scoreAfter: { type: 'cp', value: -300 },
      bestPv: verdict?.best ? [verdict.best] : [],
      replyUci: null,
      replyPv: [],
    };
  });
  return {
    moves,
    counts: {
      white: { inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { inaccuracy: 0, mistake: 0, blunder: 0 },
    },
    accuracy: { white: 70, black: 70 },
    wins: [],
    depth: 12,
  };
}
