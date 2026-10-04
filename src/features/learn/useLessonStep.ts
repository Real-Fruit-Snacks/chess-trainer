import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { isPromotionMove, legalDests, tryMove } from '@/chess/helpers';
import { playMoveSound, playSound } from '@/lib/sound';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { type LessonStep, parseShapes } from './model';
import { judgeTaskMove } from './taskCheck';

export type StepPhase = 'reading' | 'awaiting' | 'wrong' | 'replying' | 'correct' | 'revealed';

/** How a task step was finished, reported once with `onSolved`. */
export interface StepResult {
  /** The answer was shown rather than found. */
  revealed: boolean;
  /** Wrong moves played before the right one (or before the answer was shown). */
  mistakes: number;
  /** A hint was asked for. */
  hinted: boolean;
}

export interface LessonStepState {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  phase: StepPhase;
  feedback: string | null;
  /** The step's own arrows and circles plus the hint marks. */
  shapes: DrawShape[];
  /** Only the hint marks (the piece to move, then the move), for boards that hide the rest. */
  hintShapes: DrawShape[];
  highlights: Map<Square, string>;
  hintLevel: 0 | 1 | 2;
  needsPromotion: { from: Square; to: Square } | null;
  /** True when the step counts as finished (task solved, answer revealed, or no task). */
  done: boolean;
  /** "Show answer" is available: only while the task waits for a move. */
  canReveal: boolean;
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  hint: () => void;
  reveal: () => void;
  retry: () => void;
}

/**
 * Drives one lesson step: applies the learner's moves, judges them against the
 * task, plays the scripted reply and exposes board state for rendering.
 * `onSolved` is called once when the task is finished — found or revealed —
 * with how it went, so a caller can grade it on the spot.
 */
