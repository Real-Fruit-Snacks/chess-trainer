import { describe, expect, it } from 'vitest';
import {
  describeEngineSays,
  FIRST_ROUND_PLIES,
  MIN_LINE_PLIES,
  pickSequenceLine,
  pliesForRound,
  scoreAfterRound,
  sequenceLines,
} from './engineSays';
import type { OpeningLine } from './openingLines';

const line = (name: string, plies: number): OpeningLine => ({
  eco: 'C50',
  name,
  moves: Array.from({ length: plies }, (_, i) => (i % 2 === 0 ? 'e4' : 'e5')),
});

describe('engine says', () => {
  it('keeps long, uniquely named lines', () => {
    const lines = sequenceLines([
      line('short', 6),
      line('long', MIN_LINE_PLIES),
      line('long', MIN_LINE_PLIES + 2),
      line('longer', 20),
    ]);
    expect(lines.map((l) => l.name)).toEqual(['long', 'longer']);
    expect(pickSequenceLine(lines, () => 0.99)?.name).toBe('longer');
    expect(pickSequenceLine([])).toBeUndefined();
  });

  it('adds a move per round and scores the last full sequence', () => {
    expect(pliesForRound(1)).toBe(FIRST_ROUND_PLIES);
    expect(pliesForRound(4)).toBe(FIRST_ROUND_PLIES + 3);
    expect(scoreAfterRound(1)).toBe(0);
    expect(scoreAfterRound(2)).toBe(FIRST_ROUND_PLIES);
    expect(describeEngineSays(1)).toBe('1 move replayed from memory');
    expect(describeEngineSays(7)).toBe('7 moves replayed from memory');
  });
});
