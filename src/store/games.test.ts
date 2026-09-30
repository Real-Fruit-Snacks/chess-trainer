import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportedGame } from '@/lib/gameImport';
import { gameKey, MAX_STORED_GAMES, sortedGames, useGames } from './games';

const make = (n: number, url: string | null = null): ImportedGame => ({
  id: `g${n}`,
  pgn: `1. e4 e5 ${n}`,
  white: 'a',
  black: 'b',
  result: '*',
  date: '',
  event: '',
  url,
  plies: 2,
  speed: null,
  rated: null,
  timestamp: n,
});

describe('games store', () => {
  beforeEach(() => useGames.getState().clear());

  it('keys games by URL or PGN hash and ignores duplicates', () => {
    expect(gameKey(make(1, 'https://lichess.org/x'))).toBe('https://lichess.org/x');
    expect(gameKey(make(1))).toMatch(/^pgn-/);
    expect(gameKey(make(1))).toBe(gameKey({ url: null, pgn: '1. e4  e5   1' }));
    expect(useGames.getState().addGames([make(1), make(2)], 'pgn')).toBe(2);
    expect(useGames.getState().addGames([make(1)], 'lichess')).toBe(0);
    expect(Object.keys(useGames.getState().games)).toHaveLength(2);
  });

  it('caps the collection and keeps the newest', () => {
    const many = Array.from({ length: MAX_STORED_GAMES + 5 }, (_, i) => make(i));
    useGames.getState().addGames(many, 'pgn');
    const games = sortedGames(useGames.getState().games);
    expect(games).toHaveLength(MAX_STORED_GAMES);
    expect(games[0]?.timestamp).toBe(MAX_STORED_GAMES + 4);
  });

  it('stores reviews and the player name', () => {
    useGames.getState().addGames([make(1)], 'pgn');
    const id = gameKey(make(1));
    useGames.getState().setReview(id, {
      accuracy: { white: 90, black: 80 },
      counts: {
        white: { inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { inaccuracy: 1, mistake: 0, blunder: 1 },
      },
      depth: 10,
      at: 5,
    });
    expect(useGames.getState().games[id]?.review?.accuracy.black).toBe(80);
    useGames.getState().setPlayer('  alice ');
    expect(useGames.getState().player).toBe('alice');
    useGames.getState().removeGame(id);
    expect(useGames.getState().games[id]).toBeUndefined();
  });
});
