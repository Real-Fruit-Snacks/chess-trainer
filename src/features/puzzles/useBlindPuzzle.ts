import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseUci, tryMove, tryNotation } from '@/chess/helpers';
import type { MoveInput, PromotionPiece, San, Uci } from '@/chess/types';
import { describeMove } from '@/components/board/announce';
import { playMoveSound, playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { type BlindDepth, blindLevel } from './blind';
import { blindFen, type BlindSetup, judgeBlindMove, prepareBlind } from './blindLine';
import { type Puzzle, selectPuzzle } from './puzzleService';

export type BlindPhase =
  | 'loading'
  | 'solving' // waiting for the learner's move
  | 'replying' // the opponent's answer is about to appear
  | 'solved'
  | 'failed'
  | 'error';

/** What an attempt did to the learner's level at its depth. */
export interface BlindResult {
  outcome: 'solved' | 'failed';
  before: number;
  after: number;
  peeked: boolean;
}

export interface UseBlindPuzzle {
  puzzle: Puzzle | null;
  setup: BlindSetup | null;
  phase: BlindPhase;
  error: string | null;
  /** The moves after the setup move so far: the learner's and the replies. */
  played: Uci[];
  /** The move just judged wrong, in SAN. */
  wrong: San | null;
  /** Why the last move was not taken (not legal in the current position). */
  notice: string | null;
  /** The last reply in words, for screen readers. */
  announcement: string;
  /** The current position is on the board instead of the starting one. */
  peeking: boolean;
  /** The learner looked at the current position during this puzzle. */
  peeked: boolean;
  /** After a miss: further moves are practice and change nothing. */
  practice: boolean;
  solutionShown: boolean;
  result: BlindResult | null;
  /** The square picked as the start of a move on the board. */
  selected: Square | null;
  needsPromotion: { from: Square; to: Square } | null;
  next: () => Promise<void>;
  clickSquare: (square: Square) => void;
  /** A typed move; returns whether it was legal (and so taken). */
  playNotation: (notation: string) => boolean;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  togglePeek: () => void;
  retry: () => void;
  showSolution: () => void;
}

const REPLY_DELAY = 500;
const ILLEGAL = 'That move is not legal in the current position.';

/**
 * One blind puzzle at a time, at the chosen depth: the puzzle is chosen around
 * the learner's level for that depth, the board keeps showing the starting
 * position, and the learner's moves and the replies exist only as notation.
 * Reports each puzzle once (a peek keeps the level from rising).
 */
export function useBlindPuzzle(depth: BlindDepth): UseBlindPuzzle {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [setup, setSetup] = useState<BlindSetup | null>(null);
  const [played, setPlayedState] = useState<Uci[]>([]);
  const [phase, setPhaseState] = useState<BlindPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState<San | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [peeking, setPeeking] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const [practice, setPractice] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);
  const [result, setResult] = useState<BlindResult | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [needsPromotion, setNeedsPromotion] = useState<{ from: Square; to: Square } | null>(null);

  // The handlers read these rather than state, so a reply timer never acts on a stale line.
  const setupRef = useRef<BlindSetup | null>(null);
  const puzzleRef = useRef<Puzzle | null>(null);
  const playedRef = useRef<Uci[]>([]);
  const phaseRef = useRef<BlindPhase>('loading');
  const depthRef = useRef(depth);
  const loadedDepthRef = useRef(depth);
  const reportedRef = useRef(false);
  const peekedRef = useRef(false);
  const practiceRef = useRef(false);
  const seqRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const selectedRef = useRef<Square | null>(null);
  const peekingRef = useRef(false);
  depthRef.current = depth;

  const setPlayed = (line: Uci[]) => {
    playedRef.current = line;
    setPlayedState(line);
  };
  const setPhase = (next: BlindPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const select = (square: Square | null) => {
    selectedRef.current = square;
    setSelected(square);
  };
  const peek = (on: boolean) => {
    peekingRef.current = on;
    setPeeking(on);
  };
  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clearTimer, []);

  const report = useCallback((outcome: 'solved' | 'failed') => {
    const current = puzzleRef.current;
    if (reportedRef.current || !current) return;
    reportedRef.current = true;
    const { before, after } = useProgress.getState().recordBlind({
      id: current.id,
      depth: loadedDepthRef.current,
      outcome,
      peeked: peekedRef.current,
    });
    setResult({ outcome, before, after, peeked: peekedRef.current });
  }, []);

  const next = useCallback(async () => {
    const seq = ++seqRef.current;
    clearTimer();
    const chosenDepth = depthRef.current;
    setPhase('loading');
    setError(null);
    setWrong(null);
    setNotice(null);
    setAnnouncement('');
    peek(false);
    select(null);
    setNeedsPromotion(null);
    try {
      const state = useProgress.getState();
      const found = await selectPuzzle({
        rating: blindLevel(state.blind.levels, chosenDepth, state.puzzleRating),
        seen: state.seen,
        themes: [chosenDepth],
        excludeId: puzzleRef.current?.id ?? null,
      });
      if (seq !== seqRef.current) return;
      const prepared = found ? prepareBlind(found) : null;
      if (!found || !prepared) {
        throw new Error('No puzzle of that length was found near your level. Try another length.');
      }
      puzzleRef.current = found;
      setupRef.current = prepared;
      loadedDepthRef.current = chosenDepth;
      reportedRef.current = false;
      peekedRef.current = false;
      practiceRef.current = false;
      setPuzzle(found);
      setSetup(prepared);
      setPlayed([]);
      setPeeked(false);
      setPractice(false);
      setSolutionShown(false);
      setResult(null);
      setPhase('solving');
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, []);

  const attempt = useCallback(
    (move: MoveInput): boolean => {
      const current = setupRef.current;
      if (!current || phaseRef.current !== 'solving') return false;
      const before = playedRef.current;
      const verdict = judgeBlindMove(current, before, move);
      select(null);
      if (verdict.kind === 'illegal') {
        setNotice(ILLEGAL);
        return false;
      }
      setNotice(null);
      peek(false);
      if (verdict.kind === 'wrong') {
        playSound('failed');
        setWrong(verdict.san);
        setPhase('failed');
        if (!practiceRef.current) report('failed');
        return true;
      }
      setWrong(null);
      const line = [...before, verdict.uci];
      setPlayed(line);
      const chess = new Chess(blindFen(current, before));
      const made = tryMove(chess, move);
      if (verdict.done) {
        playSound('solved');
        setPhase('solved');
        if (!practiceRef.current) report('solved');
        return true;
      }
      if (made) playMoveSound(made, chess);
      setPhase('replying');
      const seq = seqRef.current;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (seq !== seqRef.current) return;
        const reply = current.solution[line.length];
        if (!reply) {
          setPhase('solved');
          if (!practiceRef.current) report('solved');
          return;
        }
        const position = new Chess(blindFen(current, line));
        const fenBefore = position.fen();
        const answered = tryMove(position, parseUci(reply));
        setPlayed([...line, reply]);
        if (answered) {
          playMoveSound(answered, position);
          setAnnouncement(
            describeMove(fenBefore, position.fen(), [answered.from, answered.to]) ??
              `${answered.san}.`,
          );
        }
        setPhase('solving');
      }, REPLY_DELAY);
      return true;
    },
    [report],
  );

  const clickSquare = useCallback(
    (square: Square) => {
      const current = setupRef.current;
      if (!current || phaseRef.current !== 'solving') return;
      setNotice(null);
      const from = selectedRef.current;
      if (from === null || from === square) {
        select(from === null ? square : null);
        return;
      }
      const chess = new Chess(blindFen(current, playedRef.current));
      const moves = chess.moves({ square: from, verbose: true }).filter((m) => m.to === square);
      // A second click on another piece of one's own picks that piece instead, as on any board.
      if (moves.length === 0 && chess.get(square)?.color === chess.turn()) {
        select(square);
        return;
      }
      select(null);
      if (moves.some((m) => m.promotion)) setNeedsPromotion({ from, to: square });
      else attempt({ from, to: square });
    },
    [attempt],
  );

  const playNotation = useCallback(
    (notation: string): boolean => {
      const current = setupRef.current;
      if (!current || phaseRef.current !== 'solving') return false;
      const chess = new Chess(blindFen(current, playedRef.current));
      // Puzzles never promote without asking: some need a knight.
      const move = tryNotation(chess, notation);
      if (!move) return false;
      return attempt({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion as PromotionPiece } : {}),
      });
    },
    [attempt],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const pending = needsPromotion;
      setNeedsPromotion(null);
      if (pending && piece) attempt({ ...pending, promotion: piece });
    },
    [needsPromotion, attempt],
  );

  const togglePeek = useCallback(() => {
    const phaseNow = phaseRef.current;
    if (phaseNow === 'loading' || phaseNow === 'error' || phaseNow === 'solved') return;
    // Before the first move the board already shows the position: nothing to peek at.
    if (playedRef.current.length === 0) return;
    const on = !peekingRef.current;
    peek(on);
    if (on) {
      peekedRef.current = true;
      setPeeked(true);
    }
  }, []);

  const retry = useCallback(() => {
    if (phaseRef.current !== 'failed') return;
    practiceRef.current = true;
    setPractice(true);
    setWrong(null);
    setPhase('solving');
  }, []);

  const showSolution = useCallback(() => {
    const current = setupRef.current;
    const phaseNow = phaseRef.current;
    if (!current || !['solving', 'replying', 'failed'].includes(phaseNow)) return;
    clearTimer();
    if (!reportedRef.current) report('failed');
    practiceRef.current = true;
    setPractice(true);
    setWrong(null);
    setNotice(null);
    peek(false);
    select(null);
    setNeedsPromotion(null);
    setPlayed([...current.solution]);
    setSolutionShown(true);
    setPhase('solved');
  }, [report]);

  return {
    puzzle,
    setup,
    phase,
    error,
    played,
    wrong,
    notice,
    announcement,
    peeking,
    peeked,
    practice,
    solutionShown,
    result,
    selected,
    needsPromotion,
    next,
    clickSquare,
    playNotation,
    resolvePromotion,
    togglePeek,
    retry,
    showSolution,
  };
}
