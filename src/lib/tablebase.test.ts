import { describe, expect, it } from 'vitest';
import { invertCategory, isTablebasePosition, normalizeTablebase, pieceCount } from './tablebase';

describe('tablebase', () => {
  it('counts pieces', () => {
    expect(pieceCount('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(3);
    expect(isTablebasePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      false,
    );
  });

  it('flips per-move categories to the mover’s point of view and sorts best first', () => {
    const result = normalizeTablebase({
      category: 'win',
      dtz: 10,
      dtm: 12,
      moves: [
        { uci: 'd1d7', san: 'Qd7', category: 'draw', dtz: 0, dtm: null },
        { uci: 'd1d8', san: 'Qd8+', category: 'loss', dtz: -8, dtm: -10 },
        { uci: 'd1a1', san: 'Qa1', category: 'loss', dtz: -14, dtm: -20 },
        { uci: 'e1e2', san: 'Ke2', category: 'win', dtz: 3, dtm: 5 },
      ],
    });
    expect(result.category).toBe('win');
    expect(result.moves.map((m) => `${m.san}:${m.outcome}`)).toEqual([
      'Qd8+:win',
      'Qa1:win',
      'Qd7:draw',
      'Ke2:loss',
    ]);
    expect(invertCategory('cursed-win')).toBe('blessed-loss');
  });
});
