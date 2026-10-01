import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import type { EvalPosition } from './positions';
import {
  describeScale,
  judge,
  pickRound,
  streakBonus,
  summarizeRound,
  toScale,
} from './whoStandsBetter';

const pos = (id: string, gameId: string, cp: number): EvalPosition => ({
  id,
  gameId,
  ply: 20,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  cp,
  best: 'e2e4',
  forcing: false,
  pieces: 32,
});

describe('who stands better', () => {
  it('picks a round with at most two positions per game', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((g) =>
      [1, 2, 3, 4].map((i) => pos(`${g}${i}`, g, i * 10)),
    );
    const round = pickRound(pool, seededRandom(3));
    expect(round).toHaveLength(10);
    const perGame = new Map<string, number>();
    for (const p of round) perGame.set(p.gameId, (perGame.get(p.gameId) ?? 0) + 1);
    expect(Math.max(...perGame.values())).toBeLessThanOrEqual(2);
  });

  it('maps centipawns onto the slider and judges guesses', () => {
    expect(toScale(0)).toBe(0);
    expect(toScale(130)).toBe(1.5);
    expect(toScale(-920)).toBe(-5);
    expect(judge(1.5, 140)).toEqual({ points: 100, verdict: 'spot on', truth: 1.5 });
    expect(judge(0, 140).verdict).toBe('close');
    expect(judge(0, 140).points).toBe(63);
    expect(judge(3.5, 140)).toEqual({ points: 50, verdict: 'right side', truth: 1.5 });
    expect(judge(-2, 140)).toEqual({ points: 0, verdict: 'wrong side', truth: 1.5 });
    // Equal positions: either side within half a pawn is not the wrong side.
    expect(judge(-0.5, 20).verdict).not.toBe('wrong side');
  });

  it('adds a streak bonus and summarises the round', () => {
    expect(streakBonus(2)).toBe(0);
    expect(streakBonus(3)).toBe(10);
    expect(streakBonus(9)).toBe(30);
    const summary = summarizeRound([
      judge(1, 100),
      judge(1, 100),
      judge(1, 100),
      judge(-3, 100),
      judge(0, 0),
    ]);
    expect(summary.score).toBe(100 + 100 + 110 + 0 + 100);
    expect(summary.max).toBe(500);
    expect(summary.spotOn).toBe(4);
    expect(summary.wrongSide).toBe(1);
  });

  it('describes the scale in words', () => {
    expect(describeScale(0)).toBe('Equal');
    expect(describeScale(0.5)).toBe('White is slightly better (0.5)');
    expect(describeScale(-1.5)).toBe('Black is clearly better (1.5)');
    expect(describeScale(4)).toBe('White is winning (4.0)');
  });
});
