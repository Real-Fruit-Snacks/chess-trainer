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
  /** Chunk files (500 puzzles each), in rating order. */
  files: string[];
  /** Older indexes: a single file per bucket. */
  file?: string;
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

/** Loads every chunk of a bucket. */
export async function loadBucket(bucket: PuzzleBucket): Promise<Puzzle[]> {
  const files = bucketFiles(bucket);
  const chunks = await Promise.all(files.map((_, i) => loadBucketChunk(bucket, i)));
  return chunks.flat();
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

/**
 * Fetches every puzzle chunk so the service worker's runtime cache has all of
 * them. Resolves with the number of files fetched; the caller can abort.
 */
/** Attempts per file when storing every puzzle offline. */
const DOWNLOAD_ATTEMPTS = 3;

export async function downloadAllPuzzles(
  index: PuzzleIndex,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const urls = puzzleFileUrls(index);
  let done = 0;
  const workers = 4;
  let next = 0;
  const fetchWithRetries = async (url: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
      if (signal?.aborted) return;
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
        await res.arrayBuffer();
        return;
      } catch (err) {
        if (signal?.aborted) return;
        lastError = err;
        // A flaky connection or a busy server: wait a little and try again.
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  };
  const run = async () => {
    while (next < urls.length) {
      if (signal?.aborted) return;
      const url = urls[next++];
      if (!url) return;
      await fetchWithRetries(url);
      if (signal?.aborted) return;
      done += 1;
      onProgress?.(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
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
};

/** Puzzles a set of opening tags covers, from the index counts (family or variation). */
export function puzzlesForTags(index: PuzzleIndex, tags: readonly string[]): number {
  return tags.reduce(
    (sum, tag) => sum + (index.openings?.[tag] ?? index.openingVariations?.[tag] ?? 0),
    0,
  );
}

/** "Sicilian_Defense_Najdorf_Variation" → "Sicilian Defense: Najdorf Variation". */
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
  'Defense',
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

  for (const window of [150, 250, 400, 600, 1000, 4000]) {
    const min = rating - window;
    const max = rating + window;
    const buckets = bucketsInRange(index, min, max);
    if (buckets.length === 0) continue;
    const pools = await Promise.all(buckets.map((b) => loadBucket(b)));
    const inRange = pools
      .flat()
      .filter((p) => p.rating >= min && p.rating <= max && p.id !== excludeId && matchesFilters(p));
    const unseen = inRange.filter((p) => !(p.id in seen));
    // Opening tactics are rarer (about a fifth of puzzles carry an opening), so
    // a handful of candidates is enough to pick from.
    const enough = openingTags ? 2 : 5;
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
    const buckets = bucketsInRange(index, min, max);
    if (buckets.length === 0) continue;
    const pools = await Promise.all(buckets.map((b) => loadBucket(b)));
    const candidates = pools
      .flat()
      .filter((p) => p.rating >= min && p.rating <= max && !used.has(p.id));
    if (candidates.length >= 3 || (candidates.length > 0 && window >= 600)) {
      return pickRandom(candidates, random) ?? null;
    }
  }
  return null;
}

/** The same puzzle for everyone on a given day, chosen from the club-level bucket. */
export async function dailyPuzzle(dateKey: string): Promise<Puzzle | null> {
  const index = await loadPuzzleIndex();
  const bucket =
    index.buckets.find((b) => b.min <= 1500 && b.max >= 1500) ??
    index.buckets[Math.floor(index.buckets.length / 2)];
  if (!bucket) return null;
  const puzzles = await loadBucket(bucket);
  if (puzzles.length === 0) return null;
  const random = seededRandom(hashString(`daily:${dateKey}`));
  return puzzles[Math.floor(random() * puzzles.length)] ?? null;
}

/**
 * Finds a bundled (or own) puzzle by id. `ratingHint` (from a review card or
 * bookmark) says which bucket to look in first, which avoids loading them all.
 */
export async function findPuzzleById(id: string, ratingHint?: number): Promise<Puzzle | null> {
  if (isOwnPuzzleId(id)) {
    const { useProgress } = await import('@/store/progress');
    return useProgress.getState().ownPuzzles[id] ?? null;
  }
  const index = await loadPuzzleIndex();
  const ordered = [...index.buckets].sort((a, b) => {
    if (ratingHint === undefined) return 0;
    const da = ratingHint >= a.min && ratingHint <= a.max ? 0 : 1;
    const db = ratingHint >= b.min && ratingHint <= b.max ? 0 : 1;
    return da - db;
  });
  for (const bucket of ordered) {
    const puzzles = await loadBucket(bucket);
    const hit = puzzles.find((p) => p.id === id);
    if (hit) return hit;
  }
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
