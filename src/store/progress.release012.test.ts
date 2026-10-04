import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDateKey } from '@/lib/dates';
import type * as IsolationModule from '@/sw/isolation';
import { useGames } from './games';
import {
  bestTrainingStreak,
  type PersistedProgress,
  capReviews,
  MAX_PUZZLE_REVIEWS,
  MAX_SEEN,
  PROGRESS_STORAGE_KEY,
  pruneSeen,
  puzzleStreak,
  summarizeProgress,
  useProgress,
  withRatingDefaults,
} from './progress';

const writeFlag = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock('@/sw/isolation', async (importOriginal) => {
  const actual = await importOriginal<typeof IsolationModule>();
  return { ...actual, writeIsolationFlag: writeFlag };
});

const attempt = (
  id: string,
  outcome: 'solved' | 'failed',
  extra: Partial<Parameters<ReturnType<typeof useProgress.getState>['recordPuzzle']>[0]> = {},
) =>
  useProgress.getState().recordPuzzle({
    id,
    puzzleRating: 1200,
    outcome,
    hintUsed: false,
    themes: 'fork short',
    durationMs: 5000,
    rated: true,
    ...extra,
  });

describe('progress store (0.12)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
    writeFlag.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps lifetime counters past the attempt cap, and the summaries read them', () => {
    useProgress.getState().completeOnboarding(1200);
    for (let i = 0; i < 310; i++) attempt(`p${i}`, i % 3 === 0 ? 'failed' : 'solved');
    const s = useProgress.getState();
    expect(s.attempts).toHaveLength(300);
    expect(s.lifetime.attempts).toBe(310);
    expect(s.lifetime.solved).toBe(206);
    expect(s.lifetime.failed).toBe(104);
    expect(s.lifetime.solvedByTheme.fork).toBe(206);
    expect(s.lifetime.solveTimeMs).toBe(206 * 5000);
    const summary = summarizeProgress(s);
    expect(summary.solved).toBe(206);
    expect(summary.failed).toBe(104);
    expect(summary.avgSolveMs).toBe(5000);
  });

  it('back-fills lifetime counters for a save without them, never below the attempt list', () => {
    const migrated = withRatingDefaults({
      onboarded: true,
      puzzleRating: 1300,
      attempts: [
        {
          id: 'a',
          puzzleRating: 1200,
          outcome: 'solved',
          hintUsed: false,
          ratingBefore: 1,
          ratingAfter: 2,
          themes: 'fork',
          at: 1,
          durationMs: 4000,
        },
        {
          id: 'b',
          puzzleRating: 1200,
          outcome: 'failed',
          hintUsed: false,
          ratingBefore: 1,
          ratingAfter: 2,
          themes: 'pin',
          at: 2,
          durationMs: 9000,
        },
      ],
      // The theme statistics remember solves the capped list has forgotten.
      themeStats: { fork: { solved: 12, failed: 1 }, pin: { solved: 0, failed: 1 } },
    });
    expect(migrated.lifetime).toEqual({
      attempts: 2,
      solved: 1,
      failed: 1,
      solvedByTheme: { fork: 12 },
      solveTimeMs: 4000,
    });
  });

  it('a Woodpecker miss does not join the review queue; other misses do', () => {
    attempt('wp1', 'failed', { rated: false, mode: 'woodpecker' });
    expect(useProgress.getState().puzzleReviews.wp1).toBeUndefined();
    attempt('r1', 'failed', { rated: false, mode: 'rated' });
    expect(useProgress.getState().puzzleReviews.r1).toBeDefined();
    // The miss still counts everywhere else.
    expect(useProgress.getState().seen.wp1).toBe('failed');
    expect(useProgress.getState().lifetime.failed).toBe(2);
  });

  it('restarting a lesson clears the steps but keeps the completion', () => {
    useProgress.getState().markLessonStep('forks', 0, 2);
    useProgress.getState().markLessonStep('forks', 1, 2);
    const completedAt = useProgress.getState().lessons.forks?.completedAt;
    expect(completedAt).not.toBeNull();
    useProgress.getState().resetLesson('forks');
    expect(useProgress.getState().lessons.forks).toMatchObject({ stepsDone: [], completedAt });
    // Resetting a lesson never visited does nothing.
    useProgress.getState().resetLesson('unknown');
    expect(useProgress.getState().lessons.unknown).toBeUndefined();
  });

  it('gives every game record a unique id and a source', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T10:00:00'));
    const game = {
      level: 3,
      color: 'white' as const,
      result: '1-0' as const,
      reason: 'checkmate',
      plies: 40,
      pgn: '1. e4 *',
    };
    // Several simul boards end in the same millisecond.
    useProgress.getState().recordGame({ ...game, source: 'simul', event: 'Simul board 1' });
    useProgress.getState().recordGame({ ...game, source: 'simul', event: 'Simul board 2' });
    useProgress.getState().recordGame(game);
    const games = useProgress.getState().games;
    expect(games).toHaveLength(3);
    expect(new Set(games.map((g) => g.id)).size).toBe(3);
    expect(games.map((g) => g.source)).toEqual(['play', 'simul', 'simul']);
    expect(games[1]?.event).toBe('Simul board 2');
    // Records from before the field existed read as ordinary engine games.
    const old = withRatingDefaults({
      games: [{ ...game, at: 5 } as never, { ...game, at: 5 } as never],
    });
    expect(old.games.map((g) => g.source)).toEqual(['play', 'play']);
    expect(old.games[0]?.id).not.toBe(old.games[1]?.id);
  });

  it('a live puzzle streak goes stale after a missed day while the stored one does not', () => {
    const streak = { current: 7, best: 9, lastDate: '2026-09-20' };
    expect(puzzleStreak({ streak }, '2026-09-20').current).toBe(7);
    expect(puzzleStreak({ streak }, '2026-09-21').current).toBe(7);
    expect(puzzleStreak({ streak }, '2026-09-30')).toEqual({ ...streak, current: 0 });
    expect(puzzleStreak({ streak: { current: 0, best: 0, lastDate: null } }).current).toBe(0);
  });

  it('remembers the best training streak as a number beyond the capped day list', () => {
    const days = Array.from({ length: 450 }, (_, i) => {
      const d = new Date(2025, 0, 1 + i);
      return localDateKey(d);
    });
    const state = withRatingDefaults({ trainingDays: days.slice(-400), bestStreak: 450 });
    expect(bestTrainingStreak(state)).toBe(450);
    // A longer run than any stored number wins too.
    expect(bestTrainingStreak({ trainingDays: days.slice(-10), bestStreak: 3 })).toBe(10);
    useProgress.getState().touchTraining();
    expect(useProgress.getState().bestStreak).toBeGreaterThanOrEqual(1);
  });

  it('caps seen ids and the review queue', () => {
    const seen: Record<string, 'solved' | 'failed'> = {};
    for (let i = 0; i < MAX_SEEN + 50; i++) seen[`id${i}`] = 'solved';
    const pruned = pruneSeen(seen);
    expect(Object.keys(pruned)).toHaveLength(MAX_SEEN);
    expect(pruned.id0).toBeUndefined();
    expect(pruned[`id${MAX_SEEN + 49}`]).toBe('solved');

    const cards = Object.fromEntries(
      Array.from({ length: MAX_PUZZLE_REVIEWS + 20 }, (_, i) => [
        `c${i}`,
        {
          id: `c${i}`,
          rating: 1200,
          themes: '',
          step: i < 10 ? 3 : 0,
          due: i,
          lapses: 0,
          addedAt: i,
        },
      ]),
    );
    const capped = capReviews(cards);
    expect(Object.keys(capped)).toHaveLength(MAX_PUZZLE_REVIEWS);
    // Cards further along the schedule survive; the newest fresh misses go first.
    expect(capped.c0?.step).toBe(3);
    expect(capped[`c${MAX_PUZZLE_REVIEWS + 19}`]).toBeUndefined();
    expect(capped.c10).toBeDefined();
  });

  it('never stores NaN from the rating pipeline, and repairs one on load', () => {
    useProgress.getState().completeOnboarding(1200);
    const before = useProgress.getState().puzzleRating;
    const result = attempt('nan', 'solved', { puzzleRating: Number.NaN });
    expect(Number.isFinite(result.after)).toBe(true);
    expect(useProgress.getState().puzzleRating).toBe(before);
    expect(Number.isFinite(useProgress.getState().puzzleRd)).toBe(true);
    const repaired = withRatingDefaults({
      onboarded: true,
      puzzleRating: Number.NaN,
      puzzleRd: Number.NaN,
    });
    expect(Number.isFinite(repaired.puzzleRating)).toBe(true);
    expect(Number.isFinite(repaired.puzzleRd)).toBe(true);
    // JSON turns NaN into null; the repair path treats it as missing.
    const fromBlob = withRatingDefaults(
      JSON.parse('{"onboarded":true,"puzzleRating":null}') as Partial<PersistedProgress>,
    );
    expect(fromBlob.puzzleRating).toBe(1000);
  });

  it('appends to the rating history on a rating reset instead of replacing it', () => {
    useProgress.getState().completeOnboarding(800);
    attempt('h', 'solved');
    useProgress.getState().completeOnboarding(1600);
    const history = useProgress.getState().ratingHistory;
    expect(history).toHaveLength(3);
    expect(history[0]?.rating).toBe(800);
    expect(history[2]?.rating).toBe(1600);
  });

  it('reloads from storage when another tab writes the progress key', async () => {
    useProgress.getState().completeOnboarding(1000);
    const blob = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}') as {
      state: Record<string, unknown>;
      version: number;
    };
    blob.state.puzzleRating = 1777;
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(blob));
    window.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_STORAGE_KEY }));
    await Promise.resolve();
    expect(useProgress.getState().puzzleRating).toBe(1777);
    // Another key: nothing happens.
    blob.state.puzzleRating = 1888;
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(blob));
    window.dispatchEvent(new StorageEvent('storage', { key: 'chess-trainer:settings' }));
    await Promise.resolve();
    expect(useProgress.getState().puzzleRating).toBe(1777);
  });

  it('reset clears the imported games, the isolation flag and the pre-import copy', () => {
    useGames.getState().setPlayer('me');
    localStorage.setItem('chess-trainer:pre-import-backup', '{}');
    useProgress.getState().completeOnboarding(1500);
    useProgress.getState().resetAll();
    expect(useGames.getState().player).toBe('');
    expect(writeFlag).toHaveBeenCalledWith(false);
    expect(localStorage.getItem('chess-trainer:pre-import-backup')).toBeNull();
    expect(useProgress.getState().lifetime.attempts).toBe(0);
  });

  it('keeps the learner-scoped fields: backups, snooze, tour and usernames', () => {
    const s = useProgress.getState();
    s.setUsernames({ lichessUsername: ' anna ' });
    expect(useProgress.getState().lichessUsername).toBe('anna');
    expect(useProgress.getState().chesscomUsername).toBe('');
    s.dismissTour();
    expect(useProgress.getState().tourDismissed).toBe(true);
    attempt('a', 'solved');
    s.snoozeBackup(5);
    expect(useProgress.getState().backupSnoozedUntil).toBe(5);
    s.markBackedUp(99);
    expect(useProgress.getState()).toMatchObject({
      lastBackupAt: 99,
      lastBackupAttempts: 1,
      backupSnoozedUntil: null,
    });
  });
});
