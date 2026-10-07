import { afterEach, describe, expect, it } from 'vitest';
import { useAnalyses } from '@/store/analyses';
import { EXPORT_VERSION } from '@/store/backupSchema';
import { useGames } from '@/store/games';
import { type StudyLink, useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import {
  deleteAnalysis,
  deleteRepertoire,
  emptySnapshot,
  fixtureSnapshot,
  solvePuzzle,
} from '@/test/syncFixtures';
import { canonical } from './canonical';
import type { SyncSnapshot } from './merge';
import {
  applySnapshot,
  hasProgress,
  readSnapshotJson,
  snapshotJson,
  takeSnapshot,
} from './snapshot';

const REP = 'custom-muofwy80-fruf';
const ANALYSIS = 'an-muofwy80-b2y86';

/** The fixture as a vault's file holds it. */
const vaultFile = (generation: number) =>
  JSON.parse(snapshotJson(fixtureSnapshot(), generation)) as Record<string, unknown>;

/** Puts a snapshot into the stores, as a merge would. */
function load(snapshot: SyncSnapshot) {
  applySnapshot(snapshot, takeSnapshot());
}

afterEach(() => {
  load(emptySnapshot());
  useLichess.setState({ links: {}, deleted: [] });
});

describe('snapshotJson and readSnapshotJson', () => {
  it('write a backup file the vault keeps, with its generation', () => {
    const json = snapshotJson(fixtureSnapshot(), 7, new Date('2026-10-07T10:00:00Z'));
    const file = JSON.parse(json) as Record<string, unknown>;
    expect(file).toMatchObject({
      app: 'chess-trainer',
      version: EXPORT_VERSION,
      exportedAt: '2026-10-07T10:00:00.000Z',
      sync: { generation: 7 },
    });
    expect(Object.keys(file)).toEqual(
      expect.arrayContaining(['progress', 'repertoire', 'analyses', 'games']),
    );
    const read = readSnapshotJson(json);
    expect(read.ok && read.generation).toBe(7);
    expect(read.ok && canonical(read.snapshot)).toBe(canonical(fixtureSnapshot()));
  });

  it('read a backup without a generation as generation 0', () => {
    for (const generation of [undefined, -3, 1.5, 'seven']) {
      const file = { ...vaultFile(1), sync: { generation } };
      const read = readSnapshotJson(JSON.stringify(file));
      expect(read.ok && read.generation).toBe(0);
    }
  });

  it('refuse data from a newer version of the app, saying so', () => {
    const file = { ...vaultFile(3), version: EXPORT_VERSION + 1 };
    const read = readSnapshotJson(JSON.stringify(file));
    expect(read).toMatchObject({ ok: false, newer: true });
    expect(!read.ok && read.reason).toMatch(/newer version of the app/);
  });

  it('refuse what is not a backup', () => {
    expect(readSnapshotJson('{not json')).toMatchObject({ ok: false, newer: false });
    expect(readSnapshotJson('{"hello":"world"}')).toMatchObject({ ok: false, newer: false });
  });
});

describe('takeSnapshot and applySnapshot', () => {
  it('read the four stores, and put a snapshot back into them', () => {
    const fixture = fixtureSnapshot();
    load(fixture);
    expect(canonical(takeSnapshot())).toBe(canonical(fixture));
    expect(useRepertoire.getState().custom.map((r) => r.id)).toEqual([REP]);
    expect(Object.keys(useAnalyses.getState().items)).toEqual([ANALYSIS]);
    expect(Object.keys(useGames.getState().games)).toHaveLength(2);
  });

  it('leave the stores that did not change alone', () => {
    const fixture = fixtureSnapshot();
    load(fixture);
    const repertoire = useRepertoire.getState();
    const analyses = useAnalyses.getState();
    const games = useGames.getState();
    applySnapshot(solvePuzzle(fixture, 'n1', 1_791_000_000_000), takeSnapshot());
    expect(useProgress.getState().attempts[0]?.id).toBe('n1');
    expect(useRepertoire.getState()).toBe(repertoire);
    expect(useAnalyses.getState()).toBe(analyses);
    expect(useGames.getState()).toBe(games);
  });

  it('tell the Lichess studies about repertoires and analyses deleted on another device', () => {
    const fixture = fixtureSnapshot();
    load(fixture);
    const link = (name: string): StudyLink => ({
      studyId: 'study1',
      chapterId: `ch-${name}`,
      localHash: 'h',
      remoteHash: 'h',
      name,
      group: 'Repertoires',
      color: null,
    });
    useLichess.setState({
      links: { [`rep:${REP}`]: link('My London'), [`ana:${ANALYSIS}`]: link('Fixture analysis') },
      deleted: [],
    });
    applySnapshot(deleteAnalysis(deleteRepertoire(fixture, REP), ANALYSIS), takeSnapshot());
    expect(useLichess.getState().deleted.sort()).toEqual([`ana:${ANALYSIS}`, `rep:${REP}`]);
    expect(useRepertoire.getState().custom).toEqual([]);
  });
});

describe('hasProgress', () => {
  it('is false for a new profile and true once there is something to lose', () => {
    expect(hasProgress(emptySnapshot())).toBe(false);
    expect(hasProgress(fixtureSnapshot())).toBe(true);
    expect(hasProgress(solvePuzzle(emptySnapshot(), 'n1', 1_791_000_000_000))).toBe(true);
    const withAnalysis = emptySnapshot();
    withAnalysis.analyses.items = fixtureSnapshot().analyses.items;
    expect(hasProgress(withAnalysis)).toBe(true);
  });
});
