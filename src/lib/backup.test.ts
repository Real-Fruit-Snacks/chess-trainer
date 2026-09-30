import { describe, expect, it } from 'vitest';
import { BACKUP_NUDGE_ATTEMPTS, backupFilename, backupStatus } from './backup';

describe('backup reminders', () => {
  const day = 86_400_000;

  it('stays quiet until there is something worth keeping', () => {
    expect(backupStatus(5, null, 0).due).toBe(false);
    expect(backupStatus(19, null, 0).due).toBe(false);
  });

  it('asks for a first backup after enough rated puzzles', () => {
    const status = backupStatus(BACKUP_NUDGE_ATTEMPTS, null, 0);
    expect(status.due).toBe(true);
    expect(status.attemptsSince).toBe(BACKUP_NUDGE_ATTEMPTS);
    expect(status.daysSince).toBeNull();
  });

  it('counts puzzles and days since the last backup', () => {
    const now = 100 * day;
    expect(backupStatus(60, now - 2 * day, 50, now)).toEqual({
      due: false,
      attemptsSince: 10,
      daysSince: 2,
    });
    expect(backupStatus(95, now - 2 * day, 50, now).due).toBe(true);
    expect(backupStatus(60, now - 20 * day, 50, now).due).toBe(true);
    // Nothing new since a backup three weeks ago: no reminder.
    expect(backupStatus(50, now - 21 * day, 50, now).due).toBe(false);
  });

  it('names the file by date', () => {
    expect(backupFilename(new Date('2026-09-30T12:00:00Z'))).toBe(
      'chess-trainer-progress-2026-09-30.json',
    );
  });
});
