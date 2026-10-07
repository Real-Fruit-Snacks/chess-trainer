import { describe, expect, it } from 'vitest';
import {
  addRepertoire,
  deleteAnalysis,
  deleteRepertoire,
  doLessonStep,
  editRepertoire,
  emptySnapshot,
  fixtureSnapshot,
  playArcade,
  reviewRepertoireCard,
  saveAnalysis,
  solvePuzzle,
} from '@/test/syncFixtures';
import { canonical } from './canonical';
import { mergeSnapshots, sameData, type SyncSnapshot, withDeviceFields } from './merge';
import { readSnapshotJson, snapshotJson } from './snapshot';

/** A moment after everything in the fixture. */
const T = 1_791_000_000_000;
const MIN = 60_000;

/** What reading a vault gives back for a snapshot written to it. */
function viaVault(snapshot: SyncSnapshot, generation = 1): SyncSnapshot {
  const read = readSnapshotJson(snapshotJson(snapshot, generation));
  if (!read.ok) throw new Error(read.reason);
  return read.snapshot;
}

const expectSame = (actual: unknown, expected: unknown) =>
  expect(canonical(actual)).toBe(canonical(expected));

const REP = 'custom-muofwy80-fruf';
const ANALYSIS = 'an-muofwy80-b2y86';

