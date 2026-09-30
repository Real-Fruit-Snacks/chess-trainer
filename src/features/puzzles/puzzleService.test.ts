import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '@/lib/random';
import {
  bucketFiles,
  bucketsInRange,
  countOfflinePuzzleFiles,
  dailyPuzzle,
  downloadAllPuzzles,
  matchesOpening,
  openingTagName,
  findPuzzleById,
  loadBucket,
  loadBucketChunk,
  loadPuzzleIndex,
  type Puzzle,
  puzzleFileUrls,
  puzzleMeta,
  selectPuzzle,
} from './puzzleService';

const puzzle = (id: string, rating: number, themes = 'fork short'): Puzzle => ({
  id,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: 'e2e4 e7e5 g1f3',
  rating,
  rd: 80,
  popularity: 95,
  plays: 1000,
  themes,
  url: 'https://lichess.org/abc',
});

const index = {
  source: 'test',
  license: 'CC0-1.0',
  generatedAt: '2024-01-01',
  total: 6,
  buckets: [
    { id: 'low', label: 'Low', min: 0, max: 999, count: 3, files: ['low-00.json', 'low-01.json'] },
    // An index from before chunking: one file per bucket.
    { id: 'high', label: 'High', min: 1000, max: 9999, count: 3, file: 'high.json', files: [] },
  ],
  themes: { fork: 3, pin: 3 },
};

const low = [puzzle('l1', 600), puzzle('l2', 800, 'pin short'), puzzle('l3', 950)];
const lowChunks: Record<string, Puzzle[]> = {
  'low-00.json': low.slice(0, 2),
  'low-01.json': low.slice(2),
};
const high = [puzzle('h1', 1100, 'pin long'), puzzle('h2', 1500), puzzle('h3', 2200, 'pin long')];

describe('puzzleService', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const url = String(input);
        const file = url.split('/').pop() ?? '';
        const body =
          file === 'index.json' ? index : file === 'high.json' ? high : (lowChunks[file] ?? null);
        if (!body) return Promise.resolve(new Response('not found', { status: 404 }));
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('caches the index', async () => {
    const a = await loadPuzzleIndex();
    const b = await loadPuzzleIndex();
    expect(a).toBe(b);
  });

  it('finds buckets overlapping a rating range', () => {
    expect(bucketsInRange(index, 900, 1100).map((b) => b.id)).toEqual(['low', 'high']);
    expect(bucketsInRange(index, 0, 500).map((b) => b.id)).toEqual(['low']);
  });

  it('selects an unseen puzzle near the rating, widening as needed', async () => {
    const random = seededRandom(1);
    const chosen = await selectPuzzle({ rating: 1000, seen: {}, random });
    expect(chosen).not.toBeNull();
    // With only a handful of puzzles the window widens until enough candidates exist.
    expect(['l1', 'l2', 'l3', 'h1', 'h2', 'h3']).toContain(chosen?.id);
  });

  it('filters by theme and excludes the current puzzle', async () => {
    const chosen = await selectPuzzle({
      rating: 1000,
      seen: {},
      themes: ['pin'],
      excludeId: 'l2',
      random: seededRandom(3),
    });
    expect(chosen?.themes).toContain('pin');
    expect(chosen?.id).not.toBe('l2');
  });

  it('recycles failed puzzles once everything has been seen', async () => {
    const seen = {
      l1: 'solved',
      l2: 'failed',
      l3: 'solved',
      h1: 'solved',
      h2: 'solved',
      h3: 'solved',
    } as const;
    const chosen = await selectPuzzle({ rating: 800, seen, random: seededRandom(5) });
    expect(chosen?.id).toBe('l2');
  });

  it('daily puzzle is deterministic per day', async () => {
    const a = await dailyPuzzle('2024-05-01');
    const b = await dailyPuzzle('2024-05-01');
    expect(a?.id).toBe(b?.id);
  });

  it('derives solver colour and move count', () => {
    const meta = puzzleMeta(puzzle('x', 1000));
    expect(meta.solverColor).toBe('black');
    expect(meta.solverMoveCount).toBe(1);
    expect(meta.moves).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });
});

