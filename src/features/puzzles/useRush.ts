import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { type Puzzle, selectRushPuzzle } from './puzzleService';
import { type PuzzleOutcomeEvent, usePuzzleTrainer } from './usePuzzleTrainer';

export type RushMode = 'timed' | 'survival';
export type RushPhase = 'idle' | 'loading' | 'running' | 'finished';

export const RUSH_DURATION_MS = 3 * 60_000;
export const RUSH_STRIKES = 3;

/** How quickly difficulty climbs: puzzle rating rises by this much per solve. */
const STEP_PER_SOLVE = 40;
const NEXT_DELAY_SOLVED = 350;
const NEXT_DELAY_FAILED = 900;

export interface RushSummary {
  mode: RushMode;
  score: number;
  strikes: number;
  peakRating: number;
  durationMs: number;
  /** Ratings of solved and failed puzzles, in order. */
  results: { rating: number; solved: boolean }[];
}

export interface UseRush {
  trainer: ReturnType<typeof usePuzzleTrainer>;
  phase: RushPhase;
  mode: RushMode;
  score: number;
  strikes: number;
  /** Milliseconds left (timed mode) or elapsed (survival). */
  clockMs: number;
  summary: RushSummary | null;
  error: string | null;
  start: (mode: RushMode) => void;
  stop: () => void;
}

/**
 * Puzzle Rush: solve as many puzzles as you can, each a little harder than the
 * last. Three mistakes end the run; the timed variant also stops at three
 * minutes. Hints are not available and nothing is rated.
 */
export function useRush(startRating: number): UseRush {
  const recordRush = useProgress((s) => s.recordRush);
  const recordUnrated = useProgress((s) => s.recordUnratedOutcome);
  const [phase, setPhase] = useState<RushPhase>('idle');
  const [mode, setMode] = useState<RushMode>('timed');
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [clockMs, setClockMs] = useState(RUSH_DURATION_MS);
  const [summary, setSummary] = useState<RushSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usedRef = useRef<Set<string>>(new Set());
  const resultsRef = useRef<{ rating: number; solved: boolean }[]>([]);
  const startedAtRef = useRef(0);
  const runRef = useRef(0);
  const scoreRef = useRef(0);
  const strikesRef = useRef(0);
  const modeRef = useRef<RushMode>('timed');
  const finishedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const baseRating = Math.max(400, Math.min(startRating - 500, 1500));

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const durationMs = Date.now() - startedAtRef.current;
    const solvedRatings = resultsRef.current.filter((r) => r.solved).map((r) => r.rating);
    const run: RushSummary = {
      mode: modeRef.current,
      score: scoreRef.current,
      strikes: strikesRef.current,
      peakRating: solvedRatings.length ? Math.max(...solvedRatings) : 0,
      durationMs,
      results: [...resultsRef.current],
    };
    setSummary(run);
    setPhase('finished');
    playSound('gameEnd');
    recordRush({
      mode: run.mode,
      score: run.score,
      peakRating: run.peakRating,
      durationMs: run.durationMs,
    });
  }, [recordRush]);

  const onOutcome = useCallback(
    (event: PuzzleOutcomeEvent, puzzle: Puzzle) => {
      if (finishedRef.current) return;
      recordUnrated(puzzle.id, puzzle.themes, event.outcome, puzzle.rating);
      resultsRef.current.push({ rating: puzzle.rating, solved: event.outcome === 'solved' });
      if (event.outcome === 'solved') {
        scoreRef.current += 1;
        setScore(scoreRef.current);
      } else {
        strikesRef.current += 1;
        setStrikes(strikesRef.current);
      }
    },
    [recordUnrated],
  );

  const trainer = usePuzzleTrainer(onOutcome);
  const { load } = trainer;

  const loadNext = useCallback(
    async (run: number) => {
      const target = baseRating + scoreRef.current * STEP_PER_SOLVE;
      try {
        const puzzle = await selectRushPuzzle(target, usedRef.current);
        if (run !== runRef.current || finishedRef.current) return;
        if (!puzzle) {
          setError('Ran out of puzzles — impressive!');
          finish();
          return;
        }
        usedRef.current.add(puzzle.id);
        load(puzzle);
      } catch (err) {
        if (run !== runRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        finish();
      }
    },
    [baseRating, finish, load],
  );

  const start = useCallback(
    (nextMode: RushMode) => {
      runRef.current += 1;
      const run = runRef.current;
      usedRef.current = new Set();
      resultsRef.current = [];
      scoreRef.current = 0;
      strikesRef.current = 0;
      modeRef.current = nextMode;
      finishedRef.current = false;
      startedAtRef.current = Date.now();
      setMode(nextMode);
      setScore(0);
      setStrikes(0);
      setSummary(null);
      setError(null);
      setClockMs(nextMode === 'timed' ? RUSH_DURATION_MS : 0);
      setPhase('running');
      void loadNext(run);
    },
    [loadNext],
  );

  const stop = useCallback(() => {
    if (phase === 'running') finish();
  }, [phase, finish]);

  // Advance after each puzzle; end the run on the third strike.
  useEffect(() => {
    if (phase !== 'running') return;
    if (trainer.phase !== 'solved' && trainer.phase !== 'failed') return;
    if (strikesRef.current >= RUSH_STRIKES) {
      timerRef.current = window.setTimeout(finish, NEXT_DELAY_FAILED);
      return () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }
    const delay = trainer.phase === 'solved' ? NEXT_DELAY_SOLVED : NEXT_DELAY_FAILED;
    const run = runRef.current;
    timerRef.current = window.setTimeout(() => void loadNext(run), delay);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [phase, trainer.phase, finish, loadNext]);

  // Clock.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      if (modeRef.current === 'timed') {
        const left = Math.max(0, RUSH_DURATION_MS - elapsed);
        setClockMs(left);
        if (left === 0) finish();
      } else {
        setClockMs(elapsed);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { trainer, phase, mode, score, strikes, clockMs, summary, error, start, stop };
}
