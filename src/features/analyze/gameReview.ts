import { Chess, type Move } from 'chess.js';
import type { MoveJudgement } from '@/components/chess/MoveList';
import { START_FEN, toUci } from '@/chess/helpers';
import type { Fen, Uci } from '@/chess/types';
import type { EngineClient } from '@/engine/EngineClient';
import { cpToWinProbability, type Score, scoreToWhiteCp } from '@/engine/uci';

export interface ReviewedMove {
  ply: number;
  san: string;
  mover: 'white' | 'black';
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
  /** Position before the move. */
  fen: Fen;
  /** Score after the move, from the mover's point of view. */
  scoreAfter: Score | null;
  /** The engine's line after its preferred move (a few plies). */
  bestPv: Uci[];
  /** The opponent's best answer to the move actually played, with its line. */
  replyUci: Uci | null;
  replyPv: Uci[];
}

export interface ReviewSummary {
  moves: ReviewedMove[];
  counts: Record<'white' | 'black', { inaccuracy: number; mistake: number; blunder: number }>;
  /** Average win-probability loss per move, as a percentage. */
  accuracy: Record<'white' | 'black', number>;
  /** White's win probability after each ply (index 0 = the starting position). */
  wins: number[];
  /** Search depth the review was run at. */
  depth: number;
}

export interface KeyMoment {
  ply: number;
  san: string;
  mover: 'white' | 'black';
  judgement: MoveJudgement;
  /** Win probability swing against the mover, 0–1. */
  loss: number;
  best: string | null;
}

/** The biggest evaluation swings of a game, in move order. */
export function keyMoments(summary: ReviewSummary, limit = 6): KeyMoment[] {
  return summary.moves
    .filter(
      (m) => m.judgement === 'blunder' || m.judgement === 'mistake' || m.judgement === 'inaccuracy',
    )
    .sort((a, b) => b.loss - a.loss)
    .slice(0, limit)
    .sort((a, b) => a.ply - b.ply)
    .map((m) => ({
      ply: m.ply,
      san: m.san,
      mover: m.mover,
      judgement: m.judgement,
      loss: m.loss,
      best: m.best,
    }));
}

/** Thresholds on win-probability loss, close to what Lichess uses. */
export function judge(loss: number): MoveJudgement {
  if (loss >= 0.3) return 'blunder';
  if (loss >= 0.2) return 'mistake';
  if (loss >= 0.1) return 'inaccuracy';
  return 'good';
}

const SEVERITY: Record<NonNullable<MoveJudgement>, number> = {
  best: 0,
  good: 0,
  inaccuracy: 1,
  mistake: 2,
  blunder: 3,
};

/** The harsher of two judgements. */
export function atLeast(judgement: MoveJudgement, floor: MoveJudgement): MoveJudgement {
  return SEVERITY[floor ?? 'good'] > SEVERITY[judgement ?? 'good'] ? floor : judgement;
}

/**
 * Win probability alone misses mates: taking the queen (+15) instead of mating
 * in two is "good". Scores are from the mover's point of view before and after
 * the move. Giving up a forced mate is at least an inaccuracy; allowing one
 * from a position that was not already lost is at least a mistake.
 */
export function mateFloor(
  judgement: MoveJudgement,
  scoreBefore: Score | null,
  scoreAfterForMover: Score | null,
  /** The move itself delivered checkmate (there is no score after it). */
  delivered = false,
): MoveJudgement {
  if (judgement === 'best' || delivered) return judgement;
  const hadMate = scoreBefore?.type === 'mate' && scoreBefore.value > 0;
  const keepsMate = scoreAfterForMover?.type === 'mate' && scoreAfterForMover.value > 0;
  if (hadMate && !keepsMate) return atLeast(judgement, 'inaccuracy');
  const wasLosing =
    scoreBefore !== null &&
    (scoreBefore.type === 'mate' ? scoreBefore.value < 0 : scoreBefore.value <= -300);
  const allowsMate = scoreAfterForMover?.type === 'mate' && scoreAfterForMover.value < 0;
  if (allowsMate && !wasLosing) return atLeast(judgement, 'mistake');
  return judgement;
}

