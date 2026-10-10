import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { isPromotionMove, legalDests, tryMove } from '@/chess/helpers';
import { playMoveSound, playSound } from '@/lib/sound';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { explainWrongMove } from './explainWrongMove';
import { type LessonStep, type LessonTask, parseShapes, taskLine } from './model';
import { judgeTaskMove, wrongMoveAnswer } from './taskCheck';

export type StepPhase =
  /** A step with no task: there is only the text to read. */
  | 'reading'
  /** The learner's move is awaited. */
  | 'awaiting'
  /** A wrong move is on the board, about to be taken back (or answered). */
  | 'wrong'
  /** A wrong move and the reply that punishes it are on the board, until taken back. */
  | 'refuted'
  /** The right move is in; the opponent's reply is on its way. */
  | 'replying'
  /** The line is done, every move found. */
  | 'correct'
  /** The line is done, with an answer shown. */
  | 'revealed';

/** How a task step was finished, reported once with `onSolved`. */
export interface StepResult {
  /** An answer was shown rather than found. */
  revealed: boolean;
  /** Wrong moves played on the way (before the right one, or before the answer was shown). */
  mistakes: number;
  /** A hint was asked for. */
  hinted: boolean;
}

/**
 * What the coach says, and the moves played, as the step goes: the question
 * (`prompt`), its reaction to a right move (`good`) and why it works (`why`),
 * its answer to a wrong one (`wrong`), a nudge (`hint`), a shown answer
 * (`answer`), and its word on the opponent's reply (`note`).
 */
export type CoachTone = 'prompt' | 'good' | 'why' | 'wrong' | 'hint' | 'answer' | 'note';

export type LessonMessage =
  | { id: number; kind: 'coach'; tone: CoachTone; text: string }
  | {
      id: number;
      kind: 'move';
      who: 'you' | 'them';
      san: string;
      color: LongColor;
      wrong: boolean;
    };

export interface LessonStepState {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  phase: StepPhase;
  /** The conversation so far: the coach's words and the moves played. */
  messages: LessonMessage[];
  /** The id of the question now waiting for a move, or null. */
  activePrompt: number | null;
  /** The step's own arrows and circles plus the hint marks (and a punishing reply's arrow). */
  shapes: DrawShape[];
  /** Only the hint marks (the piece to move, then the move), for boards that hide the rest. */
  hintShapes: DrawShape[];
  highlights: Map<Square, string>;
  hintLevel: 0 | 1 | 2;
  needsPromotion: { from: Square; to: Square } | null;
  /** True when the step counts as finished (line solved, answer shown, or no task). */
  done: boolean;
  /** "Show answer" is available: only while a move is awaited. */
  canReveal: boolean;
  /** A wrong move and its punishment stand on the board: "Take back" puts the position back. */
  canTakeBack: boolean;
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  hint: () => void;
  reveal: () => void;
  takeBack: () => void;
  retry: () => void;
}

const colorOf = (fen: Fen): LongColor => (fen.split(' ')[1] === 'b' ? 'black' : 'white');

/** Pause before the opponent's reply, and before a wrong move without an answer is taken back. */
const REPLY_MS = 600;
const TAKE_BACK_MS = 900;

/**
 * Drives one lesson step: the line of moves the learner is asked for, judged
 * against each task, with the opponent's scripted replies, the coach's words
 * for every move (right, wrong, shown) and the board state to render.
 * `onSolved` is called once, when the line is finished — found or shown —
 * with how it went, so a caller can grade it on the spot.
 */
