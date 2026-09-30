import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/srs';
import { weeklySummary } from './weeklySummary';

const now = new Date('2026-09-29T12:00:00').getTime();
const attempt = (at: number, outcome: 'solved' | 'failed') => ({
  id: `p${at}`,
  puzzleRating: 1200,
  outcome,
  hintUsed: false,
  ratingBefore: 1200,
  ratingAfter: 1210,
  themes: 'fork',
  at,
  durationMs: 1000,
});

describe('weeklySummary', () => {
  it('splits activity into this week and last week', () => {
    const summary = weeklySummary(
      {
        attempts: [
          attempt(now - DAY_MS, 'solved'),
          attempt(now - 2 * DAY_MS, 'failed'),
          attempt(now - 9 * DAY_MS, 'solved'),
        ],
        lessons: {
          a: { stepsDone: [], completedAt: now - 3 * DAY_MS, lastVisitedAt: now },
          b: { stepsDone: [], completedAt: now - 10 * DAY_MS, lastVisitedAt: now },
          c: { stepsDone: [], completedAt: null, lastVisitedAt: now },
        },
        games: [
          {
            at: now - DAY_MS,
            level: 1,
            color: 'white',
            result: '1-0',
            reason: '',
            plies: 2,
            pgn: '',
          },
        ],
        drills: { x: { best: 1, attempts: 1, lastAt: now - 8 * DAY_MS } },
        trainingDays: ['2026-09-28', '2026-09-27', '2026-09-18'],
        ratingHistory: [
          { at: now - 20 * DAY_MS, rating: 1100 },
          { at: now - 9 * DAY_MS, rating: 1150 },
          { at: now - DAY_MS, rating: 1210 },
        ],
      },
      now,
    );
    expect(summary.thisWeek).toEqual({
      puzzlesSolved: 1,
      puzzlesAttempted: 2,
      accuracy: 50,
      lessonsCompleted: 1,
      gamesPlayed: 1,
      drills: 0,
      trainingDays: 2,
      ratingChange: 60,
    });
    expect(summary.lastWeek).toMatchObject({
      puzzlesSolved: 1,
      puzzlesAttempted: 1,
      accuracy: 100,
      lessonsCompleted: 1,
      gamesPlayed: 0,
      drills: 1,
      ratingChange: 50,
    });
  });

  it('reports nulls when there is nothing to measure', () => {
    const summary = weeklySummary(
      { attempts: [], lessons: {}, games: [], drills: {}, trainingDays: [], ratingHistory: [] },
      now,
    );
    expect(summary.thisWeek.accuracy).toBeNull();
    expect(summary.thisWeek.ratingChange).toBeNull();
  });
});