/** Depth to search a position with the mover's choice almost made for them. */
export const FORCED_MOVE_DEPTH = 1;
/** Depth used while the game is still in the opening book (first plies of a known line). */
export const BOOK_DEPTH_CAP = 10;
/** Plies from the standard start position treated as book for the depth cap. */
export const BOOK_PLIES = 12;

/**
 * Adaptive depth: a position with one legal move needs no search to speak of,
 * and the first book moves of a game from the normal start need less than the
 * full depth. Everything else is searched at `depth`.
 */
export function depthFor(
  depth: number,
  position: { legalMoves: number; ply: number; fromStart: boolean },
): number {
  if (position.legalMoves <= 1) return Math.min(depth, FORCED_MOVE_DEPTH);
  if (position.fromStart && position.ply < BOOK_PLIES) return Math.min(depth, BOOK_DEPTH_CAP);
  return depth;
}

/** The second look at a flagged move searches at least this deep, whatever the review depth. */
export const RECHECK_MIN_DEPTH = 14;

/**
 * Runs one search, retrying once when it comes back stopped (another search
 * interrupted it); a second stopped result is an error, not a review.
 * `searchmoves` limits the search to those moves of the position, and
 * `multipv` asks for that many lines.
 */
async function evaluate(
  engine: EngineClient,
  position: { startFen: Fen; moves: Uci[] },
  depth: number,
  signal: AbortSignal | undefined,
  searchmoves?: Uci[],
  multipv = 1,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');
    // The moves that led here, not just the position: the engine then sees repetitions.
    const result = await engine.search({
      fen: position.startFen,
      moves: position.moves,
      depth,
      multipv,
      ...(searchmoves ? { searchmoves } : {}),
    }).result;
    if (!result.stopped) return result;
  }
  throw new Error('The engine was interrupted while reviewing the game.');
}

/** Win probability given away by the mover, from White's win probability before and after. */
function moverLoss(moverIsWhite: boolean, winBefore: number, winAfter: number): number {
  return moverIsWhite ? Math.max(0, winBefore - winAfter) : Math.max(0, winAfter - winBefore);
}

