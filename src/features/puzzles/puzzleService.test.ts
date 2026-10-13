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
  type PuzzleBucket,
  puzzleFileUrls,
  puzzleMeta,
  selectPuzzle,
} from './puzzleService';
import type * as PuzzleServiceModule from './puzzleService';

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

describe('partial loading (offline)', () => {
  // Three chunks of a 1100–1399 bucket dealt round-robin, with their rating spans; `01` is
  // "not cached" and fails to load.
  const chunked = {
    source: 'test',
    license: 'CC0-1.0',
    generatedAt: '2024-01-01',
    chunk: 2,
    total: 8,
    buckets: [
      {
        id: 'b0800',
        label: 'Novice',
        min: 800,
        max: 1099,
        count: 2,
        files: ['b0800-00.json'],
        ranges: [{ min: 800, max: 1090 }],
      },
      {
        id: 'b1100',
        label: 'Casual',
        min: 1100,
        max: 1399,
        count: 6,
        files: ['b1100-00.json', 'b1100-01.json', 'b1100-02.json'],
        ranges: [
          { min: 1100, max: 1390 },
          { min: 1150, max: 1395 },
          { min: 1200, max: 1399 },
        ],
      },
    ],
    themes: {},
  };
  const chunks: Record<string, Puzzle[]> = {
    'b0800-00.json': [puzzle('n1', 800), puzzle('n2', 1090)],
    'b1100-00.json': [puzzle('c1', 1100), puzzle('c4', 1390)],
    'b1100-01.json': [puzzle('c2', 1150), puzzle('c5', 1395)],
    'b1100-02.json': [puzzle('c3', 1200), puzzle('c6', 1399)],
  };
  const requested: string[] = [];
  let service: typeof PuzzleServiceModule;

  beforeEach(async () => {
    requested.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const file = String(input).split('/').pop() ?? '';
        requested.push(file);
        if (file === 'index.json') return Promise.resolve(Response.json(chunked));
        if (file === 'b1100-01.json') return Promise.reject(new TypeError('Failed to fetch'));
        const body = chunks[file];
        if (!body) return Promise.resolve(new Response('not found', { status: 404 }));
        return Promise.resolve(Response.json(body));
      }),
    );
    vi.resetModules();
    service = await import('./puzzleService');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the chunks that loaded and names the ones that did not', async () => {
    const idx = await service.loadPuzzleIndex();
    const bucket = idx.buckets[1] as PuzzleBucket;
    const loaded = await service.loadBucketChunks(bucket);
    expect(loaded.puzzles.map((p) => p.id)).toEqual(['c1', 'c4', 'c3', 'c6']);
    expect(loaded.failed).toEqual(['b1100-01.json']);
    expect(await service.loadBucket(bucket)).toHaveLength(4);
  });

  it('rejects only when nothing at all could be loaded', async () => {
    const idx = await service.loadPuzzleIndex();
    const bucket = idx.buckets[1] as PuzzleBucket;
    await expect(service.loadBucketChunks(bucket, [1])).rejects.toBeInstanceOf(
      service.PuzzleLoadError,
    );
    const onlyMissing = {
      ...idx,
      buckets: [{ ...bucket, files: ['b1100-01.json'], ranges: [{ min: 1150, max: 1395 }] }],
    };
    await expect(service.loadRange(onlyMissing, 1150, 1150)).rejects.toThrow(/could not be loaded/);
    // With a sibling chunk in reach the window still yields puzzles.
    expect((await service.loadRange(idx, 1391, 1394)).failed).toEqual(['b1100-01.json']);
  });

  it('loads only the chunks whose rating span overlaps the window', async () => {
    const idx = await service.loadPuzzleIndex();
    const bucket = idx.buckets[1] as PuzzleBucket;
    expect(service.chunksInRange(bucket, 1100, 1140)).toEqual([0]);
    expect(service.chunksInRange(bucket, 1396, 1500)).toEqual([2]);
    expect(service.chunksInRange(bucket, 0, 5000)).toEqual([0, 1, 2]);
    // No ranges recorded (an older index): every chunk may hold the rating.
    expect(service.chunksInRange({ ...bucket, ranges: undefined }, 1100, 1140)).toEqual([0, 1, 2]);
    const { puzzles, failed } = await service.loadRange(idx, 1000, 1140);
    expect(puzzles.map((p) => p.id)).toEqual(['n1', 'n2', 'c1', 'c4']);
    expect(failed).toEqual([]);
    expect(requested).not.toContain('b1100-01.json');
    expect(requested).not.toContain('b1100-02.json');
  });

  it('still serves rated and rush puzzles when one chunk is missing', async () => {
    const chosen = await service.selectPuzzle({ rating: 1250, seen: {}, random: seededRandom(2) });
    expect(chosen).not.toBeNull();
    expect(chosen?.id).not.toBe('c2');
    expect(chosen?.id).not.toBe('c5');
    const rush = await service.selectRushPuzzle(1250, new Set(), seededRandom(2));
    expect(rush).not.toBeNull();
  });

  it('loads one chunk for the daily puzzle', async () => {
    const a = await service.dailyPuzzle('2026-10-03');
    const b = await service.dailyPuzzle('2026-10-03');
    expect(a?.id).toBe(b?.id);
    const chunkFiles = requested.filter((f) => f.startsWith('b1100-'));
    expect(new Set(chunkFiles).size).toBe(1);
  });

  it('finds a puzzle by id from its rating hint without loading the rest', async () => {
    const hit = await service.findPuzzleById('c6', 1399);
    expect(hit?.id).toBe('c6');
    expect(requested.filter((f) => f.endsWith('.json') && f !== 'index.json')).toEqual([
      'b1100-02.json',
    ]);
  });

  it('tells "not in the set" from "could not load" when looking a puzzle up', async () => {
    await expect(service.findPuzzleById('nope')).rejects.toBeInstanceOf(service.PuzzleLoadError);
    // The failing chunk is skipped when the puzzle turns up elsewhere.
    expect((await service.findPuzzleById('c3'))?.id).toBe('c3');
  });
});

