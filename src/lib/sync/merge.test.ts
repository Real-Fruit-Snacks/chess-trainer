import { describe, expect, it } from 'vitest';
import { trainingStreak } from '@/lib/dates';
import {
  addRepertoire,
  changeSettings,
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
import {
  baseOf,
  mergeParts,
  mergeSnapshots,
  sameData,
  type SyncSnapshot,
  withDeviceFields,
} from './merge';
import { emptySyncSnapshot, readSnapshotJson, snapshotJson } from './snapshot';

/** A moment after everything in the fixture. */
const T = 1_791_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

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

  it('takes every field the other side changed, one by one', () => {
    // A field the merge forgot would keep this device's value, and never take another's.
    const empty = emptySnapshot();
    const full = fixtureSnapshot();
    const merged = mergeSnapshots(empty, empty, full);
    const device = new Set<string>(['lastBackupAt', 'lastBackupAttempts', 'backupSnoozedUntil']);
    const fields = (p: object) => p as Record<string, unknown>;
    for (const key of Object.keys(full.progress)) {
      const expected = device.has(key) ? fields(empty.progress)[key] : fields(full.progress)[key];
      expect(canonical(fields(merged.progress)[key]), key).toBe(canonical(expected));
    }
    expectSame(merged.repertoire, full.repertoire);
    expectSame(merged.analyses, full.analyses);
    expectSame(merged.games, full.games);
  });

  it('takes the other side emptied, but for the logs, which only grow', () => {
    const empty = emptySnapshot();
    const full = fixtureSnapshot();
    const merged = mergeSnapshots(full, full, empty);
    const p = merged.progress;
    const fields = (x: object) => x as Record<string, unknown>;
    // Logs keep what either side had; the device's own fields stay; the store's repair
    // keeps the counts up with the logs (lifetime with the attempts, the best streak
    // with the training days).
    const logs = ['ratingHistory', 'attempts', 'games', 'rushRuns', 'trainingDays'];
    const device = ['lastBackupAt', 'lastBackupAttempts', 'backupSnoozedUntil'];
    const derived = ['lifetime', 'bestStreak', 'selfReview'];
    for (const key of Object.keys(full.progress)) {
      if (derived.includes(key)) continue;
      const expected = [...logs, ...device].includes(key) ? full.progress : empty.progress;
      expect(canonical(fields(p)[key]), key).toBe(canonical(fields(expected)[key]));
    }
    expect(p.lifetime.attempts).toBe(full.progress.attempts.length);
    expect(p.bestStreak).toBe(trainingStreak(full.progress.trainingDays).best);
    expect(p.selfReview).toEqual({
      ...empty.progress.selfReview,
      history: full.progress.selfReview.history,
    });
    expectSame(merged.repertoire, { ...empty.repertoire, sessions: full.repertoire.sessions });
    expectSame(merged.analyses, empty.analyses);
    expectSame(merged.games, empty.games);
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

  it('joins two devices used apart: their counts add up, and the last-rated rating stays', () => {
    let phone = emptySnapshot();
    for (let i = 0; i < 3; i++) phone = solvePuzzle(phone, `p${i}`, T + i * MIN);
    phone = playArcade(phone, 'fortress', 9, T);
    let laptop = emptySnapshot();
    for (let i = 0; i < 2; i++) {
      laptop = solvePuzzle(laptop, `l${i}`, T + HOUR + i * MIN, 'solved', 20);
    }
    laptop = playArcade(laptop, 'fortress', 4, T + HOUR);
    const onPhone = mergeSnapshots(emptySyncSnapshot(), phone, laptop, { independent: true });
    const onLaptop = mergeSnapshots(emptySyncSnapshot(), laptop, phone, { independent: true });
    expectSame(onPhone, onLaptop);
    const p = onPhone.progress;
    expect(p.lifetime.attempts).toBe(5);
    expect(p.ratedAttempts).toBe(5);
    expect(p.themeStats.fork?.solved).toBe(5);
    expect(p.attempts).toHaveLength(5);
    expect(p.arcade.fortress).toMatchObject({ best: 9, plays: 2 });
    // The laptop rated last: its rating, and only its rating's history.
    expect(p.puzzleRating).toBe(laptop.progress.puzzleRating);
    expect(p.ratingHistory).toEqual(laptop.progress.ratingHistory);
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

  it('adds up what both sides added alike: one fork puzzle, one play, one drill each', () => {
    const base = fixtureSnapshot();
    const fork = base.progress.themeStats.fork ?? { solved: 0, failed: 0 };
    const once = (s: SyncSnapshot, id: string, at: number) => {
      const next = playArcade(solvePuzzle(s, id, at), 'fortress', 3, T);
      const p = next.progress;
      const drill = p.drills['knight-tour'];
      p.drills = {
        ...p.drills,
        'knight-tour': { best: 9, attempts: (drill?.attempts ?? 0) + 1, lastAt: T },
      };
      const study = p.studies['study-1'];
      p.studies = {
        ...p.studies,
        'study-1': { solvedAt: T, attempts: (study?.attempts ?? 0) + 1, clean: true },
      };
      const rung = p.oddsLadder.results[0] ?? { wins: 0, losses: 0, draws: 0 };
      p.oddsLadder = {
        ...p.oddsLadder,
        results: { ...p.oddsLadder.results, 0: { ...rung, wins: rung.wins + 1 } },
      };
      return next;
    };
    // The same changes on both devices, made apart: two of each, not one.
    const merged = mergeSnapshots(
      base,
      once(base, 'phone-1', T),
      once(base, 'laptop-1', T),
    ).progress;
    expect(merged.themeStats.fork).toEqual({ solved: fork.solved + 2, failed: fork.failed });
    expect(merged.arcade.fortress?.plays).toBe((base.progress.arcade.fortress?.plays ?? 0) + 2);
    expect(merged.drills['knight-tour']?.attempts).toBe(
      (base.progress.drills['knight-tour']?.attempts ?? 0) + 2,
    );
    expect(merged.studies['study-1']?.attempts).toBe(
      (base.progress.studies['study-1']?.attempts ?? 0) + 2,
    );
    expect(merged.oddsLadder.results[0]?.wins).toBe(
      (base.progress.oddsLadder.results[0]?.wins ?? 0) + 2,
    );
  });

  it('counts a round from the Lichess history once, though both devices brought it in', () => {
    const base = fixtureSnapshot();
    const fork = base.progress.themeStats.fork ?? { solved: 0, failed: 0 };
    const rounds = [
      { id: 'LcH01', at: T, win: true, themes: 'fork short' },
      { id: 'LcH02', at: T + 1000, win: false, themes: 'fork long' },
    ];
    /** What `mergeLichessRounds` does with the rounds on one device. */
    const bring = (s: SyncSnapshot): SyncSnapshot => {
      const next = structuredClone(s);
      const p = next.progress;
      for (const round of rounds) {
        p.seen = { ...p.seen, [round.id]: round.win ? 'solved' : 'failed' };
        const stat = p.themeStats.fork ?? { solved: 0, failed: 0 };
        p.themeStats = {
          ...p.themeStats,
          fork: round.win
            ? { ...stat, solved: stat.solved + 1 }
            : { ...stat, failed: stat.failed + 1 },
        };
      }
      p.lichessRounds = [...p.lichessRounds, ...rounds];
      return next;
    };
    const laptop = bring(base);
    const phone = bring(base);
    const merged = mergeSnapshots(base, phone, laptop).progress;
    expect(merged.themeStats.fork).toEqual({ solved: fork.solved + 1, failed: fork.failed + 1 });
    expect(merged.lichessRounds.map((r) => r.id)).toEqual(['LcH01', 'LcH02']);
    // With a puzzle solved in the app on the phone too: that one adds up.
    const busy = mergeSnapshots(base, solvePuzzle(bring(base), 'app-1', T + 5000), laptop).progress;
    expect(busy.themeStats.fork).toEqual({ solved: fork.solved + 2, failed: fork.failed + 1 });
    // A round the laptop brought from Lichess that the phone played in the app (and sent
    // there): one round.
    const played = solvePuzzle(base, 'LcH01', T);
    const broughtOne = structuredClone(base);
    broughtOne.progress.seen = { ...broughtOne.progress.seen, LcH01: 'solved' };
    broughtOne.progress.themeStats = {
      ...broughtOne.progress.themeStats,
      fork: { solved: fork.solved + 1, failed: fork.failed },
    };
    broughtOne.progress.lichessRounds = [rounds[0]!];
    const once = mergeSnapshots(base, played, broughtOne).progress;
    expect(once.themeStats.fork).toEqual({ solved: fork.solved + 1, failed: fork.failed });
    // And merged in either order, the same.
    expectSame(mergeSnapshots(base, laptop, phone), mergeSnapshots(base, phone, laptop));
  });

  it('keeps every history merged into the profile', () => {
    const base = fixtureSnapshot();
    const a = structuredClone(base);
    const b = structuredClone(base);
    a.progress.lineage = ['profile-b2', 'profile-a1'];
    b.progress.lineage = ['profile-c3'];
    expect(mergeSnapshots(base, a, b).progress.lineage).toEqual([
      'profile-a1',
      'profile-b2',
      'profile-c3',
    ]);
    expect(mergeSnapshots(null, b, a).progress.lineage).toEqual([
      'profile-a1',
      'profile-b2',
      'profile-c3',
    ]);
  });

  it('gives the same answer whichever side is this device', () => {
    const base = fixtureSnapshot();
    const a = structuredClone(base);
    const b = structuredClone(base);
    a.progress.lichessUsername = 'alice_phone';
    b.progress.lichessUsername = 'alice_laptop';
    a.progress.chesscomUsername = 'alice1';
    b.progress.chesscomUsername = 'alice2';
    a.games.player = 'Alice';
    b.games.player = 'alice';
    a.progress.threatStats.recent = [...base.progress.threatStats.recent, 't-a'];
    b.progress.threatStats.recent = [...base.progress.threatStats.recent, 't-b'];
    expectSame(mergeSnapshots(base, a, b), mergeSnapshots(base, b, a));
    expectSame(mergeSnapshots(null, a, b), mergeSnapshots(null, b, a));
  });

  it('keeps this device’s version of an item a backup brought in changed, and the backup’s as a copy', () => {
    const base = fixtureSnapshot();
    for (const [mine, theirs] of [
      ['1. e4 e5 2. Nf3 *', '1. d4 d5 *'],
      ['1. d4 d5 *', '1. e4 e5 2. Nf3 *'],
    ] as const) {
      const here = editRepertoire(base, REP, mine);
      const backup = editRepertoire(base, REP, theirs);
      const custom = mergeSnapshots(null, here, backup, { incoming: 'backup' }).repertoire.custom;
      const kept = custom.find((r) => r.id === REP);
      const copy = custom.find((r) => r.id.startsWith(`${REP}~`));
      expect(kept?.pgn).toBe(mine);
      expect(copy?.pgn).toBe(theirs);
      expect(copy?.name).toBe(`${kept?.name} (backup)`);
    }
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

describe('merging the settings', () => {
  const base = changeSettings(fixtureSnapshot(), {
    boardTheme: 'brown',
    pieceSet: 'classic',
    sounds: true,
  });

  it("takes this device's change to a setting the relay kept as it was", () => {
    const local = changeSettings(base, { boardTheme: 'blue' });
    expect(mergeSnapshots(base, local, base).settings).toEqual(local.settings);
  });

  it("takes the relay's change, and the relay's value when both changed one", () => {
    const local = changeSettings(base, { boardTheme: 'blue' });
    const remote = changeSettings(base, { boardTheme: 'green', sounds: false });
    expect(mergeSnapshots(base, local, remote).settings).toEqual(remote.settings);
  });

  it('keeps changes to different settings from both sides', () => {
    const local = changeSettings(base, { boardTheme: 'blue' });
    const remote = changeSettings(base, { pieceSet: 'merida' });
    expect(mergeSnapshots(base, local, remote).settings).toEqual({
      ...base.settings,
      boardTheme: 'blue',
      pieceSet: 'merida',
    });
  });

  it('takes the synced settings when there is no version to compare with (joining)', () => {
    const local = changeSettings(fixtureSnapshot(), { boardTheme: 'blue', soundVolume: 0.5 });
    const remote = changeSettings(fixtureSnapshot(), { boardTheme: 'green' });
    const expected = { boardTheme: 'green', soundVolume: 0.5 };
    expect(mergeSnapshots(null, local, remote).settings).toEqual(expected);
    expect(
      mergeSnapshots(emptySyncSnapshot(), local, remote, { independent: true }).settings,
    ).toEqual(expected);
    // A setting the relay has no value for yet (data from before 0.24) takes this device's.
    expect(mergeSnapshots(base, local, { ...remote, settings: {} }).settings).toEqual(
      local.settings,
    );
  });

  it('with no version to compare with, keeps the settings changed here since the last sync', () => {
    const local = changeSettings(base, { boardTheme: 'blue', pieceSet: 'merida' });
    const remote = changeSettings(base, { boardTheme: 'green', sounds: false });
    // Only the board was changed here (a merge put the pieces in since).
    const changedHere = { boardTheme: 'blue', pieceSet: 'celtic' };
    expect(mergeSnapshots(null, local, remote, { changedHere }).settings).toEqual({
      ...remote.settings,
      boardTheme: 'blue',
    });
    // With a version to compare with, three ways as ever: both changed the board, the relay's stands.
    expect(mergeSnapshots(base, local, remote, { changedHere }).settings).toEqual({
      ...remote.settings,
      pieceSet: 'merida',
    });
  });

  it("keeps this device's settings when a backup comes in", () => {
    const local = changeSettings(base, { boardTheme: 'blue' });
    const backup = changeSettings(base, { boardTheme: 'green', pieceSet: 'merida' });
    expect(mergeSnapshots(null, local, backup, { incoming: 'backup' }).settings).toEqual(
      local.settings,
    );
  });

  it('measures each part against its own base', () => {
    // Settings merged with no base, progress with one: as a part switched back on merges.
    const local = changeSettings(solvePuzzle(base, 'mine', T), { boardTheme: 'blue' });
    const remote = changeSettings(solvePuzzle(base, 'theirs', T + MIN), { boardTheme: 'green' });
    const merged = mergeParts({ ...baseOf(base), settings: null }, local, remote);
    expect(merged.settings.boardTheme).toBe('green');
    expect(merged.progress.lifetime.attempts).toBe(base.progress.lifetime.attempts + 2);
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

      // A turns sync on with its profile. B joins: on odd seeds it was never used and takes
      // the synced data; on even ones it brings a few puzzles of its own, used apart till now.
      const start = fixtureSnapshot();
      const vault: Vault = { snapshot: viaVault(start), generation: 1 };
      const a: Device = { local: start, base: start, generation: 1 };
      let own = emptySnapshot();
      const brought = seed % 2 === 0 ? 3 : 0;
      for (let i = 0; i < brought; i++) own = solvePuzzle(own, `own${i}`, T - 60 * MIN + i * MIN);
      const b: Device = {
        local:
          brought > 0
            ? mergeSnapshots(emptySyncSnapshot(), own, vault.snapshot, { independent: true })
            : vault.snapshot,
        base: vault.snapshot,
        generation: 1,
      };
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
      expect(p.lifetime.attempts).toBe(start.progress.lifetime.attempts + solves + brought);
      expect(p.ratedAttempts).toBe(start.progress.ratedAttempts + solves + brought);
      expect(p.arcade.fortress?.plays ?? 0).toBe(
        (start.progress.arcade.fortress?.plays ?? 0) + plays,
      );
      expect(p.attempts).toHaveLength(start.progress.attempts.length + solves + brought);
      // Repertoires added and never deleted anywhere are all there.
      const ids = new Set(vault.snapshot.repertoire.custom.map((r) => r.id));
      for (const id of added) if (!deleted.has(id)) expect(ids.has(id)).toBe(true);
    },
  );
});
