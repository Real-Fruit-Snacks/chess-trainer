import type { Fen } from '@/chess/types';
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
  file: string;
}

export interface PuzzleIndex {
  source: string;
  license: string;
  generatedAt: string;
  total: number;
  buckets: PuzzleBucket[];
  themes: Record<string, number>;
}

const BASE = `${import.meta.env.BASE_URL}puzzles/`;

let indexPromise: Promise<PuzzleIndex> | null = null;
const bucketCache = new Map<string, Promise<Puzzle[]>>();

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

export function loadBucket(bucket: PuzzleBucket): Promise<Puzzle[]> {
  let promise = bucketCache.get(bucket.id);
  if (!promise) {
    promise = fetchJson<Puzzle[]>(`${BASE}${bucket.file}`).catch((err: unknown) => {
      bucketCache.delete(bucket.id);
      throw err;
    });
    bucketCache.set(bucket.id, promise);
  }
  return promise;
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
  /** Exclude this id (e.g. the puzzle just shown). */
  excludeId?: string | null;
  random?: () => number;
}

/**
 * Picks a puzzle close to the player's rating. The search window starts at
 * ±150 and widens until enough unseen candidates are found; if the player has
 * exhausted the pool, previously failed puzzles are recycled before solved ones.
 */
export async function selectPuzzle(options: SelectOptions): Promise<Puzzle | null> {
  const { rating, seen, themes, excludeId, random = Math.random } = options;
  const index = await loadPuzzleIndex();
  const themeSet = themes?.length ? new Set(themes) : null;

  const matchesTheme = (p: Puzzle) => !themeSet || p.themes.split(' ').some((t) => themeSet.has(t));

  for (const window of [150, 250, 400, 600, 1000, 4000]) {
    const min = rating - window;
    const max = rating + window;
    const buckets = bucketsInRange(index, min, max);
    if (buckets.length === 0) continue;
    const pools = await Promise.all(buckets.map((b) => loadBucket(b)));
    const inRange = pools
      .flat()
      .filter((p) => p.rating >= min && p.rating <= max && p.id !== excludeId && matchesTheme(p));
    const unseen = inRange.filter((p) => !(p.id in seen));
    if (unseen.length >= 5 || (unseen.length > 0 && window >= 600)) {
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

export async function findPuzzleById(id: string): Promise<Puzzle | null> {
  const index = await loadPuzzleIndex();
  for (const bucket of index.buckets) {
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
