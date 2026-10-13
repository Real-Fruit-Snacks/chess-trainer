import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript shared with the Node import scripts (no type declarations)
import * as layout from '../../../scripts/lib/puzzle-index.mjs';
import { seededRandom, shuffle } from '@/lib/random';

interface Rated {
  id: string;
  rating: number;
}

/** The chunk layout the import and reindex scripts write (scripts/lib/puzzle-index.mjs). */
const { dealChunks, chunkRange } = layout as unknown as {
  dealChunks: <T extends Rated>(puzzles: T[], chunkSize: number) => T[][];
  chunkRange: (chunk: Rated[]) => { min: number; max: number };
};

/** A band of 1,000 puzzles rated 1100–1399, several per rating. */
const band: Rated[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `p${String(i).padStart(4, '0')}`,
  rating: 1100 + ((i * 37) % 300),
}));

describe('puzzle chunk layout', () => {
  it('deals the band round-robin by rating, so every chunk spans the whole band', () => {
    const chunks = dealChunks(band, 250);
    expect(chunks).toHaveLength(4);
    expect(chunks.map((c) => c.length)).toEqual([250, 250, 250, 250]);
    const sorted = [...band].sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
    sorted.forEach((p, i) => expect(chunks[i % 4]?.[Math.floor(i / 4)]).toBe(p));
    for (const chunk of chunks) {
      const { min, max } = chunkRange(chunk);
      expect(min).toBeLessThanOrEqual(1101);
      expect(max).toBeGreaterThanOrEqual(1398);
    }
  });

  it('is deterministic: the order puzzles arrive in does not matter, and re-dealing changes nothing', () => {
    const first = dealChunks(band, 250);
    const shuffled = shuffle([...band], seededRandom(9));
    expect(dealChunks(shuffled, 250)).toEqual(first);
    expect(dealChunks(first.flat(), 250)).toEqual(first);
  });

  it('records the rating span of a chunk', () => {
    expect(
      chunkRange([
        { id: 'a', rating: 1300 },
        { id: 'b', rating: 1120 },
      ]),
    ).toEqual({
      min: 1120,
      max: 1300,
    });
    expect(chunkRange([])).toEqual({ min: 0, max: 0 });
  });
});
