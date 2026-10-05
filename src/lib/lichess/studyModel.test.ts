import { describe, expect, it } from 'vitest';
import type { StudyLink } from '@/store/lichess';
import { FakeLichess, readGame } from '@/test/fakeLichess';
import {
  type AppStudy,
  chapterPgn,
  chaptersFromExport,
  copyName,
  fitGroup,
  fitName,
  fitsChapter,
  MAX_CHAPTER_NODES,
  parseStudyName,
  pendingRemoteHash,
  positionKey,
  reconcile,
  type ReconcileInput,
  type RemoteChapter,
  studyName,
  type SyncItem,
  treeContent,
} from './studyModel';

const RICH = `[Event "Mine"]
[White "Me"]

{Start here} 1. e4 {The best by test} {[%cal Ge2e4,Rd2d4] [%csl Gd4]} e5 $1 2. Nf3 (2. f4 $5 exf4 {[%clk 0:05:00]} 3. Nf3) 2... Nc6 3. Bb5 a6 *`;

const FEN_PGN = `[SetUp "1"]
[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]

1. Kd2 Kd5 2. Kd3 *`;

describe('study names', () => {
  it('names the repertoire study and each collection’s, part by part, and reads them back', () => {
    expect(studyName('repertoire', 'Repertoires', 1)).toBe('Chess Trainer · Repertoires');
    expect(studyName('repertoire', 'Repertoires', 2)).toBe('Chess Trainer · Repertoires (2)');
    expect(studyName('analysis', 'Games', 1)).toBe('Chess Trainer · Analyses: Games');
    expect(studyName('analysis', 'Games', 3)).toBe('Chess Trainer · Analyses: Games (3)');
    expect(parseStudyName('Chess Trainer · Repertoires (2)')).toEqual({
      kind: 'repertoire',
      group: 'Repertoires',
      part: 2,
    });
    expect(parseStudyName('Chess Trainer · Analyses: Games (3)')).toEqual({
      kind: 'analysis',
      group: 'Games',
      part: 3,
    });
    expect(parseStudyName('My own study')).toBeNull();
    expect(parseStudyName('Chess Trainer · Analyses:  ')).toBeNull();
  });

  it('never reads a collection whose name ends like a part number as another’s part', () => {
    const name = studyName('analysis', 'Games (2)', 1);
    expect(name).toBe('Chess Trainer · Analyses: Games (2) (1)');
    expect(parseStudyName(name)).toEqual({ kind: 'analysis', group: 'Games (2)', part: 1 });
    expect(parseStudyName(studyName('analysis', 'Games (2)', 4))).toEqual({
      kind: 'analysis',
      group: 'Games (2)',
      part: 4,
    });
  });

  it('fits names to Lichess’s limits', () => {
    expect(fitName('  Sicilian   Najdorf ')).toBe('Sicilian Najdorf');
    expect(fitName('   ')).toBe('Untitled');
    // Lichess keeps 80 characters of a chapter name.
    expect(fitName('x'.repeat(150))).toHaveLength(80);
    expect(fitGroup('y'.repeat(80))).toHaveLength(64);
    expect(copyName('Najdorf')).toBe('Najdorf (Lichess)');
    expect(studyName('analysis', 'z'.repeat(90), 99).length).toBeLessThanOrEqual(100);
  });
});

