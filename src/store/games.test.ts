import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportedGame } from '@/lib/gameImport';
import { gameKey, MAX_STORED_GAMES, repairGames, sortedGames, useGames } from './games';

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
    expect(useGames.getState().addGames([make(1), make(2)], 'pgn')).toEqual({
      added: 2,
      dropped: 0,
    });
    expect(useGames.getState().addGames([make(1)], 'lichess')).toEqual({ added: 0, dropped: 0 });
    expect(Object.keys(useGames.getState().games)).toHaveLength(2);
  });

  it('caps the collection, keeps the newest and says how many had to go', () => {
    const many = Array.from({ length: MAX_STORED_GAMES + 5 }, (_, i) => make(i));
    expect(useGames.getState().addGames(many, 'pgn')).toEqual({
      added: MAX_STORED_GAMES + 5,
      dropped: 5,
    });
    const games = sortedGames(useGames.getState().games);
    expect(games).toHaveLength(MAX_STORED_GAMES);
    expect(games[0]?.timestamp).toBe(MAX_STORED_GAMES + 4);
  });

  it('evicts unreviewed games before reviewed ones when the cap is reached', () => {
    const review = {
      accuracy: { white: 90, black: 80 },
      counts: {
        white: { inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      depth: 10,
      at: 5,
    };
    // The oldest import of all is reviewed: it must survive the cap.
    useGames.getState().addGames([make(0)], 'pgn');
    useGames.getState().setReview(gameKey(make(0)), review);
    const many = Array.from({ length: MAX_STORED_GAMES + 10 }, (_, i) => make(i + 1));
    const result = useGames.getState().addGames(many, 'pgn');
    expect(result.dropped).toBe(11);
    expect(useGames.getState().games[gameKey(make(0))]?.review).not.toBeNull();
    expect(Object.keys(useGames.getState().games)).toHaveLength(MAX_STORED_GAMES);
  });

  it('replaces the store from a backup part and clears the player on reset', () => {
    useGames.getState().addGames([make(1)], 'pgn');
    useGames.getState().setPlayer('me');
    const game = useGames.getState().games[gameKey(make(1))];
    useGames
      .getState()
      .replaceState({ games: { other: { ...game!, id: 'other' } }, player: 'you' });
    expect(Object.keys(useGames.getState().games)).toEqual(['other']);
    expect(useGames.getState().player).toBe('you');
    useGames.getState().clear();
    expect(useGames.getState()).toMatchObject({ games: {}, player: '' });
  });

  it('keeps a live game’s source and the learner’s side, through a reload too', () => {
    const live: ImportedGame = { ...make(7), side: 'black' };
    expect(useGames.getState().addGames([live], 'online')).toEqual({ added: 1, dropped: 0 });
    const id = gameKey(live);
    expect(useGames.getState().games[id]).toMatchObject({ source: 'online', side: 'black' });
    // What a reload reads back: the stored blob is checked game by game.
    const saved = JSON.parse(
      JSON.stringify({ games: useGames.getState().games, player: '' }),
    ) as unknown;
    expect(repairGames(saved).games[id]).toMatchObject({ source: 'online', side: 'black' });
    // A side that is not one makes the entry unusable, as any damaged field does.
    (saved as { games: Record<string, { side: string }> }).games[id]!.side = 'green';
    expect(repairGames(saved).games[id]).toBeUndefined();
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