describe('mergeSnapshots', () => {
  it('changes nothing when nothing changed', () => {
    const x = fixtureSnapshot();
    expectSame(mergeSnapshots(x, x, x), x);
    expectSame(mergeSnapshots(null, x, x), x);
  });

  it('takes the other side as it is when this side changed nothing', () => {
    const base = fixtureSnapshot();
    let remote = solvePuzzle(base, 'n1', T, 'failed');
    remote = solvePuzzle(remote, 'n2', T + MIN);
    remote = doLessonStep(remote, 'forks', 2, T);
    remote = deleteRepertoire(remote, REP);
    remote = deleteAnalysis(remote, ANALYSIS);
    remote = addRepertoire(remote, 'rep-new', 'Scandinavian', T);
    remote = playArcade(remote, 'fortress', 3, T);
    // A rating started over, which clears the last-rated time.
    remote.progress.puzzleRating = 1500;
    remote.progress.lastRatedAt = null;
    remote.progress.tourDismissed = false;
    expectSame(mergeSnapshots(base, base, remote), remote);
  });

  it('keeps this side as it is when the other side changed nothing', () => {
    const base = fixtureSnapshot();
    let local = solvePuzzle(base, 'n1', T);
    local = editRepertoire(local, REP, '1. d4 d5 2. c4 *');
    local = saveAnalysis(local, 'an-new', 'New idea', T);
    expectSame(mergeSnapshots(base, local, base), local);
  });

  it("adds up both sides' progress", () => {
    const base = fixtureSnapshot();
    let local = base;
    for (let i = 0; i < 2; i++) local = solvePuzzle(local, `l${i}`, T + i * MIN);
    let remote = base;
    for (let i = 0; i < 3; i++) remote = solvePuzzle(remote, `r${i}`, T + 10 * MIN + i * MIN);
    remote = solvePuzzle(remote, 'r-miss', T + 20 * MIN, 'failed', -7);

    const merged = mergeSnapshots(base, local, remote).progress;
    const b = base.progress;
    expect(merged.lifetime.attempts).toBe(b.lifetime.attempts + 6);
    expect(merged.lifetime.solved).toBe(b.lifetime.solved + 5);
    expect(merged.lifetime.failed).toBe(b.lifetime.failed + 1);
    expect(merged.ratedAttempts).toBe(b.ratedAttempts + 6);
    expect(merged.themeStats.fork).toEqual({
      solved: (b.themeStats.fork?.solved ?? 0) + 5,
      failed: (b.themeStats.fork?.failed ?? 0) + 1,
    });
    // Both sides' rating changes count.
    expect(merged.puzzleRating).toBe(b.puzzleRating + 2 * 5 + 3 * 5 - 7);
    // The logs join, newest first, nothing twice.
    expect(merged.attempts.map((a) => a.id).slice(0, 6)).toEqual([
      'r-miss',
      'r2',
      'r1',
      'r0',
      'l1',
      'l0',
    ]);
    expect(merged.attempts).toHaveLength(b.attempts.length + 6);
    expect(merged.ratingHistory).toHaveLength(b.ratingHistory.length + 6);
    expect(merged.ratingHistory.map((p) => p.at)).toEqual(
      [...merged.ratingHistory.map((p) => p.at)].sort((x, y) => x - y),
    );
    expect(merged.puzzleReviews['r-miss']?.lapses).toBe(1);
    expect(merged.lastRatedAt).toBe(T + 20 * MIN);
  });

  it('keeps a rating both devices took from Lichess, rather than adding it twice', () => {
    const base = fixtureSnapshot();
    const fromLichess = (s: SyncSnapshot, at: number) => {
      const next = structuredClone(s);
      next.progress.puzzleRating = 1530;
      next.progress.lastRatedAt = at;
      next.progress.ratingHistory = [...next.progress.ratingHistory, { at, rating: 1530 }];
      return next;
    };
    const a = fromLichess(base, T);
    const b = fromLichess(base, T + MIN);
    expect(mergeSnapshots(base, a, b).progress.puzzleRating).toBe(1530);
    expect(mergeSnapshots(base, b, a).progress.puzzleRating).toBe(1530);
    // And it stays there as the two devices go on syncing.
    const vault = viaVault(mergeSnapshots(base, a, b));
    expect(mergeSnapshots(a, a, vault).progress.puzzleRating).toBe(1530);
    expect(mergeSnapshots(b, fromLichess(b, T + 2 * MIN), vault).progress.puzzleRating).toBe(1530);
  });

  it('joins without a base without counting the shared part twice', () => {
    const shared = fixtureSnapshot();
    const local = solvePuzzle(solvePuzzle(shared, 'l0', T), 'l1', T + MIN);
    const remote = solvePuzzle(shared, 'r0', T + 2 * MIN);
    const merged = mergeSnapshots(null, local, remote).progress;
    // Nothing tells what was shared: the larger count stands, and the logs join.
    expect(merged.lifetime.attempts).toBe(shared.progress.lifetime.attempts + 2);
    expect(merged.attempts.map((a) => a.id)).toEqual(
      expect.arrayContaining(['l0', 'l1', 'r0', ...shared.progress.attempts.map((a) => a.id)]),
    );
    expect(merged.attempts).toHaveLength(shared.progress.attempts.length + 3);
  });

  it('carries deletions over, unless the other side changed the item since', () => {
    const base = fixtureSnapshot();
    const deleted = deleteAnalysis(deleteRepertoire(base, REP), ANALYSIS);
    const merged = mergeSnapshots(base, deleted, base);
    expect(merged.repertoire.custom.map((r) => r.id)).not.toContain(REP);
    expect(merged.analyses.items[ANALYSIS]).toBeUndefined();

    const edited = saveAnalysis(editRepertoire(base, REP, '1. d4 *'), ANALYSIS, 'Renamed', T);
    const kept = mergeSnapshots(base, deleted, edited);
    expect(kept.repertoire.custom.find((r) => r.id === REP)?.pgn).toBe('1. d4 *');
    expect(kept.analyses.items[ANALYSIS]?.name).toBe('Renamed');
  });

  it('keeps both versions of a repertoire edited on both sides, the same way on each device', () => {
    const base = fixtureSnapshot();
    const a = editRepertoire(base, REP, '1. d4 d5 2. Bf4 Nf6 *');
    const b = editRepertoire(base, REP, '1. d4 d5 2. Nf3 *');
    const onA = mergeSnapshots(base, a, b);
    const onB = mergeSnapshots(base, b, a);
    expectSame(onA.repertoire, onB.repertoire);
    const reps = onA.repertoire.custom;
    expect(reps).toHaveLength(2);
    expect(reps.map((r) => r.pgn).sort()).toEqual(['1. d4 d5 2. Bf4 Nf6 *', '1. d4 d5 2. Nf3 *']);
    const copy = reps.find((r) => r.id !== REP);
    expect(copy?.id).toMatch(new RegExp(`^${REP}~[0-9a-z]+$`));
    expect(copy?.name).toBe('My London (other device)');
  });

  it('keeps both versions of an analysis edited on both sides; the later edit keeps the id', () => {
    const base = fixtureSnapshot();
    const a = saveAnalysis(base, ANALYSIS, 'Edited first', T);
    const b = saveAnalysis(base, ANALYSIS, 'Edited later', T + MIN);
    const merged = mergeSnapshots(base, a, b).analyses.items;
    expect(merged[ANALYSIS]?.name).toBe('Edited later');
    const copies = Object.values(merged).filter((x) => x.id.startsWith(`${ANALYSIS}~`));
    expect(copies.map((x) => x.name)).toEqual(['Edited first (other device)']);
    expectSame(mergeSnapshots(base, b, a).analyses, { items: merged });
  });

  it('keeps the review that asks for more: more misses in the puzzle queue, the latest for repertoire cards', () => {
    const base = fixtureSnapshot();
    const card = base.progress.puzzleReviews.def34;
    if (!card) throw new Error('fixture changed');
    const a = structuredClone(base);
    a.progress.puzzleReviews.def34 = { ...card, step: 2, due: card.due + 5 * 86_400_000 };
    const b = structuredClone(base);
    b.progress.puzzleReviews.def34 = { ...card, lapses: 2, due: card.due + 86_400_000 };
    expect(mergeSnapshots(base, a, b).progress.puzzleReviews.def34?.lapses).toBe(2);
    expect(mergeSnapshots(base, b, a).progress.puzzleReviews.def34?.lapses).toBe(2);

    const x = reviewRepertoireCard(base, 'italian|3', T, 0);
    const y = reviewRepertoireCard(base, 'italian|3', T + MIN, 1);
    expect(mergeSnapshots(base, x, y).repertoire.cards['italian|3']?.lastReviewed).toBe(T + MIN);
    expect(mergeSnapshots(base, y, x).repertoire.cards['italian|3']?.lastReviewed).toBe(T + MIN);
  });

  it('joins the steps of a lesson done on both sides', () => {
    const base = fixtureSnapshot();
    const a = doLessonStep(base, 'forks', 2, T);
    const b = doLessonStep(base, 'forks', 3, T + MIN);
    const lesson = mergeSnapshots(base, a, b).progress.lessons.forks;
    expect(lesson?.stepsDone).toEqual([0, 1, 2, 3]);
    expect(lesson?.lastVisitedAt).toBe(T + MIN);
  });

  it('adds up plays and keeps the best score', () => {
    const base = fixtureSnapshot();
    const a = playArcade(playArcade(base, 'fortress', 20, T), 'fortress', 2, T + MIN);
    const b = playArcade(base, 'fortress', 15, T + 2 * MIN);
    const fortress = mergeSnapshots(base, a, b).progress.arcade.fortress;
    expect(fortress).toMatchObject({ best: 20, plays: 4, lastAt: T + 2 * MIN });
  });

  it("keeps each device's own backup reminder out of the comparison", () => {
    const base = fixtureSnapshot();
    const local = structuredClone(base);
    local.progress.lastBackupAt = 1;
    const remote = structuredClone(base);
    remote.progress.lastBackupAt = 2;
    remote.progress.lastBackupAttempts = 40;
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.progress.lastBackupAt).toBe(1);
    expect(merged.progress.lastBackupAttempts).toBe(base.progress.lastBackupAttempts);
    expect(sameData(merged, remote)).toBe(true);
    expect(sameData(solvePuzzle(merged, 'n', T), remote)).toBe(false);
    expect(withDeviceFields(remote, local).progress.lastBackupAt).toBe(1);
  });

  it('keeps fields this version does not know, as this device has them', () => {
    const base = fixtureSnapshot();
    const local = structuredClone(base);
    (local.progress as unknown as Record<string, unknown>).fromTheFuture = { kept: true };
    const merged = mergeSnapshots(base, local, solvePuzzle(base, 'n', T));
    expect((merged.progress as unknown as Record<string, unknown>).fromTheFuture).toEqual({
      kept: true,
    });
  });

  it('comes through the vault unchanged', () => {
    const x = fixtureSnapshot();
    expectSame(viaVault(x), x);
    const merged = mergeSnapshots(
      x,
      addRepertoire(solvePuzzle(x, 'a', T), 'rep-a', 'A', T),
      saveAnalysis(editRepertoire(solvePuzzle(x, 'b', T + MIN), REP, '1. c4 *'), 'an-b', 'B', T),
    );
    expectSame(viaVault(merged), merged);
    expectSame(viaVault(emptySnapshot()), emptySnapshot());
  });
});

