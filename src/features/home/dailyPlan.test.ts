import { describe, expect, it } from 'vitest';
import { localDateKey } from '@/lib/dates';
import { buildDailyPlan } from './dailyPlan';

const now = new Date('2026-09-29T12:00:00').getTime();
const today = localDateKey(new Date(now));

function progress(overrides: Partial<Parameters<typeof buildDailyPlan>[0]> = {}) {
  return {
    daily: null,
    attempts: [],
    puzzleReviews: {},
    lessons: {},
    drills: {},
    onboarded: true,
    games: [],
    ...overrides,
  };
}

describe('buildDailyPlan', () => {
  it('lists the daily puzzle, rated puzzles, a lesson and a drill for a new user', () => {
    const plan = buildDailyPlan(progress(), { cards: {}, custom: [] }, now);
    expect(plan.items.map((i) => i.id)).toEqual([
      'daily',
      'dailyOpening',
      'rated',
      'lesson',
      'drill',
    ]);
    expect(plan.done).toBe(0);
    expect(plan.items[3]?.title).toContain('Lesson:');
    expect(plan.items[4]?.to).toBe('/drills/endgame/mate-kq');
  });

  it('marks the daily opening done once today’s has been solved or missed', () => {
    const solved = buildDailyPlan(
      progress({
        dailyOpening: {
          date: today,
          guesses: ['Italian Game', 'Scotch Game'],
          result: 'solved',
          streak: 1,
          bestStreak: 1,
          history: { [today]: 2 },
        },
      }),
      { cards: {}, custom: [] },
      now,
    );
    const item = solved.items.find((i) => i.id === 'dailyOpening');
    expect(item?.done).toBe(true);
    expect(item?.detail).toContain('solved in 2');
    const stale = buildDailyPlan(
      progress({
        dailyOpening: {
          date: '2000-01-01',
          guesses: [],
          result: 'failed',
          streak: 0,
          bestStreak: 1,
          history: {},
        },
      }),
      { cards: {}, custom: [] },
      now,
    );
    expect(stale.items.find((i) => i.id === 'dailyOpening')?.done).toBe(false);
  });

  it('marks items done from today’s activity and adds review items when relevant', () => {
    const plan = buildDailyPlan(
      progress({
        daily: { date: today, id: 'x', outcome: 'solved' },
        attempts: Array.from({ length: 5 }, (_, i) => ({
          id: `p${i}`,
          puzzleRating: 1200,
          outcome: 'solved' as const,
          hintUsed: false,
          ratingBefore: 1200,
          ratingAfter: 1210,
          themes: 'fork',
          at: now - 1000,
          durationMs: 5000,
        })),
        puzzleReviews: {
          m1: {
            id: 'm1',
            rating: 1300,
            themes: 'pin',
            step: 0,
            due: now - 1,
            lapses: 0,
            addedAt: now - 90_000_000,
          },
        },
        drills: { 'mate-kq': { best: 80, attempts: 1, lastAt: now - 60_000 } },
      }),
      { cards: {}, custom: [] },
      now,
    );
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    expect(byId.daily?.done).toBe(true);
    expect(byId.rated?.done).toBe(true);
    expect(byId.review?.done).toBe(false);
    expect(byId.review?.detail).toBe('1 due');
    expect(byId.drill?.done).toBe(true);
    expect(plan.done).toBe(3);
  });

  it('adds an openings item once something has been learned', () => {
    const cards = {
      'italian|e2e4': {
        ease: 2.5,
        interval: 1,
        due: now - 1,
        reps: 1,
        lapses: 0,
        lastReviewed: now - 90_000_000,
      },
    };
    const plan = buildDailyPlan(progress(), { cards, custom: [] }, now);
    const openings = plan.items.find((i) => i.id === 'openings');
    expect(openings?.done).toBe(false);
    expect(openings?.detail).toBe('1 move due');
    // The opening being learned also brings its tactics into the plan.
    const tactics = plan.items.find((i) => i.id === 'openingTactics');
    expect(tactics?.title).toBe('Tactics from the Italian Game');
    expect(tactics?.to).toBe('/puzzles/openings?opening=Italian_Game');
    expect(tactics?.done).toBe(false);
    const solved = buildDailyPlan(
      progress({
        attempts: [
          {
            id: 'x',
            puzzleRating: 1200,
            outcome: 'solved',
            hintUsed: false,
            ratingBefore: 1200,
            ratingAfter: 1200,
            themes: 'fork',
            at: now - 1000,
            durationMs: 5000,
            opening: 'Italian_Game',
          },
        ],
      }),
      { cards, custom: [] },
      now,
    );
    expect(solved.items.find((i) => i.id === 'openingTactics')?.done).toBe(true);
  });
});

