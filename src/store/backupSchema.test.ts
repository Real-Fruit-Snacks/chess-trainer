import { beforeEach, describe, expect, it } from 'vitest';
import { EXPORT_VERSION, validateBackupFile } from './backupSchema';
import backupV6 from './fixtures/backup-v6.json';
import backupV7 from './fixtures/backup-v7.json';
import { useAnalyses } from './analyses';
import { useGames } from './games';
import { inspectBackup, useProgress } from './progress';
import { useRepertoire } from './repertoire';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('the backup validator', () => {
  it('refuses things that are not a backup at all', () => {
    for (const raw of [null, 'text', 42, [], { hello: 'world' }, { progress: {} }]) {
      const result = validateBackupFile(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problem).toBe('not-a-backup');
    }
    const otherApp = validateBackupFile({ app: 'other-app', progress: { onboarded: true } });
    expect(otherApp.ok).toBe(false);
  });

  it('refuses a field of the wrong type, naming it', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['progress.attempts', { onboarded: true, attempts: {} }],
      ['progress.puzzleReviews', { onboarded: true, puzzleReviews: null }],
      ['progress.puzzleRating', { onboarded: true, puzzleRating: 'high' }],
      ['progress.puzzleRating', { onboarded: true, puzzleRating: Number.NaN }],
      ['progress.streak', { onboarded: true, streak: { current: 1 } }],
      ['progress.lessons', { onboarded: true, lessons: [] }],
    ];
    for (const [path, progress] of cases) {
      const result = validateBackupFile({ app: 'chess-trainer', version: 6, progress });
      expect(result.ok, path).toBe(false);
      if (!result.ok) {
        expect(result.problem).toBe('damaged');
        expect(result.reason).toContain(path);
      }
    }
  });

  it('drops damaged list entries and unknown keys rather than the whole file', () => {
    const file = clone(backupV6);
    (file.progress as Record<string, unknown>).attempts = [
      ...file.progress.attempts,
      { id: 'broken' },
      'junk',
    ];
    (file.progress as Record<string, unknown>).secretField = 'x';
    (file.progress.lessons as Record<string, unknown>).broken = { stepsDone: 'no' };
    const result = validateBackupFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.shape.dropped).toBe(3);
      expect(result.shape.progress.attempts).toHaveLength(backupV6.progress.attempts.length);
      expect('secretField' in result.shape.progress).toBe(false);
      expect(result.shape.progress.lessons?.broken).toBeUndefined();
    }
  });

  it('keeps a lesson marked done without its steps', () => {
    const file = clone(backupV6);
    (file.progress.lessons as Record<string, unknown>).forks = {
      stepsDone: [],
      completedAt: 5,
      lastVisitedAt: 0,
      marked: true,
    };
    const result = validateBackupFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.shape.progress.lessons?.forks).toEqual({
        stepsDone: [],
        completedAt: 5,
        lastVisitedAt: 0,
        marked: true,
      });
    }
  });

  it('refuses a damaged repertoire, library or games part too', () => {
    const repertoire = clone(backupV7);
    (repertoire as Record<string, unknown>).repertoire = { cards: [] };
    expect(validateBackupFile(repertoire)).toMatchObject({ ok: false, problem: 'damaged' });
    const analyses = clone(backupV7);
    (analyses as Record<string, unknown>).analyses = { items: 'nope' };
    expect(validateBackupFile(analyses)).toMatchObject({ ok: false, problem: 'damaged' });
    const games = clone(backupV7);
    (games as Record<string, unknown>).games = { games: {}, player: 7 };
    expect(validateBackupFile(games)).toMatchObject({ ok: false, problem: 'damaged' });
  });

  it('keeps games played online with the learner’s side, and drops a side that is not one', () => {
    const file = clone(backupV7);
    const games = (file as { games: { games: Record<string, Record<string, unknown>> } }).games
      .games;
    const base = games['pgn-fixture']!;
    games['online-1'] = { ...base, id: 'online-1', source: 'online', side: 'black' };
    games['online-2'] = { ...base, id: 'online-2', source: 'online', side: 'green' };
    games.elsewhere = { ...base, id: 'elsewhere', source: 'somewhere' };
    const result = validateBackupFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.shape.games?.games?.['online-1']).toMatchObject({
        source: 'online',
        side: 'black',
      });
      expect(result.shape.games?.games?.['online-2']).toBeUndefined();
      expect(result.shape.games?.games?.elsewhere).toBeUndefined();
      expect(result.shape.dropped).toBe(2);
      // A game without a side stays as it was: the side is for games the app played itself.
      expect(result.shape.games?.games?.['pgn-fixture']).not.toHaveProperty('side');
    }
  });

  it('imports a newer format with a warning rather than refusing it', () => {
    const future = { ...clone(backupV7), version: EXPORT_VERSION + 3 };
    (future.progress as Record<string, unknown>).fromTheFuture = [1, 2, 3];
    const result = validateBackupFile(future);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toMatch(/newer version/);
      expect(result.shape.version).toBe(EXPORT_VERSION + 3);
      expect('fromTheFuture' in result.shape.progress).toBe(false);
    }
    const preview = inspectBackup(future);
    expect(preview.ok && preview.warning).toMatch(/newer version/);
  });

  it('accepts the bare progress object exports before 0.4 wrote', () => {
    const result = validateBackupFile({ onboarded: true, puzzleRating: 1300 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shape.version).toBe(1);
  });
});

