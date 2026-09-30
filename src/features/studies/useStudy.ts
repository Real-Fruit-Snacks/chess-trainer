import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { isPromotionMove, legalDests, tryMove } from '@/chess/helpers';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { normalizeSan } from '@/features/learn/taskCheck';
import { playMoveSound, playSound } from '@/lib/sound';
import { solverColor, type Study } from './studies';

export type StudyPhase = 'solving' | 'wrong' | 'replying' | 'solved' | 'revealed';

export interface StudyState {
  fen: Fen;
  turn: LongColor;
  solver: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  phase: StudyPhase;
  /** Index of the solver ply being asked for. */
  ply: number;
  total: number;
  /** Notes revealed so far (one per solved ply). */
  notes: string[];
  feedback: string | null;
  shapes: DrawShape[];
  highlights: Map<Square, string>;
  hintLevel: 0 | 1 | 2;
  /** True once a wrong move or the solution was used. */
  assisted: boolean;
  needsPromotion: { from: Square; to: Square } | null;
  /** SAN of the whole main line played out so far (for the move list). */
  played: string[];
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  hint: () => void;
  reveal: () => void;
  retry: () => void;
}

const REPLY_DELAY = 500;
const WRONG_DELAY = 700;

/**
 * Drives one study: the solver's moves are checked against the scripted line
 * (any listed alternative is accepted), the reply is played automatically,
 * and the outcome is reported once when the line is complete.
 */
export function useStudy(
  study: Study,
  onDone: (outcome: 'solved' | 'revealed', assisted: boolean) => void,
): StudyState {
  const solver = solverColor(study);
  const chessRef = useRef(new Chess(study.fen));
  const [fen, setFen] = useState<Fen>(study.fen);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [phase, setPhase] = useState<StudyPhase>('solving');
  const [ply, setPly] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [assisted, setAssisted] = useState(false);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [played, setPlayed] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reported = useRef(false);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const reset = useCallback(() => {
    clear();
    chessRef.current = new Chess(study.fen);
    setFen(study.fen);
    setLastMove(null);
    setPhase('solving');
    setPly(0);
    setNotes([]);
    setFeedback(null);
    setHintLevel(0);
    setWrongSquare(null);
    setNeedsPromotion(null);
    setPlayed([]);
    reported.current = false;
  }, [study.fen]);

  useEffect(() => {
    reset();
    return clear;
  }, [reset]);

  const sync = useCallback((move: [Square, Square] | null) => {
    setFen(chessRef.current.fen());
    setLastMove(move);
  }, []);

  const finish = useCallback((outcome: 'solved' | 'revealed', wasAssisted: boolean) => {
    setPhase(outcome);
    if (reported.current) return;
    reported.current = true;
    doneRef.current(outcome, wasAssisted);
  }, []);

  /** Plays the scripted reply for `index` and moves on to the next solver ply. */
  const playReply = useCallback(
    (index: number, wasAssisted: boolean) => {
      const step = study.line[index];
      if (!step) return;
      if (!step.reply) {
        playSound('solved');
        finish('solved', wasAssisted);
        return;
      }
      setPhase('replying');
      later(() => {
        const reply = tryMove(chessRef.current, step.reply as string);
        if (reply) {
          playMoveSound(reply, chessRef.current);
          setPlayed((p) => [...p, reply.san]);
          sync([reply.from, reply.to]);
        }
        if (index + 1 >= study.line.length) {
          playSound('solved');
          finish('solved', wasAssisted);
        } else {
          setPly(index + 1);
          setPhase('solving');
        }
      }, REPLY_DELAY);
    },
    [study.line, sync, finish],
  );

  const attempt = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'solving') return;
      const step = study.line[ply];
      if (!step) return;
      const chess = chessRef.current;
      const move = tryMove(chess, promotion ? { from, to, promotion } : { from, to });
      if (!move) {
        sync(lastMove);
        return;
      }
      const accepted = step.moves.some((m) => normalizeSan(m) === normalizeSan(move.san));
      if (accepted) {
        playMoveSound(move, chess);
        setHintLevel(0);
        setPlayed((p) => [...p, move.san]);
        setNotes((n) => [...n, step.note ?? '']);
        setFeedback(step.note ?? null);
        sync([move.from, move.to]);
        playReply(ply, assisted);
        return;
      }
      playSound('failed');
      setAssisted(true);
      setPhase('wrong');
      setWrongSquare(move.to);
      setFeedback('Not the study’s move — take it back and look again.');
      sync([move.from, move.to]);
      later(() => {
        chess.undo();
        setWrongSquare(null);
        sync(null);
        setPhase('solving');
      }, WRONG_DELAY);
    },
    [phase, study.line, ply, sync, lastMove, playReply, assisted],
  );

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'solving') return;
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
    if (phase !== 'solving') return;
    setAssisted(true);
    setHintLevel((l) => (l >= 2 ? 2 : ((l + 1) as 1 | 2)));
  }, [phase]);

  /** Plays the rest of the main line automatically. */
  const reveal = useCallback(() => {
    if (phase === 'solved' || phase === 'revealed') return;
    clear();
    setAssisted(true);
    const chess = chessRef.current;
    let index = ply;
    const step = () => {
      const current = study.line[index];
      if (!current) {
        finish('revealed', true);
        return;
      }
      const move = tryMove(chess, current.moves[0] as string);
      if (!move) {
        finish('revealed', true);
        return;
      }
      setPlayed((p) => [...p, move.san]);
      setNotes((n) => [...n, current.note ?? '']);
      setFeedback(current.note ?? null);
      sync([move.from, move.to]);
      setPly(index);
      if (!current.reply) {
        finish('revealed', true);
        return;
      }
      later(() => {
        const reply = tryMove(chess, current.reply as string);
        if (reply) {
          setPlayed((p) => [...p, reply.san]);
          sync([reply.from, reply.to]);
        }
        index += 1;
        if (index >= study.line.length) finish('revealed', true);
        else later(step, REPLY_DELAY);
      }, REPLY_DELAY);
    };
    setPhase('replying');
    step();
  }, [phase, ply, study.line, sync, finish]);

  const turn: LongColor = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const derived = useMemo(() => {
    const probe = new Chess(fen);
    return {
      dests: phase === 'solving' ? legalDests(probe) : new Map<Square, Square[]>(),
      check: probe.inCheck(),
    };
  }, [phase, fen]);

  const shapes = useMemo<DrawShape[]>(() => {
    const step = study.line[ply];
    if (!step || phase !== 'solving' || hintLevel === 0) return [];
    const probe = new Chess(fen);
    const move = tryMove(probe, step.moves[0] as string);
    if (!move) return [];
    return hintLevel === 1
      ? [{ orig: move.from, brush: 'yellow' }]
      : [{ orig: move.from, dest: move.to, brush: 'yellow' }];
  }, [study.line, ply, phase, hintLevel, fen]);

  const highlights = useMemo(() => {
    const map = new Map<Square, string>();
    if (wrongSquare) map.set(wrongSquare, 'wrong');
    return map;
  }, [wrongSquare]);

  return {
    fen,
    turn,
    solver,
    dests: derived.dests,
    lastMove,
    check: derived.check,
    phase,
    ply,
    total: study.line.length,
    notes,
    feedback,
    shapes,
    highlights,
    hintLevel,
    assisted,
    needsPromotion,
    played,
    playMove,
    resolvePromotion,
    hint,
    reveal,
    retry: reset,
  };
}
