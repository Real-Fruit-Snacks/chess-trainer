import { Chess, type Move, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkedKingSquare, legalDests, toUci, tryMove } from '@/chess/helpers';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { type Score } from '@/engine/uci';
import { useEngine } from '@/engine/useEngine';
import { playMoveSound, playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import type { ClassicGame } from './games';

export type GuessPhase =
  | 'intro' // opening moves are being replayed
  | 'guess' // waiting for the learner
  | 'checking' // engine is judging an alternative move
  | 'feedback' // result of the guess shown; game move on the board
  | 'auto' // opponent's move is being played
  | 'done';

export interface GuessFeedback {
  played: string;
  actual: string;
  points: 0 | 2 | 3;
  verdict: 'exact' | 'good' | 'miss';
  note: string | null;
}

export interface GuessBoard {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  checkedKing: Square | null;
}

export interface UseGuessTheMove {
  phase: GuessPhase;
  board: GuessBoard;
  ply: number;
  totalPlies: number;
  score: number;
  maxScore: number;
  guesses: number;
  feedback: GuessFeedback | null;
  history: Move[];
  engineStatus: ReturnType<typeof useEngine>['status'];
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  /** Continue after feedback (also triggered by a key). */
  next: () => void;
  skipToGuessing: () => void;
  restart: () => void;
  needsPromotion: { from: Square; to: Square } | null;
  resolvePromotion: (piece: PromotionPiece | null) => void;
}

const INTRO_DELAY = 350;
const AUTO_DELAY = 550;
const GOOD_MOVE_MARGIN_CP = 40;
const JUDGE_DEPTH = 13;

function toBoard(chess: Chess, lastMove: [Square, Square] | null): GuessBoard {
  return {
    fen: chess.fen(),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    dests: legalDests(chess),
    lastMove,
    check: chess.inCheck(),
    checkedKing: checkedKingSquare(chess),
  };
}

/** Centipawns from the mover's point of view, given a score reported for the side to move *after* the move. */
function moverCp(score: Score): number {
  const cp =
    score.type === 'mate'
      ? score.value > 0
        ? 10_000 - score.value
        : -10_000 - score.value
      : score.value;
  return -cp;
}

/**
 * Replays a famous game and asks the learner to guess the winner's moves.
 * 3 points for the move played in the game, 2 when the engine rates the
 * guess about as well, 0 otherwise.
 */
export function useGuessTheMove(game: ClassicGame): UseGuessTheMove {
  const recordGuessGame = useProgress((s) => s.recordGuessGame);
  const { engine, status: engineStatus } = useEngine();
  const moves = useMemo(() => game.moves.split(' '), [game.moves]);
  const guessCount = useMemo(
    () =>
      moves.filter(
        (_, i) => i >= game.guessFromPly && (i % 2 === 0 ? 'white' : 'black') === game.guessColor,
      ).length,
    [moves, game.guessFromPly, game.guessColor],
  );

  const chessRef = useRef(new Chess());
  const [phase, setPhase] = useState<GuessPhase>('intro');
  const [board, setBoard] = useState<GuessBoard>(() => toBoard(chessRef.current, null));
  const [ply, setPly] = useState(0);
  const [score, setScore] = useState(0);
  const [guesses, setGuesses] = useState(0);
  const [feedback, setFeedback] = useState<GuessFeedback | null>(null);
  const [history, setHistory] = useState<Move[]>([]);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const plyRef = useRef(0);
  const scoreRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const recordedRef = useRef(false);
  /** Bumped on restart so a judgement still in flight cannot play into the new game. */
  const runRef = useRef(0);

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => clearTimers(), []);

  const sync = useCallback((lastMove: [Square, Square] | null) => {
    setBoard(toBoard(chessRef.current, lastMove));
    setHistory(chessRef.current.history({ verbose: true }));
    setPly(plyRef.current);
  }, []);

  const moverOf = useCallback(
    (index: number): LongColor => (index % 2 === 0 ? 'white' : 'black'),
    [],
  );

  /** Plays the game move at plyRef and advances. Returns the move. */
  const playGameMove = useCallback((): Move | null => {
    const san = moves[plyRef.current];
    if (!san) return null;
    const move = tryMove(chessRef.current, san);
    if (!move) return null;
    playMoveSound(move, chessRef.current);
    plyRef.current += 1;
    sync([move.from, move.to]);
    return move;
  }, [moves, sync]);

  const finish = useCallback(() => {
    setPhase('done');
    if (!recordedRef.current) {
      recordedRef.current = true;
      recordGuessGame(game.id, scoreRef.current, guessCount * 3);
    }
    playSound('gameEnd');
  }, [game.id, guessCount, recordGuessGame]);

  /** Drives the game forward until it is the learner's turn to guess. */
  const stepRef = useRef<() => void>(() => undefined);
  const step = useCallback(() => {
    const index = plyRef.current;
    if (index >= moves.length) {
      finish();
      return;
    }
    const learnerToMove = index >= game.guessFromPly && moverOf(index) === game.guessColor;
    if (learnerToMove) {
      setPhase('guess');
      return;
    }
    setPhase(index < game.guessFromPly ? 'intro' : 'auto');
    later(
      () => {
        playGameMove();
        stepRef.current();
      },
      index < game.guessFromPly ? INTRO_DELAY : AUTO_DELAY,
    );
  }, [moves.length, game.guessFromPly, game.guessColor, moverOf, playGameMove, finish]);
  stepRef.current = step;

  useEffect(() => {
    step();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per game on mount
  }, [game.id]);

  const judge = useCallback(
    async (
      fenBefore: Fen,
      userMove: Move,
      actualSan: string,
      run: number,
    ): Promise<GuessFeedback['verdict']> => {
      const client = engine();
      // The engine may still be loading right after navigation: wait for it rather than scoring 0.
      try {
        await client.init();
      } catch {
        return 'miss';
      }
      const after = (san: string): Fen | null => {
        const chess = new Chess(fenBefore);
        const move = tryMove(chess, san);
        return move ? chess.fen() : null;
      };
      const userFen = after(userMove.san);
      const actualFen = after(actualSan);
      if (!userFen || !actualFen) return 'miss';
      const evaluate = async (fen: Fen): Promise<number | null> => {
        const chess = new Chess(fen);
        if (chess.isCheckmate()) return 10_000;
        if (chess.isGameOver()) return 0;
        const res = await client.search({ fen, depth: JUDGE_DEPTH, multipv: 1 }).result;
        if (res.stopped) return null;
        const s = res.lines.get(1)?.score;
        return s ? moverCp(s) : null;
      };
      // One after the other: a second search would stop the first at a shallow depth. A restart
      // meanwhile makes the answer moot, so the second search is not started.
      const userCp = await evaluate(userFen);
      const actualCp = userCp === null || run !== runRef.current ? null : await evaluate(actualFen);
      if (userCp === null || actualCp === null) return 'miss';
      return userCp >= actualCp - GOOD_MOVE_MARGIN_CP ? 'good' : 'miss';
    },
    [engine],
  );

  const attempt = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'guess') return;
      const chess = chessRef.current;
      const index = plyRef.current;
      const actual = moves[index];
      if (!actual) return;
      const fenBefore = chess.fen();
      const move = tryMove(chess, promotion ? { from, to, promotion } : { from, to });
      if (!move) return;
      chess.undo();
      const actualMove = tryMove(new Chess(fenBefore), actual);
      const exact = actualMove ? toUci(actualMove) === toUci(move) : false;
      const note = game.notes[index + 1] ?? null;

      const settle = (verdict: GuessFeedback['verdict']) => {
        const points: GuessFeedback['points'] =
          verdict === 'exact' ? 3 : verdict === 'good' ? 2 : 0;
        scoreRef.current += points;
        setScore(scoreRef.current);
        setGuesses((g) => g + 1);
        playSound(points === 3 ? 'solved' : points === 2 ? 'notify' : 'failed');
        // Show the game move on the board.
        playGameMove();
        setFeedback({ played: move.san, actual, points, verdict, note });
        setPhase('feedback');
      };

      if (exact) {
        settle('exact');
        return;
      }
      setPhase('checking');
      const run = runRef.current;
      void judge(fenBefore, move, actual, run)
        .catch((): GuessFeedback['verdict'] => 'miss')
        .then((verdict) => {
          if (run !== runRef.current) return;
          settle(verdict);
        });
    },
    [phase, moves, game.notes, judge, playGameMove],
  );

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'guess') return;
      const piece = chessRef.current.get(from);
      const isPromotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
      if (isPromotion && !promotion) {
        setNeedsPromotion({ from, to });
        return;
      }
      attempt(from, to, promotion);
    },
    [phase, attempt],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const pending = needsPromotion;
      setNeedsPromotion(null);
      if (!pending || !piece) return;
      attempt(pending.from, pending.to, piece);
    },
    [needsPromotion, attempt],
  );

  const next = useCallback(() => {
    if (phase !== 'feedback') return;
    setFeedback(null);
    step();
  }, [phase, step]);

  const skipToGuessing = useCallback(() => {
    if (phase !== 'intro') return;
    clearTimers();
    while (plyRef.current < game.guessFromPly) {
      const san = moves[plyRef.current];
      if (!san || !tryMove(chessRef.current, san)) break;
      plyRef.current += 1;
    }
    const last = chessRef.current.history({ verbose: true }).at(-1);
    sync(last ? [last.from, last.to] : null);
    step();
  }, [phase, game.guessFromPly, moves, sync, step]);

  const restart = useCallback(() => {
    clearTimers();
    runRef.current += 1;
    engine().stop();
    chessRef.current = new Chess();
    plyRef.current = 0;
    scoreRef.current = 0;
    recordedRef.current = false;
    setScore(0);
    setGuesses(0);
    setFeedback(null);
    setNeedsPromotion(null);
    sync(null);
    step();
  }, [sync, step, engine]);

  return {
    phase,
    board,
    ply,
    totalPlies: moves.length,
    score,
    maxScore: guessCount * 3,
    guesses,
    feedback,
    history,
    engineStatus,
    playMove,
    next,
    skipToGuessing,
    restart,
    needsPromotion,
    resolvePromotion,
  };
}
