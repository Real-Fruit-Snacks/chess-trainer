import type { Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { moveLabel, START_FEN } from '@/chess/helpers';
import type { Fen, San } from '@/chess/types';
import { playSound, type SoundName } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import {
  type ArbiterPace,
  type ArbiterRound,
  buildRound,
  callWindowMs,
  describeArbiter,
  leadInMs,
  type ReplayGame,
  stepMs,
  STRIKES,
} from './arbiter';
import type { IllegalKind } from './arbiterMoves';

export type ArbiterPhase = 'idle' | 'watching' | 'verdict' | 'over';

/** How a round ended. */
export interface ArbiterVerdict {
  outcome: 'caught' | 'missed' | 'false-alarm';
  /** How long the call took after the illegal move appeared (a catch). */
  reactionMs?: number;
  /** The legal move that was called (a false alarm that cost the last strike). */
  called?: ShownMove;
}

/** The move on the board, for the status line: "12." and "Nf3". */
export interface ShownMove {
  label: string;
  san: San;
}

/** After a false alarm the replay holds still this long, with the call's answer showing. */
export const FALSE_ALARM_PAUSE_MS = 1500;

/** How many recent kinds a new round avoids, so the same rule does not come twice running. */
const RECENT_KINDS = 4;

export interface UseArbiter {
  phase: ArbiterPhase;
  round: number;
  strikes: number;
  caught: number;
  fastestMs: number | null;
  current: ArbiterRound | null;
  /** Moves of the round on the board: 0 is the start position, `lead.length + 1` the illegal move. */
  shown: number;
  verdict: ArbiterVerdict | null;
  falseAlarm: ShownMove | null;
  paused: boolean;
  fen: Fen;
  lastMove: [Square, Square] | null;
  /** The move last played on the board, if any. */
  move: ShownMove | null;
  start: () => void;
  call: () => void;
  next: () => void;
  pause: () => void;
  resume: () => void;
}

function soundFor(san: San): SoundName {
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}

/**
 * The Arbiter run: rounds built from the classic games, the replay clock,
 * calls, strikes and the record. The replay pauses itself when the page is
 * hidden, so switching tabs never costs a strike.
 */
export function useArbiter(
  games: readonly ReplayGame[] | null,
  pace: ArbiterPace,
  random: () => number = Math.random,
): UseArbiter {
  const recordArcade = useProgress((s) => s.recordArcade);
  const [phase, setPhase] = useState<ArbiterPhase>('idle');
  const [round, setRound] = useState(1);
  const [strikes, setStrikes] = useState(0);
  const [caught, setCaught] = useState(0);
  const [fastestMs, setFastestMs] = useState<number | null>(null);
  const [current, setCurrent] = useState<ArbiterRound | null>(null);
  const [shown, setShown] = useState(0);
  const [verdict, setVerdict] = useState<ArbiterVerdict | null>(null);
  const [falseAlarm, setFalseAlarm] = useState<ShownMove | null>(null);
  const [paused, setPaused] = useState(false);

  const timer = useRef<number | null>(null);
  const illegalAt = useRef(0);
  const recent = useRef<IllegalKind[]>([]);
  const called = useRef(new Set<number>());
  // The latest values for the timer callbacks.
  const live = useRef({ phase, round, strikes, shown, current, paused, pace });
  live.current = { phase, round, strikes, shown, current, paused, pace };
  const recorded = useRef(false);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);

  /** The miss: the illegal move stood unchallenged until the next move would have come. */
  const miss = useCallback(() => {
    clear();
    live.current.phase = 'verdict';
    live.current.strikes += 1;
    setStrikes((s) => s + 1);
    setVerdict({ outcome: 'missed' });
    setPhase('verdict');
    playSound('failed');
  }, []);

  /** Shows the next move of the round, and arms whatever comes after it. */
  const stepRef = useRef<() => void>(() => undefined);
  const step = useCallback(() => {
    const { current: r, round: n, pace: p } = live.current;
    if (!r) return;
    const nextShown = live.current.shown + 1;
    live.current.shown = nextShown;
    setShown(nextShown);
    setFalseAlarm(null);
    if (nextShown <= r.lead.length) {
      playSound(soundFor(r.lead[nextShown - 1]?.san ?? ''));
      timer.current = window.setTimeout(() => stepRef.current(), stepMs(n, p));
      return;
    }
    playSound(soundFor(r.illegal.san));
    illegalAt.current = Date.now();
    timer.current = window.setTimeout(miss, callWindowMs(n, p));
  }, [miss]);
  stepRef.current = step;

  /** Arms the clock from where the round stands: a pause or a false alarm picks up here. */
  const arm = useCallback(
    (delay?: number) => {
      clear();
      const { current: r, round: n, pace: p, shown: s } = live.current;
      if (!r) return;
      if (s > r.lead.length) {
        // The illegal move is on the board: a fresh window for the call.
        illegalAt.current = Date.now();
        timer.current = window.setTimeout(miss, delay ?? callWindowMs(n, p));
        return;
      }
      timer.current = window.setTimeout(step, delay ?? (s === 0 ? leadInMs(n, p) : stepMs(n, p)));
    },
    [miss, step],
  );

  const beginRound = useCallback(
    (n: number) => {
      clear();
      const next = games ? buildRound(games, n, random, recent.current) : null;
      if (!next) return;
      recent.current = [next.illegal.kind, ...recent.current].slice(0, RECENT_KINDS);
      called.current = new Set();
      live.current = { ...live.current, current: next, round: n, shown: 0, phase: 'watching' };
      setCurrent(next);
      setRound(n);
      setShown(0);
      setVerdict(null);
      setFalseAlarm(null);
      setPaused(false);
      setPhase('watching');
      timer.current = window.setTimeout(step, leadInMs(n, live.current.pace));
    },
    [games, random, step],
  );

  const start = useCallback(() => {
    recorded.current = false;
    recent.current = [];
    setStrikes(0);
    setCaught(0);
    setFastestMs(null);
    live.current.strikes = 0;
    beginRound(1);
  }, [beginRound]);

  const call = useCallback(() => {
    const { phase: ph, paused: pa, current: r, shown: s, strikes: st } = live.current;
    if (ph !== 'watching' || pa || !r || s === 0) return;
    if (s > r.lead.length) {
      clear();
      live.current.phase = 'verdict';
      const reactionMs = Math.max(0, Date.now() - illegalAt.current);
      setCaught((c) => c + 1);
      setFastestMs((f) => (f === null ? reactionMs : Math.min(f, reactionMs)));
      setVerdict({ outcome: 'caught', reactionMs });
      setPhase('verdict');
      playSound('solved');
      return;
    }
    // A legal move: one strike per move, however often it is called.
    if (called.current.has(s)) return;
    called.current.add(s);
    const move = r.lead[s - 1];
    const label = moveLabel(r.startPly + s - 1);
    const san = move?.san ?? '';
    const strikesNow = st + 1;
    live.current.strikes = strikesNow;
    setStrikes(strikesNow);
    playSound('failed');
    if (strikesNow >= STRIKES) {
      clear();
      live.current.phase = 'verdict';
      setVerdict({ outcome: 'false-alarm', called: { label, san } });
      setPhase('verdict');
      return;
    }
    setFalseAlarm({ label, san });
    arm(FALSE_ALARM_PAUSE_MS);
  }, [arm]);

  const next = useCallback(() => {
    if (live.current.phase !== 'verdict') return;
    if (live.current.strikes >= STRIKES) {
      live.current.phase = 'over';
      setPhase('over');
      return;
    }
    beginRound(live.current.round + 1);
  }, [beginRound]);

  const pause = useCallback(() => {
    if (live.current.phase !== 'watching' || live.current.paused) return;
    clear();
    live.current.paused = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (live.current.phase !== 'watching' || !live.current.paused) return;
    live.current.paused = false;
    setPaused(false);
    arm();
  }, [arm]);

  // A hidden page pauses the replay; coming back waits for Resume.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pause]);

  useEffect(() => {
    if (phase !== 'over' || recorded.current) return;
    recorded.current = true;
    recordArcade('arbiter', caught, describeArbiter(caught, live.current.pace));
  }, [phase, caught, recordArcade]);

  const lead = current?.lead ?? [];
  const onIllegal = current !== null && shown > lead.length;
  const shownMove = shown > 0 ? lead[shown - 1] : undefined;
  let fen: Fen = current?.startFen ?? START_FEN;
  let lastMove: [Square, Square] | null = null;
  let move: ShownMove | null = null;
  if (current && onIllegal) {
    fen = current.illegal.fen;
    lastMove = [current.illegal.from, current.illegal.to];
    move = { label: moveLabel(current.startPly + lead.length), san: current.illegal.san };
  } else if (current && shownMove) {
    fen = shownMove.fen;
    lastMove = [shownMove.from, shownMove.to];
    move = { label: moveLabel(current.startPly + shown - 1), san: shownMove.san };
  }

  return {
    phase,
    round,
    strikes,
    caught,
    fastestMs,
    current,
    shown,
    verdict,
    falseAlarm,
    paused,
    fen,
    lastMove,
    move,
    start,
    call,
    next,
    pause,
    resume,
  };
}
