import { useStorageHealth } from '@/lib/persistStorage';
import { useAnalyses } from '@/store/analyses';
import { type BackupShape, EXPORT_VERSION, validateBackupFile } from '@/store/backupSchema';
import { useGames } from '@/store/games';
import { useLichess } from '@/store/lichess';
import { storageKeyFor } from '@/store/profiles';
import {
  addThemeStats,
  emptyProgress,
  lifetimeFrom,
  type PersistedProgress,
  type ThemeStat,
  useProgress,
  withRatingDefaults,
} from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { learnerSettingsOf, useSettings } from '@/store/settings';
import type { SyncWrites } from './base';
import { DEVICE_SYNC_STORAGE_KEY } from './enabled';
import { same } from './canonical';
import type { SyncSnapshot } from './merge';

/**
 * What device sync carries: the profile's four data stores — progress, the
 * opening repertoires, the analysis library and the imported games — and the
 * learner's settings: exactly what a backup holds. In the vault the snapshot
 * is a backup file, so a decrypted vault could be imported like any other.
 * The device's own settings (the engine build, the install prompt), the
 * Lichess connection and the sync's own state stay on each device.
 */

/** The storage keys (before the profile's suffix) of the synced stores, and of the sync's own. */
const SYNCED_STORAGE_KEYS = [
  'chess-trainer:settings',
  'chess-trainer:progress',
  'chess-trainer:repertoire',
  'chess-trainer:analyses',
  'chess-trainer:games',
  DEVICE_SYNC_STORAGE_KEY,
] as const;

/** The vault keeps the latest write of at most this many devices. */
const MAX_WRITERS = 64;

/** The profile's data as it is now. */
export function takeSnapshot(): SyncSnapshot {
  const progress: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(useProgress.getState())) {
    if (typeof value !== 'function') progress[key] = value;
  }
  const { cards, custom, sessions } = useRepertoire.getState();
  const { games, player } = useGames.getState();
  return {
    progress: progress as PersistedProgress,
    repertoire: { cards, custom, sessions },
    analyses: { items: useAnalyses.getState().items },
    games: { games, player },
    settings: learnerSettingsOf(useSettings.getState()),
  };
}

/**
 * This device's data as reading it back from a vault would give it: anything
 * the vault's reader leaves out (an entry the backup schema refuses) is left
 * out here too. Otherwise it would look like a change still to send, and be
 * written again at every sync.
 */
export function localSnapshot(): SyncSnapshot {
  const taken = takeSnapshot();
  const read = readSnapshotJson(snapshotJson(taken, 0));
  return read.ok ? read.snapshot : taken;
}

/**
 * Whether a synced store, or the sync's own state, holds changes that did not
 * fit in storage (a full disk): what is in memory is then not what the next
 * start reads back, and nothing may be agreed with the relay on top of it
 * until it is saved.
 */
export function unsavedData(): boolean {
  const failed = useStorageHealth.getState().failed;
  return SYNCED_STORAGE_KEYS.some((key) => storageKeyFor(key) in failed);
}

/** The record of writes with `device`'s write at `generation`, the oldest writers left out past the cap. */
export function withWrite(writes: SyncWrites, device: string, generation: number): SyncWrites {
  const all = { ...writes, [device]: generation };
  const kept = Object.entries(all)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_WRITERS);
  return Object.fromEntries(kept);
}

/**
 * The snapshot as the vault keeps it: a backup file's JSON, plus the vault's
 * generation — one more with every write — and its record of writes. Both are
 * sealed with the data, so the relay cannot pass off an older copy as the
 * current one (a device that has seen generation 7 refuses a 6), nor hide
 * whose write a copy holds (see deviceSync.ts).
 */
export function snapshotJson(
  snapshot: SyncSnapshot,
  generation: number,
  writes: SyncWrites = {},
  now = new Date(),
): string {
  return JSON.stringify({
    app: 'chess-trainer',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    sync: { generation, writes },
    ...snapshot,
  });
}