describe('lazy loading (every chunk samples its band)', () => {
  // Four chunks dealt round-robin: each spans the whole 1100–1399 band. Only chunk 03 holds
  // the rare theme.
  const files = ['b1100-00.json', 'b1100-01.json', 'b1100-02.json', 'b1100-03.json'];
  const chunk = (k: number) =>
    Array.from({ length: 6 }, (_, j) =>
      puzzle(`r${k}-${j}`, 1100 + j * 55 + k * 5, k === 3 ? 'rare short' : 'fork short'),
    );
  const dealt = {
    source: 'test',
    license: 'CC0-1.0',
    generatedAt: '2024-01-01',
    chunk: 6,
    total: 24,
    buckets: [
      {
        id: 'b1100',
        label: 'Casual',
        min: 1100,
        max: 1399,
        count: 24,
        files,
        ranges: files.map((_, k) => ({ min: 1100 + k * 5, max: 1375 + k * 5 })),
      },
    ],
    themes: { fork: 18, rare: 6 },
  };
  const requested: string[] = [];
  let failing = new Set<string>();
  let service: typeof PuzzleServiceModule;
  const chunksRequested = () => requested.filter((f) => f !== 'index.json');

  beforeEach(async () => {
    requested.length = 0;
    failing = new Set();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const file = String(input).split('/').pop() ?? '';
        requested.push(file);
        if (file === 'index.json') return Promise.resolve(Response.json(dealt));
        if (failing.has(file)) return Promise.reject(new TypeError('Failed to fetch'));
        const k = files.indexOf(file);
        if (k < 0) return Promise.resolve(new Response('not found', { status: 404 }));
        return Promise.resolve(Response.json(chunk(k)));
      }),
    );
    vi.resetModules();
    service = await import('./puzzleService');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a rated or Rush puzzle from the first chunk alone', async () => {
    const chosen = await service.selectPuzzle({ rating: 1250, seen: {}, random: seededRandom(4) });
    expect(chosen?.id).toMatch(/^r0-/);
    expect(chunksRequested()).toEqual(['b1100-00.json']);
    const rush = await service.selectRushPuzzle(1250, new Set(), seededRandom(4));
    expect(rush?.id).toMatch(/^r0-/);
    expect(chunksRequested()).toEqual(['b1100-00.json']);
  });

  it('loads more chunks, a few at a time, only while a filter is not yet satisfied', async () => {
    const chosen = await service.selectPuzzle({
      rating: 1250,
      seen: {},
      themes: ['rare'],
      random: seededRandom(4),
    });
    expect(chosen?.themes).toContain('rare');
    // One chunk, then two more, then the rest.
    expect(chunksRequested()).toEqual(files);
  });

  it('keeps serving puzzles when the first chunk cannot be loaded', async () => {
    failing = new Set(['b1100-00.json']);
    const chosen = await service.selectPuzzle({ rating: 1250, seen: {}, random: seededRandom(4) });
    expect(chosen?.id).toMatch(/^r[12]-/);
    expect(chunksRequested()).toEqual(['b1100-00.json', 'b1100-01.json', 'b1100-02.json']);
  });

  it('looks a puzzle up chunk by chunk and stops at the one that holds it', async () => {
    expect((await service.findPuzzleById('r0-3', 1250))?.id).toBe('r0-3');
    expect(chunksRequested()).toEqual(['b1100-00.json']);
    expect((await service.findPuzzleById('r3-1', 1250))?.id).toBe('r3-1');
    expect(chunksRequested()).toEqual(files);
  });

  it('searches the chunks already in memory before fetching any', async () => {
    const idx = await service.loadPuzzleIndex();
    await service.loadBucketChunk(idx.buckets[0] as PuzzleBucket, 2);
    requested.length = 0;
    expect((await service.findPuzzleById('r2-5'))?.id).toBe('r2-5');
    expect(chunksRequested()).toEqual([]);
  });

  it('does not search bands far from the rating a link carries', async () => {
    expect(await service.findPuzzleById('nope', 3500)).toBeNull();
    expect(chunksRequested()).toEqual([]);
  });

  it('gives a daily puzzle offline from a chunk that is stored', async () => {
    failing = new Set(files.slice(1));
    const offline = await service.dailyPuzzle('2026-10-03');
    expect(offline?.id).toMatch(/^r0-/);
    expect(await service.dailyPuzzle('2026-10-03')).toEqual(offline);
    failing = new Set(files);
    vi.resetModules();
    service = await import('./puzzleService');
    await expect(service.dailyPuzzle('2026-10-03')).rejects.toBeInstanceOf(service.PuzzleLoadError);
  });
});

