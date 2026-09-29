import { Chess, type Move } from 'chess.js';
import type { MoveJudgement } from '@/components/chess/MoveList';
import { toUci } from '@/chess/helpers';
import type { Fen, Uci } from '@/chess/types';
import type { EngineClient } from '@/engine/EngineClient';
import { cpToWinProbability, type Score, scoreToWhiteCp } from '@/engine/uci';

export interface ReviewedMove {
  ply: number;
  san: string;
  /** Evaluation (White's win probability) before and after the move. */
  winBefore: number;
  winAfter: number;
  /** Win probability lost by the mover (0 = perfect). */
  loss: number;
  judgement: MoveJudgement;
  /** Engine's preferred move in the position before this move, in SAN. */
  best: string | null;
  bestUci: Uci | null;
  scoreBefore: Score | null;
}

export interface ReviewSummary {
  moves: ReviewedMove[];
  counts: Record<'white' | 'black', { inaccuracy: number; mistake: number; blunder: number }>;
  /** Average win-probability loss per move, as a percentage. */
  accuracy: Record<'white' | 'black', number>;
}

/** Thresholds on win-probability loss, close to what Lichess uses. */
export function judge(loss: number): MoveJudgement {
  if (loss >= 0.3) return 'blunder';
  if (loss >= 0.2) return 'mistake';
  if (loss >= 0.1) return 'inaccuracy';
  return 'good';
}

/**
 * Evaluates every position of a game at a fixed depth and classifies each move
 * by how much win probability it gave away compared with the engine's choice.
 */
export async function reviewGame(
  engine: EngineClient,
  startFen: Fen,
  moves: Move[],
  options: {
    depth?: number;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ReviewSummary> {
  const depth = options.depth ?? 12;
  const total = moves.length + 1;
  const evaluations: { win: number; score: Score | null; best: Uci | null }[] = [];

  const chess = new Chess(startFen);
  for (let ply = 0; ply <= moves.length; ply++) {
    if (options.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');
    const fen = chess.fen();
    const moverIsWhite = chess.turn() === 'w';

    if (chess.isGameOver()) {
      const win = chess.isCheckmate() ? (moverIsWhite ? 0 : 1) : 0.5;
      evaluations.push({ win, score: null, best: null });
    } else {
      const result = await engine.search({ fen, depth, multipv: 1 }).result;
      const info = result.lines.get(1);
      const score = info?.score ?? null;
      const win = score ? cpToWinProbability(scoreToWhiteCp(score, moverIsWhite)) : 0.5;
      evaluations.push({ win, score, best: result.bestmove.move });
    }
    options.onProgress?.(ply + 1, total);
    const move = moves[ply];
    if (move) chess.move(move.san);
  }

  const reviewed: ReviewedMove[] = [];
  const counts = {
    white: { inaccuracy: 0, mistake: 0, blunder: 0 },
    black: { inaccuracy: 0, mistake: 0, blunder: 0 },
  };
  const losses = { white: [] as number[], black: [] as number[] };

  const replay = new Chess(startFen);
  moves.forEach((move, i) => {
    const before = evaluations[i];
    const after = evaluations[i + 1];
    if (!before || !after) return;
    const mover = replay.turn() === 'w' ? 'white' : 'black';
    // Loss from the mover's point of view.
    const loss =
      mover === 'white' ? Math.max(0, before.win - after.win) : Math.max(0, after.win - before.win);
    const played = toUci(move);
    const isBest = before.best === played;
    const judgement: MoveJudgement = isBest ? 'best' : judge(loss);
    if (judgement === 'inaccuracy' || judgement === 'mistake' || judgement === 'blunder') {
      counts[mover][judgement]++;
    }
    losses[mover].push(loss);

    let bestSan: string | null = null;
    if (before.best && !isBest) {
      try {
        const probe = new Chess(replay.fen());
        bestSan = probe.move({
          from: before.best.slice(0, 2),
          to: before.best.slice(2, 4),
          promotion: before.best[4],
        }).san;
      } catch {
        bestSan = null;
      }
    }

    reviewed.push({
      ply: i + 1,
      san: move.san,
      winBefore: before.win,
      winAfter: after.win,
      loss,
      judgement,
      best: bestSan,
      bestUci: isBest ? null : before.best,
      scoreBefore: before.score,
    });
    replay.move(move.san);
  });

  const accuracy = {
    white: accuracyFrom(losses.white),
    black: accuracyFrom(losses.black),
  };

  return { moves: reviewed, counts, accuracy };
}

/** Maps average win-probability loss to a 0–100 "accuracy" figure. */
function accuracyFrom(losses: number[]): number {
  if (losses.length === 0) return 100;
  const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
  // Exponential decay: 0 loss → 100, 0.1 average loss → ~61, 0.3 → ~22.
  return Math.round(100 * Math.exp(-5 * avg));
}