/* ------------------------------------------------------------------ */
/* Two devices, one vault                                             */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Device {
  local: SyncSnapshot;
  base: SyncSnapshot | null;
  generation: number;
}

interface Vault {
  snapshot: SyncSnapshot;
  generation: number;
}

/** One sync, as deviceSync.ts runs it: merge with the vault, write back what it lacks. */
function sync(device: Device, vault: Vault): boolean {
  expect(vault.generation).toBeGreaterThanOrEqual(device.generation);
  const remote = vault.snapshot;
  const merged = mergeSnapshots(device.base, device.local, remote);
  device.local = merged;
  device.base = remote;
  device.generation = vault.generation;
  if (sameData(merged, remote)) return false;
  vault.generation += 1;
  vault.snapshot = viaVault(merged, vault.generation);
  device.base = merged;
  device.generation = vault.generation;
  return true;
}

describe('two devices syncing through one vault', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
    'agree, with nothing lost, after random use (seed %i)',
    (seed) => {
      const random = mulberry32(seed);
      const pickOne = <T>(list: readonly T[]): T | undefined =>
        list[Math.floor(random() * list.length)];

      // A turns sync on with its profile; B joins and replaces its empty one.
      const start = fixtureSnapshot();
      const vault: Vault = { snapshot: viaVault(start), generation: 1 };
      const a: Device = { local: start, base: start, generation: 1 };
      const b: Device = { local: vault.snapshot, base: vault.snapshot, generation: 1 };
      const devices = [a, b];

      let n = 0;
      let solves = 0;
      let plays = 0;
      const added = new Set<string>();
      const deleted = new Set<string>();
      for (let step = 0; step < 50; step++) {
        const device = pickOne(devices) ?? a;
        const at = T + ++n * MIN;
        const roll = random();
        if (roll < 0.3) {
          device.local = solvePuzzle(
            device.local,
            `p${n}`,
            at,
            random() < 0.7 ? 'solved' : 'failed',
          );
          solves++;
        } else if (roll < 0.4) {
          device.local = doLessonStep(device.local, 'forks', Math.floor(random() * 8), at);
        } else if (roll < 0.5) {
          device.local = playArcade(device.local, 'fortress', Math.floor(random() * 30), at);
          plays++;
        } else if (roll < 0.55) {
          device.local = addRepertoire(device.local, `rep-${n}`, `Line ${n}`, at);
          added.add(`rep-${n}`);
        } else if (roll < 0.62) {
          const rep = pickOne(device.local.repertoire.custom);
          if (rep) device.local = editRepertoire(device.local, rep.id, `1. e4 c5 ${n} *`);
        } else if (roll < 0.65) {
          const rep = pickOne(device.local.repertoire.custom);
          if (rep) {
            device.local = deleteRepertoire(device.local, rep.id);
            deleted.add(rep.id);
          }
        } else if (roll < 0.72) {
          const id = pickOne([...Object.keys(device.local.analyses.items), `an-${n}`]) ?? `an-${n}`;
          device.local = saveAnalysis(device.local, id, `Analysis ${n}`, at);
        } else if (roll < 0.75) {
          const id = pickOne(Object.keys(device.local.analyses.items));
          if (id) device.local = deleteAnalysis(device.local, id);
        } else if (roll < 0.8) {
          device.local = reviewRepertoireCard(
            device.local,
            `italian|${Math.floor(random() * 4)}`,
            at,
            Math.floor(random() * 2),
          );
        } else {
          sync(device, vault);
        }
      }

      // Both sync until neither has anything to send: a few rounds at most.
      let rounds = 0;
      for (;;) {
        const wrote = [sync(a, vault), sync(b, vault)];
        rounds++;
        if (!wrote.includes(true)) break;
        expect(rounds).toBeLessThan(4);
      }
      expect(sameData(a.local, b.local)).toBe(true);
      expect(sameData(a.local, vault.snapshot)).toBe(true);

      // Every puzzle and every play counted once.
      const p = vault.snapshot.progress;
      expect(p.lifetime.attempts).toBe(start.progress.lifetime.attempts + solves);
      expect(p.ratedAttempts).toBe(start.progress.ratedAttempts + solves);
      expect(p.arcade.fortress?.plays ?? 0).toBe(
        (start.progress.arcade.fortress?.plays ?? 0) + plays,
      );
      expect(p.attempts).toHaveLength(start.progress.attempts.length + solves);
      // Repertoires added and never deleted anywhere are all there.
      const ids = new Set(vault.snapshot.repertoire.custom.map((r) => r.id));
      for (const id of added) if (!deleted.has(id)) expect(ids.has(id)).toBe(true);
    },
  );
});
