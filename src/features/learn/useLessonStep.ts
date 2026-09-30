import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { isPromotionMove, legalDests, tryMove } from '@/chess/helpers';
import { playMoveSound, playSound } from '@/lib/sound';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { type LessonStep, parseShapes } from './model';
import { judgeTaskMove } from './taskCheck';

export type StepPhase = 'reading' | 'awaiting' | 'wrong' | 'replying' | 'correct' | 'revealed';

export interface LessonStepState {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  phase: StepPhase;
  feedback: string | null;
  shapes: DrawShape[];
  highlights: Map<Square, string>;
  hintLevel: 0 | 1 | 2;
  needsPromotion: { from: Square; to: Square } | null;
  /** True when the step counts as finished (task solved, answer revealed, or no task). */
  done: boolean;
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  hint: () => void;
  reveal: () => void;
  retry: () => void;
}

/**
 * Drives one lesson step: applies the learner's moves, judges them against the
 * task, plays the scripted reply and exposes board state for rendering.
 */
export function useLessonStep(step: LessonStep, onSolved: () => void): LessonStepState {
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

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Reset whenever the step changes.
  useEffect(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    chessRef.current = new Chess(step.fen);
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
    onSolvedRef.current();
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
    setHintLevel((l) => (l >= 2 ? 2 : ((l + 1) as 1 | 2)));
    if (step.task.hint) setFeedback(step.task.hint);
  }, [step.task, phase]);

  const reveal = useCallback(() => {
    const task = step.task;
    if (!task || phase === 'correct' || phase === 'revealed') return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    const chess = chessRef.current;
    while (chess.history().length > 0) chess.undo();
    const answer = task.moves[0];
    const move = answer ? tryMove(chess, answer) : null;
    if (move) sync([move.from, move.to]);
    setPhase('revealed');
    setFeedback(`The answer was ${answer ?? '?'}. ${task.success ?? ''}`.trim());
    if (task.reply) {
      later(() => {
        const reply = tryMove(chessRef.current, task.reply as string);
        if (reply) sync([reply.from, reply.to]);
      }, 500);
    }
    onSolvedRef.current();
  }, [step.task, phase, sync]);

  const retry = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    chessRef.current = new Chess(step.fen);
    sync(null);
    setPhase(step.task ? 'awaiting' : 'reading');
    setFeedback(null);
    setHintLevel(0);
    setWrongSquare(null);
  }, [step, sync]);

  const turn: LongColor = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const derived = useMemo(() => {
    const probe = new Chess(fen);
    return {
      dests: phase === 'awaiting' ? legalDests(probe) : new Map<Square, Square[]>(),
      check: probe.inCheck(),
    };
  }, [phase, fen]);

  const shapes = useMemo<DrawShape[]>(() => {
    const base = parseShapes(step.shapes);
    if (hintLevel === 0 || !step.task || phase !== 'awaiting') return base;
    const probe = new Chess(step.fen);
    const first = step.task.moves[0];
    const move = first ? tryMove(probe, first) : null;
    if (!move) return base;
    if (hintLevel === 1) return [...base, { orig: move.from, brush: 'yellow' }];
    return [...base, { orig: move.from, dest: move.to, brush: 'yellow' }];
  }, [step, hintLevel, phase]);

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
    highlights,
    hintLevel,
    needsPromotion,
    done: !step.task || phase === 'correct' || phase === 'revealed',
    playMove,
    resolvePromotion,
    hint,
    reveal,
    retry,
  };
}