describe('looking a puzzle up near a rating', () => {
  // Two bands of three chunks each; every chunk spans its band.
  const bands = [
    { id: 'b0800', min: 800, max: 1099 },
    { id: 'b1100', min: 1100, max: 1399 },
  ];
  const fileOf = (band: string, k: number) => `${band}-0${k}.json`;
  const index2 = {
    source: 'test',
    license: 'CC0-1.0',
    generatedAt: '2024-01-01',
    chunk: 2,
    total: 12,
    buckets: bands.map((b) => ({
      ...b,
      label: b.id,
      count: 6,
      files: [0, 1, 2].map((k) => fileOf(b.id, k)),
      ranges: [0, 1, 2].map(() => ({ min: b.min, max: b.max })),
    })),
    themes: {},
  };
  const requested: string[] = [];
  let service: typeof PuzzleServiceModule;

  beforeEach(async () => {
    requested.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const file = String(input).split('/').pop() ?? '';
        if (file === 'index.json') return Promise.resolve(Response.json(index2));
        requested.push(file);
        const match = /^(b\d{4})-0(\d)\.json$/.exec(file);
        const band = bands.find((b) => b.id === match?.[1]);
        if (!match || !band) return Promise.resolve(new Response('not found', { status: 404 }));
        const k = Number(match[2]);
        return Promise.resolve(
          Response.json([
            puzzle(`${band.id}c${k}a`, band.min + 50),
            puzzle(`${band.id}c${k}b`, band.max - 50),
          ]),
        );
      }),
    );
    vi.resetModules();
    service = await import('./puzzleService');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches the bands within reach of a Woodpecker set side by side', async () => {
    // The set was built around 1150; its puzzle sits in the band below.
    expect((await service.findPuzzleById('b0800c0b', 1150, { near: 250 }))?.id).toBe('b0800c0b');
    expect(requested.sort()).toEqual(['b0800-00.json', 'b1100-00.json']);
  });

  it('searches the hinted band to the end first when the hint is the puzzle’s own rating', async () => {
    expect((await service.findPuzzleById('b0800c0b', 1150))?.id).toBe('b0800c0b');
    expect(requested).toEqual(['b1100-00.json', 'b1100-01.json', 'b1100-02.json', 'b0800-00.json']);
  });
});