describe('chunked buckets and offline files', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const file = String(input).split('/').pop() ?? '';
        const body =
          file === 'index.json' ? index : file === 'high.json' ? high : (lowChunks[file] ?? null);
        if (!body) return Promise.resolve(new Response('not found', { status: 404 }));
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads every chunk of a bucket once and single-file buckets as before', async () => {
    const idx = await loadPuzzleIndex();
    const lowBucket = idx.buckets[0];
    const highBucket = idx.buckets[1];
    if (!lowBucket || !highBucket) throw new Error('fixture');
    expect(bucketFiles(lowBucket)).toEqual(['low-00.json', 'low-01.json']);
    expect(bucketFiles(highBucket)).toEqual(['high.json']);
    expect((await loadBucket(lowBucket)).map((p) => p.id)).toEqual(['l1', 'l2', 'l3']);
    expect((await loadBucketChunk(lowBucket, 1)).map((p) => p.id)).toEqual(['l3']);
    expect(await loadBucketChunk(lowBucket, 5)).toEqual([]);
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    await loadBucket(lowBucket);
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(calls);
    expect(puzzleFileUrls(idx).map((u) => u.split('/').pop())).toEqual([
      'index.json',
      'low-00.json',
      'low-01.json',
      'high.json',
    ]);
  });

  it('downloads every file with progress and finds puzzles by id with a rating hint', async () => {
    const idx = await loadPuzzleIndex();
    const progress: number[] = [];
    expect(await downloadAllPuzzles(idx, (done) => progress.push(done))).toBe(4);
    expect(progress).toEqual([1, 2, 3, 4]);
    expect((await findPuzzleById('h3', 2000))?.id).toBe('h3');
    expect((await findPuzzleById('l2'))?.id).toBe('l2');
    expect(await findPuzzleById('nope')).toBeNull();
    // Without the Cache API nothing counts as offline.
    expect(await countOfflinePuzzleFiles(idx)).toEqual({ cached: 0, total: 4 });
  });

  it('retries a file that fails once and gives up after repeated failures', async () => {
    vi.useFakeTimers();
    const idx = await loadPuzzleIndex();
    const original = fetch;
    let failures = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (String(input).endsWith('low-01.json') && failures < 1) {
          failures += 1;
          return Promise.reject(new TypeError('network down'));
        }
        return original(input, init);
      }),
    );
    const done = downloadAllPuzzles(idx);
    await vi.runAllTimersAsync();
    expect(await done).toBe(4);
    expect(failures).toBe(1);

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        String(input).endsWith('high.json')
          ? Promise.resolve(new Response('busy', { status: 503 }))
          : original(input),
      ),
    );
    const failing = downloadAllPuzzles(idx);
    const settled = failing.then(
      () => 'resolved',
      (err: unknown) => (err instanceof Error ? err.message : 'rejected'),
    );
    await vi.runAllTimersAsync();
    expect(await settled).toMatch(/HTTP 503/);
    vi.useRealTimers();
  });
});

describe('openings', () => {
  it('names Lichess opening tags readably', () => {
    expect(openingTagName('Sicilian_Defense_Najdorf_Variation')).toBe(
      'Sicilian Defense: Najdorf Variation',
    );
    expect(openingTagName('Queens_Gambit_Declined')).toBe('Queen’s Gambit Declined');
    expect(openingTagName('Kings_Indian_Attack')).toBe('King’s Indian Attack');
    expect(openingTagName('Ruy_Lopez_Morphy_Defense')).toBe('Ruy Lopez: Morphy Defense');
    expect(openingTagName('Queens_Pawn_Game_London_System')).toBe(
      'Queen’s Pawn Game: London System',
    );
    expect(openingTagName('Caro-Kann_Defense')).toBe('Caro-Kann Defense');
    expect(openingTagName('Vant_Kruijs_Opening')).toBe('Van ’t Kruijs Opening');
  });

  it('matches a family tag against its variations', () => {
    const najdorf = { opening: 'Sicilian_Defense Sicilian_Defense_Najdorf_Variation' };
    expect(matchesOpening(najdorf, ['Sicilian_Defense'])).toBe(true);
    expect(matchesOpening(najdorf, ['Sicilian_Defense_Najdorf_Variation'])).toBe(true);
    expect(matchesOpening(najdorf, ['Sicilian_Defense_Alapin_Variation'])).toBe(false);
    expect(matchesOpening({ opening: 'Sicilian_Defense' }, ['Sicilian_Def'])).toBe(false);
    expect(matchesOpening({}, ['Sicilian_Defense'])).toBe(false);
  });
});
