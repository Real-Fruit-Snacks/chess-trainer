import type { LessonProgress } from '@/store/progress';
import { LEARNER_SETTING_KEYS } from '@/store/settings';
import { same } from './canonical';
import { sameData, type SyncSnapshot } from './merge';
import type { SyncPart } from './parts';

/**
 * What a learner would count in what device sync keeps in step: how much a
 * profile holds (`syncTotals`), and how much one version of the data adds to
 * another (`syncChanges`): what a sync brought in, or sent.
 */

/** The kinds counted, in the order they are listed. */
export const SYNC_KINDS = [
  'puzzles',
  'lessons',
  'repertoires',
  'moves',
  'analyses',
  'games',
] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];
export type SyncCounts = Record<SyncKind, number>;

/** The part of the profile each kind belongs to (each part can be kept to a device). */
export const KIND_PART: Record<SyncKind, SyncPart> = {
  puzzles: 'progress',
  lessons: 'progress',
  repertoires: 'repertoire',
  moves: 'repertoire',
  analyses: 'analyses',
  games: 'games',
};

/** Lessons completed (marked done included). */
export const completedLessons = (lessons: Record<string, LessonProgress>): number =>
  Object.values(lessons).filter((lesson) => lesson.completedAt !== null).length;

/**
 * What a profile holds: puzzles played, lessons completed, repertoires of its
 * own, repertoire moves in review, saved analyses and imported games. The
 * parts in `off` (kept to the device) count none.
 */
export function syncTotals(
  snapshot: SyncSnapshot,
  off: ReadonlySet<SyncPart> = new Set(),
): SyncCounts {
  const { progress, repertoire, analyses, games } = snapshot;
  const totals: SyncCounts = {
    puzzles: progress.lifetime.attempts,
    lessons: completedLessons(progress.lessons),
    repertoires: repertoire.custom.length,
    moves: Object.keys(repertoire.cards).length,
    analyses: Object.keys(analyses.items).length,
    games: Object.keys(games.games).length,
  };
  for (const kind of SYNC_KINDS) if (off.has(KIND_PART[kind])) totals[kind] = 0;
  return totals;
}

/** What one version of the data has that another has not. */
export interface SyncChanges {
  /**
   * New or changed, by kind: puzzles played, lessons worked on, repertoires,
   * repertoire moves reviewed, analyses and imported games new or edited.
   */
  changed: SyncCounts;
  /** Settings changed. */
  settings: number;
  /** Lessons, repertoires, repertoire moves, analyses and imported games gone. */
  removed: number;
  /** Anything else changed (a rating, a drill, the review queue…). */
  other: boolean;
}

function newOrChanged(before: Record<string, unknown>, after: Record<string, unknown>): number {
  let n = 0;
  for (const [id, item] of Object.entries(after)) {
    if (!(id in before) || !same(before[id], item)) n++;
  }
  return n;
}

function gone(before: Record<string, unknown>, after: Record<string, unknown>): number {
  let n = 0;
  for (const id of Object.keys(before)) if (!(id in after)) n++;
  return n;
}

const byId = <T extends { id: string }>(list: readonly T[]): Record<string, T> =>
  Object.fromEntries(list.map((item) => [item.id, item]));

/** What `after` has that `before` has not. */
export function syncChanges(before: SyncSnapshot, after: SyncSnapshot): SyncChanges {
  const pairs: [Record<string, unknown>, Record<string, unknown>][] = [
    [before.progress.lessons, after.progress.lessons],
    [byId(before.repertoire.custom), byId(after.repertoire.custom)],
    [before.repertoire.cards, after.repertoire.cards],
    [before.analyses.items, after.analyses.items],
    [before.games.games, after.games.games],
  ];
  const [lessons, repertoires, moves, analyses, games] = pairs.map(([b, a]) => newOrChanged(b, a));
  const changed: SyncCounts = {
    puzzles: Math.max(0, after.progress.lifetime.attempts - before.progress.lifetime.attempts),
    lessons: lessons ?? 0,
    repertoires: repertoires ?? 0,
    moves: moves ?? 0,
    analyses: analyses ?? 0,
    games: games ?? 0,
  };
  const removed = pairs.reduce((sum, [b, a]) => sum + gone(b, a), 0);
  const settings = LEARNER_SETTING_KEYS.filter(
    (key) => after.settings[key] !== undefined && !same(before.settings[key], after.settings[key]),
  ).length;
  const counted = removed > 0 || SYNC_KINDS.some((kind) => changed[kind] > 0);
  // Something uncounted only matters when nothing counted changed (a rating moves with puzzles).
  // The settings are counted on their own.
  const other = !counted && !sameData({ ...before, settings: {} }, { ...after, settings: {} });
  return { changed, settings, removed, other };
}

/** Whether nothing changed at all. */
export const nothingChanged = (changes: SyncChanges): boolean =>
  !changes.other &&
  changes.settings === 0 &&
  changes.removed === 0 &&
  SYNC_KINDS.every((kind) => changes.changed[kind] === 0);

/** The changes, or null when there are none. */
export const changesOrNull = (changes: SyncChanges): SyncChanges | null =>
  nothingChanged(changes) ? null : changes;

/** Two sets of changes as one (the rounds of a run that met other devices' writes). */
export function addChanges(a: SyncChanges | null, b: SyncChanges | null): SyncChanges | null {
  if (!a) return b;
  if (!b) return a;
  const changed = { ...a.changed };
  for (const kind of SYNC_KINDS) changed[kind] += b.changed[kind];
  return {
    changed,
    settings: a.settings + b.settings,
    removed: a.removed + b.removed,
    other: a.other || b.other,
  };
}