export type ReadSnapshot =
  | { ok: true; snapshot: SyncSnapshot; generation: number; writes: SyncWrites }
  | { ok: false; newer: boolean; reason: string };

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** The generation and the record of writes a vault's JSON carries (0 and none without them). */
function syncOf(raw: unknown): { generation: number; writes: SyncWrites } {
  const sync = (raw as { sync?: { generation?: unknown; writes?: unknown } } | null)?.sync;
  const writes: SyncWrites = {};
  const listed = sync?.writes;
  if (typeof listed === 'object' && listed !== null && !Array.isArray(listed)) {
    for (const [device, generation] of Object.entries(listed as Record<string, unknown>)) {
      if (/^[A-Za-z0-9_-]{8,64}$/.test(device) && positive(generation)) writes[device] = generation;
    }
  }
  return { generation: positive(sync?.generation) ? sync.generation : 0, writes };
}

/** A validated backup's parts as a snapshot, missing parts empty. */
function snapshotFromShape(shape: BackupShape): SyncSnapshot {
  return {
    progress: { ...emptyProgress(), ...withRatingDefaults(shape.progress) },
    repertoire: { cards: {}, custom: [], sessions: [], ...shape.repertoire },
    analyses: { items: shape.analyses?.items ?? {} },
    games: { games: shape.games?.games ?? {}, player: shape.games?.player ?? '' },
    settings: shape.settings ?? {},
  };
}

/**
 * A backup file's data as a snapshot, read as an import reads it: a save from
 * before the theme statistics gets them rebuilt from its attempts.
 */
export function backupSnapshot(shape: BackupShape): SyncSnapshot {
  const snapshot = snapshotFromShape(shape);
  const { progress } = snapshot;
  if (Object.keys(progress.themeStats).length === 0) {
    progress.themeStats = progress.attempts.reduce(
      (acc, a) => addThemeStats(acc, a.themes, a.outcome),
      {} as Record<string, ThemeStat>,
    );
    progress.lifetime = lifetimeFrom(progress.attempts, progress.themeStats);
  }
  return snapshot;
}

/**
 * Reads a vault's JSON back, checked field by field as an import is. Data from
 * a newer version of the app is refused rather than read in part: writing it
 * back would lose what this version cannot read.
 */
export function readSnapshotJson(json: string): ReadSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, newer: false, reason: 'The synced data is not readable.' };
  }
  const result = validateBackupFile(raw);
  if (!result.ok) return { ok: false, newer: false, reason: result.reason };
  const { shape } = result;
  if (shape.version > EXPORT_VERSION) {
    return {
      ok: false,
      newer: true,
      reason:
        'Another device synced with a newer version of the app. Update the app on this device to keep syncing.',
    };
  }
  return { ok: true, snapshot: snapshotFromShape(shape), ...syncOf(raw) };
}

/** Puts a snapshot into the stores — only the ones it changes. */
export function applySnapshot(next: SyncSnapshot, current: SyncSnapshot): void {
  if (!same(next.progress, current.progress)) useProgress.setState(next.progress);
  if (!same(next.repertoire, current.repertoire)) {
    useRepertoire.getState().replaceState(next.repertoire);
  }
  if (!same(next.analyses, current.analyses)) useAnalyses.getState().replaceState(next.analyses);
  if (!same(next.games, current.games)) useGames.getState().replaceState(next.games);
  // Settings one by one, and only those `next` has a value for.
  const settings = Object.fromEntries(
    Object.entries(next.settings).filter(
      ([key, value]) =>
        value !== undefined && !same(value, current.settings[key as keyof typeof next.settings]),
    ),
  );
  if (Object.keys(settings).length > 0) useSettings.setState(settings);
}

/**
 * Notes for the Lichess studies the custom repertoires and analyses that
 * `current` had and `next` no longer has, so a chapter that holds one goes too
 * instead of bringing it back.
 */
