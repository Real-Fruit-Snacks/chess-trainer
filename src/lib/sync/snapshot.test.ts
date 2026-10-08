import { afterEach, describe, expect, it } from 'vitest';
import { useAnalyses } from '@/store/analyses';
import { EXPORT_VERSION } from '@/store/backupSchema';
import { useGames } from '@/store/games';
import { type StudyLink, useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { DEFAULT_SETTINGS, learnerSettingsOf, useSettings } from '@/store/settings';
import {
  changeSettings,
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
  emptySyncSnapshot,
  hasProgress,
  noteRemoved,
  readSnapshotJson,
  shareHistory,
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
  useSettings.setState({ ...DEFAULT_SETTINGS });
});

describe('snapshotJson and readSnapshotJson', () => {
  it('write a backup file the vault keeps, with its generation', () => {
    const json = snapshotJson(fixtureSnapshot(), 7, {}, new Date('2026-10-07T10:00:00Z'));
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

  it("carry the settings, checked as a load checks them, and none of the device's", () => {
    const file = {
      ...vaultFile(2),
      settings: { boardTheme: 'green', pieceSet: 'no-such-set', engineThreads: false },
    };
    const read = readSnapshotJson(JSON.stringify(file));
    expect(read.ok && read.snapshot.settings).toEqual({ boardTheme: 'green' });
    // A file from before settings were in backups has none.
    const { settings: _none, ...before } = vaultFile(2);
    const old = readSnapshotJson(JSON.stringify({ ...before, version: 11 }));
    expect(old.ok && old.snapshot.settings).toEqual({});
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
  it('read the stores, and put a snapshot back into them', () => {
    const fixture = fixtureSnapshot();
    load(fixture);
    // The fixture has no settings: the store's stay, and are read with the rest.
    expect(canonical({ ...takeSnapshot(), settings: {} })).toBe(canonical(fixture));
    expect(takeSnapshot().settings).toEqual(learnerSettingsOf(useSettings.getState()));
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

  it("read the learner's settings, never the device's own", () => {
    useSettings.setState({ boardTheme: 'blue', engineThreads: false, installDismissedAt: 5 });
    const { settings } = takeSnapshot();
    expect(settings).toMatchObject({ boardTheme: 'blue' });
    expect(settings).not.toHaveProperty('engineThreads');
    expect(settings).not.toHaveProperty('engineFull');
    expect(settings).not.toHaveProperty('installDismissedAt');
  });

  it('put in the settings a snapshot has a value for, and leave the rest', () => {
    useSettings.setState({ boardTheme: 'blue', sounds: false, engineThreads: false });
    const before = useSettings.getState();
    // Settings it does not change are no change to the store.
    applySnapshot({ ...takeSnapshot() }, takeSnapshot());
    expect(useSettings.getState()).toBe(before);
    applySnapshot(
      changeSettings({ ...takeSnapshot(), settings: {} }, { boardTheme: 'green' }),
      takeSnapshot(),
    );
    expect(useSettings.getState()).toMatchObject({
      boardTheme: 'green',
      sounds: false,
      engineThreads: false,
    });
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
    const current = takeSnapshot();
    const next = deleteAnalysis(deleteRepertoire(fixture, REP), ANALYSIS);
    applySnapshot(next, current);
    expect(useLichess.getState().deleted).toEqual([]);
    noteRemoved(next, current);
    expect(useLichess.getState().deleted.sort()).toEqual([`ana:${ANALYSIS}`, `rep:${REP}`]);
    expect(useRepertoire.getState().custom).toEqual([]);
  });
});

describe('shareHistory', () => {
  it('tells devices restored from one backup from devices used apart', () => {
    const shared = fixtureSnapshot();
    expect(shareHistory(solvePuzzle(shared, 'a', 1_791_000_000_000), shared)).toBe(true);
    const apart = solvePuzzle(emptySnapshot(), 'b', 1_791_000_000_000);
    expect(shareHistory(apart, shared)).toBe(false);
    expect(shareHistory(emptySnapshot(), shared)).toBe(false);
    // The same Lichess game imported on both devices is not shared history.
    const imported = emptySnapshot();
    imported.games = shared.games;
    expect(shareHistory(imported, shared)).toBe(false);
  });

  it('takes only copies for shared history, not what reaches both devices otherwise', () => {
    const T = 1_791_000_000_000;
    const laptop = fixtureSnapshot();
    const phone = solvePuzzle(emptySnapshot(), 'b', T);
    // Repertoires and analyses the Lichess studies brought: new ids, made there and then.
    phone.repertoire.custom = laptop.repertoire.custom.map((r) => ({
      ...r,
      id: `${r.id}-pulled`,
      createdAt: T,
    }));
    phone.analyses.items = Object.fromEntries(
      Object.values(laptop.analyses.items).map((a) => [
        `${a.id}-pulled`,
        { ...a, id: `${a.id}-pulled`, createdAt: T },
      ]),
    );
    expect(shareHistory(phone, laptop)).toBe(false);
    // A game the laptop played and sent to Lichess, read back on the phone (without the id).
    const sent = laptop.progress.games.find((g) => g.lichessId);
    if (!sent) throw new Error('The fixture has no game sent to Lichess.');
    const { lichessId, ...readBack } = sent;
    expect(lichessId).toBeTruthy();
    laptop.progress.games = [sent];
    phone.progress.games = [readBack];
    expect(shareHistory(phone, laptop)).toBe(false);
    // A puzzle both made from the same game: the id comes from the position, the moment not.
    const own = {
      id: 'own-abc123',
      fen: '8/8/8/8/8/8/8/K6k w - - 0 1',
      moves: 'a1a2 h1h2',
      rating: 1500,
      rd: 100,
      popularity: 0,
      plays: 0,
      themes: 'fork',
      url: '',
      source: { title: 'A game', ply: 20, played: 'Kb1', judgement: 'blunder' as const, loss: 0.4 },
      createdAt: T - 1000,
    };
    laptop.progress.ownPuzzles = { [own.id]: own };
    phone.progress.ownPuzzles = { [own.id]: { ...own, createdAt: T } };
    expect(shareHistory(phone, laptop)).toBe(false);
    // Copies, as a restored backup has them, are shared history, however old the logs are.
    const copies: ((s: SyncSnapshot) => void)[] = [
      (s) => {
        s.repertoire.custom = laptop.repertoire.custom;
      },
      (s) => {
        s.analyses.items = laptop.analyses.items;
      },
      (s) => {
        s.progress.ownPuzzles = laptop.progress.ownPuzzles;
      },
    ];
    for (const copy of copies) {
      const restored = structuredClone(phone);
      copy(restored);
      expect(shareHistory(restored, laptop)).toBe(true);
    }
    // And so is a game without a trip through Lichess: only a backup gives it to both.
    laptop.progress.games = [readBack];
    expect(shareHistory(phone, laptop)).toBe(true);
  });

  it('takes a history id the two have in common for shared history, whatever the logs', () => {
    let at = 1_791_000_000_000;
    // Profiles with nothing else in common: each its own puzzle, at its own moment.
    const named = (lineage: string[]) => {
      at += 60_000;
      const s = solvePuzzle(emptySnapshot(), `p-${at}`, at);
      s.progress.lineage = lineage;
      return s;
    };
    expect(shareHistory(named(['profile-a1']), named(['profile-a1']))).toBe(true);
    expect(shareHistory(named(['profile-a1', 'profile-b2']), named(['profile-b2']))).toBe(true);
    expect(shareHistory(named(['profile-a1']), named(['profile-b2']))).toBe(false);
    expect(shareHistory(named([]), named([]))).toBe(false);
  });

  it('starts from an empty profile', () => {
    const empty = emptySyncSnapshot();
    expect(hasProgress(empty)).toBe(false);
    expect(canonical(empty)).toBe(canonical(emptySnapshot()));
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
