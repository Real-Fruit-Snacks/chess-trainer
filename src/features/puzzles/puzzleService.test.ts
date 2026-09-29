import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '@/lib/random';
import {
  bucketsInRange,
  dailyPuzzle,
  loadPuzzleIndex,
  type Puzzle,
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
    { id: 'low', label: 'Low', min: 0, max: 999, count: 3, file: 'low.json' },
    { id: 'high', label: 'High', min: 1000, max: 9999, count: 3, file: 'high.json' },
  ],
  themes: { fork: 3, pin: 3 },
};

const low = [puzzle('l1', 600), puzzle('l2', 800, 'pin short'), puzzle('l3', 950)];
const high = [puzzle('h1', 1100, 'pin long'), puzzle('h2', 1500), puzzle('h3', 2200, 'pin long')];

describe('puzzleService', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const url = String(input);
        const body = url.endsWith('index.json')
          ? index
          : url.endsWith('low.json')
            ? low
            : url.endsWith('high.json')
              ? high
              : null;
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
