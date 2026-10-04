import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import type { Puzzle } from './puzzleService';

const puzzle = (id: string, rating: number): Puzzle => ({
  id,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: 'e2e4 e7e5 g1f3',
  rating,
  rd: 80,
  popularity: 95,
  plays: 1000,
  themes: 'fork short',
  url: 'https://lichess.org/abc',
});

// Three chunks dealt round-robin over the 1100–1399 band, 20 puzzles each.
const files = ['b1100-00.json', 'b1100-01.json', 'b1100-02.json'];
const chunk = (k: number) =>
  Array.from({ length: 20 }, (_, j) => puzzle(`w${k}-${j}`, 1100 + j * 15 + k * 5));
const index = {
  source: 'test',
  license: 'CC0-1.0',
  generatedAt: '2024-01-01',
  chunk: 20,
  total: 60,
  buckets: [
    {
      id: 'b1100',
      label: 'Casual',
      min: 1100,
      max: 1399,
      count: 60,
      files,
      ranges: files.map((_, k) => ({ min: 1100 + k * 5, max: 1385 + k * 5 })),
    },
  ],
  themes: {},
};

describe('chooseWoodpeckerPuzzles', () => {
  const requested: string[] = [];

  beforeEach(() => {
    requested.length = 0;
    useProgress.getState().resetAll();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const file = String(input).split('/').pop() ?? '';
        requested.push(file);
        if (file === 'index.json') return Promise.resolve(Response.json(index));
        const k = files.indexOf(file);
        return Promise.resolve(
          k < 0 ? new Response('not found', { status: 404 }) : Response.json(chunk(k)),
        );
      }),
    );
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a set from the first chunk when it holds enough unseen puzzles', async () => {
    const { chooseWoodpeckerPuzzles } = await import('./chooseWoodpeckerPuzzles');
    const ids = await chooseWoodpeckerPuzzles(10, 1250);
    expect(ids).toHaveLength(10);
    expect(ids.every((id) => id.startsWith('w0-'))).toBe(true);
    expect(requested.filter((f) => f !== 'index.json')).toEqual(['b1100-00.json']);
  });

  it('loads further chunks for a set bigger than one chunk can fill', async () => {
    const { chooseWoodpeckerPuzzles } = await import('./chooseWoodpeckerPuzzles');
    const ids = await chooseWoodpeckerPuzzles(40, 1250);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    expect(requested.filter((f) => f !== 'index.json')).toEqual(files);
  });
});
