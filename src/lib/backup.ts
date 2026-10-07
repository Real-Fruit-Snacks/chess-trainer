import { safeLocalStorage } from '@/lib/persistStorage';
import { deviceSyncOn } from '@/lib/sync/enabled';
import { activeProfile, type ProfilesState, useProfiles } from '@/store/profiles';
import {
  type ImportResult,
  PRE_IMPORT_BACKUP_KEY,
  type ProgressState,
  useProgress,
} from '@/store/progress';

/**
 * Moving progress between devices. The export is a JSON file; on phones the
 * Web Share API hands it straight to another device or app (AirDrop, Nearby
 * Share, messaging), and the app is registered as a handler for .json files so
 * an export opened from the file manager can be imported after confirmation.
 */
export const BACKUP_MIME = 'application/json';

/** Reminder thresholds: this many rated puzzles or this many days since the last backup. */
export const BACKUP_NUDGE_ATTEMPTS = 40;
export const BACKUP_NUDGE_DAYS = 14;
/** "Later" on the reminder hides it for this long. */
export const BACKUP_SNOOZE_DAYS = 7;
/** Backups bigger than this are not read at all (a real one is well under 10 MB). */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

/** A profile name as part of a file name: letters, digits and dashes only. */
function fileSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/** `chess-trainer-progress-Anna-2026-10-03.json` (with a profile name when one is given). */
export function backupFilename(now = new Date(), profileName?: string): string {
  const slug = profileName ? fileSlug(profileName) : '';
  return `chess-trainer-progress-${slug ? `${slug}-` : ''}${now.toISOString().slice(0, 10)}.json`;
}

/**
 * The active profile's name for the file name, so backups of different learners
 * on one device are told apart; none while there is only the one profile.
 */
export function backupProfileName(
  state: Pick<ProfilesState, 'profiles' | 'activeId'> = useProfiles.getState(),
): string | undefined {
  return state.profiles.length > 1 ? activeProfile(state).name : undefined;
}

export function backupFile(json: string, now = new Date()): File {
  return new File([json], backupFilename(now, backupProfileName()), { type: BACKUP_MIME });
}

/** Whether this browser can share a backup file to another app or device. */
export function canShareBackup(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [backupFile('{}')] });
  } catch {
    return false;
  }
}

/**
 * Downloads the backup as a file (the universal fallback). The object URL is
 * revoked on the next tick: revoking it synchronously after `click()` can
 * cancel the download in WebKit.
 */
