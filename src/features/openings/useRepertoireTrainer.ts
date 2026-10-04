import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '@/components/board/Board';
import { checkedKingSquare, legalDests, parseUci, toUci, tryMove } from '@/chess/helpers';
import type { GameTree, TreeNode } from '@/chess/tree';
import type { Fen, LongColor, PromotionPiece } from '@/chess/types';
import { isNew, type Quality } from '@/lib/srs';
import { playMoveSound, playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { cardKey, isLearnerMove, pickLine, repertoireLines, transpositionTwins } from './model';

export type TrainerPhase =
  | 'idle'
  | 'opponent' // opponent's move is being played
  | 'learner' // waiting for the learner
  | 'lineDone'
  | 'sessionDone';

export interface LineResult {
  correct: number;
  total: number;
}

export interface BoardState {
  fen: Fen;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  lastMove: [Square, Square] | null;
  check: boolean;
  checkedKing: Square | null;
}

export interface UseRepertoireTrainer {
  phase: TrainerPhase;
  board: BoardState;
  /** Nodes of the current line (root excluded) and how far we are into it. */
  line: TreeNode[];
  index: number;
  /** Comment attached to the last played move, if any. */
  tip: string | null;
  /** Whether the current learner move is being shown (new card or after a miss). */
  showing: boolean;
  shapes: DrawShape[];
  wrongMove: [Square, Square] | null;
  lineResult: LineResult;
  session: LineResult & { lines: number };
  dueOnly: boolean;
  setDueOnly: (v: boolean) => void;
  start: () => void;
  nextLine: () => void;
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  showMove: () => void;
  stop: () => void;
  needsPromotion: { from: Square; to: Square } | null;
  resolvePromotion: (piece: PromotionPiece | null) => void;
}

const OPPONENT_DELAY = 450;
const LINE_DONE_DELAY = 1400;
const MAX_LINES_PER_SESSION = 12;

function boardState(chess: Chess, lastMove: [Square, Square] | null): BoardState {
  return {
    fen: chess.fen(),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    dests: legalDests(chess),
    lastMove,
    check: chess.inCheck(),
    checkedKing: checkedKingSquare(chess),
  };
}

/**
 * Trains one repertoire line at a time: opponent moves are played from the
 * tree automatically, the learner must recall their own. New moves are shown
 * with an arrow first; every learner move is graded into the SRS store.
 */
export function useRepertoireTrainer(
  repertoireId: string,
  tree: GameTree,
  color: LongColor,
): UseRepertoireTrainer {
  const review = useRepertoire((s) => s.review);
  const recordSession = useRepertoire((s) => s.recordSession);
  const allCards = useRepertoire((s) => s.cards);
  const cards = useMemo(() => cardsFor(allCards, repertoireId), [allCards, repertoireId]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const lines = useMemo(() => repertoireLines(tree), [tree]);

  const chessRef = useRef(new Chess(tree.startFen));
  const [phase, setPhase] = useState<TrainerPhase>('idle');
  const [board, setBoard] = useState<BoardState>(() => boardState(chessRef.current, null));
  const [line, setLine] = useState<TreeNode[]>([]);
  const [index, setIndex] = useState(0);
  const [tip, setTip] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const [wrongMove, setWrongMove] = useState<[Square, Square] | null>(null);
  const [lineResult, setLineResult] = useState<LineResult>({ correct: 0, total: 0 });
  const [session, setSession] = useState({ correct: 0, total: 0, lines: 0 });
  const [dueOnly, setDueOnly] = useState(true);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const lineRef = useRef<TreeNode[]>([]);
  const indexRef = useRef(0);
  const missedRef = useRef(false); // current learner move already missed or shown
  const lineStatsRef = useRef({ correct: 0, total: 0 });
  const sessionRef = useRef({ correct: 0, total: 0, lines: 0 });
  const timersRef = useRef<number[]>([]);
  const lastLineRef = useRef<TreeNode[] | null>(null);

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => clearTimers(), []);

  const expectedNode = (): TreeNode | undefined => lineRef.current[indexRef.current];

  const finishLine = useCallback(() => {
    const stats = lineStatsRef.current;
    sessionRef.current = {
      correct: sessionRef.current.correct + stats.correct,
      total: sessionRef.current.total + stats.total,
      lines: sessionRef.current.lines + 1,
    };
    setSession({ ...sessionRef.current });
    setLineResult({ ...stats });
    setPhase('lineDone');
    playSound('solved');
  }, []);

  /** Advances through opponent moves until it is the learner's turn (or the line ends). */
  const advanceRef = useRef<() => void>(() => undefined);
  const advance = useCallback(() => {
    const node = expectedNode();
    if (!node) {
      finishLine();
      return;
    }
    if (isLearnerMove(node, color)) {
      missedRef.current = false;
      const card = cardsRef.current[cardKey(node)];
      setShowing(isNew(card));
      setPhase('learner');
      return;
    }
    setPhase('opponent');
    later(() => {
      const move = tryMove(chessRef.current, parseUci(node.uci));
      if (!move) {
        finishLine();
        return;
      }
      playMoveSound(move, chessRef.current);
      indexRef.current += 1;
      setIndex(indexRef.current);
      setBoard(boardState(chessRef.current, [move.from, move.to]));
      setTip(node.comment ?? null);
      advanceRef.current();
    }, OPPONENT_DELAY);
  }, [color, finishLine]);
  advanceRef.current = advance;

  const beginLine = useCallback(
    (chosen: TreeNode[]) => {
      clearTimers();
      chessRef.current = new Chess(tree.startFen);
      lineRef.current = chosen;
      lastLineRef.current = chosen;
      indexRef.current = 0;
      lineStatsRef.current = { correct: 0, total: 0 };
      setLine(chosen);
      setIndex(0);
      setTip(null);
      setWrongMove(null);
      setNeedsPromotion(null);
      setLineResult({ correct: 0, total: 0 });
      setBoard(boardState(chessRef.current, null));
      advance();
    },
    [tree, advance],
  );

  const nextLine = useCallback(() => {
    if (sessionRef.current.lines >= MAX_LINES_PER_SESSION) {
      setPhase('sessionDone');
      recordSession({ repertoireId, ...sessionRef.current });
      return;
    }
    const chosen = pickLine(lines, color, cardsRef.current, Date.now(), {
      dueOnly,
      exclude: lines.length > 1 ? lastLineRef.current : null,
    });
    if (!chosen) {
      setPhase('sessionDone');
      if (sessionRef.current.total > 0) recordSession({ repertoireId, ...sessionRef.current });
      return;
    }
    beginLine(chosen);
  }, [lines, color, dueOnly, beginLine, recordSession, repertoireId]);

  const start = useCallback(() => {
    sessionRef.current = { correct: 0, total: 0, lines: 0 };
    setSession({ correct: 0, total: 0, lines: 0 });
    lastLineRef.current = null;
    nextLine();
  }, [nextLine]);

  const stop = useCallback(() => {
    clearTimers();
    if (sessionRef.current.total > 0) recordSession({ repertoireId, ...sessionRef.current });
    setPhase('idle');
  }, [recordSession, repertoireId]);

  const grade = useCallback(
    (node: TreeNode, quality: Quality) => {
      const now = Date.now();
      review(repertoireId, cardKey(node), quality, now);
      // The same move in the same position by another move order: one memory, so its card moves
      // too — unless that line already recalled it today (two successes in a day would push it
      // further than the schedule intends). A miss always carries over.
      const today = new Date(now).setHours(0, 0, 0, 0);
      for (const twin of transpositionTwins(tree, node)) {
        const card = cardsRef.current[cardKey(twin)];
        if (quality >= 3 && card?.lastReviewed != null && card.lastReviewed >= today) continue;
        review(repertoireId, cardKey(twin), quality, now);
      }
      useProgress.getState().touchTraining();
      lineStatsRef.current = {
        correct: lineStatsRef.current.correct + (quality >= 3 ? 1 : 0),
        total: lineStatsRef.current.total + 1,
      };
      setLineResult({ ...lineStatsRef.current });
    },
    [review, repertoireId, tree],
  );

  // Auto-advance after a finished line.
  useEffect(() => {
    if (phase !== 'lineDone') return;
    const id = window.setTimeout(nextLine, LINE_DONE_DELAY);
    return () => window.clearTimeout(id);
  }, [phase, nextLine]);

  const attempt = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'learner') return;
      const node = expectedNode();
      if (!node) return;
      const chess = chessRef.current;
      const move = tryMove(chess, promotion ? { from, to, promotion } : { from, to });
      if (!move) return;
      const played = toUci(move);
      // Accept any learner move that is in the repertoire at this point.
      const parent = node.parent;
      const alternative = parent?.children.find((c) => c.uci === played && c !== node);
      const chosen = played === node.uci ? node : alternative;
      if (!chosen) {
        chess.undo();
        playSound('failed');
        setWrongMove([from, to]);
        if (!missedRef.current) {
          missedRef.current = true;
          grade(node, 1);
        }
        setShowing(true);
        later(() => setWrongMove(null), 600);
        return;
      }
      playMoveSound(move, chess);
      if (chosen !== node) {
        // Follow the alternative branch's main continuation from here.
        const rest: TreeNode[] = [];
        let cursor: TreeNode | undefined = chosen;
        while (cursor) {
          rest.push(cursor);
          cursor = cursor.children[0];
        }
        const newLine = [...lineRef.current.slice(0, indexRef.current), ...rest];
        lineRef.current = newLine;
        setLine(newLine);
      }
      if (!missedRef.current) {
        const card = cardsRef.current[cardKey(chosen)];
        grade(chosen, isNew(card) ? 4 : 5);
      }
      indexRef.current += 1;
      setIndex(indexRef.current);
      setShowing(false);
      setBoard(boardState(chess, [move.from, move.to]));
      setTip(chosen.comment ?? null);
      advance();
    },
    [phase, grade, advance],
  );

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (phase !== 'learner') return;
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

  const showMove = useCallback(() => {
    if (phase !== 'learner') return;
    const node = expectedNode();
    if (!node) return;
    if (!missedRef.current && !isNew(cardsRef.current[cardKey(node)])) {
      missedRef.current = true;
      grade(node, 2);
    }
    setShowing(true);
  }, [phase, grade]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (phase !== 'learner' || !showing) return [];
    const node = lineRef.current[indexRef.current];
    if (!node) return [];
    const { from, to } = parseUci(node.uci);
    return [{ orig: from, dest: to, brush: 'green' }];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are read on purpose; index/line trigger recalculation
  }, [phase, showing, index, line]);

  return {
    phase,
    board,
    line,
    index,
    tip,
    showing,
    shapes,
    wrongMove,
    lineResult,
    session,
    dueOnly,
    setDueOnly,
    start,
    nextLine,
    playMove,
    showMove,
    stop,
    needsPromotion,
    resolvePromotion,
  };
}
