/**
 * Test helpers for device sync: a realistic profile (the v10 backup fixture)
 * and the changes a learner makes on one device, applied to a snapshot the
 * way the stores apply them. Used by the merge, snapshot and sync tests only.
 */
import backupV10 from '@/store/fixtures/backup-v10.json';
import type { SyncSnapshot } from '@/lib/sync/merge';
import { readSnapshotJson } from '@/lib/sync/snapshot';

/** The fixture profile as a sync snapshot, read the way a vault is read. */
export function fixtureSnapshot(): SyncSnapshot {
  const read = readSnapshotJson(JSON.stringify(backupV10));
  if (!read.ok) throw new Error(read.reason);
  // The fixture lists its attempts oldest first; the store keeps the newest first.
  read.snapshot.progress.attempts.sort((x, y) => y.at - x.at);
  return read.snapshot;
}

/** A profile with nothing in it. */
export function emptySnapshot(): SyncSnapshot {
  const read = readSnapshotJson(
    JSON.stringify({ app: 'chess-trainer', version: 10, progress: { onboarded: false } }),
  );
  if (!read.ok) throw new Error(read.reason);
  return read.snapshot;
}

const clone = <T>(value: T): T => structuredClone(value);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/** A rated puzzle attempt, as `recordPuzzle` records it (the rating moves by `delta`). */
export function solvePuzzle(
  s: SyncSnapshot,
  id: string,
  at: number,
  outcome: 'solved' | 'failed' = 'solved',
  delta = outcome === 'solved' ? 5 : -5,
): SyncSnapshot {
  const next = clone(s);
  const p = next.progress;
  const before = p.puzzleRating;
  p.puzzleRating = before + delta;
  p.lastRatedAt = at;
  p.ratedAttempts += 1;
  p.ratingHistory = [...p.ratingHistory, { at, rating: p.puzzleRating }];
  p.attempts = [
    {
      id,
      puzzleRating: 1300,
      outcome,
      hintUsed: false,
      ratingBefore: before,
      ratingAfter: p.puzzleRating,
      themes: 'fork short',
      at,
      durationMs: 10_000,
    },
    ...p.attempts,
  ];
  p.lifetime = {
    ...p.lifetime,
    attempts: p.lifetime.attempts + 1,
    solved: p.lifetime.solved + (outcome === 'solved' ? 1 : 0),
    failed: p.lifetime.failed + (outcome === 'failed' ? 1 : 0),
    solveTimeMs: p.lifetime.solveTimeMs + (outcome === 'solved' ? 10_000 : 0),
  };
  p.seen = { ...p.seen, [id]: outcome };
  const fork = p.themeStats.fork ?? { solved: 0, failed: 0 };
  p.themeStats = {
    ...p.themeStats,
    fork: {
      solved: fork.solved + (outcome === 'solved' ? 1 : 0),
      failed: fork.failed + (outcome === 'failed' ? 1 : 0),
    },
  };
  if (!p.trainingDays.includes(day(at))) p.trainingDays = [...p.trainingDays, day(at)].sort();
  if (outcome === 'failed') {
    p.puzzleReviews = {
      ...p.puzzleReviews,
      [id]: {
        id,
        rating: 1300,
        themes: 'fork short',
        step: 0,
        due: at + 86_400_000,
        lapses: 1,
        addedAt: at,
      },
    };
  }
  return next;
}

/** A step of a lesson done. */
export function doLessonStep(
  s: SyncSnapshot,
  lessonId: string,
  step: number,
  at: number,
): SyncSnapshot {
  const next = clone(s);
  const lesson = next.progress.lessons[lessonId] ?? {
    stepsDone: [],
    completedAt: null,
    lastVisitedAt: at,
  };
  next.progress.lessons = {
    ...next.progress.lessons,
    [lessonId]: {
      ...lesson,
      stepsDone: lesson.stepsDone.includes(step) ? lesson.stepsDone : [...lesson.stepsDone, step],
      lastVisitedAt: at,
    },
  };
  return next;
}

/** A play of an arcade game. */
export function playArcade(s: SyncSnapshot, game: string, score: number, at: number): SyncSnapshot {
  const next = clone(s);
  const was = next.progress.arcade[game];
  next.progress.arcade = {
    ...next.progress.arcade,
    [game]: {
      best: Math.max(was?.best ?? 0, score),
      plays: (was?.plays ?? 0) + 1,
      lastAt: at,
      ...(was?.detail ? { detail: was.detail } : {}),
    },
  };
  return next;
}

export function addRepertoire(s: SyncSnapshot, id: string, name: string, at: number): SyncSnapshot {
  const next = clone(s);
  next.repertoire.custom = [
    ...next.repertoire.custom,
    { id, name, color: 'white', pgn: '1. e4 e5 *', createdAt: at },
  ];
  return next;
}

export function editRepertoire(s: SyncSnapshot, id: string, pgn: string): SyncSnapshot {
  const next = clone(s);
  next.repertoire.custom = next.repertoire.custom.map((r) => (r.id === id ? { ...r, pgn } : r));
  return next;
}

export function deleteRepertoire(s: SyncSnapshot, id: string): SyncSnapshot {
  const next = clone(s);
  next.repertoire.custom = next.repertoire.custom.filter((r) => r.id !== id);
  next.repertoire.cards = Object.fromEntries(
    Object.entries(next.repertoire.cards).filter(([key]) => !key.startsWith(`${id}|`)),
  );
  return next;
}

/** A repertoire card reviewed. */
export function reviewRepertoireCard(
  s: SyncSnapshot,
  key: string,
  at: number,
  lapses = 0,
): SyncSnapshot {
  const next = clone(s);
  next.repertoire.cards = {
    ...next.repertoire.cards,
    [key]: { ease: 2.5, interval: 1, due: at + 86_400_000, reps: 1, lapses, lastReviewed: at },
  };
  return next;
}

export function saveAnalysis(s: SyncSnapshot, id: string, name: string, at: number): SyncSnapshot {
  const next = clone(s);
  const was = next.analyses.items[id];
  next.analyses.items = {
    ...next.analyses.items,
    [id]: {
      id,
      name,
      collection: 'My analyses',
      pgn: '1. d4 d5 *',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: 2,
      createdAt: was?.createdAt ?? at,
      updatedAt: at,
    },
  };
  return next;
}

export function deleteAnalysis(s: SyncSnapshot, id: string): SyncSnapshot {
  const next = clone(s);
  const items = { ...next.analyses.items };
  delete items[id];
  next.analyses.items = items;
  return next;
}
