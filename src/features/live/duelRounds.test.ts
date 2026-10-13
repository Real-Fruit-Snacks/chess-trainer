import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '@/lib/random';
import type * as PuzzleServiceModule from '@/features/puzzles/puzzleService';
import type { Puzzle } from '@/features/puzzles/puzzleService';
import { describeGame, POSITIONS } from '@/features/arcade/positions';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { CLASSIC_GAME_IDS, duelContent } from '../../../relay/src/live/duelRules.mjs';
import { DUEL_RULES, LIMITS } from '../../../relay/src/live/shared.mjs';

const puzzleService = vi.hoisted(() => ({
  targets: [] as number[],
  /** How many puzzles there are to give before the service runs dry. */
  left: Infinity,
}));

vi.mock('@/features/puzzles/puzzleService', async (importOriginal) => {
  const actual = await importOriginal<typeof PuzzleServiceModule>();
  return {
    ...actual,
    selectRushPuzzle: (target: number, used: Set<string>) => {
      puzzleService.targets.push(target);
      if (puzzleService.left <= 0) return Promise.resolve(null);
      puzzleService.left -= 1;
      const n = puzzleService.targets.length;
      const puzzle: Puzzle = {
        id: `p${String(n).padStart(4, '0')}`,
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        moves: 'f1c4 g8f6 f3g5 d7d5',
        rating: Math.round(target),
        rd: 80,
        popularity: 90,
        plays: 1000,
        themes: 'fork',
        url: 'https://lichess.org/abcd',
      };
      expect(used.has(puzzle.id)).toBe(false);
      return Promise.resolve(puzzle);
    },
  };
});

import { arbiterRoundOf, classicReplays, prepareDuel, TIMED_RACE_PUZZLES } from './duelRounds';
import type { ArbiterItem, JudgeItem, RacePuzzle } from './types';

beforeEach(() => {
  puzzleService.targets = [];
  puzzleService.left = Infinity;
});

describe('a duel’s rounds', () => {
  it('deals a race of rounds near its level, and a timed race climbing from below it', async () => {
    const rounds = (await prepareDuel(
      'race',
      { format: 'best3', level: 1500 },
      seededRandom(1),
    )) as RacePuzzle[];
    expect(rounds).toHaveLength(DUEL_RULES.race.rounds);
    for (const target of puzzleService.targets) {
      expect(Math.abs(target - 1500)).toBeLessThanOrEqual(100);
    }
    expect(rounds[0]).toEqual({
      id: 'p0001',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      moves: 'f1c4 g8f6 f3g5 d7d5',
      rating: expect.any(Number) as number,
    });

    puzzleService.targets = [];
    const timed = (await prepareDuel('race', { format: 'timed', level: 1200 })) as RacePuzzle[];
    expect(timed.length).toBeLessThanOrEqual(TIMED_RACE_PUZZLES);
    expect(timed.length).toBeGreaterThanOrEqual(DUEL_RULES.race.timedMin);
    expect(puzzleService.targets.slice(0, 3)).toEqual([800, 830, 860]);
    // It fits in the one message the relay takes from the host.
    expect(JSON.stringify({ t: 'content', items: timed }).length).toBeLessThanOrEqual(
      LIMITS.contentBytes,
    );
  });

  it('says so when not enough puzzles can be found', async () => {
    puzzleService.left = 3;
    await expect(prepareDuel('race', { format: 'best3', level: 1500 })).rejects.toThrow(
      'Not enough puzzles could be loaded.',
    );
  });

  it('deals Who Stands Better? positions the relay takes', async () => {
    const items = (await prepareDuel('judge', {}, seededRandom(7))) as JudgeItem[];
    expect(items).toHaveLength(DUEL_RULES.judge.rounds);
    expect(duelContent('judge', {}, items)).toEqual(items);
    const perGame = new Map<string, number>();
    for (const item of items) perGame.set(item.game, (perGame.get(item.game) ?? 0) + 1);
    expect(Math.max(...perGame.values())).toBeLessThanOrEqual(2);
  });

  it('deals Arbiter rounds that both devices read back the same way', async () => {
    const items = (await prepareDuel(
      'arbiter',
      { pace: 'normal' },
      seededRandom(3),
    )) as ArbiterItem[];
    expect(items).toHaveLength(DUEL_RULES.arbiter.rounds);
    expect(duelContent('arbiter', { pace: 'normal' }, items)).toEqual(items);
    for (const item of items) {
      const round = arbiterRoundOf(item, classicReplays());
      expect(round, item.illegal.kind).not.toBeNull();
      expect(round!.illegal).toMatchObject({
        from: item.illegal.from,
        to: item.illegal.to,
        kind: item.illegal.kind,
      });
      expect(round!.lead.map((m) => m.from + m.to)).toEqual(item.lead.map((u) => u.slice(0, 4)));
      expect(round!.startFen).toBe(item.fen);
    }
  });

  it('comes from classic games the relay takes: every one this device can deal from', () => {
    const relayTakes = new Set(CLASSIC_GAME_IDS);
    // Arbiter's rounds come from the classic games, Who Stands Better?'s from their middlegames.
    expect(CLASSIC_GAMES.map((game) => game.id).filter((id) => !relayTakes.has(id))).toEqual([]);
    expect(POSITIONS.map((p) => p.gameId).filter((id) => !relayTakes.has(id))).toEqual([]);
    // A game this device does not know is never named by its id.
    expect(describeGame({ gameId: 'opera-game' })).toBe(
      'Paul Morphy – Duke of Brunswick & Count Isouard, 1858',
    );
    expect(describeGame({ gameId: 'you-play-like-a-beginner' })).toBe('A classic game');
  });

  it('reads back every kind of round it deals, whatever the draw', async () => {
    for (let seed = 1; seed <= 25; seed++) {
      const items = (await prepareDuel(
        'arbiter',
        { pace: 'slow' },
        seededRandom(seed * 7919),
      )) as ArbiterItem[];
      for (const item of items) {
        expect(arbiterRoundOf(item), `seed ${seed}: ${item.illegal.kind}`).not.toBeNull();
      }
    }
  });

  it('reads a round from its own moves when this device does not know the game', () => {
    const item: ArbiterItem = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ply: 0,
      lead: ['e2e4', 'e7e5'],
      illegal: { from: 'g1', to: 'g3', kind: 'knight-shape' },
      game: 'a-game-not-here',
    };
    const round = arbiterRoundOf(item, []);
    expect(round).toMatchObject({
      gameId: 'a-game-not-here',
      startPly: 0,
      illegal: { from: 'g1', to: 'g3', kind: 'knight-shape' },
    });
    expect(round!.lead.map((m) => m.san)).toEqual(['e4', 'e5']);
    // A move that is not the round's own illegal one, or moves that do not fit: no round.
    expect(arbiterRoundOf({ ...item, illegal: { ...item.illegal, to: 'h3' } }, [])).toBeNull();
    expect(arbiterRoundOf({ ...item, lead: ['e2e5'] }, [])).toBeNull();
  });
});
