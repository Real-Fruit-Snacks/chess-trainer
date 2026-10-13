import { beforeEach, describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { parsePgnGames } from '@/lib/gameImport';
import {
  DEFAULT_COLLECTION,
  groupAnalyses,
  MAX_ANALYSES,
  repairAnalyses,
  studyChapters,
  useAnalyses,
} from './analyses';

const PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) a6 *';

describe('analysis library', () => {
  beforeEach(() => {
    localStorage.clear();
    useAnalyses.getState().clear();
  });

  it('saves, groups by collection, renames and removes', () => {
    const a = useAnalyses
      .getState()
      .save({ name: ' Ruy ', pgn: PGN, startFen: START_FEN, moves: 4 });
    const b = useAnalyses
      .getState()
      .save({ name: 'Italian', collection: 'Openings', pgn: PGN, startFen: START_FEN, moves: 4 });
    expect(a.name).toBe('Ruy');
    expect(a.collection).toBe(DEFAULT_COLLECTION);
    const groups = groupAnalyses(useAnalyses.getState().items);
    expect(groups.map((g) => g.collection)).toEqual([DEFAULT_COLLECTION, 'Openings']);
    useAnalyses.getState().update(b.id, { name: 'Italian Game', collection: '' });
    expect(useAnalyses.getState().items[b.id]?.name).toBe('Italian Game');
    expect(useAnalyses.getState().items[b.id]?.collection).toBe('Openings');
    useAnalyses.getState().removeCollection('Openings');
    expect(Object.keys(useAnalyses.getState().items)).toEqual([a.id]);
    useAnalyses.getState().remove(a.id);
    expect(useAnalyses.getState().items).toEqual({});
  });

  it('splits a Lichess study export into named chapters of one collection', () => {
    const study = [
      '[Event "My study: Chapter 1"]\n[Site "https://lichess.org/study/abc/def"]\n[ChapterName "The Ruy"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *',
      '[Event "My study: Chapter 2"]\n[Site "https://lichess.org/study/abc/ghi"]\n[FEN "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1"]\n[SetUp "1"]\n\n1. Kd3 Kd5 *',
    ].join('\n\n');
    const games = parsePgnGames(study);
    expect(games).toHaveLength(2);
    const { collection, chapters } = studyChapters(games);
    expect(collection).toBe('My study');
    expect(chapters.map((c) => c.name)).toEqual(['The Ruy', 'Chapter 2']);
    expect(chapters[1]?.startFen).toBe('8/8/8/4k3/8/4K3/4P3/8 w - - 0 1');
    expect(chapters[0]?.moves).toBe(3);
  });

  it('replaces the library from a validated backup part, within the cap', () => {
    const saved = useAnalyses
      .getState()
      .save({ name: 'A', pgn: PGN, startFen: START_FEN, moves: 4 });
    const many = Object.fromEntries(
      Array.from({ length: MAX_ANALYSES + 3 }, (_, i) => [
        `an-${i}`,
        { ...saved, id: `an-${i}`, name: `B${i}`, updatedAt: i },
      ]),
    );
    useAnalyses.getState().replaceState({ items: many });
    const items = useAnalyses.getState().items;
    // Replaced, not merged: the entry saved before the import is gone …
    expect(items[saved.id]).toBeUndefined();
    // … and the cap holds, the oldest entries going first.
    expect(Object.keys(items)).toHaveLength(MAX_ANALYSES);
    expect(items['an-0']).toBeUndefined();
    expect(items[`an-${MAX_ANALYSES + 2}`]).toBeDefined();
  });

  it('repairs a stored blob: damaged entries are dropped, unknown keys kept', () => {
    const good = {
      id: 'ok',
      name: 'Ok',
      collection: 'C',
      pgn: PGN,
      startFen: START_FEN,
      moves: 4,
      createdAt: 1,
      updatedAt: 1,
    };
    const repaired = repairAnalyses({ items: { ok: good, bad: { id: 'bad' } }, future: 1 });
    expect(Object.keys(repaired.items)).toEqual(['ok']);
    expect(repaired.future).toBe(1);
    expect(repairAnalyses('nope').items).toEqual({});
  });
});
