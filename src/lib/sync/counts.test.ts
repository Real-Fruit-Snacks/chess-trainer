import { describe, expect, it } from 'vitest';
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
import {
  addChanges,
  changesOrNull,
  completedLessons,
  nothingChanged,
  type SyncChanges,
  syncChanges,
  syncTotals,
} from './counts';

const T = 1_791_000_000_000;

const none = (): SyncChanges => ({
  changed: { puzzles: 0, lessons: 0, repertoires: 0, moves: 0, analyses: 0, games: 0 },
  settings: 0,
  removed: 0,
  other: false,
});

describe('syncTotals', () => {
  it('counts what a profile holds, by kind', () => {
    const s = fixtureSnapshot();
    expect(syncTotals(s)).toEqual({
      puzzles: s.progress.lifetime.attempts,
      lessons: completedLessons(s.progress.lessons),
      repertoires: s.repertoire.custom.length,
      moves: Object.keys(s.repertoire.cards).length,
      analyses: Object.keys(s.analyses.items).length,
      games: Object.keys(s.games.games).length,
    });
    expect(syncTotals(emptySnapshot())).toEqual(none().changed);
  });

  it('counts none of a part kept to the device', () => {
    const s = fixtureSnapshot();
    const totals = syncTotals(s);
    expect(syncTotals(s, new Set(['progress', 'games']))).toEqual({
      ...totals,
      puzzles: 0,
      lessons: 0,
      games: 0,
    });
    expect(syncTotals(s, new Set(['repertoire']))).toMatchObject({ repertoires: 0, moves: 0 });
  });

  it('counts a lesson once it is completed, marked done included', () => {
    const s = doLessonStep(emptySnapshot(), 'l1', 0, T);
    expect(completedLessons(s.progress.lessons)).toBe(0);
    const done = structuredClone(s);
    done.progress.lessons.l1 = { ...done.progress.lessons.l1!, completedAt: T };
    expect(completedLessons(done.progress.lessons)).toBe(1);
  });
});

describe('syncChanges', () => {
  it('finds nothing between two copies of the same data', () => {
    const s = fixtureSnapshot();
    const changes = syncChanges(s, structuredClone(s));
    expect(changes).toEqual(none());
    expect(nothingChanged(changes)).toBe(true);
    expect(changesOrNull(changes)).toBeNull();
  });

  it('counts puzzles played, lessons worked on and repertoire moves reviewed', () => {
    const before = fixtureSnapshot();
    let after = solvePuzzle(solvePuzzle(before, 'a', T), 'b', T + 1000, 'failed');
    after = doLessonStep(after, 'new-lesson', 0, T);
    after = reviewRepertoireCard(after, 'some-rep|e4', T);
    expect(syncChanges(before, after).changed).toMatchObject({ puzzles: 2, lessons: 1, moves: 1 });
  });

  it('counts repertoires and analyses new or edited, and what was deleted', () => {
    const before = saveAnalysis(fixtureSnapshot(), 'old', 'Old', T);
    const rep = before.repertoire.custom[0]?.id ?? '';
    let after = addRepertoire(before, 'custom-new', 'New', T);
    after = editRepertoire(after, rep, '1. d4 *');
    after = saveAnalysis(after, 'fresh', 'Fresh', T);
    after = deleteAnalysis(after, 'old');
    const changes = syncChanges(before, after);
    expect(changes.changed).toMatchObject({ repertoires: 2, analyses: 1 });
    expect(changes.removed).toBe(1);
    expect(changes.other).toBe(false);
  });

  it('counts a deleted repertoire with its reviewed moves as deletions', () => {
    const before = reviewRepertoireCard(
      addRepertoire(emptySnapshot(), 'custom-x', 'X', T),
      'custom-x|e4',
      T,
    );
    const after = deleteRepertoire(before, 'custom-x');
    expect(syncChanges(before, after)).toMatchObject({ removed: 2, other: false });
  });

  it('notes a change nothing counts, such as an arcade game', () => {
    const before = fixtureSnapshot();
    const after = playArcade(before, 'fortress', 3, T);
    expect(syncChanges(before, after)).toEqual({ ...none(), other: true });
    expect(changesOrNull(syncChanges(before, after))).not.toBeNull();
  });

  it('counts the settings changed, one by one, and nothing else for them', () => {
    const before = changeSettings(fixtureSnapshot(), { boardTheme: 'blue', sounds: true });
    const after = changeSettings(before, { boardTheme: 'green', sounds: true, pieceSet: 'merida' });
    expect(syncChanges(before, after)).toEqual({ ...none(), settings: 2 });
    // A side that has no value for a setting counts no change to it.
    expect(syncChanges(after, { ...after, settings: {} })).toEqual(none());
    expect(nothingChanged({ ...none(), settings: 1 })).toBe(false);
  });

  it('counts only what one side has over the other, never less than none', () => {
    const before = solvePuzzle(fixtureSnapshot(), 'a', T);
    // The other way round: the older copy has no puzzles the newer one lacks.
    expect(syncChanges(before, fixtureSnapshot()).changed.puzzles).toBe(0);
  });
});

describe('addChanges', () => {
  it('adds up two runs, either of which may have changed nothing', () => {
    const a: SyncChanges = { ...none(), changed: { ...none().changed, puzzles: 2 } };
    const b: SyncChanges = {
      changed: { ...none().changed, puzzles: 1, analyses: 1 },
      settings: 2,
      removed: 1,
      other: true,
    };
    expect(addChanges({ ...a, settings: 1 }, b)).toEqual({
      changed: { ...none().changed, puzzles: 3, analyses: 1 },
      settings: 3,
      removed: 1,
      other: true,
    });
    expect(addChanges(null, b)).toBe(b);
    expect(addChanges(a, null)).toBe(a);
    expect(addChanges(null, null)).toBeNull();
  });
});
