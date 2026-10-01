import type { Square } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import type { EngineClient, SearchResult } from '@/engine/EngineClient';
import { getLevel } from '@/engine/levels';
import { chooseLevelMove, ensureSkill, type SkillCache } from './engineMove';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fakeClient(result: Partial<SearchResult>) {
  const setOption = vi.fn(() => Promise.resolve());
  const search = vi.fn(() => ({
    id: 1,
    stop: () => undefined,
    result: Promise.resolve({
      bestmove: { move: 'e2e4' },
      lines: new Map(),
      stopped: false,
      ...result,
    }),
  }));
  return { client: { setOption, search } as unknown as EngineClient, setOption, search };
}

const legal = new Map<Square, Square[]>([
  ['e2', ['e3', 'e4']],
  ['g1', ['f3', 'h3']],
]);
const pieceAt = (square: Square) => (square === 'e2' ? { type: 'p' } : { type: 'n' });

describe('chooseLevelMove', () => {
  it('sends the skill level once per cache', async () => {
    const { client, setOption } = fakeClient({});
    const cache: SkillCache = { skill: null };
    await ensureSkill(client, cache, 5);
    await ensureSkill(client, cache, 5);
    expect(setOption).toHaveBeenCalledTimes(1);
    expect(setOption).toHaveBeenCalledWith('Skill Level', 5);
    await ensureSkill(client, cache, 20);
    expect(setOption).toHaveBeenCalledTimes(2);
  });

  it('plays the engine move at single-line levels and passes the level limits', async () => {
    const { client, search } = fakeClient({ bestmove: { move: 'g1f3' } });
    const level = getLevel(6);
    const move = await chooseLevelMove(
      client,
      { skill: null },
      {
        level,
        fen: START,
        moves: [],
        legal,
        pieceAt,
      },
    );
    expect(move).toBe('g1f3');
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ movetime: level.movetime, multipv: 1, fen: START }),
    );
  });

  it('samples among the ranked lines at multi-line levels', async () => {
    const lines = new Map([
      [1, { multipv: 1, pv: ['e2e4'] }],
      [2, { multipv: 2, pv: ['g1f3'] }],
      [3, { multipv: 3, pv: ['e2e3'] }],
    ]);
    const { client } = fakeClient({ lines: lines as SearchResult['lines'] });
    const level = { ...getLevel(3), randomMoveChance: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const move = await chooseLevelMove(
        client,
        { skill: null },
        {
          level,
          fen: START,
          moves: [],
          legal,
          pieceAt,
        },
      );
      if (move) seen.add(move);
    }
    expect([...seen].every((m) => ['e2e4', 'g1f3', 'e2e3'].includes(m))).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('plays a random legal move (queening when it promotes) when the level says so', async () => {
    const { client, search } = fakeClient({});
    const level = { ...getLevel(1), randomMoveChance: 1 };
    const promoting = new Map<Square, Square[]>([['a7', ['a8']]]);
    const move = await chooseLevelMove(
      client,
      { skill: null },
      {
        level,
        fen: '8/P7/8/8/8/8/8/k6K w - - 0 1',
        moves: [],
        legal: promoting,
        pieceAt: () => ({ type: 'p' }),
      },
    );
    expect(move).toBe('a7a8q');
    expect(search).not.toHaveBeenCalled();
  });

  it('returns null when the search was stopped', async () => {
    const { client } = fakeClient({ stopped: true, bestmove: { move: null } });
    const move = await chooseLevelMove(
      client,
      { skill: null },
      {
        level: getLevel(5),
        fen: START,
        moves: [],
        legal,
        pieceAt,
      },
    );
    expect(move).toBeNull();
  });
});
