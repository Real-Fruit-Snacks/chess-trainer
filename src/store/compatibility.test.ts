import { beforeEach, describe, expect, it } from 'vitest';
import { decodeShare } from '@/lib/shareCodes';
import { parseShareFragment } from '@/lib/shareLink';
import backupV2 from './fixtures/backup-v2.json';
import backupV4 from './fixtures/backup-v4.json';
import backupV5 from './fixtures/backup-v5.json';
import { type PersistedProgress, useProgress, withRatingDefaults } from './progress';

/**
 * The compatibility promise: a backup made by any earlier version imports
 * into this one with nothing lost, a stored state from an earlier version
 * migrates on load, and a share link keeps opening the same game. These
 * fixtures are real export shapes from earlier releases — add a new one
 * whenever the export version changes, never edit an old one.
 */
describe('backups from earlier versions', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
  });

  it('imports a 0.3-era backup (export v2, Elo rating, no theme statistics)', () => {
    expect(useProgress.getState().importState(backupV2)).toBe(true);
    const s = useProgress.getState();
    expect(s.onboarded).toBe(true);
    expect(s.puzzleRating).toBe(1212);
    expect(s.ratedAttempts).toBe(3);
    expect(s.attempts).toHaveLength(3);
    expect(s.ratingHistory).toHaveLength(4);
    expect(s.lessons['the-board']?.completedAt).toBe(1726990000000);
    expect(s.games[0]?.result).toBe('1-0');
    expect(s.streak.best).toBe(4);
    // Glicko-2 fields are derived rather than defaulted blindly …
    expect(s.puzzleRd).toBe(200);
    expect(s.lastRatedAt).toBe(1727000200000);
    expect(s.calibration).toBeNull();
    // … theme statistics are rebuilt from the attempts …
    expect(s.themeStats.fork).toEqual({ solved: 2, failed: 0 });
    expect(s.themeStats.pin).toEqual({ solved: 0, failed: 1 });
    // … and everything invented since starts empty rather than undefined.
    expect(s.puzzleReviews).toEqual({});
    expect(s.ownPuzzles).toEqual({});
    expect(s.arcade).toEqual({});
    expect(s.dailyOpening).toBeNull();
    expect(s.oddsLadder.rung).toBe(0);
  });

  it('imports a 0.5-era backup (export v4, Glicko-2 and the review queue)', () => {
    expect(useProgress.getState().importState(backupV4)).toBe(true);
    const s = useProgress.getState();
    expect(s.puzzleRd).toBe(92.5);
    expect(s.puzzleVolatility).toBe(0.06);
    expect(s.themeStats.mateIn2).toEqual({ solved: 1, failed: 0 });
    expect(s.puzzleReviews.def34?.due).toBe(1727260100000);
    expect(s.trainingDays).toEqual(['2026-09-21', '2026-09-22']);
    expect(s.guessGames['opera-game']?.score).toBe(14);
    expect(s.placement).toBeNull();
    expect(s.studies).toEqual({});
  });

  it('imports a 0.7-era backup (export v5, studies, recall and placement)', () => {
    expect(useProgress.getState().importState(backupV5)).toBe(true);
    const s = useProgress.getState();
    expect(s.placement?.courseId).toBe('intermediate');
    expect(s.studies['reti-1921']?.attempts).toBe(2);
    expect(s.lessonRecall['forks:1']?.step).toBe(1);
    expect(s.woodpecker).toBeNull();
    expect(s.arcade).toEqual({});
  });

  it('round-trips the current export through import unchanged', () => {
    useProgress.getState().importState(backupV5);
    useProgress.getState().recordArcade('fortress', 12, 'Held level 2');
    const exported = JSON.parse(useProgress.getState().exportState()) as { version: number };
    expect(exported.version).toBe(6);
    useProgress.getState().resetAll();
    expect(useProgress.getState().importState(exported)).toBe(true);
    expect(useProgress.getState().arcade.fortress?.best).toBe(12);
    expect(useProgress.getState().studies['reti-1921']?.attempts).toBe(2);
  });

  it('rejects things that are not a backup without touching the state', () => {
    useProgress.getState().importState(backupV5);
    expect(useProgress.getState().importState({ hello: 'world' })).toBe(false);
    expect(useProgress.getState().importState('nope')).toBe(false);
    expect(useProgress.getState().placement?.courseId).toBe('intermediate');
  });
});

describe('stored state from earlier versions', () => {
  it('migrates a version-1 save: rating defaults and rebuilt theme statistics', () => {
    const migrated = withRatingDefaults(backupV2.progress as Partial<PersistedProgress>);
    expect(migrated.puzzleRd).toBe(200);
    expect(migrated.puzzleVolatility).toBeGreaterThan(0);
    expect(migrated.placement).toBeNull();
    expect(migrated.woodpecker).toBeNull();
    expect(migrated.arcade).toEqual({});
  });
});

describe('share links from earlier versions', () => {
  it('still opens a game link made by 0.4', async () => {
    const parsed = await parseShareFragment(
      '#z=i3YtS80rUVByy6woKS1KVYrl4jLUU0g1UUg1VTDSU_BLM1bwSzZTMNZTcEoyVUg0U9ACAA&ply=4',
    );
    expect(parsed?.pgn).toContain('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    expect(parsed?.ply).toBe(4);
  });

  it('still opens a repertoire link and a Woodpecker link made by 0.6', async () => {
    const rep = await decodeShare(
      '#rep=q1bKS8xNVbJScsusKCktSlXSUUrOz8kvUrJSKs_ILAHxC9LzlKyUDPUUUk0UUk0VjPQU_NKMFbSUagE',
    );
    expect(rep).toEqual({
      kind: 'repertoire',
      name: 'Fixture',
      color: 'white',
      pgn: '1. e4 e5 2. Nf3 *',
    });
    const wp = await decodeShare(
      '#wp=q1YqKK2qykn1TClWsopWSkxKNjRS0lFKSU0zNlGK1VEqSizJzEtXsjI0NTCoBQA',
    );
    expect(wp).toEqual({ kind: 'woodpecker', puzzleIds: ['abc12', 'def34'], rating: 1500 });
  });
});
