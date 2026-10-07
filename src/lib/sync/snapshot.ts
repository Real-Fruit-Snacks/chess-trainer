import { useAnalyses } from '@/store/analyses';
import { EXPORT_VERSION, validateBackupFile } from '@/store/backupSchema';
import { useGames } from '@/store/games';
import { useLichess } from '@/store/lichess';
import {
  emptyProgress,
  type PersistedProgress,
  useProgress,
  withRatingDefaults,
} from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { same } from './canonical';
import type { SyncSnapshot } from './merge';

/**
 * What device sync carries: the profile's four data stores — progress, the
 * opening repertoires, the analysis library and the imported games — exactly
 * what a backup holds. In the vault the snapshot is a backup file, so a
 * decrypted vault could be imported like any other. Settings, the Lichess
 * connection and the sync's own state stay on each device.
 */

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
  };
}

/**
 * The snapshot as the vault keeps it: a backup file's JSON, plus the vault's
 * generation — one more with every write. It is sealed with the data, so the
 * relay cannot pass off an older copy as the current one: a device that has
 * seen generation 7 refuses a 6 (see deviceSync.ts).
 */
export function snapshotJson(snapshot: SyncSnapshot, generation: number, now = new Date()): string {
  return JSON.stringify({
    app: 'chess-trainer',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    sync: { generation },
    ...snapshot,
  });
}

export type ReadSnapshot =
  | { ok: true; snapshot: SyncSnapshot; generation: number }
  | { ok: false; newer: boolean; reason: string };

/** The generation a vault's JSON carries (0 when it has none). */
function generationOf(raw: unknown): number {
  const sync = (raw as { sync?: { generation?: unknown } } | null)?.sync;
  const generation = sync?.generation;
  return typeof generation === 'number' && Number.isSafeInteger(generation) && generation > 0
    ? generation
    : 0;
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
  return {
    ok: true,
    generation: generationOf(raw),
    snapshot: {
      progress: { ...emptyProgress(), ...withRatingDefaults(shape.progress) },
      repertoire: { cards: {}, custom: [], sessions: [], ...shape.repertoire },
      analyses: { items: shape.analyses?.items ?? {} },
      games: { games: shape.games?.games ?? {}, player: shape.games?.player ?? '' },
    },
  };
}

/**
 * Puts a merged snapshot into the stores — only the ones it changes. Custom
 * repertoires and analyses another device deleted are noted for the Lichess
 * studies, so a chapter that holds one goes too instead of bringing it back.
 */
export function applySnapshot(next: SyncSnapshot, current: SyncSnapshot): void {
  if (!same(next.progress, current.progress)) useProgress.setState(next.progress);
  if (!same(next.repertoire, current.repertoire)) {
    useRepertoire.getState().replaceState(next.repertoire);
  }
  if (!same(next.analyses, current.analyses)) useAnalyses.getState().replaceState(next.analyses);
  if (!same(next.games, current.games)) useGames.getState().replaceState(next.games);
  const lichess = useLichess.getState();
  const repertoires = new Set(next.repertoire.custom.map((rep) => rep.id));
  for (const rep of current.repertoire.custom) {
    if (!repertoires.has(rep.id)) lichess.noteDeleted(`rep:${rep.id}`);
  }
  for (const id of Object.keys(current.analyses.items)) {
    if (!(id in next.analyses.items)) lichess.noteDeleted(`ana:${id}`);
  }
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