/** A score for the side to move, seen by the other side (the move just made). */
function flipScore(score: Score | null): Score | null {
  return score ? { type: score.type, value: -score.value } : null;
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
  const evaluations: {
    win: number;
    score: Score | null;
    best: Uci | null;
    pv: Uci[];
    depth: number;
  }[] = [];
  /**
   * A second look at the moves the first pass flags: the engine's choice and the
   * move played, searched together from the position before it, at least
   * RECHECK_MIN_DEPTH deep (scores from the mover's point of view). Two searches a
   * ply apart can disagree by more than the move costs — the later one sees
   * further — so a strong move can look like a slip; one search of both moves
   * judges them by the same horizon. `best` is null when only the move played
   * could be searched.
   */
  const checked = new Map<number, { best: Score | null; played: Score }>();
  const PV_PLIES = 6;

  const chess = new Chess(startFen);
  const played: Uci[] = [];
  for (let ply = 0; ply <= moves.length; ply++) {
    if (options.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');
    const moverIsWhite = chess.turn() === 'w';

    if (chess.isGameOver()) {
      const win = chess.isCheckmate() ? (moverIsWhite ? 0 : 1) : 0.5;
      evaluations.push({ win, score: null, best: null, pv: [], depth: 0 });
    } else {
      const searchDepth = depthFor(depth, {
        legalMoves: chess.moves().length,
        ply,
        fromStart: startFen === START_FEN,
      });
      const result = await evaluate(
        engine,
        { startFen, moves: [...played] },
        searchDepth,
        options.signal,
      );
      const info = result.lines.get(1);
      const score = info?.score ?? null;
      const win = score ? cpToWinProbability(scoreToWhiteCp(score, moverIsWhite)) : 0.5;
      evaluations.push({
        win,
        score,
        best: result.bestmove.move,
        pv: (info?.pv ?? []).slice(0, PV_PLIES),
        depth: searchDepth,
      });
    }

    // The move that led here: when it is not the engine's choice and looks like a slip,
    // compare the two again in one search from the position before.
    const before = evaluations[ply - 1];
    const after = evaluations[ply];
    const last = played[ply - 1];
    if (ply > 0 && before?.score && after && last && before.best !== last) {
      const lastMoverIsWhite = !moverIsWhite;
      const delivered = after.score === null && after.win === (lastMoverIsWhite ? 1 : 0);
      const first = mateFloor(
        judge(moverLoss(lastMoverIsWhite, before.win, after.win)),
        before.score,
        flipScore(after.score),
        delivered,
      );
      if (first === 'inaccuracy' || first === 'mistake' || first === 'blunder') {
        const both = before.best ? [before.best, last] : [last];
        const result = await evaluate(
          engine,
          { startFen, moves: played.slice(0, ply - 1) },
          Math.max(before.depth, RECHECK_MIN_DEPTH),
          options.signal,
          both,
          both.length,
        );
        const lines = [...result.lines.values()];
        const playedLine = lines.find((line) => line.pv[0] === last);
        const bestLine = lines.find((line) => line.pv[0] === before.best);
        if (playedLine) {
          checked.set(ply - 1, { best: bestLine?.score ?? null, played: playedLine.score });
        }
      }
    }

    options.onProgress?.(ply + 1, total);
    const move = moves[ply];
    if (move) {
      const done = chess.move(move.san);
      played.push(toUci(done));
    }
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
    let loss = moverLoss(mover === 'white', before.win, after.win);
    const played = toUci(move);
    const isBest = before.best === played;
    // The score after the move is reported for the side then to move: flip it to the mover's view.
    const scoreAfter = flipScore(after.score);
    // A flagged move looked at again: with both moves in one search, that search's verdict
    // stands; with the move played alone, it can only make the loss smaller.
    let judgedBefore = before.score;
    let judgedAfter = scoreAfter;
    const second = checked.get(i);
    if (second) {
      const white = mover === 'white';
      const winPlayed = cpToWinProbability(scoreToWhiteCp(second.played, white));
      if (second.best) {
        loss = moverLoss(white, cpToWinProbability(scoreToWhiteCp(second.best, white)), winPlayed);
        judgedBefore = second.best;
        judgedAfter = second.played;
      } else {
        const ownLoss = moverLoss(white, before.win, winPlayed);
        if (ownLoss < loss) {
          loss = ownLoss;
          judgedAfter = second.played;
        }
      }
    }
    const delivered = after.score === null && after.win === (mover === 'white' ? 1 : 0);
    const judgement: MoveJudgement = isBest
      ? 'best'
      : mateFloor(judge(loss), judgedBefore, judgedAfter, delivered);
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
      mover,
      winBefore: before.win,
      winAfter: after.win,
      loss,
      judgement,
      best: bestSan,
      bestUci: isBest ? null : before.best,
      scoreBefore: before.score,
      fen: replay.fen(),
      scoreAfter,
      bestPv: before.pv,
      replyUci: after.best,
      replyPv: after.pv,
    });
    replay.move(move.san);
  });

  const accuracy = {
    white: accuracyFrom(losses.white),
    black: accuracyFrom(losses.black),
  };

  return { moves: reviewed, counts, accuracy, wins: evaluations.map((e) => e.win), depth };
}

/** Maps average win-probability loss to a 0–100 "accuracy" figure. */
function accuracyFrom(losses: number[]): number {
  if (losses.length === 0) return 100;
  const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
  // Exponential decay: 0 loss → 100, 0.1 average loss → ~61, 0.3 → ~22.
  return Math.round(100 * Math.exp(-5 * avg));
}