describe('item content', () => {
  it('hashes moves with annotations, and moves alone', () => {
    const rich = treeContent(RICH);
    expect(rich).not.toBeNull();
    const plain = treeContent('1. e4 e5 2. Nf3 (2. f4 exf4 3. Nf3) 2... Nc6 3. Bb5 a6 *');
    expect(plain?.movesHash).toBe(rich?.movesHash);
    expect(plain?.hash).not.toBe(rich?.hash);
    // Spacing, the order of arrows, clocks and tags are not content.
    const respaced = treeContent(
      RICH.replace('{The best by test}', '{  The best\n by   test }')
        .replace('Ge2e4,Rd2d4', 'Rd2d4,Ge2e4')
        .replace('[%clk 0:05:00]', '[%clk 0:04:00]')
        .replace('[White "Me"]', '[White "You"]'),
    );
    expect(respaced?.hash).toBe(rich?.hash);
    // A changed comment, glyph or arrow is.
    expect(treeContent(RICH.replace('by test', 'by far'))?.hash).not.toBe(rich?.hash);
    expect(treeContent(RICH.replace('e5 $1', 'e5 $2'))?.hash).not.toBe(rich?.hash);
    expect(treeContent(RICH.replace('Gd4', 'Rd4'))?.hash).not.toBe(rich?.hash);
    expect(rich?.moves).toBe(6);
    expect(rich?.nodes).toBe(9);
  });

  it('settles after one rewrite, and survives Lichess’s way of writing it', () => {
    const once = treeContent(RICH);
    const twice = treeContent(once?.pgn ?? '');
    expect(twice?.hash).toBe(once?.hash);
    expect(twice?.pgn).toBe(once?.pgn);
    // As the stand-in Lichess stores and exports it: one line, comments `{ spaced }`.
    const lichess = readGame(chapterPgn({ name: 'x', pgn: once?.pgn ?? '' }));
    expect(treeContent(lichess.movetext)?.hash).toBe(once?.hash);
    const fen = treeContent(FEN_PGN);
    expect(treeContent(fen?.pgn ?? '')?.hash).toBe(fen?.hash);
  });

  it('knows an empty item, a start position and the chapter limits', () => {
    expect(treeContent('*')?.blank).toBe(true);
    expect(treeContent('')?.blank).toBe(true);
    const fen = treeContent(FEN_PGN);
    expect(fen?.blank).toBe(false);
    expect(fen?.startFen).toBe('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1');
    expect(fen?.pgn).toContain('[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]');
    expect(treeContent('1. e4 Ke7 2. Qh5 Ke6 3. Qxe5#  *')).toBeNull();
    expect(positionKey('8/8/8/8/8/8/8/K6k w - - 5 40')).toBe('8/8/8/8/8/8/8/K6k w');
    expect(fitsChapter({ nodes: MAX_CHAPTER_NODES, pgn: '' }, 'x')).toBe(true);
    expect(fitsChapter({ nodes: MAX_CHAPTER_NODES + 1, pgn: '' }, 'x')).toBe(false);
    expect(fitsChapter({ nodes: 1, pgn: 'x'.repeat(100_000) }, 'x')).toBe(false);
  });

  it('writes a chapter with its name and no other tags but the start', () => {
    const pgn = chapterPgn({ name: '  My  line ', pgn: RICH });
    expect(pgn).toMatch(/^\[ChapterName "My line"\]\n\n/);
    expect(pgn).not.toContain('[Event');
    expect(chapterPgn({ name: 'K+P', pgn: FEN_PGN })).toContain('[FEN "8/8/8/4k3/8/8/4P3/4K3 w');
  });
});