export function useLessonStep(
  step: LessonStep,
  onSolved: (result: StepResult) => void,
): LessonStepState {
  const line = useMemo(() => taskLine(step.task), [step]);
  const chessRef = useRef(new Chess(step.fen));
  const [fen, setFen] = useState<Fen>(step.fen);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [phase, setPhase] = useState<StepPhase>(line.length > 0 ? 'awaiting' : 'reading');
  const [messages, setMessages] = useState<LessonMessage[]>(() => openingMessages(line));
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [punisher, setPunisher] = useState<DrawShape | null>(null);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [index, setIndex] = useState(0);
  const timers = useRef<number[]>([]);
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  // The line's own state, read synchronously by the callbacks and timers.
  const indexRef = useRef(0);
  /** The position of the task now asked, and the move that led to it. */
  const taskFenRef = useRef<Fen>(step.fen);
  const taskLastMoveRef = useRef<[Square, Square] | null>(null);
  const nextId = useRef(1);
  // Counted synchronously, so the result handed to `onSolved` is never a render behind.
  const mistakesRef = useRef(0);
  const hintedRef = useRef(false);
  const revealedRef = useRef(false);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const coach = (tone: CoachTone, text: string): LessonMessage => ({
    id: nextId.current++,
    kind: 'coach',
    tone,
    text,
  });
  const moveMessage = (who: 'you' | 'them', san: string, color: LongColor, wrong = false) =>
    ({ id: nextId.current++, kind: 'move', who, san, color, wrong }) satisfies LessonMessage;
  const push = useCallback((...added: (LessonMessage | null)[]) => {
    const kept = added.filter((m): m is LessonMessage => m !== null);
    if (kept.length > 0) setMessages((prev) => [...prev, ...kept]);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    chessRef.current = new Chess(step.fen);
    indexRef.current = 0;
    taskFenRef.current = step.fen;
    taskLastMoveRef.current = null;
    mistakesRef.current = 0;
    hintedRef.current = false;
    revealedRef.current = false;
    nextId.current = 1;
    setFen(step.fen);
    setLastMove(null);
    setIndex(0);
    setPhase(line.length > 0 ? 'awaiting' : 'reading');
    setMessages(openingMessages(line));
    setHintLevel(0);
    setWrongSquare(null);
    setPunisher(null);
    setNeedsPromotion(null);
  }, [step, line]);

  // A new step starts afresh in the same render, so nothing of the last one shows with it
  // (the page moves focus to the new question as it appears).
  const [shown, setShown] = useState(step);
  if (shown !== step) {
    setShown(step);
    reset();
  }
  useEffect(() => clearTimers, [step]);

  const sync = useCallback((move: [Square, Square] | null) => {
    setFen(chessRef.current.fen());
    setLastMove(move);
  }, []);

  const finish = useCallback(() => {
    const revealed = revealedRef.current;
    if (!revealed) playSound('solved');
    setPhase(revealed ? 'revealed' : 'correct');
    onSolvedRef.current({
      revealed,
      mistakes: mistakesRef.current,
      hinted: hintedRef.current,
    });
  }, []);

  /** After a right (or shown) move: the reply and the next question, or the end of the line. */
  const carryOn = useCallback(
    (task: LessonTask) => {
      if (!task.reply) {
        finish();
        return;
      }
      setPhase('replying');
      later(() => {
        const chess = chessRef.current;
        const color = colorOf(chess.fen());
        const reply = tryMove(chess, task.reply as string);
        if (reply) {
          playMoveSound(reply, chess);
          sync([reply.from, reply.to]);
          taskLastMoveRef.current = [reply.from, reply.to];
        }
        const next = line[indexRef.current + 1];
        push(
          moveMessage('them', reply?.san ?? (task.reply as string), color),
          task.replyNote ? coach('note', task.replyNote) : null,
          next ? coach('prompt', next.prompt) : null,
        );
        if (!next) {
          finish();
          return;
        }
        indexRef.current += 1;
        setIndex(indexRef.current);
        taskFenRef.current = chess.fen();
        setHintLevel(0);
        setPhase('awaiting');
      }, REPLY_MS);
    },
    [line, finish, push, sync],
  );

  /** Puts the position of the task back, after a wrong move (and its punishment). */
  const takeBack = useCallback(() => {
    clearTimers();
    chessRef.current = new Chess(taskFenRef.current);
    setWrongSquare(null);
    setPunisher(null);
    sync(taskLastMoveRef.current);
    setPhase('awaiting');
  }, [sync]);

  const attempt = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const task = line[indexRef.current];
      if (!task || phase !== 'awaiting') return;
      const chess = chessRef.current;
      const before = chess.fen();
      const color = colorOf(before);
      const move = tryMove(chess, promotion ? { from, to, promotion } : { from, to });
      if (!move) {
        sync(lastMove);
        return;
      }
      if (judgeTaskMove(task, move, chess) === 'correct') {
        playMoveSound(move, chess);
        setHintLevel(0);
        sync([move.from, move.to]);
        taskLastMoveRef.current = [move.from, move.to];
        push(
          moveMessage('you', move.san, color),
          coach('good', task.success ?? 'Exactly.'),
          task.why ? coach('why', task.why) : null,
        );
        carryOn(task);
        return;
      }
      playSound('failed');
      mistakesRef.current += 1;
      setWrongSquare(move.to);
      sync([move.from, move.to]);
      setPhase('wrong');
      // The coach's own answer for a tempting move; otherwise what the board shows, and the nudge.
      const listed = wrongMoveAnswer(task, move.san);
      const seen = listed ? null : explainWrongMove(before, move.san);
      const words = [
        listed ? coach('wrong', listed.text) : null,
        seen ? coach('wrong', seen.text) : null,
        listed
          ? null
          : task.failure
            ? coach(seen ? 'hint' : 'wrong', task.failure)
            : seen
              ? null
              : coach('wrong', 'Not this one. Look at the position again.'),
      ];
      push(moveMessage('you', move.san, color, true));
      const refute = listed?.refute ?? seen?.refute ?? null;
      if (!refute) {
        push(...words);
        later(takeBack, TAKE_BACK_MS);
        return;
      }
      // The reply that punishes it comes first: the coach's words are about it.
      later(() => {
        const answer = tryMove(chessRef.current, refute);
        if (!answer) {
          push(...words);
          takeBack();
          return;
        }
        playMoveSound(answer, chessRef.current);
        sync([answer.from, answer.to]);
        setPunisher({ orig: answer.from, dest: answer.to, brush: 'red' });
        push(moveMessage('them', answer.san, color === 'white' ? 'black' : 'white'), ...words);
        setPhase('refuted');
      }, REPLY_MS);
    },
    [line, phase, sync, lastMove, push, carryOn, takeBack],
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
    const task = line[indexRef.current];
    if (!task || phase !== 'awaiting') return;
    hintedRef.current = true;
    // The words come with the first nudge; the second only draws the move.
    if (hintLevel === 0 && task.hint) push(coach('hint', task.hint));
    setHintLevel((l) => (l >= 2 ? 2 : ((l + 1) as 1 | 2)));
  }, [line, phase, hintLevel, push]);

  const reveal = useCallback(() => {
    const task = line[indexRef.current];
    // Only while a move is awaited: not while a wrong move is on the board, nor once the
    // right move is in and the reply is on its way.
    if (!task || phase !== 'awaiting') return;
    clearTimers();
    const chess = new Chess(taskFenRef.current);
    chessRef.current = chess;
    const answer = task.moves[0];
    const move = answer ? tryMove(chess, answer) : null;
    if (move) {
      sync([move.from, move.to]);
      taskLastMoveRef.current = [move.from, move.to];
    }
    revealedRef.current = true;
    setWrongSquare(null);
    setPunisher(null);
    setNeedsPromotion(null);
    setHintLevel(0);
    push(
      coach('answer', `Here is the move: ${move?.san ?? answer ?? '?'}.`),
      task.success ? coach('good', task.success) : null,
      task.why ? coach('why', task.why) : null,
    );
    carryOn(task);
  }, [line, phase, sync, push, carryOn]);

  const turn = colorOf(fen);
  const derived = useMemo(() => {
    const probe = new Chess(fen);
    return {
      dests: phase === 'awaiting' ? legalDests(probe) : new Map<Square, Square[]>(),
      check: probe.inCheck(),
    };
  }, [phase, fen]);

  const hintShapes = useMemo<DrawShape[]>(() => {
    const task = line[index];
    if (hintLevel === 0 || !task || phase !== 'awaiting') return [];
    const probe = new Chess(taskFenRef.current);
    const first = task.moves[0];
    const move = first ? tryMove(probe, first) : null;
    if (!move) return [];
    if (hintLevel === 1) return [{ orig: move.from, brush: 'yellow' }];
    return [{ orig: move.from, dest: move.to, brush: 'yellow' }];
  }, [line, index, hintLevel, phase]);

  // The step's arrows describe its diagram: once a line has moved on, they would mislead.
  const ownShapes = useMemo(
    () => (index === 0 || line.length <= 1 ? parseShapes(step.shapes) : []),
    [step.shapes, index, line.length],
  );
  const shapes = useMemo<DrawShape[]>(
    () => [...ownShapes, ...hintShapes, ...(punisher ? [punisher] : [])],
    [ownShapes, hintShapes, punisher],
  );

  const highlights = useMemo(() => {
    const map = new Map<Square, string>();
    if (wrongSquare) map.set(wrongSquare, 'wrong');
    if (phase === 'correct' && lastMove) map.set(lastMove[1], 'right');
    return map;
  }, [wrongSquare, phase, lastMove]);

  const asking = phase === 'awaiting' || phase === 'wrong' || phase === 'refuted';
  const activePrompt = asking
    ? ([...messages].reverse().find((m) => m.kind === 'coach' && m.tone === 'prompt')?.id ?? null)
    : null;

  return {
    fen,
    turn,
    dests: derived.dests,
    lastMove,
    check: derived.check,
    phase,
    messages,
    activePrompt,
    shapes,
    hintShapes,
    highlights,
    hintLevel,
    needsPromotion,
    done: line.length === 0 || phase === 'correct' || phase === 'revealed',
    canReveal: line.length > 0 && phase === 'awaiting',
    canTakeBack: phase === 'refuted',
    playMove,
    resolvePromotion,
    hint,
    reveal,
    takeBack,
    retry: reset,
  };
}

/** The conversation a step starts with: the first question, when there is a task. */
function openingMessages(line: LessonTask[]): LessonMessage[] {
  const first = line[0];
  return first ? [{ id: 0, kind: 'coach', tone: 'prompt', text: first.prompt }] : [];
}