describe('adaptive plan', () => {
  it('targets the weakest theme once the statistics show one', () => {
    const themeStats = {
      fork: { solved: 2, failed: 5 },
      pin: { solved: 9, failed: 1 },
      short: { solved: 0, failed: 20 }, // meta tag: ignored
    };
    const plan = buildDailyPlan(
      progress({
        themeStats,
        attempts: [
          {
            id: 'q',
            puzzleRating: 1200,
            outcome: 'failed',
            hintUsed: false,
            ratingBefore: 1200,
            ratingAfter: 1200,
            themes: 'fork middlegame',
            at: now - 100,
            durationMs: 1000,
          },
        ],
      }),
      { cards: {}, custom: [] },
      now,
    );
    const rated = plan.items.find((i) => i.id === 'rated');
    expect(rated?.title).toBe('Solve 5 puzzles on Fork');
    expect(rated?.to).toBe('/puzzles/themes?theme=fork');
    expect(rated?.detail).toContain('29%');
    expect(rated?.detail).toContain('1 of 5 today');
  });

  it('keeps rated puzzles while every theme is fine', () => {
    const plan = buildDailyPlan(
      progress({ themeStats: { fork: { solved: 9, failed: 1 } } }),
      { cards: {}, custom: [] },
      now,
    );
    expect(plan.items.find((i) => i.id === 'rated')?.title).toBe('Solve 5 rated puzzles');
  });

  it('rotates drills to the least recently done and lists recall when cards exist', () => {
    const drills = Object.fromEntries(
      ['mate-kq', 'mate-kr', 'coordinates'].map((id, i) => [
        id,
        { best: 1, attempts: 1, lastAt: now - (10 - i) * 86_400_000 },
      ]),
    );
    const plan = buildDailyPlan(
      progress({
        drills,
        lessonRecall: {
          'forks:1': {
            id: 'forks:1',
            rating: 0,
            themes: 'forks',
            step: 0,
            due: now - 1,
            lapses: 0,
            addedAt: now - 90_000_000,
          },
        },
      }),
      { cards: {}, custom: [] },
      now,
    );
    const drill = plan.items.find((i) => i.id === 'drill');
    // Drills never done come first: the third endgame drill in the list.
    expect(drill?.to).not.toBe('/drills/endgame/mate-kq');
    expect(drill?.title).toContain('Drill:');
    const recall = plan.items.find((i) => i.id === 'recall');
    expect(recall).toMatchObject({ to: '/learn/recall', done: false, detail: '1 due' });
  });
});

describe('work-on item from game insights', () => {
  it('adds the first work item and ticks it off after a puzzle of that theme', () => {
    const workOn = [
      {
        id: 'motif:hanging-piece',
        title: 'Hanging pieces',
        detail: '3 times in your reviewed games',
        lessonId: 'piece-values',
        theme: 'hangingPiece',
      },
    ];
    const plan = buildDailyPlan(progress(), { cards: {}, custom: [] }, now, workOn);
    const item = plan.items.find((i) => i.id === 'workOn');
    expect(item?.title).toBe('Work on: Hanging pieces');
    expect(item?.to).toBe('/puzzles/themes?theme=hangingPiece');
    expect(item?.done).toBe(false);
    const practised = buildDailyPlan(
      progress({
        attempts: [
          {
            id: 'x',
            puzzleRating: 1200,
            outcome: 'failed',
            hintUsed: false,
            ratingBefore: 1200,
            ratingAfter: 1200,
            themes: 'hangingPiece middlegame',
            at: now - 1000,
            durationMs: 5000,
          },
        ],
      }),
      { cards: {}, custom: [] },
      now,
      workOn,
    );
    expect(practised.items.find((i) => i.id === 'workOn')?.done).toBe(true);
  });
});
