import { describe, expect, it } from 'vitest';
import { displayOpeningName, epdOf, findOpening, foldOpeningSpelling } from './openings';

const table = {
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': ['B00', "King's Pawn Game"] as [
    string,
    string,
  ],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': [
    'C40',
    "King's Knight Opening",
  ] as [string, string],
};

describe('openings', () => {
  it('strips move counters from the EPD', () => {
    expect(epdOf('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
    );
  });

  it('names the deepest known position and keeps it once out of book', () => {
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    ];
    expect(findOpening(table, fens)?.name).toBe("King's Knight Opening");
    expect(findOpening(table, fens.slice(0, 2))?.eco).toBe('B00');
    expect(findOpening(table, fens.slice(0, 1))).toBeNull();
  });

  it('writes opening names in British English for display, and matches either spelling', () => {
    expect(displayOpeningName('Center Game: Paulsen Attack')).toBe('Centre Game: Paulsen Attack');
    expect(displayOpeningName('Sicilian Defense: Najdorf Variation')).toBe(
      'Sicilian Defence: Najdorf Variation',
    );
    expect(displayOpeningName('Scandinavian Defense: Mieses-Kotroc Variation')).toBe(
      'Scandinavian Defence: Mieses-Kotroc Variation',
    );
    // Whole words only.
    expect(displayOpeningName('Defenseless Centerville')).toBe('Defenseless Centerville');
    expect(foldOpeningSpelling('French Defence')).toBe(foldOpeningSpelling('French Defense'));
    expect(foldOpeningSpelling('Centre')).toBe('centre');
    expect(displayOpeningName("King's Indian Defense")).toBe('King’s Indian Defence');
    expect(foldOpeningSpelling('King’s Indian')).toBe(foldOpeningSpelling("King's Indian"));
  });
});