export function useLessonStep(
  step: LessonStep,
  onSolved: (result: StepResult) => void,
): LessonStepState {
  const chessRef = useRef(new Chess(step.fen));
  const [fen, setFen] = useState<Fen>(step.fen);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [phase, setPhase] = useState<StepPhase>(step.task ? 'awaiting' : 'reading');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const timers = useRef<number[]>([]);
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  // Counted synchronously, so the result handed to `onSolved` is never a render behind.
  const mistakesRef = useRef(0);
  const hintedRef = useRef(false);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Reset whenever the step changes.
  useEffect(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    chessRef.current = new Chess(step.fen);
    mistakesRef.current = 0;
    hintedRef.current = false;
    setFen(step.fen);
    setLastMove(null);
    setPhase(step.task ? 'awaiting' : 'reading');
    setFeedback(null);
    setHintLevel(0);
    setWrongSquare(null);
    setNeedsPromotion(null);
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
    };
  }, [step]);

  const sync = useCallback((move: [Square, Square] | null) => {
    setFen(chessRef.current.fen());
    setLastMove(move);
  }, []);

  const finishCorrect = useCallback((message: string | undefined) => {
    playSound('solved');
    setPhase('correct');
    setFeedback(message ?? 'Correct!');
    onSolvedRef.current({
      revealed: false,
      mistakes: mistakesRef.current,
      hinted: hintedRef.current,
    });
  }, []);

  const attempt = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const task = step.task;
      if (!task || phase !== 'awaiting') return;
      const chess = chessRef.current;
      const move = tryMove(chess, promotion ? { from, to, promotion } : { from, to });
      if (!move) {
        sync(lastMove);
        return;
      }
      const verdict = judgeTaskMove(task, move, chess);
      if (verdict === 'correct') {
        playMoveSound(move, chess);
        setHintLevel(0);
        sync([move.from, move.to]);
        if (task.reply) {
          setPhase('replying');
          later(() => {
            const reply = tryMove(chessRef.current, task.reply as string);
            if (reply) {
              playMoveSound(reply, chessRef.current);
              sync([reply.from, reply.to]);
            }
            finishCorrect(task.success);
          }, 450);
        } else {
          finishCorrect(task.success);
        }
        return;
      }
      playSound('failed');
      mistakesRef.current += 1;
      setPhase('wrong');
      setWrongSquare(move.to);
      setFeedback(task.failure ?? 'Not quite — try again.');
      sync([move.from, move.to]);
      later(() => {
        chess.undo();
        setWrongSquare(null);
        sync(null);
        setPhase('awaiting');
      }, 750);
    },
    [step.task, phase, sync, lastMove, finishCorrect],
  );

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'awaiting') return;
      if (!promotion && isPromotionMove(chessRef.current, from, to)) {
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
        sync(lastMove);
        return;
      }
      attempt(pending.from, pending.to, piece);
    },
    [needsPromotion, attempt, sync, lastMove],
  );

  const hint = useCallback(() => {
    if (!step.task || phase !== 'awaiting') return;
    hintedRef.current = true;
    setHintLevel((l) => (l >= 2 ? 2 : ((l + 1) as 1 | 2)));
    if (step.task.hint) setFeedback(step.task.hint);
  }, [step.task, phase]);

  const reveal = useCallback(() => {
    const task = step.task;
    // Only while the task waits for a move: not while a wrong move is being taken
    // back, nor once the right move is in and the reply is on its way.
    if (!task || phase !== 'awaiting') return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    const chess = chessRef.current;
    while (chess.history().length > 0) chess.undo();
    const answer = task.moves[0];
    const move = answer ? tryMove(chess, answer) : null;
    if (move) sync([move.from, move.to]);
    setWrongSquare(null);
    setNeedsPromotion(null);
    setPhase('revealed');
    setFeedback(`The answer was ${answer ?? '?'}. ${task.success ?? ''}`.trim());
    if (task.reply) {
      later(() => {
        const reply = tryMove(chessRef.current, task.reply as string);
        if (reply) sync([reply.from, reply.to]);
      }, 500);
    }
    onSolvedRef.current({
      revealed: true,
      mistakes: mistakesRef.current,
      hinted: hintedRef.current,
    });
  }, [step.task, phase, sync]);

  const retry = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    chessRef.current = new Chess(step.fen);
    mistakesRef.current = 0;
    hintedRef.current = false;
    sync(null);
    setPhase(step.task ? 'awaiting' : 'reading');
    setFeedback(null);
    setHintLevel(0);
    setWrongSquare(null);
    setNeedsPromotion(null);
  }, [step, sync]);

  const turn: LongColor = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const derived = useMemo(() => {
    const probe = new Chess(fen);
    return {
      dests: phase === 'awaiting' ? legalDests(probe) : new Map<Square, Square[]>(),
      check: probe.inCheck(),
    };
  }, [phase, fen]);

  const hintShapes = useMemo<DrawShape[]>(() => {
    if (hintLevel === 0 || !step.task || phase !== 'awaiting') return [];
    const probe = new Chess(step.fen);
    const first = step.task.moves[0];
    const move = first ? tryMove(probe, first) : null;
    if (!move) return [];
    if (hintLevel === 1) return [{ orig: move.from, brush: 'yellow' }];
    return [{ orig: move.from, dest: move.to, brush: 'yellow' }];
  }, [step, hintLevel, phase]);

  const shapes = useMemo<DrawShape[]>(
    () => [...parseShapes(step.shapes), ...hintShapes],
    [step.shapes, hintShapes],
  );

  const highlights = useMemo(() => {
    const map = new Map<Square, string>();
    if (wrongSquare) map.set(wrongSquare, 'wrong');
    if (phase === 'correct' && lastMove) map.set(lastMove[1], 'right');
    return map;
  }, [wrongSquare, phase, lastMove]);

  return {
    fen,
    turn,
    dests: derived.dests,
    lastMove,
    check: derived.check,
    phase,
    feedback,
    shapes,
    hintShapes,
    highlights,
    hintLevel,
    needsPromotion,
    done: !step.task || phase === 'correct' || phase === 'revealed',
    canReveal: !!step.task && phase === 'awaiting',
    playMove,
    resolvePromotion,
    hint,
    reveal,
    retry,
  };
}
