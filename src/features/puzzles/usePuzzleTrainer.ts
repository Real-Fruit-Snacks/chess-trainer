import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { checkedKingSquare, legalDests, parseUci, toUci } from '@/chess/helpers';
import { playMoveSound, playSound } from '@/lib/sound';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { type Puzzle, puzzleMeta } from './puzzleService';

export type TrainerPhase =
  | 'idle'
  | 'intro' // opponent's setup move is being played
  | 'solving' // waiting for the user's move
  | 'checking' // the engine is judging a move that differs from the stored solution
  | 'replying' // opponent's automatic reply is being played
  | 'solved'
  | 'failed';

/**
 * Judges a move that is not the stored solution; resolves true when it is just
 * as good. Returning null (synchronously) means the puzzle has one answer and
 * the move is simply wrong. Own-game puzzles use this with the engine.
 */
export type VerifyMove = (
  puzzle: Puzzle,
  fenBefore: Fen,
  expected: string,
  played: string,
) => Promise<boolean> | null;

export interface PuzzleTrainerOptions {
  verifyMove?: VerifyMove;
}

export interface TrainerSnapshot {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  checkedKing: Square | null;
  /** Number of solver moves already found. */
  progress: number;
  total: number;
}

export interface PuzzleOutcomeEvent {
  outcome: 'solved' | 'failed';
  hintUsed: boolean;
  /** Most revealing hint used: 0 none, 1 the piece, 2 the whole move. */
  hintLevel: 0 | 1 | 2;
  durationMs: number;
  /** Moves the solver had to find. */
  solverMoves: number;
}

export interface UsePuzzleTrainer {
  puzzle: Puzzle | null;
  phase: TrainerPhase;
  position: TrainerSnapshot;
  solverColor: LongColor;
  hintLevel: 0 | 1 | 2;
  shapes: DrawShape[];
  /** Custom square highlights (chessground `highlight.custom`). */
  highlights: Map<Square, string>;
  wrongMove: [Square, Square] | null;
  /** Milliseconds spent so far on the current puzzle. */
  elapsedMs: number;
  load: (puzzle: Puzzle) => void;
  playUserMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  hint: () => void;
  showSolution: () => void;
  /** After a failure, allow the user to keep trying (unrated). */
  retry: () => void;
  /** Whether the user is playing on after failing; further results don't count. */
  practiceAfterFail: boolean;
  /** True once "Show solution" played the line out (pages leave it on screen). */
  solutionShown: boolean;
  needsPromotion: { from: Square; to: Square } | null;
  resolvePromotion: (piece: PromotionPiece | null) => void;
}

const INTRO_DELAY = 600;
const REPLY_DELAY = 350;

function snapshot(
  chess: Chess,
  lastMove: [Square, Square] | null,
  progress: number,
  total: number,
): TrainerSnapshot {
  return {
    fen: chess.fen(),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    dests: legalDests(chess),
    lastMove,
    check: chess.inCheck(),
    checkedKing: checkedKingSquare(chess),
    progress,
    total,
  };
}

/**
 * Drives one puzzle at a time: plays the opponent's setup move, validates the
 * user's moves against the stored solution (accepting any checkmate as the
 * final move, as Lichess does), auto-replies for the opponent and reports the
 * outcome exactly once per puzzle.
 */