describe('atomic import', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
  });

  it('changes nothing in any store when one part is refused', () => {
    useProgress.getState().completeOnboarding(1500);
    useRepertoire.getState().review('italian', 'e2e4', 5, 1_700_000_000_000);
    useAnalyses.getState().save({ name: 'Keep', pgn: '1. e4 *', startFen: 'x', moves: 1 });
    useGames.getState().setPlayer('keep');
    const file = clone(backupV7);
    // Every other part is fine; the games part is broken.
    (file as Record<string, unknown>).games = { games: 'nope' };
    const result = useProgress.getState().importState(file);
    expect(result.ok).toBe(false);
    expect(useProgress.getState().puzzleRating).toBe(1500);
    expect(useRepertoire.getState().cards['italian|e2e4']?.reps).toBe(1);
    expect(Object.keys(useAnalyses.getState().items)).toHaveLength(1);
    expect(useGames.getState().player).toBe('keep');
  });

  it('replaces every store together when the file is good', () => {
    useProgress.getState().completeOnboarding(1500);
    useRepertoire.getState().review('italian', 'e2e4', 5, 1_700_000_000_000);
    useAnalyses.getState().save({ name: 'Gone', pgn: '1. e4 *', startFen: 'x', moves: 1 });
    useGames.getState().setPlayer('gone');
    const result = useProgress.getState().importState(backupV7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toEqual({
        exportedAt: '2026-10-03T09:00:00.000Z',
        version: 7,
        attempts: 8,
        games: 2,
        analyses: 1,
        repertoires: 1,
        settings: false,
        dropped: 0,
      });
    }
    expect(useProgress.getState().puzzleRating).toBe(1212);
    expect(useRepertoire.getState().cards['italian|e2e4']).toBeUndefined();
    expect(useAnalyses.getState().items['an-muofwy80-b2y86']).toBeDefined();
    expect(Object.keys(useAnalyses.getState().items)).toHaveLength(1);
    expect(useGames.getState().player).toBe('fixture_user');
  });

  it('a backup without the newer parts empties them (it replaces, never merges)', () => {
    useGames.getState().setPlayer('gone');
    useAnalyses.getState().save({ name: 'Gone', pgn: '1. e4 *', startFen: 'x', moves: 1 });
    expect(useProgress.getState().importState(backupV6).ok).toBe(true);
    expect(useGames.getState().player).toBe('');
    expect(Object.keys(useAnalyses.getState().items)).toEqual(['an-muofwy80-b2y86']);
  });
});