describe('reading a study export', () => {
  it('reads every chapter with its id, name, side and content; skips what it cannot read', async () => {
    const fake = new FakeLichess();
    const token = fake.issueToken();
    const study = fake.addStudy('Chess Trainer · Repertoires', [
      { name: 'Italian', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 *', orientation: 'white' },
      { name: 'Caro', pgn: '1. e4 c6 2. d4 d5 *', orientation: 'black' },
      { name: 'Broken', pgn: '1. e4 e5 2. Ke3 Ke6 3. Qq9 *' },
    ]);
    fake.addStudy('Something else', [{ name: 'Other', pgn: '1. d4 *' }]);
    const res = await fake.handle({
      method: 'GET',
      url: `https://lichess.org/api/study/${study.id}.pgn?orientation=true`,
      headers: { authorization: `Bearer ${token}` },
      body: '',
    });
    const app: AppStudy = {
      id: study.id,
      kind: 'repertoire',
      group: 'Repertoires',
      part: 1,
      updatedAt: 0,
    };
    const { chapters, unreadable } = chaptersFromExport(app, res.body);
    expect(chapters.map((c) => [c.name, c.color, c.chapterId])).toEqual([
      ['Italian', 'white', study.chapters[0]?.id],
      ['Caro', 'black', study.chapters[1]?.id],
    ]);
    expect(unreadable).toEqual([`${study.id}/${study.chapters[2]?.id}`]);
    expect(chapters[0]?.movesHash).toBe(treeContent('1. e4 e5 2. Nf3 Nc6 3. Bc4 *')?.movesHash);
    // The blank chapter of a new study is known as such.
    const fresh = fake.addStudy('Chess Trainer · Analyses: X');
    const blank = await fake.handle({
      method: 'GET',
      url: `https://lichess.org/api/study/${fresh.id}.pgn`,
      headers: { authorization: `Bearer ${token}` },
      body: '',
    });
    const read = chaptersFromExport({ ...app, id: fresh.id }, blank.body);
    expect(read.chapters.map((c) => [c.name, c.blank])).toEqual([['Chapter 1', true]]);
  });
});

/* ------------------------------------------------------------------ */
/* Reconciling                                                        */
/* ------------------------------------------------------------------ */

const S = 'st000001';
const PGN_A = '1. e4 e5 2. Nf3 *';
const PGN_B = '1. e4 e5 2. Nf3 Nc6 *';
const PGN_C = '1. d4 d5 *';

function item(key: string, pgn: string, overrides: Partial<SyncItem> = {}): SyncItem {
  const content = treeContent(pgn);
  if (!content) throw new Error(`bad PGN ${pgn}`);
  return {
    key,
    kind: key.startsWith('rep:') ? 'repertoire' : 'analysis',
    group: key.startsWith('rep:') ? 'Repertoires' : 'My analyses',
    name: key.slice(4),
    color: 'white',
    pgn: content.pgn,
    startFen: content.startFen,
    hash: content.hash,
    movesHash: content.movesHash,
    fits: true,
    blank: content.blank,
    ...overrides,
  };
}

function chapter(chapterId: string, of: SyncItem, overrides: Partial<RemoteChapter> = {}) {
  const remote: RemoteChapter = {
    studyId: S,
    chapterId,
    kind: of.kind,
    group: of.group,
    name: fitName(of.name),
    color: of.color,
    pgn: of.pgn,
    startFen: of.startFen,
    // Lichess's own version hashes differently: each side is compared with itself.
    hash: `remote-${of.hash}`,
    movesHash: of.movesHash,
    blank: false,
    ...overrides,
  };
  return remote;
}

function linkOf(of: SyncItem, remote: RemoteChapter): StudyLink {
  return {
    studyId: remote.studyId,
    chapterId: remote.chapterId,
    localHash: of.hash,
    remoteHash: remote.hash,
    name: fitName(of.name),
    group: of.group,
    color: of.kind === 'repertoire' ? of.color : null,
  };
}

function decide(input: Partial<ReconcileInput>) {
  return reconcile({
    items: [],
    chapters: [],
    links: {},
    listed: new Set([S]),
    read: new Set([S]),
    ...input,
  });
}

const kinds = (actions: ReturnType<typeof reconcile>) => actions.map((a) => a.type);

describe('reconcile', () => {
  const base = item('rep:Italian', PGN_A);
  const remote = chapter('ch000001', base);
  const links = { [base.key]: linkOf(base, remote) };

  it('does nothing when neither side changed', () => {
    expect(decide({ items: [base], chapters: [remote], links })).toEqual([]);
  });

  it('sends new moves, and replaces the chapter for a new name, side, start or list', () => {
    const moved = item('rep:Italian', PGN_B);
    expect(decide({ items: [moved], chapters: [remote], links })).toEqual([
      { type: 'push-update', item: moved, link: links[base.key] },
    ]);
    for (const changed of [
      { ...base, name: 'Italian Game' },
      { ...base, color: 'black' as const },
      item('rep:Italian', '[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. Kd2 *'),
    ]) {
      expect(kinds(decide({ items: [changed], chapters: [remote], links }))).toEqual([
        'push-replace',
      ]);
    }
    const analysis = item('ana:Line', PGN_A);
    const analysisRemote = chapter('ch000002', analysis);
    const moved2 = { ...analysis, group: 'Openings' };
    expect(
      kinds(
        decide({
          items: [moved2],
          chapters: [analysisRemote],
          links: { [analysis.key]: linkOf(analysis, analysisRemote) },
        }),
      ),
    ).toEqual(['push-replace']);
  });

  it('takes what changed on Lichess: moves, name or side', () => {
    for (const changed of [
      { ...remote, hash: 'remote-other' },
      { ...remote, name: 'Italian Game' },
      { ...remote, color: 'black' as const },
    ]) {
      expect(decide({ items: [base], chapters: [changed], links })).toEqual([
        { type: 'pull-update', key: base.key, chapter: changed },
      ]);
    }
    // An analysis's side is not its own (it always faces White).
    const analysis = item('ana:Line', PGN_A);
    const analysisRemote = chapter('ch000002', analysis);
    expect(
      decide({
        items: [analysis],
        chapters: [{ ...analysisRemote, color: 'black' }],
        links: { [analysis.key]: linkOf(analysis, analysisRemote) },
      }),
    ).toEqual([]);
  });

  it('keeps both versions when both sides changed', () => {
    const local = item('rep:Italian', PGN_B);
    const changed = { ...remote, hash: 'remote-other', pgn: PGN_C };
    expect(decide({ items: [local], chapters: [changed], links })).toEqual([
      { type: 'pull-new', chapter: changed, name: 'Italian (Lichess)' },
      { type: 'push-update', item: local, link: links[base.key] },
    ]);
    // An emptied chapter is not worth a copy.
    expect(
      kinds(decide({ items: [local], chapters: [{ ...changed, blank: true }], links })),
    ).toEqual(['push-update']);
  });

  it('follows deletions either way, unless the other side changed meanwhile', () => {
    const deleted = new Set([base.key]);
    expect(decide({ items: [], chapters: [remote], links, deleted })).toEqual([
      { type: 'push-delete', key: base.key, link: links[base.key] },
    ]);
    const changed = { ...remote, hash: 'remote-other' };
    expect(decide({ items: [], chapters: [changed], links, deleted })).toEqual([
      { type: 'pull-new', chapter: changed, name: 'Italian', replacesKey: base.key },
    ]);
    expect(decide({ items: [base], chapters: [], links })).toEqual([
      { type: 'pull-delete', key: base.key },
    ]);
    const local = item('rep:Italian', PGN_B);
    expect(decide({ items: [local], chapters: [], links })).toEqual([
      { type: 'push-new', item: local, replacesKey: base.key },
    ]);
  });

  it('brings back an item that went missing here without being deleted', () => {
    expect(decide({ items: [], chapters: [remote], links })).toEqual([
      { type: 'pull-new', chapter: remote, name: 'Italian', replacesKey: base.key },
    ]);
    // An emptied chapter has nothing to bring back.
    expect(decide({ items: [], chapters: [{ ...remote, blank: true }], links })).toEqual([
      { type: 'unlink', key: base.key },
    ]);
  });

  it('sends everything again when a whole study is gone, and decides nothing for an unread one', () => {
    expect(
      decide({ items: [base], chapters: [], links, listed: new Set(), read: new Set() }),
    ).toEqual([{ type: 'push-new', item: base, replacesKey: base.key }]);
    expect(decide({ items: [base], chapters: [], links, read: new Set() })).toEqual([]);
    expect(decide({ items: [], chapters: [], links, read: new Set() })).toEqual([]);
    expect(decide({ items: [], chapters: [], links })).toEqual([{ type: 'unlink', key: base.key }]);
    expect(decide({ items: [], chapters: [], links, listed: new Set() })).toEqual([
      { type: 'unlink', key: base.key },
    ]);
  });

  it('leaves frozen chapters alone', () => {
    const frozen = new Set([`${S}/${remote.chapterId}`]);
    expect(decide({ items: [], chapters: [], links, frozen })).toEqual([]);
    expect(
      decide({ items: [item('rep:Italian', PGN_B)], chapters: [remote], links, frozen }),
    ).toEqual([]);
  });

  it('links the same item on both sides, and sends or brings in the rest', () => {
    const local = item('rep:Italian', PGN_A);
    const twin = chapter('ch000009', local);
    const other = item('rep:Caro', PGN_C);
    const theirs = chapter('ch000010', item('rep:Italian', PGN_B));
    const blank = chapter('ch000011', item('rep:Chapter 1', '*'), { blank: true });
    expect(decide({ items: [local, other], chapters: [twin, theirs, blank] })).toEqual([
      { type: 'link', item: local, chapter: twin },
      { type: 'push-new', item: other },
      // A name in use here is fine: the lists allow two of a name.
      { type: 'pull-new', chapter: theirs, name: 'Italian' },
    ]);
    // Two identical items, one chapter: one is linked, the other goes up.
    const copy = { ...local, key: 'rep:Italian copy' };
    expect(kinds(decide({ items: [local, copy], chapters: [twin] }))).toEqual(['link', 'push-new']);
    // A twin must match name, side and start too.
    expect(kinds(decide({ items: [{ ...local, color: 'black' }], chapters: [twin] }))).toEqual([
      'push-new',
      'pull-new',
    ]);
  });

  it('compares moves alone until Lichess’s own version of a sent chapter is known', () => {
    const pending = {
      [base.key]: { ...links[base.key]!, remoteHash: pendingRemoteHash(base.movesHash) },
    };
    expect(decide({ items: [base], chapters: [remote], links: pending })).toEqual([
      { type: 'link', item: base, chapter: remote },
    ]);
    const edited = { ...remote, hash: 'remote-x', movesHash: item('rep:x', PGN_B).movesHash };
    expect(kinds(decide({ items: [base], chapters: [edited], links: pending }))).toEqual([
      'pull-update',
    ]);
  });
});