export function noteRemoved(next: SyncSnapshot, current: SyncSnapshot): void {
  const lichess = useLichess.getState();
  const repertoires = new Set(next.repertoire.custom.map((rep) => rep.id));
  for (const rep of current.repertoire.custom) {
    if (!repertoires.has(rep.id)) lichess.noteDeleted(`rep:${rep.id}`);
  }
  for (const id of Object.keys(current.analyses.items)) {
    if (!(id in next.analyses.items)) lichess.noteDeleted(`ana:${id}`);
  }
}

/** A profile with nothing in it: the base of two devices that were used apart. */
export function emptySyncSnapshot(): SyncSnapshot {
  return {
    progress: emptyProgress(),
    repertoire: { cards: {}, custom: [], sessions: [] },
    analyses: { items: {} },
    games: { games: {}, player: '' },
    settings: {},
  };
}

/**
 * Whether two profiles share history: an id of their `lineage` (made when a
 * profile is first exported or synced), the same puzzle attempt (puzzle and
 * moment), rating point, finished game, rush run or self-review, or the same
 * custom repertoire, saved analysis or puzzle made from a game (by id and
 * when it was made) — what one device can only have from the other, as after
 * restoring its backup. What may have reached both otherwise does not count:
 * games either one sent to Lichess (its sync brings them to its other
 * devices), imported games and puzzles from the Lichess history (both devices
 * may have fetched the same), or a puzzle both made from the same game (its
 * id comes from the position, but each made it at its own moment). The
 * Lichess studies give a repertoire or analysis they bring a new id.
 */
export function shareHistory(a: SyncSnapshot, b: SyncSnapshot): boolean {
  const overlap = (x: readonly string[], y: readonly string[]) => {
    const seen = new Set(x);
    return y.some((key) => seen.has(key));
  };
  const viaLichess = new Set(
    [...a.progress.games, ...b.progress.games].filter((g) => g.lichessId).map((g) => g.id),
  );
  const made = (items: Iterable<{ id: string; createdAt: number }>) =>
    [...items].map((item) => `${item.id}@${item.createdAt}`);
  const attempts = (s: SyncSnapshot) => s.progress.attempts.map((t) => `${t.id}@${t.at}`);
  const points = (s: SyncSnapshot) => s.progress.ratingHistory.map((p) => `${p.at}:${p.rating}`);
  const games = (s: SyncSnapshot) =>
    s.progress.games.filter((g) => !viaLichess.has(g.id)).map((g) => g.id);
  const runs = (s: SyncSnapshot) => s.progress.rushRuns.map((r) => `${r.at}:${r.mode}:${r.score}`);
  const reviews = (s: SyncSnapshot) => s.progress.selfReview.history.map((h) => `${h.at}`);
  const repertoires = (s: SyncSnapshot) => made(s.repertoire.custom);
  const analyses = (s: SyncSnapshot) => made(Object.values(s.analyses.items));
  const own = (s: SyncSnapshot) => made(Object.values(s.progress.ownPuzzles));
  const lineage = (s: SyncSnapshot) => s.progress.lineage;
  return [lineage, attempts, points, games, runs, reviews, repertoires, analyses, own].some(
    (keys) => overlap(keys(a), keys(b)),
  );
}

/** Whether the profile holds anything a learner would miss (joining asks what to do with it). */
export function hasProgress(snapshot: SyncSnapshot = takeSnapshot()): boolean {
  const p = snapshot.progress;
  return (
    p.lifetime.attempts > 0 ||
    p.attempts.length > 0 ||
    Object.keys(p.lessons).length > 0 ||
    p.games.length > 0 ||
    p.trainingDays.length > 0 ||
    Object.keys(snapshot.repertoire.cards).length > 0 ||
    snapshot.repertoire.custom.length > 0 ||
    Object.keys(snapshot.analyses.items).length > 0 ||
    Object.keys(snapshot.games.games).length > 0
  );
}
