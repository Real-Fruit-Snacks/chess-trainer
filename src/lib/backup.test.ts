import { beforeEach, describe, expect, it } from 'vitest';
import { useGames } from '@/store/games';
import { PRE_IMPORT_BACKUP_KEY, useProgress } from '@/store/progress';
import {
  BACKUP_NUDGE_ATTEMPTS,
  backupFilename,
  backupProfileName,
  backupStatus,
  canUndoImport,
  hasBackupWorthyActivity,
  importWithUndo,
  looksLikePgn,
  parseBackupText,
  undoImport,
} from './backup';

const day = 86_400_000;
const noActivity = { trainingDays: 0, lessonsCompleted: 0, repertoireCards: 0, games: 0 };
const puzzler = { ...noActivity, trainingDays: 5 };
const progress = (
  ratedAttempts: number,
  lastBackupAt: number | null,
  lastBackupAttempts = 0,
  backupSnoozedUntil: number | null = null,
) => ({ ratedAttempts, lastBackupAt, lastBackupAttempts, backupSnoozedUntil });

describe('backup reminders', () => {
  it('stays quiet until there is something worth keeping, whatever the kind of activity', () => {
    expect(backupStatus(progress(5, null), noActivity).due).toBe(false);
    expect(
      backupStatus(progress(BACKUP_NUDGE_ATTEMPTS - 1, null), { ...noActivity, trainingDays: 4 })
        .due,
    ).toBe(false);
    expect(hasBackupWorthyActivity(noActivity)).toBe(false);
    // Lessons, openings or games alone are enough: not only rated puzzles.
    expect(hasBackupWorthyActivity({ ...noActivity, lessonsCompleted: 3 })).toBe(true);
    expect(hasBackupWorthyActivity({ ...noActivity, repertoireCards: 10 })).toBe(true);
    expect(hasBackupWorthyActivity({ ...noActivity, games: 3 })).toBe(true);
    expect(backupStatus(progress(0, null), { ...noActivity, lessonsCompleted: 3 }).due).toBe(true);
  });

  it('counts a run of rated puzzles as worth keeping, even in the first days', () => {
    const status = backupStatus(progress(BACKUP_NUDGE_ATTEMPTS, null), noActivity);
    expect(status).toEqual({ due: true, attemptsSince: BACKUP_NUDGE_ATTEMPTS, daysSince: null });
  });

  it('asks for a first backup once there is activity, and counts the attempts honestly', () => {
    const status = backupStatus(progress(BACKUP_NUDGE_ATTEMPTS, null), puzzler);
    expect(status.due).toBe(true);
    expect(status.attemptsSince).toBe(BACKUP_NUDGE_ATTEMPTS);
    expect(status.daysSince).toBeNull();
  });

  it('counts puzzles and days since the last backup', () => {
    const now = 100 * day;
    expect(backupStatus(progress(60, now - 2 * day, 50), puzzler, now)).toEqual({
      due: false,
      attemptsSince: 10,
      daysSince: 2,
    });
    expect(backupStatus(progress(95, now - 2 * day, 50), puzzler, now).due).toBe(true);
    expect(backupStatus(progress(60, now - 20 * day, 50), puzzler, now).due).toBe(true);
    // Nothing new since a backup three weeks ago: no reminder.
    expect(
      backupStatus(progress(50, now - 21 * day, 50), { ...puzzler, activeSinceBackup: false }, now)
        .due,
    ).toBe(false);
    // Training of any kind since then brings it back.
    expect(
      backupStatus(progress(50, now - 21 * day, 50), { ...puzzler, activeSinceBackup: true }, now)
        .due,
    ).toBe(true);
  });

  it('"Later" snoozes the reminder until the given time', () => {
    const now = 100 * day;
    expect(backupStatus(progress(60, null, 0, now + day), puzzler, now).due).toBe(false);
    expect(backupStatus(progress(60, null, 0, now - 1), puzzler, now).due).toBe(true);
  });

  it('puts the profile in the file name only when there is more than one', () => {
    const me = { id: 'default', name: 'Me', createdAt: 0 };
    const anna = { id: 'p2', name: 'Anna', createdAt: 1 };
    expect(backupProfileName({ profiles: [me], activeId: 'default' })).toBeUndefined();
    expect(backupProfileName({ profiles: [me, anna], activeId: 'p2' })).toBe('Anna');
    expect(backupProfileName({ profiles: [me, anna], activeId: 'default' })).toBe('Me');
  });

  it('names the file by profile and date', () => {
    expect(backupFilename(new Date('2026-09-30T12:00:00Z'))).toBe(
      'chess-trainer-progress-2026-09-30.json',
    );
    expect(backupFilename(new Date('2026-09-30T12:00:00Z'), 'Anna Müller')).toBe(
      'chess-trainer-progress-Anna-Muller-2026-09-30.json',
    );
    expect(backupFilename(new Date('2026-09-30T12:00:00Z'), '   ')).toBe(
      'chess-trainer-progress-2026-09-30.json',
    );
  });
});

describe('reading a backup file', () => {
  it('tells a PGN from a broken file', () => {
    expect(looksLikePgn('[Event "Casual game"]\n[Site "?"]\n\n1. e4 e5 *')).toBe(true);
    expect(looksLikePgn('1. e4 e5 2. Nf3 Nc6')).toBe(true);
    expect(looksLikePgn('{"progress": {}}')).toBe(false);
    const pgn = parseBackupText('[Event "Casual game"]\n\n1. e4 e5 *');
    expect(pgn.ok).toBe(false);
    if (!pgn.ok) {
      expect(pgn.problem).toBe('looks-like-pgn');
      expect(pgn.reason).toContain('looks like a PGN');
    }
    const junk = parseBackupText('not json');
    expect(junk.ok).toBe(false);
    if (!junk.ok) expect(junk.problem).toBe('unreadable');
    expect(parseBackupText('{"a":1}')).toEqual({ ok: true, parsed: { a: 1 } });
  });
});

describe('import with undo', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
    useGames.getState().clear();
  });

  it('keeps the data an import replaces and puts it back on undo', () => {
    useProgress.getState().completeOnboarding(1600);
    useProgress.getState().recordDrill('coordinates', 9);
    useGames.getState().setPlayer('me');
    expect(canUndoImport()).toBe(false);

    const result = importWithUndo({ onboarded: true, puzzleRating: 900 });
    expect(result.ok).toBe(true);
    expect(useProgress.getState().puzzleRating).toBe(900);
    expect(useProgress.getState().drills.coordinates).toBeUndefined();
    expect(useGames.getState().player).toBe('');
    expect(canUndoImport()).toBe(true);
    expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toContain('"coordinates"');

    expect(undoImport()).toBe(true);
    expect(useProgress.getState().puzzleRating).toBe(1600);
    expect(useProgress.getState().drills.coordinates?.best).toBe(9);
    expect(useGames.getState().player).toBe('me');
    expect(canUndoImport()).toBe(false);
    expect(undoImport()).toBe(false);
  });

  it('stashes nothing when the file is refused', () => {
    useProgress.getState().completeOnboarding(1600);
    const result = importWithUndo({ progress: { puzzleRating: 'high' } });
    expect(result.ok).toBe(false);
    expect(useProgress.getState().puzzleRating).toBe(1600);
    expect(canUndoImport()).toBe(false);
  });

  it('a reset clears the pre-import copy', () => {
    useProgress.getState().completeOnboarding(1600);
    importWithUndo({ onboarded: true, puzzleRating: 900 });
    expect(canUndoImport()).toBe(true);
    useProgress.getState().resetAll();
    expect(canUndoImport()).toBe(false);
  });
});
