import type { Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import {
  describeGhostKnight,
  HUNTS,
  type HuntMode,
  huntPoints,
  type HuntState,
  playHunterMove,
  startHunt,
} from './ghostKnight';

export type GhostPhase = 'idle' | 'hunting' | 'ended' | 'over';

/** Hunts that may fail before the run ends; a failed hunt is tried again. */
export const LIVES = 3;

export interface UseGhostKnight {
  phase: GhostPhase;
  mode: HuntMode;
  setMode: (mode: HuntMode) => void;
  /** Which of the five hunts is on (0-based). */
  huntIndex: number;
  lives: number;
  points: number;
  /** Hunts won this run. */
  caught: number;
  hunt: HuntState | null;
  /** Points the last hunt earned. */
  lastPoints: number;
  start: () => void;
  /** Your move; false when it cannot be made. */
  move: (from: Square, to: Square) => boolean;
  /** On from a finished hunt: the next one, the same one again, or the result. */
  next: () => void;
}

const WON = new Set(['caught', 'cornered']);

/** The Ghost Knight run: five hunts in order, three lives, points for every catch. */
export function useGhostKnight(random: () => number = Math.random): UseGhostKnight {
  const recordArcade = useProgress((s) => s.recordArcade);
  const [phase, setPhase] = useState<GhostPhase>('idle');
  const [mode, setMode] = useState<HuntMode>('shaded');
  const [huntIndex, setHuntIndex] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [points, setPoints] = useState(0);
  const [caught, setCaught] = useState(0);
  const [hunt, setHunt] = useState<HuntState | null>(null);
  const [lastPoints, setLastPoints] = useState(0);
  const recorded = useRef(false);
  const live = useRef({ phase, mode, huntIndex, lives, hunt });
  live.current = { phase, mode, huntIndex, lives, hunt };

  const begin = useCallback(
    (index: number) => {
      const squad = HUNTS[index] ?? HUNTS[0];
      if (!squad) return;
      setHuntIndex(index);
      setHunt(startHunt(squad, random));
      setLastPoints(0);
      setPhase('hunting');
    },
    [random],
  );

  const start = useCallback(() => {
    recorded.current = false;
    setLives(LIVES);
    setPoints(0);
    setCaught(0);
    begin(0);
  }, [begin]);

  const move = useCallback(
    (from: Square, to: Square) => {
      const { phase: ph, hunt: state, mode: m } = live.current;
      if (ph !== 'hunting' || !state) return false;
      const next = playHunterMove(state, from, to, random);
      if (!next) return false;
      live.current.hunt = next;
      setHunt(next);
      const last = next.events[next.events.length - 1];
      if (!next.outcome) {
        if (last?.type === 'took' && last.turn === next.turn) playSound('capture');
        else if (last?.type === 'seen' && last.turn === next.turn) playSound('notify');
        else playSound('move');
        return true;
      }
      if (WON.has(next.outcome)) {
        const earned = huntPoints(next, m);
        setPoints((p) => p + earned);
        setCaught((c) => c + 1);
        setLastPoints(earned);
        playSound('solved');
      } else {
        setLives((l) => l - 1);
        playSound('failed');
      }
      live.current.phase = 'ended';
      setPhase('ended');
      return true;
    },
    [random],
  );

  const next = useCallback(() => {
    const { phase: ph, hunt: state, huntIndex: index, lives: left } = live.current;
    if (ph !== 'ended' || !state) return;
    const won = state.outcome !== null && WON.has(state.outcome);
    if (won) {
      if (index + 1 >= HUNTS.length) setPhase('over');
      else begin(index + 1);
      return;
    }
    if (left <= 0) setPhase('over');
    else begin(index);
  }, [begin]);

  useEffect(() => {
    if (phase !== 'over' || recorded.current) return;
    recorded.current = true;
    recordArcade('ghost-knight', points, describeGhostKnight(caught, points, mode));
  }, [phase, points, caught, mode, recordArcade]);

  return {
    phase,
    mode,
    setMode,
    huntIndex,
    lives,
    points,
    caught,
    hunt,
    lastPoints,
    start,
    move,
    next,
  };
}