export function downloadBackup(json: string): void {
  const blob = new Blob([json], { type: BACKUP_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename(new Date(), backupProfileName());
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Shares the backup through the system share sheet. Resolves to true when the
 * share completed, false when the user cancelled; throws when sharing is not
 * possible so the caller can fall back to a download.
 */
export async function shareBackup(json: string, appName: string): Promise<boolean> {
  const file = backupFile(json);
  try {
    await navigator.share({
      files: [file],
      title: `${appName} progress`,
      text: `${appName} progress backup — open it in the app on the other device to import.`,
    });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}

/** Records that a backup has just been made, for the reminder. */
export function markBackedUp(now = Date.now()): void {
  useProgress.getState().markBackedUp(now);
}

/* ------------------------------------------------------------------ */
/* The reminder                                                       */
/* ------------------------------------------------------------------ */

export interface BackupStatus {
  /** Whether the reminder should be shown. */
  due: boolean;
  /** Rated attempts since the last backup (or ever, if none was made). */
  attemptsSince: number;
  daysSince: number | null;
}

/** Thresholds for "the learner has done something worth keeping" — any one is enough. */
export const BACKUP_ACTIVITY = {
  trainingDays: 5,
  lessons: 3,
  repertoireCards: 10,
  games: 3,
} as const;

export interface BackupActivity {
  trainingDays: number;
  lessonsCompleted: number;
  repertoireCards: number;
  games: number;
  /** Any training day after the last backup (true when unknown): no reminder for a dormant profile. */
  activeSinceBackup?: boolean;
}

/** Whether there is enough of anything — puzzles, lessons, openings, drills, games — to protect. */
export function hasBackupWorthyActivity(activity: BackupActivity): boolean {
  return (
    activity.trainingDays >= BACKUP_ACTIVITY.trainingDays ||
    activity.lessonsCompleted >= BACKUP_ACTIVITY.lessons ||
    activity.repertoireCards >= BACKUP_ACTIVITY.repertoireCards ||
    activity.games >= BACKUP_ACTIVITY.games
  );
}

/**
 * Whether it is time to remind the learner to back up: there is activity worth
 * keeping (a few training days, lessons, openings or games, or a run of rated
 * puzzles) and either many rated puzzles or a fortnight (with some activity)
 * have passed since the last backup, and the reminder is not snoozed.
 */
export function backupStatus(
  progress: Pick<
    ProgressState,
    'ratedAttempts' | 'lastBackupAt' | 'lastBackupAttempts' | 'backupSnoozedUntil'
  >,
  activity: BackupActivity,
  now = Date.now(),
): BackupStatus {
  const { ratedAttempts, lastBackupAt, lastBackupAttempts, backupSnoozedUntil } = progress;
  const attemptsSince = Math.max(0, ratedAttempts - (lastBackupAt ? lastBackupAttempts : 0));
  const daysSince = lastBackupAt ? Math.floor((now - lastBackupAt) / 86_400_000) : null;
  // A run of rated puzzles is worth keeping on its own, even in the first days.
  const worthKeeping = hasBackupWorthyActivity(activity) || ratedAttempts >= BACKUP_NUDGE_ATTEMPTS;
  if (!worthKeeping) return { due: false, attemptsSince, daysSince };
  if (backupSnoozedUntil !== null && now < backupSnoozedUntil) {
    return { due: false, attemptsSince, daysSince };
  }
  const active = attemptsSince > 0 || (activity.activeSinceBackup ?? true);
  const due =
    lastBackupAt === null ||
    attemptsSince >= BACKUP_NUDGE_ATTEMPTS ||
    (daysSince !== null && daysSince >= BACKUP_NUDGE_DAYS && active);
  return { due, attemptsSince, daysSince };
}

/* ------------------------------------------------------------------ */
/* Reading a file                                                     */
/* ------------------------------------------------------------------ */

export type BackupReadResult =
  | { ok: true; parsed: unknown }
  | { ok: false; problem: 'too-large' | 'unreadable' | 'looks-like-pgn'; reason: string };

/** Whether text that failed to parse as JSON is a PGN by the look of it. */
export function looksLikePgn(text: string): boolean {
  const head = text.slice(0, 2000);
  return /^\s*\[\s*\w+\s+"/.test(head) || /(^|\s)1\.\s*[a-hNBRQKO]/.test(head);
}

/** Parses the text of a backup file, saying why when it cannot. */
export function parseBackupText(text: string): BackupReadResult {
  try {
    return { ok: true, parsed: JSON.parse(text) as unknown };
  } catch {
    if (looksLikePgn(text)) {
      return {
        ok: false,
        problem: 'looks-like-pgn',
        reason:
          'That is not a Chess Trainer backup (it looks like a PGN). Games go in through My games or Analyze.',
      };
    }
    return {
      ok: false,
      problem: 'unreadable',
      reason: 'That file could not be read as a Chess Trainer backup.',
    };
  }
}

/** Reads and parses a backup file, refusing absurdly large files before reading them. */
export async function readBackupFile(file: File): Promise<BackupReadResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      problem: 'too-large',
      reason: `That file is ${Math.round(file.size / (1024 * 1024))} MB — far bigger than any Chess Trainer backup, so it was not opened.`,
    };
  }
  try {
    return parseBackupText(await file.text());
  } catch {
    return { ok: false, problem: 'unreadable', reason: 'That file could not be read.' };
  }
}

/* ------------------------------------------------------------------ */
/* Replacing, with a way back                                         */
/* ------------------------------------------------------------------ */

/**
 * With device sync on, data that an import replaced is not taken as deleted:
 * the next sync joins it with the synced data, so nothing goes from the other
 * devices (see `forgetSyncBase`).
 */
function joinImportWithSyncedData(): void {
  if (!deviceSyncOn()) return;
  void import('@/lib/sync/deviceSync').then((sync) => sync.forgetSyncBase()).catch(() => undefined);
}

/**
 * Keeps the current data aside, then imports. The copy lives under one storage
 * key until the next import or a reset; `undoImport` puts it back.
 */
export function importWithUndo(raw: unknown): ImportResult {
  const previous = useProgress.getState().exportState();
  const result = useProgress.getState().importState(raw);
  if (result.ok) {
    safeLocalStorage.setItem(PRE_IMPORT_BACKUP_KEY, previous);
    joinImportWithSyncedData();
  }
  return result;
}

/** Whether an import can still be undone. */
export function canUndoImport(): boolean {
  return typeof safeLocalStorage.getItem(PRE_IMPORT_BACKUP_KEY) === 'string';
}

/** Restores the data from before the last import; returns false when there is none or it fails. */
export function undoImport(): boolean {
  const stashed = safeLocalStorage.getItem(PRE_IMPORT_BACKUP_KEY);
  if (typeof stashed !== 'string') return false;
  const read = parseBackupText(stashed);
  if (!read.ok) return false;
  const result = useProgress.getState().importState(read.parsed);
  if (result.ok) {
    safeLocalStorage.removeItem(PRE_IMPORT_BACKUP_KEY);
    joinImportWithSyncedData();
  }
  return result.ok;
}
