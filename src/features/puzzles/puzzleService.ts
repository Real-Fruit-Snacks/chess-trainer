import type { Fen } from '@/chess/types';
import { isOwnPuzzleId } from './ownPuzzles';
import { hashString, pickRandom, seededRandom } from '@/lib/random';

export interface Puzzle {
  id: string;
  /** Position *before* the opponent's move that sets up the tactic. */
  fen: Fen;
  /** Space-separated UCI moves: opponent move first, then the solution alternating. */
  moves: string;
  rating: number;
  rd: number;
  popularity: number;
  plays: number;
  /** Space-separated Lichess theme tags. */
  themes: string;
  /** Source game on Lichess. */
  url: string;
  opening?: string;
}

export interface PuzzleBucket {
  id: string;
  label: string;
  min: number;
  max: number;
  count: number;
  /** Chunk files (500 puzzles each); every chunk samples the whole band. */
  files: string[];
  /** Rating span of each chunk file (same order as `files`); older indexes lack it. */
  ranges?: { min: number; max: number }[];
  /** Older indexes: a single file per bucket. */
  file?: string;
}

/** The puzzles of the chunks that could be loaded, and how many could not. */
export interface LoadedPuzzles {
  puzzles: Puzzle[];
  /** Chunk files that failed to load (offline, not cached). */
  failed: string[];
}

/** Thrown when a chunk file could not be loaded and the answer depends on it. */
export class PuzzleLoadError extends Error {
  constructor(files: string[]) {
    super(
      files.length === 1
        ? 'A puzzle file could not be loaded. Check your connection or download the puzzles for offline use in Settings.'
        : `${files.length} puzzle files could not be loaded. Check your connection or download the puzzles for offline use in Settings.`,
    );
    this.name = 'PuzzleLoadError';
  }
}

export interface PuzzleIndex {
  source: string;
  license: string;
  generatedAt: string;
  total: number;
  /** Puzzles per chunk file. */
  chunk?: number;
  buckets: PuzzleBucket[];
  themes: Record<string, number>;
  /** Puzzles per opening family (first Lichess opening tag), for the by-opening catalogue. */
  openings?: Record<string, number>;
  /** Puzzles per opening variation (second tag). */
  openingVariations?: Record<string, number>;
}

const BASE = `${import.meta.env.BASE_URL}puzzles/`;
/** Runtime cache the service worker keeps puzzle chunks in (see src/sw.ts). */
export const PUZZLE_CACHE = 'chess-trainer-puzzles';

