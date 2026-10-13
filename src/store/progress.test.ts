import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_VERSION } from './backupSchema';
import { summarizeProgress, useProgress, withRatingDefaults } from './progress';
import { dueAt } from '@/lib/srs';
import { localDateKey } from '@/lib/dates';
import { DEFAULT_VOLATILITY, INITIAL_RD } from '@/lib/glicko';
import { REPEAT_WEIGHT } from '@/lib/puzzleScore';
import { CALIBRATION_PUZZLES, CALIBRATION_START_RATING, SELF_ASSESSED_RD } from '@/lib/rating';
import { useRepertoire } from './repertoire';
import { DEFAULT_SETTINGS, useSettings } from './settings';

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

  it('exports and imports state, including the opening repertoire', () => {
    useProgress.getState().completeOnboarding(1500);
    attempt('x', 'solved');
    useProgress
      .getState()
      .recordRush({ mode: 'timed', score: 7, peakRating: 1300, durationMs: 180_000 });
    useProgress.getState().recordDrill('coordinates', 22, '22 squares');
    useRepertoire.getState().review('italian', 'e2e4', 5, 1_700_000_000_000);
    const json = useProgress.getState().exportState();
    useProgress.getState().resetAll();
    expect(useProgress.getState().puzzleRating).toBe(1000);
    expect(useProgress.getState().rushRuns).toEqual([]);
    expect(useRepertoire.getState().cards).toEqual({});
    expect(useProgress.getState().importState(JSON.parse(json)).ok).toBe(true);
    expect(useProgress.getState().attempts[0]?.id).toBe('x');
    expect(useProgress.getState().rushRuns[0]?.score).toBe(7);
    expect(useProgress.getState().drills.coordinates?.best).toBe(22);
    expect(useProgress.getState().themeStats.fork?.solved).toBe(1);
    expect(useRepertoire.getState().cards['italian|e2e4']?.reps).toBe(1);
    expect(useProgress.getState().importState({ nonsense: true }).ok).toBe(false);
  });

  it("backs up the learner's settings and restores them, leaving the device's alone", () => {
    useSettings.setState({ boardTheme: 'blue', pieceSet: 'merida', engineFull: true });
    const json = useProgress.getState().exportState();
    const file = JSON.parse(json) as { version: number; settings: Record<string, unknown> };
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.settings).toMatchObject({ boardTheme: 'blue', pieceSet: 'merida' });
    expect(file.settings).not.toHaveProperty('engineFull');

    useSettings.setState({ ...DEFAULT_SETTINGS, engineThreads: false });
    const result = useProgress.getState().importState(JSON.parse(json));
    expect(result.ok && result.summary.settings).toBe(true);
    expect(useSettings.getState()).toMatchObject({
      boardTheme: 'blue',
      pieceSet: 'merida',
      // The device's own stay as this device has them.
      engineThreads: false,
      engineFull: false,
    });

    // A backup from before settings were in backups leaves the settings as they are.
    const { settings: _none, ...older } = JSON.parse(json) as Record<string, unknown>;
    useSettings.setState({ boardTheme: 'green' });
    const old = useProgress.getState().importState({ ...older, version: 11 });
    expect(old.ok && old.summary.settings).toBe(false);
    expect(useSettings.getState().boardTheme).toBe('green');
    useSettings.setState({ ...DEFAULT_SETTINGS });
  });

  it('names the profile’s history in its first backup, and keeps that name', () => {
    expect(useProgress.getState().lineage).toEqual([]);
    const first = JSON.parse(useProgress.getState().exportState()) as {
      progress: { lineage: string[] };
    };
    expect(first.progress.lineage).toHaveLength(1);
    expect(first.progress.lineage[0]).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const second = JSON.parse(useProgress.getState().exportState()) as typeof first;
    expect(second.progress.lineage).toEqual(first.progress.lineage);
    // Restoring a backup restores its name with it.
    useProgress.getState().resetAll();
    expect(useProgress.getState().lineage).toEqual([]);
    expect(useProgress.getState().importState(first).ok).toBe(true);
    expect(useProgress.getState().lineage).toEqual(first.progress.lineage);
  });

  it('queues missed puzzles for review and reschedules solves', () => {
    attempt('miss', 'failed');
    const card = useProgress.getState().puzzleReviews.miss;
    expect(card?.step).toBe(0);
    expect(card?.due).toBeGreaterThan(Date.now());
    // Solving it in the review queue moves it to the next step; a plain solve elsewhere does not.
    useProgress.getState().recordPuzzle({
      id: 'miss',
      puzzleRating: 1200,
      outcome: 'solved',
      hintUsed: false,
      themes: 'fork',
      durationMs: 1000,
      rated: false,
      review: true,
    });
    expect(useProgress.getState().puzzleReviews.miss?.step).toBe(1);
    attempt('other', 'solved');
    expect(useProgress.getState().puzzleReviews.other).toBeUndefined();
    useProgress.getState().dismissReview('miss');
    expect(useProgress.getState().puzzleReviews.miss).toBeUndefined();
    // Rush misses are queued too.
    useProgress.getState().recordUnratedOutcome('rush1', 'pin', 'failed', 1500);
    expect(useProgress.getState().puzzleReviews.rush1?.rating).toBe(1500);
  });

  it('records training days from any activity', () => {
    expect(useProgress.getState().trainingDays).toEqual([]);
    attempt('t1', 'solved');
    const today = localDateKey();
    expect(useProgress.getState().trainingDays).toEqual([today]);
    useProgress.getState().recordDrill('coordinates', 5);
    useProgress.getState().touchTraining();
    expect(useProgress.getState().trainingDays).toEqual([today]);
  });

  it('keeps the best drill result and counts attempts', () => {
    const { recordDrill } = useProgress.getState();
    recordDrill('mate-kq', 80, 'Done in 20 moves');
    recordDrill('mate-kq', 60, 'Done in 40 moves');
    recordDrill('mate-kq', 90, 'Done in 10 moves');
    expect(useProgress.getState().drills['mate-kq']).toMatchObject({
      best: 90,
      attempts: 3,
      detail: 'Done in 10 moves',
    });
  });

  it('records the best guess-the-move score per game', () => {
    const { recordGuessGame } = useProgress.getState();
    recordGuessGame('opera-game', 12, 30);
    recordGuessGame('opera-game', 9, 30);
    expect(useProgress.getState().guessGames['opera-game']?.score).toBe(12);
    recordGuessGame('opera-game', 21, 30);
    expect(useProgress.getState().guessGames['opera-game']?.score).toBe(21);
  });

  it('keeps the best arcade score with its detail and counts plays', () => {
    const { recordArcade } = useProgress.getState();
    recordArcade('fortress', 3, 'held 3 positions');
    recordArcade('fortress', 2, 'held 2 positions');
    let result = useProgress.getState().arcade.fortress;
    expect(result?.best).toBe(3);
    expect(result?.plays).toBe(2);
    expect(result?.detail).toBe('held 3 positions');
    recordArcade('fortress', 5, 'held 5 positions');
    result = useProgress.getState().arcade.fortress;
    expect(result?.best).toBe(5);
    expect(result?.detail).toBe('held 5 positions');
    expect(useProgress.getState().trainingDays).toHaveLength(1);
  });

  it('stores the daily opening and odds ladder state and exports them', () => {
    const { setDailyOpening, setOddsLadder, exportState } = useProgress.getState();
    setDailyOpening({
      date: '2026-10-01',
      guesses: ['Italian Game'],
      result: null,
      streak: 2,
      bestStreak: 4,
      history: { '2026-09-30': 3 },
    });
    setOddsLadder({ rung: 2, best: 3, results: { 0: { wins: 1, losses: 0 } } });
    const exported = JSON.parse(exportState()) as {
      version: number;
      progress: { dailyOpening: { streak: number }; oddsLadder: { rung: number } };
    };
    expect(exported.version).toBe(EXPORT_VERSION);
    expect(exported.progress.dailyOpening.streak).toBe(2);
    expect(exported.progress.oddsLadder.rung).toBe(2);
    // A save from before the arcade existed gets the defaults.
    expect(useProgress.getState().importState({ onboarded: true, puzzleRating: 1400 }).ok).toBe(
      true,
    );
    expect(useProgress.getState().oddsLadder).toEqual({ rung: 0, best: 0, results: {} });
    expect(useProgress.getState().dailyOpening).toBeNull();
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

describe('own puzzles, bookmarks, recall and studies', () => {
  const own = (id: string, createdAt = 1) => ({
    id: `own-${id}`,
    fen: 'fen',
    moves: 'e2e4 e7e5',
    rating: 1200,
    rd: 0,
    popularity: 0,
    plays: 0,
    themes: 'ownGame blunder',
    url: '',
    source: { title: 't', ply: 2, played: 'e5', judgement: 'blunder' as const, loss: 0.5 },
    createdAt,
  });

  it('stores own puzzles once and queues them for review right away', () => {
    useProgress.getState().resetAll();
    expect(useProgress.getState().addOwnPuzzles([own('a'), own('b')])).toBe(2);
    expect(useProgress.getState().addOwnPuzzles([own('a')])).toBe(0);
    const state = useProgress.getState();
    expect(Object.keys(state.ownPuzzles).sort()).toEqual(['own-a', 'own-b']);
    expect(state.puzzleReviews['own-a']?.due).toBeLessThanOrEqual(Date.now());
    state.removeOwnPuzzle('own-a');
    expect(useProgress.getState().ownPuzzles['own-a']).toBeUndefined();
    expect(useProgress.getState().puzzleReviews['own-a']).toBeUndefined();
  });

  it('drops the oldest own puzzles beyond the cap', () => {
    useProgress.getState().resetAll();
    const many = Array.from({ length: 305 }, (_, i) => own(`p${i}`, i));
    useProgress.getState().addOwnPuzzles(many);
    const ids = Object.keys(useProgress.getState().ownPuzzles);
    expect(ids.length).toBe(300);
    expect(ids).not.toContain('own-p0');
    expect(ids).toContain('own-p304');
    expect(useProgress.getState().puzzleReviews['own-p0']).toBeUndefined();
  });

  it('bookmarks a puzzle into the queue without duplicating an existing card', () => {
    useProgress.getState().resetAll();
    useProgress.getState().bookmarkPuzzle({ id: 'x', rating: 1300, themes: 'fork' });
    const card = useProgress.getState().puzzleReviews.x;
    expect(card?.step).toBe(0);
    expect(card?.due).toBeLessThanOrEqual(Date.now());
    useProgress.getState().bookmarkPuzzle({ id: 'x', rating: 1300, themes: 'fork' });
    expect(useProgress.getState().puzzleReviews.x).toBe(card);
  });

  it('schedules and grades lesson recall cards', () => {
    useProgress.getState().resetAll();
    useProgress.getState().scheduleLessonRecall([{ id: 'forks:1', lessonId: 'forks' }], 1000);
    // First recall three days after the lesson (step 1 of the 1-3-7-14-30 schedule).
    expect(useProgress.getState().lessonRecall['forks:1']).toMatchObject({
      step: 1,
      due: dueAt(1000, 3),
    });
    useProgress.getState().recordLessonRecall('forks:1', 'solved');
    expect(useProgress.getState().lessonRecall['forks:1']?.step).toBe(2);
    useProgress.getState().recordLessonRecall('forks:1', 'failed');
    expect(useProgress.getState().lessonRecall['forks:1']?.step).toBe(0);
    expect(useProgress.getState().lessonRecall['forks:1']?.lapses).toBe(1);
    expect(useProgress.getState().trainingDays.length).toBe(1);
  });

  it('schedules recall for the task steps when a lesson completes', () => {
    useProgress.getState().resetAll();
    useProgress.getState().markLessonStep('forks', 0, 2, [1]);
    expect(useProgress.getState().lessonRecall).toEqual({});
    useProgress.getState().markLessonStep('forks', 1, 2, [1]);
    expect(Object.keys(useProgress.getState().lessonRecall)).toEqual(['forks:1']);
    // Completing again (or revisiting) does not reset an existing card.
    useProgress.getState().recordLessonRecall('forks:1', 'solved');
    useProgress.getState().markLessonStep('forks', 1, 2, [1]);
    expect(useProgress.getState().lessonRecall['forks:1']?.step).toBe(2);
    useProgress.getState().dismissLessonRecall('forks:1');
    expect(useProgress.getState().lessonRecall['forks:1']).toBeUndefined();
  });

  it('marks a lesson done without its steps: completed, but not training', () => {
    useProgress.getState().resetAll();
    vi.useFakeTimers({ now: 1_000_000 });
    useProgress.getState().markLessonStep('forks', 0, 3, [2]);
    const daysBefore = useProgress.getState().trainingDays.length;
    vi.setSystemTime(2_000_000);
    useProgress.getState().markLessonDone('forks');
    expect(useProgress.getState().lessons.forks).toEqual({
      stepsDone: [0],
      completedAt: 2_000_000,
      lastVisitedAt: 1_000_000,
      marked: true,
    });
    expect(useProgress.getState().trainingDays).toHaveLength(daysBefore);
    expect(useProgress.getState().lessonRecall).toEqual({});
    expect(summarizeProgress(useProgress.getState()).lessonsCompleted).toBe(1);
    // A lesson that is already done stays as it is.
    useProgress.getState().markLessonDone('forks');
    expect(useProgress.getState().lessons.forks?.completedAt).toBe(2_000_000);
    // Restarting it keeps the mark.
    useProgress.getState().resetLesson('forks');
    expect(useProgress.getState().lessons.forks).toMatchObject({ stepsDone: [], marked: true });
    vi.useRealTimers();
  });

  it('completes a marked lesson for real once every step is done', () => {
    useProgress.getState().resetAll();
    useProgress.getState().markLessonDone('forks');
    useProgress.getState().markLessonStep('forks', 0, 2, [1]);
    expect(useProgress.getState().lessons.forks?.marked).toBe(true);
    const markedAt = useProgress.getState().lessons.forks?.completedAt ?? 0;
    useProgress.getState().markLessonStep('forks', 1, 2, [1]);
    const done = useProgress.getState().lessons.forks;
    expect(done?.marked).toBeUndefined();
    expect(done?.completedAt).toBeGreaterThanOrEqual(markedAt);
    expect(Object.keys(useProgress.getState().lessonRecall)).toEqual(['forks:1']);
  });

  it('marks a lesson not done, and puts a lesson back as it was', () => {
    useProgress.getState().resetAll();
    useProgress.getState().markLessonStep('forks', 0, 1);
    const before = useProgress.getState().lessons.forks;
    expect(before?.completedAt).not.toBeNull();
    useProgress.getState().markLessonNotDone('forks');
    expect(useProgress.getState().lessons.forks).toEqual({
      stepsDone: [],
      completedAt: null,
      lastVisitedAt: before?.lastVisitedAt,
    });
    useProgress.getState().restoreLesson('forks', before);
    expect(useProgress.getState().lessons.forks).toEqual(before);
    // Never opened: undoing a mark removes the lesson's entry again.
    useProgress.getState().markLessonDone('pins');
    useProgress.getState().restoreLesson('pins', undefined);
    expect(useProgress.getState().lessons.pins).toBeUndefined();
    // Not done already, or never opened: nothing to clear.
    useProgress.getState().markLessonNotDone('skewers');
    expect(useProgress.getState().lessons.skewers).toBeUndefined();
  });

  it('records study results', () => {
    useProgress.getState().resetAll();
    useProgress.getState().recordStudy('reti', 'failed', false);
    expect(useProgress.getState().studies.reti).toMatchObject({ solvedAt: null, attempts: 1 });
    useProgress.getState().recordStudy('reti', 'solved', true);
    expect(useProgress.getState().studies.reti?.solvedAt).not.toBeNull();
    expect(useProgress.getState().studies.reti?.clean).toBe(true);
  });

  it('round-trips the new state through export and import', () => {
    useProgress.getState().resetAll();
    useProgress.getState().addOwnPuzzles([own('z')]);
    useProgress.getState().recordStudy('reti', 'solved', true);
    const exported = useProgress.getState().exportState();
    useProgress.getState().resetAll();
    expect(useProgress.getState().importState(JSON.parse(exported)).ok).toBe(true);
    expect(useProgress.getState().ownPuzzles['own-z']).toBeDefined();
    expect(useProgress.getState().studies.reti?.clean).toBe(true);
  });
});

describe('Glicko-2 puzzle rating', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    vi.useRealTimers();
  });

  it('self-assessment starts moderately uncertain, calibration very uncertain', () => {
    useProgress.getState().completeOnboarding(1200);
    expect(useProgress.getState().puzzleRd).toBe(SELF_ASSESSED_RD);
    expect(useProgress.getState().calibration).toBeNull();
    useProgress.getState().completeOnboarding(0, 'calibrate');
    const state = useProgress.getState();
    expect(state.puzzleRating).toBe(CALIBRATION_START_RATING);
    expect(state.puzzleRd).toBe(INITIAL_RD);
    expect(state.calibration).toMatchObject({ total: CALIBRATION_PUZZLES, done: 0 });
  });

  it('a calibration run counts rated puzzles and finishes after the last one', () => {
    useProgress.getState().completeOnboarding(0, 'calibrate');
    let done = false;
    for (let i = 0; i < CALIBRATION_PUZZLES; i++) {
      expect(done).toBe(false);
      const result = attempt(`c${i}`, i % 3 === 0 ? 'failed' : 'solved', {
        puzzleRating: 1100 + i * 40,
      });
      done = result.calibrationDone;
      if (i < CALIBRATION_PUZZLES - 1) {
        expect(useProgress.getState().calibration?.done).toBe(i + 1);
      }
    }
    expect(done).toBe(true);
    const state = useProgress.getState();
    expect(state.calibration).toBeNull();
    expect(state.puzzleRd).toBeLessThan(INITIAL_RD / 2);
    expect(state.ratedAttempts).toBe(CALIBRATION_PUZZLES);
    // Unrated attempts never count towards calibration.
    useProgress.getState().completeOnboarding(0, 'calibrate');
    attempt('u', 'solved', { rated: false });
    expect(useProgress.getState().calibration?.done).toBe(0);
  });

  it('moves a lot while uncertain and a little once settled, and stores the score', () => {
    useProgress.getState().completeOnboarding(0, 'calibrate');
    const first = attempt('f1', 'solved', { puzzleRating: 1100, puzzleRd: 80, solverMoves: 2 });
    expect(first.after - first.before).toBeGreaterThan(80);
    expect(useProgress.getState().attempts[0]?.score).toBe(1);
    useProgress.setState({ puzzleRd: 60 });
    const settled = attempt('f2', 'solved', { puzzleRating: useProgress.getState().puzzleRating });
    expect(settled.after - settled.before).toBeGreaterThan(5);
    expect(settled.after - settled.before).toBeLessThan(15);
  });

  it('gives less credit for hints, slow solves and repeats', () => {
    useProgress.getState().completeOnboarding(1200);
    useProgress.setState({ puzzleRd: 80 });
    const base = { puzzleRating: 1200, puzzleRd: 80, solverMoves: 2 };
    const clean = attempt('h0', 'solved', base).after - 1200;
    useProgress.setState({ puzzleRating: 1200, puzzleRd: 80 });
    const piece = attempt('h1', 'solved', { ...base, hintLevel: 1 }).after - 1200;
    useProgress.setState({ puzzleRating: 1200, puzzleRd: 80 });
    const move = attempt('h2', 'solved', { ...base, hintLevel: 2 }).after - 1200;
    expect(clean).toBeGreaterThan(piece);
    expect(piece).toBeGreaterThanOrEqual(move);
    // The whole move was given away, which is worth less than the expected 0.5 —
    // but a correct solve never costs rating points, so the floor holds it at 0.
    expect(move).toBeCloseTo(0, 5);
    expect(useProgress.getState().attempts.find((a) => a.id === 'h1')?.hintUsed).toBe(true);

    useProgress.setState({ puzzleRating: 1200, puzzleRd: 80 });
    const slow = attempt('s1', 'solved', { ...base, durationMs: 5 * 60_000 }).after - 1200;
    expect(slow).toBeLessThan(clean);
    expect(slow).toBeGreaterThan(0);

    useProgress.setState({ puzzleRating: 1200, puzzleRd: 80 });
    const repeat = attempt('h0', 'solved', base).after - 1200; // h0 was seen above
    expect(repeat).toBeCloseTo(clean * REPEAT_WEIGHT, 0);
  });

  it('lets the deviation grow during a long break', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00'));
    useProgress.getState().completeOnboarding(1500);
    useProgress.setState({ puzzleRd: 60, lastRatedAt: Date.now() });
    vi.setSystemTime(new Date('2027-01-01T12:00:00'));
    const result = attempt('back', 'solved', { puzzleRating: 1500, puzzleRd: 80 });
    // A year away: the first solve moves the rating far more than the usual ±10.
    expect(result.after - result.before).toBeGreaterThan(20);
    expect(useProgress.getState().lastRatedAt).toBe(Date.now());
  });

  it('fills in the Glicko fields for saves made by older versions', () => {
    const old = {
      onboarded: true,
      puzzleRating: 1420,
      ratedAttempts: 45,
      ratingHistory: [
        { at: 1_700_000_000_000, rating: 1200 },
        { at: 1_700_500_000_000, rating: 1420 },
      ],
    };
    const migrated = withRatingDefaults(old);
    expect(migrated.puzzleRd).toBe(80);
    expect(migrated.puzzleVolatility).toBe(DEFAULT_VOLATILITY);
    expect(migrated.lastRatedAt).toBe(1_700_500_000_000);
    expect(migrated.calibration).toBeNull();
    expect(
      withRatingDefaults({ onboarded: true, puzzleRating: 1000, ratedAttempts: 12 }).puzzleRd,
    ).toBe(130);
    expect(
      withRatingDefaults({ onboarded: true, puzzleRating: 1000, ratedAttempts: 3 }).puzzleRd,
    ).toBe(200);
    expect(
      withRatingDefaults({ onboarded: true, puzzleRating: 1000, ratedAttempts: 0 }).puzzleRd,
    ).toBe(SELF_ASSESSED_RD);
    expect(withRatingDefaults({ onboarded: false }).puzzleRd).toBe(INITIAL_RD);
    // Present values are kept as they are.
    expect(withRatingDefaults({ ...old, puzzleRd: 55, lastRatedAt: 5 })).toMatchObject({
      puzzleRd: 55,
      lastRatedAt: 5,
    });
    // An old export goes through the same defaults.
    expect(useProgress.getState().importState({ progress: old }).ok).toBe(true);
    expect(useProgress.getState().puzzleRd).toBe(80);
  });
});