export function usePuzzleTrainer(
  onOutcome: (event: PuzzleOutcomeEvent, puzzle: Puzzle) => void,
  options: PuzzleTrainerOptions = {},
): UsePuzzleTrainer {
  const verifyRef = useRef(options.verifyMove);
  verifyRef.current = options.verifyMove;
  /** Bumped on every load so a late verification never lands on the next puzzle. */
  const loadSeqRef = useRef(0);
  const chessRef = useRef(new Chess());
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [phase, setPhase] = useState<TrainerPhase>('idle');
  const [position, setPosition] = useState<TrainerSnapshot>(() =>
    snapshot(chessRef.current, null, 0, 0),
  );
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [wrongMove, setWrongMove] = useState<[Square, Square] | null>(null);
  const [practiceAfterFail, setPracticeAfterFail] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const stepRef = useRef(0); // index into moves[] of the next expected move
  const movesRef = useRef<string[]>([]);
  const reportedRef = useRef(false);
  const hintUsedRef = useRef<0 | 1 | 2>(0);
  const startedAtRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const totalRef = useRef(0);
  const meta = useMemo(() => (puzzle ? puzzleMeta(puzzle) : null), [puzzle]);
  const solverColor: LongColor = meta?.solverColor ?? 'white';

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  useEffect(() => () => clearTimers(), []);

  // Elapsed timer while solving.
  useEffect(() => {
    if (!['solving', 'checking', 'replying', 'intro'].includes(phase)) return;
    const id = window.setInterval(() => {
      if (startedAtRef.current !== null) setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const report = useCallback(
    (outcome: 'solved' | 'failed') => {
      if (reportedRef.current || !puzzle) return;
      reportedRef.current = true;
      const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      setElapsedMs(durationMs);
      onOutcomeRef.current(
        {
          outcome,
          hintUsed: hintUsedRef.current > 0,
          hintLevel: hintUsedRef.current,
          durationMs,
          solverMoves: totalRef.current,
        },
        puzzle,
      );
    },
    [puzzle],
  );

  const commit = useCallback((lastMove: [Square, Square] | null) => {
    const progress = Math.floor(stepRef.current / 2);
    setPosition(snapshot(chessRef.current, lastMove, progress, totalRef.current));
  }, []);

  const playOpponentMove = useCallback(
    (index: number, nextPhase: TrainerPhase) => {
      const uci = movesRef.current[index];
      if (!uci) return;
      const move = chessRef.current.move(parseUci(uci));
      playMoveSound(move, chessRef.current);
      stepRef.current = index + 1;
      commit([move.from, move.to]);
      setPhase(nextPhase);
    },
    [commit],
  );

  const load = useCallback(
    (next: Puzzle) => {
      clearTimers();
      loadSeqRef.current += 1;
      const { moves } = puzzleMeta(next);
      chessRef.current = new Chess(next.fen);
      movesRef.current = moves;
      totalRef.current = Math.ceil((moves.length - 1) / 2);
      stepRef.current = 0;
      reportedRef.current = false;
      hintUsedRef.current = 0;
      startedAtRef.current = null;
      setPuzzle(next);
      setHintLevel(0);
      setWrongMove(null);
      setPracticeAfterFail(false);
      setSolutionShown(false);
      setNeedsPromotion(null);
      setElapsedMs(0);
      setPhase('intro');
      setPosition(snapshot(chessRef.current, null, 0, totalRef.current));
      later(() => {
        playOpponentMove(0, 'solving');
        startedAtRef.current = Date.now();
      }, INTRO_DELAY);
    },
    [playOpponentMove],
  );

  const attempt = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'solving') return;
      const chess = chessRef.current;
      const expected = movesRef.current[stepRef.current];
      if (!expected) return;

      const fenBefore = chess.fen();
      let move;
      try {
        move = chess.move(promotion ? { from, to, promotion } : { from, to });
      } catch {
        commit(position.lastMove);
        return;
      }
      const played = toUci(move);
      const isLastSolverMove = stepRef.current >= movesRef.current.length - 1;
      const correct = played === expected || (isLastSolverMove && chess.isCheckmate());

      const reject = () => {
        playSound('failed');
        setWrongMove([from, to]);
        setPhase('failed');
        if (!practiceAfterFail) report('failed');
        // Show the wrong move briefly, then take it back.
        later(() => {
          chess.undo();
          setWrongMove(null);
          commit(position.lastMove);
        }, 700);
      };

      const accept = () => {
        stepRef.current += 1;
        setHintLevel(0);
        commit([move.from, move.to]);

        if (stepRef.current >= movesRef.current.length) {
          playSound('solved');
          setPhase('solved');
          if (!practiceAfterFail) report('solved');
          return;
        }
        playMoveSound(move, chess);
        setPhase('replying');
        later(() => playOpponentMove(stepRef.current, 'solving'), REPLY_DELAY);
      };

      if (correct) {
        accept();
        return;
      }

      // Another move may be just as good (own-game puzzles): let the engine judge it.
      // Only a final solver move can be accepted this way — after it the stored
      // line no longer applies.
      const verdict =
        isLastSolverMove && puzzle
          ? verifyRef.current?.(puzzle, fenBefore, expected, played)
          : null;
      if (!verdict) {
        reject();
        return;
      }
      const seq = loadSeqRef.current;
      setPhase('checking');
      commit([move.from, move.to]);
      verdict
        .then((ok) => {
          if (seq !== loadSeqRef.current) return;
          if (ok) accept();
          else reject();
        })
        .catch(() => {
          if (seq === loadSeqRef.current) reject();
        });
    },
    [phase, puzzle, commit, position.lastMove, practiceAfterFail, report, playOpponentMove],
  );

  const playUserMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'solving') return;
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
      if (!pending) return;
      if (!piece) {
        commit(position.lastMove); // snap the pawn back
        return;
      }
      attempt(pending.from, pending.to, piece);
    },
    [needsPromotion, attempt, commit, position.lastMove],
  );

  const hint = useCallback(() => {
    if (phase !== 'solving') return;
    const next: 1 | 2 = hintLevel >= 1 ? 2 : 1;
    hintUsedRef.current = next;
    setHintLevel(next);
  }, [phase, hintLevel]);

  const retry = useCallback(() => {
    if (phase !== 'failed') return;
    clearTimers();
    // Make sure the wrong move is gone.
    const chess = chessRef.current;
    const expectedPly = stepRef.current;
    while (chess.history().length > expectedPly) chess.undo();
    setWrongMove(null);
    setPracticeAfterFail(true);
    commit(position.lastMove);
    setPhase('solving');
  }, [phase, commit, position.lastMove]);

  const showSolution = useCallback(() => {
    if (phase === 'solved' || phase === 'idle' || phase === 'intro') return;
    clearTimers();
    loadSeqRef.current += 1; // a verdict still pending on a checked move is dropped
    if (!reportedRef.current) report('failed');
    setPracticeAfterFail(true);
    setSolutionShown(true);
    setWrongMove(null);
    const chess = chessRef.current;
    while (chess.history().length > stepRef.current) chess.undo();
    setPhase('replying');
    const playNext = () => {
      const uci = movesRef.current[stepRef.current];
      if (!uci) {
        setPhase('solved');
        return;
      }
      const move = chess.move(parseUci(uci));
      playMoveSound(move, chess);
      stepRef.current += 1;
      commit([move.from, move.to]);
      later(playNext, 650);
    };
    later(playNext, 200);
  }, [phase, report, commit]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (hintLevel === 0 || phase !== 'solving') return [];
    const expected = movesRef.current[stepRef.current];
    if (!expected) return [];
    const { from, to } = parseUci(expected);
    if (hintLevel === 1) return [{ orig: from, brush: 'green' }];
    return [{ orig: from, dest: to, brush: 'green' }];
  }, [hintLevel, phase, position.fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlights = useMemo(() => {
    const map = new Map<Square, string>();
    if (wrongMove) map.set(wrongMove[1], 'wrong');
    return map;
  }, [wrongMove]);

  return {
    puzzle,
    phase,
    position,
    solverColor,
    hintLevel,
    shapes,
    highlights,
    wrongMove,
    elapsedMs,
    load,
    playUserMove,
    hint,
    showSolution,
    retry,
    practiceAfterFail,
    solutionShown,
    needsPromotion,
    resolvePromotion,
  };
}