describe('downloading every puzzle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const many = {
    source: 'test',
    license: 'CC0-1.0',
    generatedAt: '2024-01-01',
    total: 10,
    buckets: [
      {
        id: 'b1100',
        label: 'Casual',
        min: 1100,
        max: 1399,
        count: 10,
        files: Array.from({ length: 10 }, (_, i) => `b1100-${String(i).padStart(2, '0')}.json`),
      },
    ],
    themes: {},
  };

  it('treats Stop as a stop, not a failure: it resolves with what was fetched', async () => {
    const controller = new AbortController();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init?: RequestInit) => {
        calls += 1;
        if (calls === 3) controller.abort();
        if (init?.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
        return Promise.resolve(new Response('[]'));
      }),
    );
    const done = await downloadAllPuzzles(many, undefined, controller.signal);
    expect(done).toBeLessThan(11);
    expect(calls).toBeLessThan(11);
  });

  it('stops the other downloads once one file has failed for good', async () => {
    vi.useFakeTimers();
    const started: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const file = String(input).split('/').pop() ?? '';
        started.push(file);
        if (file === 'b1100-01.json') return Promise.resolve(new Response('busy', { status: 503 }));
        // Every other file hangs until it is aborted.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      }),
    );
    const settled = downloadAllPuzzles(many).then(
      () => 'resolved',
      (err: unknown) => (err instanceof Error ? err.message : 'rejected'),
    );
    await vi.runAllTimersAsync();
    expect(await settled).toMatch(/HTTP 503/);
    // Four workers started four files; after the failure no new file was started.
    expect(new Set(started).size).toBe(4);
  });
});

describe('openings', () => {
  it('names Lichess opening tags readably', () => {
    expect(openingTagName('Sicilian_Defense_Najdorf_Variation')).toBe(
      'Sicilian Defence: Najdorf Variation',
    );
    expect(openingTagName('Queens_Gambit_Declined')).toBe('Queen’s Gambit Declined');
    expect(openingTagName('Kings_Indian_Attack')).toBe('King’s Indian Attack');
    expect(openingTagName('Ruy_Lopez_Morphy_Defense')).toBe('Ruy Lopez: Morphy Defence');
    expect(openingTagName('Center_Game')).toBe('Centre Game');
    expect(openingTagName('Queens_Pawn_Game_London_System')).toBe(
      'Queen’s Pawn Game: London System',
    );
    expect(openingTagName('Caro-Kann_Defense')).toBe('Caro-Kann Defence');
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
