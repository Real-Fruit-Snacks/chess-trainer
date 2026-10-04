import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeDtm,
  invertCategory,
  isTablebasePosition,
  lookupTablebase,
  normalizeTablebase,
  pieceCount,
  tablebaseCacheKey,
} from './tablebase';

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

describe('tablebase lookups', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('caches by position and halfmove clock, not by move number', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(Response.json({ category: 'win', dtz: 2, dtm: 3, moves: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
    await lookupTablebase(a);
    await lookupTablebase('4k3/8/8/8/8/8/8/3QK3 w - - 0 40');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await lookupTablebase('4k3/8/8/8/8/8/8/3QK3 w - - 90 60');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tablebaseCacheKey('4k3/8/8/8/8/8/8/3QK3 w - - 90 60')).toBe(
      '4k3/8/8/8/8/8/8/3QK3 w - - 90',
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports failures in words the panel can show', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(lookupTablebase('8/8/8/8/8/8/8/K6k w - - 0 1')).rejects.toThrow(/online/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('x', 'TimeoutError'))),
    );
    await expect(lookupTablebase('8/8/8/8/8/8/8/K6k w - - 0 2')).rejects.toThrow(/too long/);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    );
    await expect(lookupTablebase('8/8/8/8/8/8/8/K6k w - - 1 2')).rejects.toThrow(/HTTP 503/);
  });

  it('turns DTM plies into moves', () => {
    expect(describeDtm(10)).toBe('mate in 5');
    expect(describeDtm(-9)).toBe('mate in 5');
    expect(describeDtm(1)).toBe('mate in 1');
  });
});
