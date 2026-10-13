import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isPromotionMove,
  parseUci,
  passMove,
  toUci,
  tryMove,
  tryNotation,
  uciToSan,
} from '@/chess/helpers';
import type { Fen, LongColor, MoveInput, PromotionPiece, San, Uci } from '@/chess/types';
import { useEngine } from '@/engine/useEngine';
import { playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { loadThreatPositions } from './threatData';
import {
  describeThreat,
  dueOwnThreats,
  isOwnThreatId,
  isStoredDefence,
  isStoredThreat,
  learnerSide,
  type OwnThreat,
  pickBundledThreat,
  type ThreatDescription,
  type ThreatPosition,
  verifyDefence,
  verifyThreatGuess,
} from './threats';

export type ThreatPhase =
  | 'loading'
  | 'threat' // the learner plays the opponent's threat on the board
  | 'checking' // the engine is asked about a guess or a defence the lists do not name
  | 'defend' // the learner meets the threat
  | 'done'
  | 'error';

/** Wrong guesses allowed before the threat is shown. */
export const THREAT_TRIES = 2;
/** Every this many positions, one of the learner's own threats comes up when one is due. */
const OWN_EVERY = 3;

export interface ThreatAttempt {
  misses: number;
  /** The last wrong guess, in SAN from the opponent's side. */
  lastWrong: San | null;
  /** Named by the learner (true) or shown (false); null while guessing. */
  found: boolean | null;
  /** The move the learner met the threat with, and whether it holds. */
  defence: { uci: Uci; san: San; held: boolean } | null;
}

const FRESH: ThreatAttempt = { misses: 0, lastWrong: null, found: null, defence: null };

export interface UseThreatDrill {
  phase: ThreatPhase;
  position: ThreatPosition | null;
  /** The position comes from one of the learner's own games. */
  own: OwnThreat | null;
  learner: LongColor;
  opponent: LongColor;
  /** The position after a pass: the opponent to move (the board of the threat stage). */
  passed: Fen | null;
  description: ThreatDescription | null;
  attempt: ThreatAttempt;
  error: string | null;
  needsPromotion: { from: Square; to: Square; color: LongColor } | null;
  engineReady: boolean;
  next: () => Promise<void>;
  /** A move on the board: the threat in the first stage, the defence in the second. */
  playMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  /** A typed move for the current stage; false when it is not legal there. */
  playNotation: (notation: string) => boolean;
  resolvePromotion: (piece: PromotionPiece | null) => void;
  /** Shows the threat (counts as not found). */
  reveal: () => void;
  /** Moves on without a defence (nothing recorded for it). */
  skipDefence: () => void;
}

/**
 * The "What's the threat?" drill: a position comes up (one of the learner's
 * own when due, a bundled one otherwise), the learner plays the opponent's
 * threat, then a move that meets it. Each position is recorded once.
 */
export function useThreatDrill(): UseThreatDrill {
  const { engine, status: engineStatus, start: startEngine } = useEngine({ autoStart: false });
  const [phase, setPhaseState] = useState<ThreatPhase>('loading');
  const [position, setPosition] = useState<ThreatPosition | null>(null);
  const [attempt, setAttempt] = useState<ThreatAttempt>(FRESH);
  const [error, setError] = useState<string | null>(null);
  const [needsPromotion, setNeedsPromotion] = useState<UseThreatDrill['needsPromotion']>(null);
  const phaseRef = useRef<ThreatPhase>('loading');
  const positionRef = useRef<ThreatPosition | null>(null);
  const attemptRef = useRef<ThreatAttempt>(FRESH);
  /** Positions shown so far: every `OWN_EVERY`th one (the first included) is the learner's own when due. */
  const shownRef = useRef(0);
  const seqRef = useRef(0);
  const recordedRef = useRef(false);

  useEffect(() => {
    void startEngine();
  }, [startEngine]);

  const setPhase = (next: ThreatPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const updateAttempt = (patch: Partial<ThreatAttempt>) => {
    attemptRef.current = { ...attemptRef.current, ...patch };
    setAttempt(attemptRef.current);
  };

  const record = useCallback((defence: 'held' | 'failed' | null) => {
    const current = positionRef.current;
    if (!current || recordedRef.current) return;
    recordedRef.current = true;
    useProgress.getState().recordThreat({
      id: current.id,
      found: attemptRef.current.found === true,
      defence,
    });
  }, []);

  const next = useCallback(async () => {
    const seq = ++seqRef.current;
    setPhase('loading');
    setError(null);
    setNeedsPromotion(null);
    try {
      const state = useProgress.getState();
      const currentId = positionRef.current?.id ?? null;
      const due = dueOwnThreats(state.ownThreats).filter((t) => t.id !== currentId);
      let chosen: ThreatPosition | null = null;
      if (due.length > 0 && shownRef.current % OWN_EVERY === 0) chosen = due[0] ?? null;
      if (!chosen) {
        const bundled = await loadThreatPositions();
        if (seq !== seqRef.current) return;
        chosen = pickBundledThreat(bundled, {
          rating: state.puzzleRating,
          recent: state.threatStats.recent,
          excludeId: currentId,
        });
      }
      // Nothing bundled near the rating at all: an own threat is better than nothing.
      chosen ??= due[0] ?? null;
      if (!chosen) throw new Error('No positions for the drill were found.');
      shownRef.current += 1;
      positionRef.current = chosen;
      recordedRef.current = false;
      attemptRef.current = FRESH;
      setAttempt(FRESH);
      setPosition(chosen);
      setPhase('threat');
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(
        err instanceof Error && err.message.startsWith('No positions')
          ? err.message
          : 'The drill’s positions could not be loaded. Check your connection and try again.',
      );
      setPhase('error');
    }
  }, []);

  // The first position comes a tick later, so a mount that is undone at once (React's strict
  // mode) never shows one and spends the learner's own threat on it.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void next();
    });
    return () => {
      cancelled = true;
    };
  }, [next]);

  const engineReady = engineStatus === 'ready';

  /** The threat is known (named or shown): on to the defence. */
  const toDefence = useCallback((found: boolean) => {
    updateAttempt({ found });
    playSound(found ? 'solved' : 'failed');
    setPhase('defend');
  }, []);

  const wrongGuess = useCallback(
    (san: San) => {
      const misses = attemptRef.current.misses + 1;
      updateAttempt({ misses, lastWrong: san });
      if (misses >= THREAT_TRIES) toDefence(false);
      else {
        playSound('failed');
        setPhase('threat');
      }
    },
    [toDefence],
  );

  const guess = useCallback(
    (move: MoveInput) => {
      const current = positionRef.current;
      const passed = current ? passMove(current.fen) : null;
      if (!current || !passed || phaseRef.current !== 'threat') return;
      const made = tryMove(new Chess(passed), move);
      if (!made) return;
      const uci = toUci(made);
      if (isStoredThreat(current, uci)) {
        toDefence(true);
        return;
      }
      if (!engineReady) {
        wrongGuess(made.san);
        return;
      }
      const seq = seqRef.current;
      setPhase('checking');
      void verifyThreatGuess(engine(), current, uci)
        .catch(() => false)
        .then((same) => {
          if (seq !== seqRef.current) return;
          if (same) toDefence(true);
          else wrongGuess(made.san);
        });
    },
    [engine, engineReady, toDefence, wrongGuess],
  );

  const finishDefence = useCallback(
    (defence: { uci: Uci; san: San }, held: boolean) => {
      updateAttempt({ defence: { ...defence, held } });
      playSound(held ? 'solved' : 'failed');
      record(held ? 'held' : 'failed');
      setPhase('done');
    },
    [record],
  );

  const defend = useCallback(
    (move: MoveInput) => {
      const current = positionRef.current;
      if (!current || phaseRef.current !== 'defend') return;
      const made = tryMove(new Chess(current.fen), move);
      if (!made) return;
      const played = { uci: toUci(made), san: made.san };
      if (isStoredDefence(current, played.uci)) {
        finishDefence(played, true);
        return;
      }
      if (!engineReady) {
        finishDefence(played, false);
        return;
      }
      const seq = seqRef.current;
      setPhase('checking');
      void verifyDefence(engine(), current, played.uci)
        .catch(() => false)
        .then((held) => {
          if (seq !== seqRef.current) return;
          finishDefence(played, held);
        });
    },
    [engine, engineReady, finishDefence],
  );

  /** The board of the current stage, and the side that moves on it. */
  const stageBoard = (): { fen: Fen; color: LongColor } | null => {
    const current = positionRef.current;
    if (!current) return null;
    if (phaseRef.current === 'threat') {
      const passed = passMove(current.fen);
      return passed
        ? { fen: passed, color: learnerSide(current) === 'white' ? 'black' : 'white' }
        : null;
    }
    if (phaseRef.current === 'defend') return { fen: current.fen, color: learnerSide(current) };
    return null;
  };

  const play = (move: MoveInput) => {
    if (phaseRef.current === 'threat') guess(move);
    else if (phaseRef.current === 'defend') defend(move);
  };

  const playMove = (from: Square, to: Square, promotion?: PromotionPiece) => {
    const board = stageBoard();
    if (!board) return;
    if (!promotion && isPromotionMove(new Chess(board.fen), from, to)) {
      setNeedsPromotion({ from, to, color: board.color });
      return;
    }
    play(promotion ? { from, to, promotion } : { from, to });
  };

  const playNotation = (notation: string): boolean => {
    const board = stageBoard();
    if (!board) return false;
    const made = tryNotation(new Chess(board.fen), notation);
    if (!made) return false;
    play({
      from: made.from,
      to: made.to,
      ...(made.promotion ? { promotion: made.promotion as PromotionPiece } : {}),
    });
    return true;
  };

  const resolvePromotion = (piece: PromotionPiece | null) => {
    const pending = needsPromotion;
    setNeedsPromotion(null);
    if (pending && piece) play({ from: pending.from, to: pending.to, promotion: piece });
  };

  const reveal = useCallback(() => {
    if (phaseRef.current !== 'threat') return;
    toDefence(false);
  }, [toDefence]);

  const skipDefence = useCallback(() => {
    if (phaseRef.current !== 'defend') return;
    record(null);
    setPhase('done');
  }, [record]);

  const learner = position ? learnerSide(position) : 'white';
  const passed = position ? passMove(position.fen) : null;
  return {
    phase,
    position,
    own: position && isOwnThreatId(position.id) ? (position as OwnThreat) : null,
    learner,
    opponent: learner === 'white' ? 'black' : 'white',
    passed,
    description: position ? describeThreat(position) : null,
    attempt,
    error,
    needsPromotion,
    engineReady,
    next,
    playMove,
    playNotation,
    resolvePromotion,
    reveal,
    skipDefence,
  };
}

/** The stored defences in SAN, for the summary. */
export function defencesInSan(position: Pick<ThreatPosition, 'fen' | 'defences'>): San[] {
  return position.defences
    .map((uci) => uciToSan(position.fen, uci))
    .filter((san): san is San => san !== null);
}

/** The game move of a bundled position (or the learner's own), in SAN. */
export function gameMoveSan(position: ThreatPosition): San | null {
  if (isOwnThreatId(position.id)) return (position as OwnThreat).source.played;
  return position.game ? uciToSan(position.fen, position.game) : null;
}

/** Arrow squares of a UCI move. */
export function arrowOf(uci: Uci, brush: string) {
  const { from, to } = parseUci(uci);
  return { orig: from, dest: to, brush };
}
