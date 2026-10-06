import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ANALYSES, useAnalyses } from '@/store/analyses';
import { useLichess } from '@/store/lichess';
import { useRepertoire } from '@/store/repertoire';
import type { FakeStudy } from '@/test/fakeLichess';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import { syncStudies } from './studies';
import { MAX_CHAPTERS, treeContent } from './studyModel';

const ITALIAN = '1. e4 e5 2. Nf3 Nc6 3. Bc4 {The Italian} Bc5 (3... Nf6 4. Ng5) *';
const CARO = '1. e4 c6 2. d4 d5 3. Nc3 dxe4 *';
const LONDON = '1. d4 d5 2. Bf4 Nf6 3. e3 *';
const ENDGAME = '[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. Kd2 Kd5 2. Kd3 *';
const REPERTOIRES = 'Chess Trainer · Repertoires';

let lichess: FakeLichessHandle;
let token: string;

function connectAccount() {
  useLichess.getState().connect(
    { id: 'learner', username: 'Learner', token, expiresAt: null },
    {
      puzzle: null,
      bullet: null,
      blitz: null,
      rapid: null,
      classical: null,
      at: 0,
    },
  );
}

beforeEach(() => {
  localStorage.clear();
  lichess = installFakeLichess();
  token = lichess.fake.issueToken();
  useRepertoire.getState().resetAll();
  useAnalyses.getState().clear();
  useLichess.getState().forget();
  connectAccount();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sync = () => syncStudies(token, 'Learner');

function addRep(name: string, pgn: string, color: 'white' | 'black' = 'white') {
  return useRepertoire.getState().addCustom({ name, color, pgn });
}

function addAnalysis(name: string, pgn: string, collection?: string) {
  const content = treeContent(pgn);
  if (!content) throw new Error('bad PGN');
  return useAnalyses.getState().save({
    name,
    pgn,
    startFen: content.startFen,
    moves: content.moves,
    ...(collection ? { collection } : {}),
  });
}

function study(name: string): FakeStudy {
  const found = lichess.fake.studies.find((s) => s.name === name);
  if (!found) {
    throw new Error(`No study “${name}”: ${lichess.fake.studies.map((s) => s.name).join(', ')}`);
  }
  return found;
}

const chapterNames = (name: string) => study(name).chapters.map((c) => c.name);
const reps = () => useRepertoire.getState().custom;
const analyses = () => Object.values(useAnalyses.getState().items);
const moves = (pgn: string) => treeContent(pgn)?.movesHash;
const studyReads = () =>
  lichess.fake.requests.filter((r) => /^GET \/api\/study\/\w{8}\.pgn/.test(r));
const accountExports = () =>
  lichess.fake.requests.filter((r) => /^GET \/api\/study\/by\/\w+\/export\.pgn/.test(r)).length;

/** A second device on the same account: nothing local, nothing remembered. */
function becomeNewDevice() {
  useRepertoire.getState().resetAll();
  useAnalyses.getState().clear();
  useLichess.getState().forget();
  connectAccount();
}

describe('repertoires and analyses in private studies', () => {
  it('sends everything the first time: a study per list, named chapters, no empty chapter left', async () => {
    addRep('Italian', ITALIAN);
    addRep('Caro-Kann', CARO, 'black');
    addAnalysis('Game 1', LONDON);
    addAnalysis('K+P', ENDGAME, 'Endgames');

    const result = await sync();
    expect(result).toMatchObject({ pushed: 4, pulled: 0, copies: 0, heldBack: [], skipped: false });
    expect(lichess.fake.studies.map((s) => [s.name, s.visibility])).toEqual([
      [REPERTOIRES, 'private'],
      ['Chess Trainer · Analyses: My analyses', 'private'],
      ['Chess Trainer · Analyses: Endgames', 'private'],
    ]);
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian', 'Caro-Kann']);
    expect(study(REPERTOIRES).chapters.map((c) => c.orientation)).toEqual(['white', 'black']);
    expect(chapterNames('Chess Trainer · Analyses: Endgames')).toEqual(['K+P']);
    expect(study('Chess Trainer · Analyses: Endgames').chapters[0]?.fen).toBe(
      '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
    );
    expect(study(REPERTOIRES).chapters[0]?.movetext).toContain('{ The Italian }');

    const links = useLichess.getState().links;
    expect(Object.keys(links)).toHaveLength(4);
    // Lichess's own version of each chapter is known: nothing is pending.
    expect(Object.values(links).every((l) => !l.remoteHash.startsWith('?'))).toBe(true);
  });

  it('reads the studies again once after sending, then skips them while nothing changes', async () => {
    addRep('Italian', ITALIAN);
    await sync();
    const afterPush = studyReads().length;
    expect(await sync()).toMatchObject({ pushed: 0, pulled: 0, skipped: false });
    expect(studyReads().length).toBe(afterPush + 1);
    expect(await sync()).toMatchObject({ skipped: true });
    expect(studyReads().length).toBe(afterPush + 1);
  });

  it('sends names as Lichess keeps them, so nothing looks renamed afterwards', async () => {
    const long = `A name far too long for a chapter… ${'with more words '.repeat(6)}`;
    addAnalysis(long, ITALIAN, 'Openings ♟ 🎯');
    addRep('Najdorf\u00a0"6.Bg5"', CARO);
    await sync();
    const openings = study('Chess Trainer · Analyses: Openings');
    expect(openings.chapters[0]?.name).toHaveLength(80);
    expect(openings.chapters[0]?.name).toContain('chapter...');
    expect(chapterNames(REPERTOIRES)).toEqual(["Najdorf '6.Bg5'"]);
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 0 });
    expect(await sync()).toMatchObject({ skipped: true });
    // Here the names stay as they were typed.
    expect(analyses()[0]?.name).toBe(long.trim());
    expect(analyses()[0]?.collection).toBe('Openings ♟ 🎯');
  });

  it('restores everything on another device, and keeps it in step from there', async () => {
    addRep('Italian', ITALIAN);
    addRep('Caro-Kann', CARO, 'black');
    addAnalysis('K+P', ENDGAME, 'Endgames');
    await sync();

    becomeNewDevice();
    const result = await sync();
    expect(result).toMatchObject({ pulled: 3, pushed: 0 });
    expect(reps().map((r) => [r.name, r.color, moves(r.pgn)])).toEqual([
      ['Italian', 'white', moves(ITALIAN)],
      ['Caro-Kann', 'black', moves(CARO)],
    ]);
    expect(reps()[0]?.pgn).toContain('{The Italian}');
    expect(analyses().map((a) => [a.name, a.collection, a.startFen])).toEqual([
      ['K+P', 'Endgames', '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1'],
    ]);
    // Brought in, linked, and nothing sent back.
    expect(Object.keys(useLichess.getState().links)).toHaveLength(3);
    expect(await sync()).toMatchObject({ skipped: true });
  });

  it('sends edits: new moves in place, a new name or side as a new chapter', async () => {
    const rep = addRep('Italian', ITALIAN);
    await sync();
    const first = study(REPERTOIRES).chapters[0];
    useRepertoire.getState().updateCustom(rep.id, { pgn: `${ITALIAN.slice(0, -1)} 4. c3 *` });
    expect(await sync()).toMatchObject({ pushed: 1 });
    expect(study(REPERTOIRES).chapters[0]?.id).toBe(first?.id);
    expect(study(REPERTOIRES).chapters[0]?.movetext).toContain('4. c3');

    useRepertoire.getState().updateCustom(rep.id, { name: 'Giuoco Piano', color: 'black' });
    await sync();
    const chapters = study(REPERTOIRES).chapters;
    expect(chapters.map((c) => [c.name, c.orientation])).toEqual([['Giuoco Piano', 'black']]);
    expect(chapters[0]?.id).not.toBe(first?.id);
    expect(chapters[0]?.movetext).toContain('4. c3');
  });

  it('takes edits made on Lichess: moves, name and side', async () => {
    const rep = addRep('Italian', ITALIAN);
    await sync();
    const chapter = study(REPERTOIRES).chapters[0];
    lichess.fake.editChapter(study(REPERTOIRES).id, chapter?.id ?? '', {
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 {Evans} *',
      name: 'Evans Gambit',
      orientation: 'black',
    });
    expect(await sync()).toMatchObject({ pulled: 1, pushed: 0 });
    const updated = reps().find((r) => r.id === rep.id);
    expect(updated?.name).toBe('Evans Gambit');
    expect(updated?.color).toBe('black');
    expect(updated?.pgn).toContain('4. b4 {Evans}');
    expect(await sync()).toMatchObject({ skipped: true });
  });

  it('follows deletions both ways', async () => {
    const italian = addRep('Italian', ITALIAN);
    addRep('Caro-Kann', CARO, 'black');
    await sync();
    useRepertoire.getState().removeCustom(italian.id);
    expect(await sync()).toMatchObject({ pushed: 1 });
    expect(chapterNames(REPERTOIRES)).toEqual(['Caro-Kann']);

    lichess.fake.deleteChapter(study(REPERTOIRES).id, study(REPERTOIRES).chapters[0]?.id ?? '');
    expect(await sync()).toMatchObject({ pulled: 1 });
    expect(reps()).toEqual([]);
    expect(useLichess.getState().links).toEqual({});
  });

  it('restores what went missing here without being deleted, deleting nothing on Lichess', async () => {
    addRep('Italian', ITALIAN);
    addAnalysis('K+P', ENDGAME, 'Endgames');
    await sync();
    // As a damaged save would: the lists start empty, with no deletion behind it.
    useRepertoire.setState({ custom: [] });
    useAnalyses.setState({ items: {} });
    expect(await sync()).toMatchObject({ pulled: 2, pushed: 0 });
    expect(reps().map((r) => r.name)).toEqual(['Italian']);
    expect(analyses().map((a) => a.name)).toEqual(['K+P']);
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian']);
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 0 });
  });

  it('keeps both versions when an item changed on both sides', async () => {
    const rep = addRep('Italian', ITALIAN);
    await sync();
    const chapterId = study(REPERTOIRES).chapters[0]?.id ?? '';
    lichess.fake.editChapter(study(REPERTOIRES).id, chapterId, {
      pgn: `${ITALIAN.slice(0, -1)} 4. b4 *`,
    });
    useRepertoire.getState().updateCustom(rep.id, { pgn: `${ITALIAN.slice(0, -1)} 4. c3 *` });

    const result = await sync();
    expect(result.copies).toBe(1);
    expect(
      reps()
        .map((r) => r.name)
        .sort(),
    ).toEqual(['Italian', 'Italian (Lichess)']);
    expect(reps().find((r) => r.name === 'Italian (Lichess)')?.pgn).toContain('4. b4');
    // Lichess has both too: the original chapter with this device's moves, the copy beside it.
    const chapters = study(REPERTOIRES).chapters;
    expect(chapters.map((c) => c.name)).toEqual(['Italian', 'Italian (Lichess)']);
    expect(chapters[0]?.movetext).toContain('4. c3');
    expect(chapters[1]?.movetext).toContain('4. b4');
    await sync();
    expect(await sync()).toMatchObject({ skipped: true });
  });

  it('never deletes anything here because a whole study disappeared: it is made again', async () => {
    addRep('Italian', ITALIAN);
    await sync();
    lichess.fake.studies.splice(0, lichess.fake.studies.length);
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 1 });
    expect(reps()).toHaveLength(1);
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian']);
  });

  it('leaves alone a chapter it cannot read, and the item linked to it', async () => {
    addRep('Italian', ITALIAN);
    await sync();
    const chapter = study(REPERTOIRES).chapters[0];
    if (chapter) chapter.movetext = '1. e4 e5 2. Ke3 Qq9';
    lichess.fake.editChapter(study(REPERTOIRES).id, chapter?.id ?? '', {});
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 0 });
    expect(reps()).toHaveLength(1);
  });

  it('keeps an item too big for a chapter on this device, without reading the studies over it', async () => {
    const huge: string[] = [];
    for (let i = 0; i < 1600; i++) huge.push(i % 2 === 0 ? 'Nf3 Nf6 Ng1 Ng8' : '');
    const pgn = `${huge.filter(Boolean).join(' ')} *`;
    addRep('Shuffle', pgn);
    addRep('Italian', ITALIAN);
    const first = await sync();
    expect(first.heldBack).toEqual(['Shuffle']);
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian']);
    await sync();
    const reads = studyReads().length;
    expect(await sync()).toMatchObject({ skipped: true, heldBack: ['Shuffle'] });
    expect(studyReads().length).toBe(reads);
  });

  it('remembers what Lichess refused, sends the rest, and tries again once it changes', async () => {
    lichess.fake.refusePgn = (pgn) => (pgn.includes('Bf4') ? 'PGN is invalid' : null);
    addAnalysis('A', ITALIAN);
    const london = addAnalysis('B', LONDON);
    addAnalysis('C', CARO);
    const result = await sync();
    expect(result.heldBack).toEqual(['B']);
    expect(chapterNames('Chess Trainer · Analyses: My analyses')).toEqual(['A', 'C']);
    expect(useLichess.getState().refused[`ana:${london.id}`]).toBeDefined();
    await sync();
    expect(await sync()).toMatchObject({ skipped: true });

    lichess.fake.refusePgn = null;
    useAnalyses.getState().update(london.id, { pgn: `${LONDON.slice(0, -1)} 3... c5 *` });
    expect(await sync()).toMatchObject({ pushed: 1, heldBack: [] });
    expect(chapterNames('Chess Trainer · Analyses: My analyses')).toEqual(['A', 'C', 'B']);
  });

  it('continues a full study in the next part', async () => {
    const third = ['a3', 'a4', 'b3', 'b4', 'c3', 'c4', 'd3', 'd4', 'g3', 'g4', 'h3', 'h4', 'Bc4'];
    for (let i = 0; i < MAX_CHAPTERS + 2; i++) {
      addAnalysis(`Line ${i}`, `1. e4 e5 2. Nf3 Nc6 3. ${third[i % third.length]} *`);
    }
    await sync();
    // A new study's empty first chapter took one place until the import was done.
    expect(study('Chess Trainer · Analyses: My analyses').chapters).toHaveLength(MAX_CHAPTERS - 1);
    expect(chapterNames('Chess Trainer · Analyses: My analyses (2)')).toEqual([
      'Line 63',
      'Line 64',
      'Line 65',
    ]);
    // The place it left is used next.
    addAnalysis('Line 66', '1. d4 *');
    await sync();
    expect(study('Chess Trainer · Analyses: My analyses').chapters).toHaveLength(MAX_CHAPTERS);
  });

  it('leaves analyses on Lichess when the library here is full', async () => {
    addAnalysis('Kept', ITALIAN);
    await sync();
    becomeNewDevice();
    const items: Record<string, ReturnType<typeof useAnalyses.getState>['items'][string]> = {};
    for (let i = 0; i < MAX_ANALYSES; i++) {
      items[`an-${i}`] = {
        id: `an-${i}`,
        name: `Local ${i}`,
        collection: 'Elsewhere',
        pgn: '*',
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: 0,
        createdAt: i,
        updatedAt: i,
      };
    }
    useAnalyses.getState().replaceState({ items });
    const result = await sync();
    expect(result.notPulled).toBe(1);
    expect(analyses()).toHaveLength(MAX_ANALYSES);
  });

  it('after a backup import, links what is on both sides and deletes nothing on Lichess', async () => {
    addRep('Italian', ITALIAN);
    addRep('Caro-Kann', CARO, 'black');
    await sync();
    // As an import does: the data replaced, the matching started over.
    useRepertoire.getState().replaceState({
      custom: [
        { id: 'custom-restored', name: 'Italian', color: 'white', pgn: ITALIAN, createdAt: 1 },
      ],
    });
    useLichess.getState().restartSync();
    const result = await sync();
    expect(result).toMatchObject({ pushed: 0, pulled: 1 });
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian', 'Caro-Kann']);
    expect(reps().map((r) => r.name)).toEqual(['Italian', 'Caro-Kann']);
  });

  it('sends a chapter anew when it vanished between the read and the update', async () => {
    const rep = addRep('Italian', ITALIAN);
    await sync();
    const chapterId = study(REPERTOIRES).chapters[0]?.id ?? '';
    useRepertoire.getState().updateCustom(rep.id, { pgn: `${ITALIAN.slice(0, -1)} 4. c3 *` });
    lichess.fake.failNext(/^POST \/api\/study\/\w+\/\w+\/moves$/, 400, {
      body: JSON.stringify({ error: `Invalid or forbidden chapter x/${chapterId}` }),
    });
    expect(await sync()).toMatchObject({ pushed: 1 });
    expect(study(REPERTOIRES).chapters.map((c) => c.movetext.includes('4. c3'))).toEqual([true]);
  });

  it('makes its studies for its owner alone to share and export, and reads each on its own', async () => {
    addRep('Italian', ITALIAN);
    addAnalysis('K+P', ENDGAME, 'Endgames');
    await sync();
    expect(lichess.fake.studies.map((s) => [s.visibility, s.shareable])).toEqual([
      ['private', 'owner'],
      ['private', 'owner'],
    ]);
    becomeNewDevice();
    expect(await sync()).toMatchObject({ pulled: 2 });
    expect(accountExports()).toBe(0);
  });

  it('reads the studies 0.17.0 made from the account’s export, and tidies what its stopped run left', async () => {
    addRep('Italian', ITALIAN);
    addRep('Caro-Kann', CARO, 'black');
    // As 0.17.0 went: the chapters went up, then reading them back failed and the run stopped.
    lichess.fake.failNext(/^GET \/api\/study\/\w{8}\.pgn$/, 503);
    await expect(sync()).rejects.toMatchObject({ kind: 'server' });
    // …and its study had sharing set to nobody, which stops even its owner's export of it.
    study(REPERTOIRES).shareable = 'nobody';
    // A study of the learner's own, changed since, comes first in the account's export.
    lichess.fake.addStudy('My openings', [{ name: 'Sicilian', pgn: '1. e4 c5 *' }]);
    expect(chapterNames(REPERTOIRES)).toEqual(['Chapter 1', 'Italian', 'Caro-Kann']);
    expect(
      Object.values(useLichess.getState().links).map((l) => l.remoteHash.startsWith('?')),
    ).toEqual([true, true]);

    expect(await sync()).toMatchObject({ pulled: 0, pushed: 0, skipped: false });
    expect(accountExports()).toBe(1);
    // Lichess's own version of each chapter is known now, and the empty first chapter is gone.
    expect(
      Object.values(useLichess.getState().links).some((l) => l.remoteHash.startsWith('?')),
    ).toBe(false);
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian', 'Caro-Kann']);
    expect(reps().map((r) => r.name)).toEqual(['Italian', 'Caro-Kann']);

    // From then on it syncs as any other: read once more after the tidying, then skipped…
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 0, skipped: false });
    expect(await sync()).toMatchObject({ skipped: true });
    // …and edits come both ways.
    const chapter = study(REPERTOIRES).chapters[0];
    lichess.fake.editChapter(study(REPERTOIRES).id, chapter?.id ?? '', {
      pgn: `${ITALIAN.slice(0, -1)} 4. b4 *`,
    });
    expect(await sync()).toMatchObject({ pulled: 1 });
    expect(reps()[0]?.pgn).toContain('4. b4');
    useRepertoire
      .getState()
      .updateCustom(reps()[1]?.id ?? '', { pgn: `${CARO.slice(0, -1)} 4. Nxe4 *` });
    expect(await sync()).toMatchObject({ pushed: 1 });
    expect(study(REPERTOIRES).chapters[1]?.movetext).toContain('4. Nxe4');
    // The learner's own study was left alone.
    expect(study('My openings').chapters.map((c) => c.name)).toEqual(['Sicilian']);
  });

  it('leaves for the next sync a study Lichess will not export that the account’s export lacks', async () => {
    addRep('Italian', ITALIAN);
    await sync();
    study(REPERTOIRES).shareable = 'nobody';
    lichess.fake.editChapter(study(REPERTOIRES).id, study(REPERTOIRES).chapters[0]?.id ?? '', {
      pgn: `${ITALIAN.slice(0, -1)} 4. b4 *`,
    });
    lichess.fake.failNext(/^GET \/api\/study\/by\/\w+\/export\.pgn$/, 200, {
      headers: { 'content-type': 'application/x-chess-pgn' },
      body: '',
    });
    // Nothing read, so nothing decided: no item goes, and the edit waits.
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 0 });
    expect(reps()[0]?.pgn).not.toContain('4. b4');
    expect(await sync()).toMatchObject({ pulled: 1 });
    expect(reps()[0]?.pgn).toContain('4. b4');
  });

  it('stops on a dropped connection with what came down saved, and finishes next time', async () => {
    addRep('Italian', ITALIAN);
    addRep('Caro-Kann', CARO, 'black');
    lichess.fake.failNext(/^POST \/api\/study\/\w+\/import-pgn$/, 503);
    await expect(sync()).rejects.toMatchObject({ kind: 'server' });
    expect(await sync()).toMatchObject({ pushed: 2 });
    expect(chapterNames(REPERTOIRES)).toEqual(['Italian', 'Caro-Kann']);
    expect(lichess.fake.studies).toHaveLength(1);
  });
});