let indexPromise: Promise<PuzzleIndex> | null = null;
const chunkCache = new Map<string, Promise<Puzzle[]>>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export function loadPuzzleIndex(): Promise<PuzzleIndex> {
  indexPromise ??= fetchJson<PuzzleIndex>(`${BASE}index.json`).catch((err: unknown) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

/** The chunk files of a bucket (one file for indexes made before chunking). */
export function bucketFiles(bucket: PuzzleBucket): string[] {
  if (bucket.files?.length) return bucket.files;
  return bucket.file ? [bucket.file] : [];
}

/** Loads one chunk of a bucket; chunks are fetched once and kept in memory. */
export function loadBucketChunk(bucket: PuzzleBucket, index: number): Promise<Puzzle[]> {
  const file = bucketFiles(bucket)[index];
  if (!file) return Promise.resolve([]);
  let promise = chunkCache.get(file);
  if (!promise) {
    promise = fetchJson<Puzzle[]>(`${BASE}${file}`).catch((err: unknown) => {
      chunkCache.delete(file);
      throw err;
    });
    chunkCache.set(file, promise);
  }
  return promise;
}

/**
 * The indexes of the chunks that can hold puzzles rated between `min` and
 * `max`. Without recorded ranges (older indexes) every chunk may.
 */
export function chunksInRange(bucket: PuzzleBucket, min: number, max: number): number[] {
  const files = bucketFiles(bucket);
  const ranges = bucket.ranges;
  const all = files.map((_, i) => i);
  if (ranges?.length !== files.length) return all;
  return all.filter((i) => {
    const r = ranges[i];
    return !r || (r.max >= min && r.min <= max);
  });
}

/** Some chunks of one bucket, in the order they should be loaded. */
interface ChunkPlan {
  bucket: PuzzleBucket;
  chunks: number[];
}

/**
 * Chunks a lazy load adds per bucket in each round, after the ones already in
 * memory: one (the precached first chunk), then two, then four, then the rest.
 */
const LAZY_ROUNDS = [1, 2, 4];

/**
 * Loads the planned chunks, keeping whatever arrives: offline, only the chunks
 * the service worker holds load, and the puzzles in them are still worth
 * playing. Rejects (with `PuzzleLoadError`) only when chunks were asked for and
 * none of them could be loaded.
 *
 * With `enough`, the load is lazy: chunks already in memory first (they cost
 * nothing), then the rest a few per bucket at a time (see `LAZY_ROUNDS`) until
 * `enough` holds for the puzzles loaded so far. Every chunk samples its whole
 * rating band, so one chunk per band usually answers.
 */
async function loadChunks(
  plan: ChunkPlan[],
  enough?: (puzzles: Puzzle[]) => boolean,
): Promise<LoadedPuzzles> {
  const puzzles: Puzzle[] = [];
  const failed: string[] = [];
  let attempted = 0;
  let loaded = 0;
  const fetchRound = async (round: ChunkPlan[]) => {
    const jobs = round.flatMap(({ bucket, chunks }) => chunks.map((i) => ({ bucket, i })));
    attempted += jobs.length;
    const settled = await Promise.allSettled(
      jobs.map(({ bucket, i }) => loadBucketChunk(bucket, i)),
    );
    settled.forEach((result, n) => {
      const job = jobs[n];
      if (!job) return;
      if (result.status === 'fulfilled') {
        loaded += 1;
        puzzles.push(...result.value);
      } else {
        failed.push(bucketFiles(job.bucket)[job.i] ?? `chunk ${job.i}`);
      }
    });
  };

  if (!enough) {
    await fetchRound(plan);
  } else {
    const queues = plan.map(({ bucket, chunks }) => {
      const files = bucketFiles(bucket);
      const inMemory = (i: number) => chunkCache.has(files[i] ?? '');
      return {
        bucket,
        ready: chunks.filter(inMemory),
        rest: chunks.filter((i) => !inMemory(i)),
      };
    });
    await fetchRound(queues.map((q) => ({ bucket: q.bucket, chunks: q.ready })));
    for (let round = 0; !enough(puzzles) && queues.some((q) => q.rest.length > 0); round++) {
      const size = LAZY_ROUNDS[round] ?? Infinity;
      await fetchRound(queues.map((q) => ({ bucket: q.bucket, chunks: q.rest.splice(0, size) })));
    }
  }
  if (attempted > 0 && loaded === 0) throw new PuzzleLoadError(failed);
  return { puzzles, failed };
}

/** Loads the given chunks of a bucket (all of them by default); see `loadChunks`. */
export function loadBucketChunks(
  bucket: PuzzleBucket,
  indexes: number[] = bucketFiles(bucket).map((_, i) => i),
): Promise<LoadedPuzzles> {
  return loadChunks([{ bucket, chunks: indexes }]);
}

/** Loads every chunk of a bucket that can be loaded (see `loadBucketChunks`). */
export async function loadBucket(bucket: PuzzleBucket): Promise<Puzzle[]> {
  return (await loadBucketChunks(bucket)).puzzles;
}

/**
 * The puzzles of every bucket that may hold ratings between `min` and `max`,
 * from the chunks overlapping that window only. Without `enough` every such
 * chunk is loaded; with it, only as many as it takes (see `loadChunks`).
 * Rejects when no chunk could be loaded at all; otherwise partial results are
 * returned.
 */
export function loadRange(
  index: PuzzleIndex,
  min: number,
  max: number,
  enough?: (puzzles: Puzzle[]) => boolean,
): Promise<LoadedPuzzles> {
  const plan = bucketsInRange(index, min, max).map((bucket) => ({
    bucket,
    chunks: chunksInRange(bucket, min, max),
  }));
  return loadChunks(plan, enough);
}

/** Every puzzle file URL, index first. */
export function puzzleFileUrls(index: PuzzleIndex): string[] {
  return [
    `${BASE}index.json`,
    ...index.buckets.flatMap((b) => bucketFiles(b).map((f) => `${BASE}${f}`)),
  ];
}

/** How many of the puzzle files the service worker holds for offline use. */
export async function countOfflinePuzzleFiles(
  index: PuzzleIndex,
): Promise<{ cached: number; total: number }> {
  const urls = puzzleFileUrls(index);
  if (typeof caches === 'undefined') return { cached: 0, total: urls.length };
  let cached = 0;
  try {
    const store = await caches.open(PUZZLE_CACHE);
    const keys = new Set((await store.keys()).map((r) => new URL(r.url).pathname));
    // The first chunk of every bucket and the index are precached rather than runtime-cached.
    const precached = await caches.keys();
    const precacheStores = await Promise.all(
      precached.filter((n) => n.includes('precache')).map((n) => caches.open(n)),
    );
    const precachedPaths = new Set<string>();
    for (const s of precacheStores) {
      for (const r of await s.keys()) precachedPaths.add(new URL(r.url).pathname);
    }
    for (const url of urls) {
      const path = new URL(url, location.origin).pathname;
      if (keys.has(path) || precachedPaths.has(path)) cached += 1;
    }
  } catch {
    return { cached: 0, total: urls.length };
  }
  return { cached, total: urls.length };
}

/** Attempts per file when storing every puzzle offline. */
const DOWNLOAD_ATTEMPTS = 3;

/**
 * Fetches every puzzle chunk so the service worker's runtime cache has all of
 * them. Resolves with the number of files fetched. Aborting through `signal`
 * ("Stop") is not a failure: the promise resolves with what was fetched so far
 * and the caller, which owns the signal, reports a stop. A file that still
 * fails after its retries rejects the promise and stops the other workers, so
 * nothing keeps downloading behind a reported failure.
 */
export async function downloadAllPuzzles(
  index: PuzzleIndex,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const urls = puzzleFileUrls(index);
  let done = 0;
  const workers = 4;
  let next = 0;
  const outcome: { failure: Error | null } = { failure: null };
  // One signal for the fetches: the caller's Stop, or a failure in another worker.
  const halt = new AbortController();
  const onAbort = () => halt.abort();
  if (signal?.aborted) halt.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const stopped = () => halt.signal.aborted;

  const fetchWithRetries = async (url: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
      if (stopped()) return;
      try {
        const res = await fetch(url, { signal: halt.signal });
        if (!res.ok) throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
        await res.arrayBuffer();
        return;
      } catch (err) {
        if (stopped()) return;
        lastError = err;
        // A flaky connection or a busy server: wait a little and try again.
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  };
  const run = async () => {
    while (next < urls.length && !stopped()) {
      const url = urls[next++];
      if (!url) return;
      try {
        await fetchWithRetries(url);
      } catch (err) {
        outcome.failure ??= err instanceof Error ? err : new Error(String(err));
        halt.abort();
        return;
      }
      if (stopped()) return;
      done += 1;
      onProgress?.(done, urls.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: workers }, run));
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (outcome.failure) throw outcome.failure;
  return done;
}

export function bucketsInRange(index: PuzzleIndex, min: number, max: number): PuzzleBucket[] {
  return index.buckets.filter((b) => b.max >= min && b.min <= max);
}

export interface SelectOptions {
  /** Player rating to target. */
  rating: number;
  /** Puzzle IDs already attempted, with their outcome. */
  seen: Record<string, 'solved' | 'failed'>;
  /** Only puzzles carrying at least one of these themes. */
  themes?: string[];
  /** Only puzzles from these openings (Lichess opening tags; a tag matches its sub-variations). */
  openings?: string[];
  /** Exclude this id (e.g. the puzzle just shown). */
  excludeId?: string | null;
  random?: () => number;
}

/** Whether a puzzle arose from one of the given openings ("Sicilian_Defense" also matches "Sicilian_Defense_Najdorf_Variation"). */
export function matchesOpening(puzzle: Pick<Puzzle, 'opening'>, tags: readonly string[]): boolean {
  if (!puzzle.opening) return false;
  const own = puzzle.opening.split(' ');
  return tags.some((tag) => own.some((t) => t === tag || t.startsWith(`${tag}_`)));
}

const OPENING_WORDS: Record<string, string> = {
  Queens: 'Queen’s',
  Kings: 'King’s',
  Petrovs: 'Petrov’s',
  Bishops: 'Bishop’s',
  Anderssens: 'Anderssen’s',
  Gedults: 'Gedult’s',
  Vant: 'Van ’t',
  // The app writes British English ("Caro-Kann Defence", as in the repertoires).
  Defense: 'Defence',
  Center: 'Centre',
};

/** Puzzles a set of opening tags covers, from the index counts (family or variation). */
export function puzzlesForTags(index: PuzzleIndex, tags: readonly string[]): number {
  return tags.reduce(
    (sum, tag) => sum + (index.openings?.[tag] ?? index.openingVariations?.[tag] ?? 0),
    0,
  );
}

/** "Sicilian_Defense_Najdorf_Variation" → "Sicilian Defence: Najdorf Variation". */
export function openingTagName(tag: string): string {
  const words = tag.split('_').map((w) => OPENING_WORDS[w] ?? w);
  for (const n of [3, 2]) {
    if (words.length >= n && FAMILY_ENDINGS.has(words[n - 1] ?? '')) {
      const rest = words.slice(n).join(' ');
      return rest ? `${words.slice(0, n).join(' ')}: ${rest}` : words.join(' ');
    }
  }
  return words.join(' ');
}

const FAMILY_ENDINGS = new Set([
  'Game',
  'Defence',
  'Opening',
  'Attack',
  'Gambit',
  'System',
  'Declined',
  'Accepted',
  'Lopez',
]);

/**
 * Picks a puzzle close to the player's rating. The search window starts at
 * ±150 and widens until enough unseen candidates are found; if the player has
 * exhausted the pool, previously failed puzzles are recycled before solved ones.
 */
export async function selectPuzzle(options: SelectOptions): Promise<Puzzle | null> {
  const { rating, seen, themes, openings, excludeId, random = Math.random } = options;
  const index = await loadPuzzleIndex();
  const themeSet = themes?.length ? new Set(themes) : null;
  const openingTags = openings?.length ? openings : null;

  const matchesTheme = (p: Puzzle) => !themeSet || p.themes.split(' ').some((t) => themeSet.has(t));
  const matchesFilters = (p: Puzzle) =>
    matchesTheme(p) && (!openingTags || matchesOpening(p, openingTags));
  // Opening tactics are rarer (about a fifth of puzzles carry an opening), so
  // a handful of candidates is enough to pick from.
  const enough = openingTags ? 2 : 5;

  for (const window of [150, 250, 400, 600, 1000, 4000]) {
    const min = rating - window;
    const max = rating + window;
    if (bucketsInRange(index, min, max).length === 0) continue;
    const candidate = (p: Puzzle) =>
      p.rating >= min && p.rating <= max && p.id !== excludeId && matchesFilters(p);
    // Only as many chunks as it takes: the window widens once every chunk in it was searched.
    const { puzzles } = await loadRange(index, min, max, (loaded) =>
      atLeast(loaded, enough, (p) => candidate(p) && !(p.id in seen)),
    );
    const inRange = puzzles.filter(candidate);
    const unseen = inRange.filter((p) => !(p.id in seen));
    if (unseen.length >= enough || (unseen.length > 0 && window >= 600)) {
      return pickRandom(unseen, random) ?? null;
    }
    if (window >= 4000) {
      // Everything has been attempted: recycle failed puzzles first, then any.
      const failed = inRange.filter((p) => seen[p.id] === 'failed');
      return pickRandom(failed.length ? failed : inRange, random) ?? null;
    }
  }
  return null;
}

/** Whether at least `count` of `puzzles` pass `test` (stops counting once they do). */
function atLeast(puzzles: Puzzle[], count: number, test: (p: Puzzle) => boolean): boolean {
  let found = 0;
  for (const p of puzzles) {
    if (test(p) && ++found >= count) return true;
  }
  return false;
}

/**
 * Picks a puzzle near `targetRating` that has not been used in the current
 * run. Used by Puzzle Rush, where difficulty climbs with every solve.
 */
export async function selectRushPuzzle(
  targetRating: number,
  used: Set<string>,
  random: () => number = Math.random,
): Promise<Puzzle | null> {
  const index = await loadPuzzleIndex();
  for (const window of [100, 200, 350, 600, 4000]) {
    const min = targetRating - window;
    const max = targetRating + window;
    if (bucketsInRange(index, min, max).length === 0) continue;
    const candidate = (p: Puzzle) => p.rating >= min && p.rating <= max && !used.has(p.id);
    const { puzzles } = await loadRange(index, min, max, (loaded) => atLeast(loaded, 3, candidate));
    const candidates = puzzles.filter(candidate);
    if (candidates.length >= 3 || (candidates.length > 0 && window >= 600)) {
      return pickRandom(candidates, random) ?? null;
    }
  }
  return null;
}

/**
 * The same puzzle for everyone on a given day, chosen from the club-level
 * bucket. The day's puzzle lives in one chunk, so only that chunk is loaded.
 * Offline, when that chunk is not stored, the day's pick comes from a chunk
 * that is (the precached first one) — a different puzzle from the online one,
 * but a daily puzzle all the same.
 */
export async function dailyPuzzle(dateKey: string): Promise<Puzzle | null> {
  const index = await loadPuzzleIndex();
  const bucket =
    index.buckets.find((b) => b.min <= 1500 && b.max >= 1500) ??
    index.buckets[Math.floor(index.buckets.length / 2)];
  if (!bucket || bucket.count === 0) return null;
  const random = seededRandom(hashString(`daily:${dateKey}`));
  const n = Math.floor(random() * bucket.count);
  const files = bucketFiles(bucket);
  const chunkSize = files.length > 1 ? Math.ceil(bucket.count / files.length) : bucket.count;
  const chunkIndex = Math.min(files.length - 1, Math.floor(n / chunkSize));
  try {
    const chunk = await loadBucketChunk(bucket, chunkIndex);
    return chunk[n - chunkIndex * chunkSize] ?? chunk[0] ?? null;
  } catch (err) {
    for (const [i] of files.entries()) {
      if (i === chunkIndex) continue;
      const other = await loadBucketChunk(bucket, i).catch(() => null);
      if (other?.length) return other[n % other.length] ?? null;
    }
    throw err instanceof Error ? new PuzzleLoadError([files[chunkIndex] ?? bucket.id]) : err;
  }
}

/**
 * How far (in rating points) from a rating hint a puzzle is still looked for.
 * A review card or a Progress link carries the puzzle's own rating; a
 * Woodpecker set its rating at creation, with puzzles within a few hundred
 * points of it. A puzzle further away than this is taken to be gone.
 */
const HINT_REACH = 700;

export interface FindPuzzleOptions {
  /**
   * How far from `ratingHint` the puzzle's own rating may be. 0 (the default)
   * means the hint is the puzzle's rating (a review card, a Progress link), so
   * its band is searched first and to the end. A Woodpecker set passes the
   * window it was built from: the bands within it are searched side by side, a
   * chunk or two of each at a time.
   */
  near?: number;
}

/**
 * Finds a bundled (or own) puzzle by id, loading as little as it can. Chunks
 * already in memory are searched first; then the bands nearest to
 * `ratingHint` (from a review card, a Woodpecker set or a Progress link), a
 * chunk or two at a time, stopping at the first hit. Without a hint every
 * band may be searched. Resolves null when the puzzle is in none of the files;
 * rejects when a file that might hold it could not be loaded, so callers can
 * tell "gone from the set" from "offline".
 */
export async function findPuzzleById(
  id: string,
  ratingHint?: number,
  options: FindPuzzleOptions = {},
): Promise<Puzzle | null> {
  if (isOwnPuzzleId(id)) {
    const { useProgress } = await import('@/store/progress');
    return useProgress.getState().ownPuzzles[id] ?? null;
  }
  const index = await loadPuzzleIndex();
  const has = (puzzles: Puzzle[]) => puzzles.some((p) => p.id === id);
  const hinted = ratingHint !== undefined && Number.isFinite(ratingHint);
  const hint = ratingHint ?? 0;
  // 0 when the hint falls inside the band; without a hint every band is as near as any other.
  const distance = (b: PuzzleBucket) => (hinted ? Math.max(0, b.min - hint, hint - b.max) : 0);
  const ordered = [...index.buckets]
    .filter((b) => distance(b) <= HINT_REACH)
    .sort((a, b) => distance(a) - distance(b));

  // Whatever is already in memory costs nothing to search.
  const inMemory = ordered.map((bucket) => ({
    bucket,
    chunks: bucketFiles(bucket)
      .map((file, i) => (chunkCache.has(file) ? i : -1))
      .filter((i) => i >= 0),
  }));
  const remembered = await loadChunks(inMemory).catch(() => null);
  const quick = remembered?.puzzles.find((p) => p.id === id);
  if (quick) return quick;

  // The chunks of a band in search order: with chunk ranges in the index, the ones that can
  // hold the hinted rating first.
  const planFor = (bucket: PuzzleBucket): ChunkPlan => {
    const all = bucketFiles(bucket).map((_, i) => i);
    const likely = hinted && distance(bucket) === 0 ? chunksInRange(bucket, hint, hint) : [];
    return { bucket, chunks: [...likely, ...all.filter((i) => !likely.includes(i))] };
  };
  const near = hinted ? Math.max(0, options.near ?? 0) : 0;
  const groups: PuzzleBucket[][] =
    near > 0
      ? [
          ordered.filter((b) => distance(b) <= near),
          ...ordered.filter((b) => distance(b) > near).map((b) => [b]),
        ]
      : ordered.map((b) => [b]);

  const failed: string[] = [];
  for (const group of groups) {
    const plan = group.map(planFor);
    let loaded: LoadedPuzzles;
    try {
      loaded = await loadChunks(plan, has);
    } catch (err) {
      if (!(err instanceof PuzzleLoadError)) throw err;
      for (const { bucket, chunks } of plan) {
        failed.push(...chunks.map((i) => bucketFiles(bucket)[i] ?? `chunk ${i}`));
      }
      continue;
    }
    const hit = loaded.puzzles.find((p) => p.id === id);
    if (hit) return hit;
    failed.push(...loaded.failed);
  }
  if (failed.length > 0) throw new PuzzleLoadError(failed);
  return null;
}

/** Splits the stored move string and exposes the solver's colour. */
export function puzzleMeta(puzzle: Puzzle) {
  const moves = puzzle.moves.split(' ');
  const fenTurn = puzzle.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  // The first move is the opponent's; the solver plays the other colour.
  const solverColor = fenTurn === 'white' ? 'black' : 'white';
  return { moves, solverColor, solverMoveCount: Math.ceil((moves.length - 1) / 2) } as const;
}
