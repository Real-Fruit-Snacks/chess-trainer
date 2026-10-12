import type { ProgressState } from '@/store/progress';

/**
 * The version of the app whose news this device has seen: Home's "What's new" card shows the
 * releases after it. Kept on the device, not in the learner's data (a backup or a sync carries
 * none of it), and small enough for the shell to load at start-up.
 */
export const SEEN_VERSION_KEY = 'open-file:seen-version';

type LearnerSlice = Pick<ProgressState, 'onboarded' | 'attempts' | 'lessons' | 'games'>;

/** Puzzles tried, a lesson opened or a game played. */
export function hasLearnerActivity(progress: LearnerSlice): boolean {
  return (
    progress.attempts.length > 0 ||
    Object.keys(progress.lessons).length > 0 ||
    progress.games.length > 0
  );
}

/** Someone who has started: Home gives them their day first, and the news of each release. */
export function isReturningLearner(progress: LearnerSlice): boolean {
  return progress.onboarded || hasLearnerActivity(progress);
}

/** The version last seen, or null when none was ever recorded (or storage is out of reach). */
export function readSeenVersion(
  storage: Pick<Storage, 'getItem'> | null = localStore(),
): string | null {
  try {
    return storage?.getItem(SEEN_VERSION_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeSeenVersion(
  version: string,
  storage: Pick<Storage, 'setItem'> | null = localStore(),
): void {
  try {
    storage?.setItem(SEEN_VERSION_KEY, version);
  } catch {
    // Storage full or blocked: the card comes back next time, nothing worse.
  }
}

/**
 * A first visit counts the running version as seen, so a newcomer never hears what is "new" in
 * a version they only just met. A learner who already has progress but no version recorded
 * used a version from before the card existed: nothing is recorded, and Home tells them.
 */
export function noteFirstVisit(returning: boolean, version: string = __APP_VERSION__): void {
  if (!returning && readSeenVersion() === null) writeSeenVersion(version);
}

function localStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
