import { useSettings } from '@/store/settings';

/**
 * Moving progress between devices. The export is a JSON file; on phones the
 * Web Share API hands it straight to another device or app (AirDrop, Nearby
 * Share, messaging), and the app is registered as a handler for .json files so
 * an export opened from the file manager imports itself.
 */
export const BACKUP_MIME = 'application/json';

/** Reminder thresholds: this many rated puzzles or this many days since the last backup. */
export const BACKUP_NUDGE_ATTEMPTS = 40;
export const BACKUP_NUDGE_DAYS = 14;
/** No reminder at all until the learner has done something worth keeping. */
export const BACKUP_NUDGE_MIN_ATTEMPTS = 20;

export function backupFilename(now = new Date()): string {
  return `chess-trainer-progress-${now.toISOString().slice(0, 10)}.json`;
}

export function backupFile(json: string, now = new Date()): File {
  return new File([json], backupFilename(now), { type: BACKUP_MIME });
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

/** Downloads the backup as a file (the universal fallback). */
export function downloadBackup(json: string): void {
  const blob = new Blob([json], { type: BACKUP_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  a.click();
  URL.revokeObjectURL(url);
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
export function markBackedUp(ratedAttempts: number, now = Date.now()): void {
  useSettings.getState().update({ lastBackupAt: now, lastBackupAttempts: ratedAttempts });
}

export interface BackupStatus {
  /** Whether the reminder should be shown. */
  due: boolean;
  /** Rated puzzles solved since the last backup (or ever, if none was made). */
  attemptsSince: number;
  daysSince: number | null;
}

/** Whether it is time to remind the learner to back up. */
export function backupStatus(
  ratedAttempts: number,
  lastBackupAt: number | null,
  lastBackupAttempts: number,
  now = Date.now(),
): BackupStatus {
  const attemptsSince = Math.max(0, ratedAttempts - (lastBackupAt ? lastBackupAttempts : 0));
  const daysSince = lastBackupAt ? Math.floor((now - lastBackupAt) / 86_400_000) : null;
  if (ratedAttempts < BACKUP_NUDGE_MIN_ATTEMPTS) return { due: false, attemptsSince, daysSince };
  const due =
    attemptsSince >= BACKUP_NUDGE_ATTEMPTS ||
    (daysSince !== null && daysSince >= BACKUP_NUDGE_DAYS && attemptsSince > 0);
  return { due, attemptsSince, daysSince };
}

interface LaunchParams {
  files: { getFile: () => Promise<File> }[];
}

/**
 * Handles files the OS opened the app with (the manifest's file_handlers).
 * Calls `onFile` for each; returns false when the browser has no launch queue.
 */
export function consumeLaunchFiles(onFile: (file: File) => void): boolean {
  const queue = (
    window as unknown as { launchQueue?: { setConsumer: (fn: (p: LaunchParams) => void) => void } }
  ).launchQueue;
  if (!queue) return false;
  queue.setConsumer((params) => {
    for (const handle of params.files ?? []) {
      handle
        .getFile()
        .then(onFile)
        .catch(() => undefined);
    }
  });
  return true;
}
