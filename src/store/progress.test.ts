import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeProgress, useProgress } from './progress';

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
    themes: 'fork',
    durationMs: 5000,
    rated: true,
    ...extra,
  });

describe('progress store', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    vi.useRealTimers();
  });

  it('starts unonboarded with a default rating', () => {
    const state = useProgress.getState();
    expect(state.onboarded).toBe(false);
    expect(state.puzzleRating).toBe(1000);
  });

  it('onboarding sets the starting rating and history', () => {
    useProgress.getState().completeOnboarding(800);
    const state = useProgress.getState();
    expect(state.onboarded).toBe(true);
    expect(state.puzzleRating).toBe(800);
    expect(state.ratingHistory).toHaveLength(1);
  });

  it('records rated attempts and moves the rating', () => {
    useProgress.getState().completeOnboarding(1200);
    const { before, after } = attempt('p1', 'solved');
    expect(after).toBeGreaterThan(before);
    const state = useProgress.getState();
    expect(state.attempts[0]?.id).toBe('p1');
    expect(state.seen.p1).toBe('solved');
    expect(state.ratedAttempts).toBe(1);
    expect(state.ratingHistory).toHaveLength(2);
  });

  it('unrated attempts do not change the rating but are remembered', () => {
    useProgress.getState().completeOnboarding(1200);
    const { before, after } = attempt('p2', 'failed', { rated: false });
    expect(after).toBe(before);
    expect(useProgress.getState().seen.p2).toBe('failed');
    expect(useProgress.getState().ratedAttempts).toBe(0);
  });

  it('tracks daily streaks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T12:00:00'));
    attempt('a', 'solved');
    expect(useProgress.getState().streak.current).toBe(1);

    attempt('b', 'solved'); // same day
    expect(useProgress.getState().streak.current).toBe(1);

    vi.setSystemTime(new Date('2024-03-02T09:00:00'));
    attempt('c', 'solved');
    expect(useProgress.getState().streak).toMatchObject({ current: 2, best: 2 });

    vi.setSystemTime(new Date('2024-03-05T09:00:00'));
    attempt('d', 'failed'); // fails don't extend or break
    expect(useProgress.getState().streak.current).toBe(2);
    attempt('e', 'solved'); // gap → streak resets
    expect(useProgress.getState().streak).toMatchObject({ current: 1, best: 2 });
  });

  it('marks lesson steps and completion', () => {
    const { markLessonStep } = useProgress.getState();
    markLessonStep('forks', 0, 3);
    markLessonStep('forks', 0, 3); // idempotent
    markLessonStep('forks', 2, 3);
    expect(useProgress.getState().lessons.forks?.stepsDone).toEqual([0, 2]);
    expect(useProgress.getState().lessons.forks?.completedAt).toBeNull();
    markLessonStep('forks', 1, 3);
    expect(useProgress.getState().lessons.forks?.completedAt).not.toBeNull();
  });

  it('exports and imports state', () => {
    useProgress.getState().completeOnboarding(1500);
    attempt('x', 'solved');
    const json = useProgress.getState().exportState();
    useProgress.getState().resetAll();
    expect(useProgress.getState().puzzleRating).toBe(1000);
    expect(useProgress.getState().importState(JSON.parse(json))).toBe(true);
    expect(useProgress.getState().attempts[0]?.id).toBe('x');
    expect(useProgress.getState().importState({ nonsense: true })).toBe(false);
  });

  it('summarises statistics', () => {
    useProgress.getState().completeOnboarding(1200);
    attempt('s1', 'solved');
    attempt('f1', 'failed');
    useProgress.getState().recordGame({
      level: 3,
      color: 'white',
      result: '1-0',
      reason: 'checkmate',
      plies: 40,
      pgn: '',
    });
    const summary = summarizeProgress(useProgress.getState());
    expect(summary).toMatchObject({ solved: 1, failed: 1, wins: 1, losses: 0, draws: 0 });
    expect(summary.avgSolveMs).toBe(5000);
  });
});
