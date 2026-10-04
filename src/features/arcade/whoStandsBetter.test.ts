import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import { quietPositions } from './positions';
import type { EvalPosition } from './positions';
import {
  describeRoundBest,
  describeScale,
  judge,
  pickRound,
  POINTS_PER_PAWN,
  SPOT_ON,
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

  it('maps centipawns onto the slider in tenths of a pawn', () => {
    expect(toScale(0)).toBe(0);
    expect(toScale(130)).toBe(1.3);
    expect(toScale(-46)).toBe(-0.5);
    expect(toScale(-920)).toBe(-5);
  });

  it('judges on a tight scale: spot on within 0.3, 30 points per pawn of error', () => {
    expect(SPOT_ON).toBe(0.3);
    expect(POINTS_PER_PAWN).toBe(30);
    expect(judge(1.4, 140)).toEqual({ points: 100, verdict: 'spot on', truth: 1.4 });
    expect(judge(1.1, 140)).toEqual({ points: 91, verdict: 'spot on', truth: 1.4 });
    // Half a pawn out is no longer spot on.
    expect(judge(0.9, 140)).toEqual({ points: 85, verdict: 'close', truth: 1.4 });
    expect(judge(0, 140)).toEqual({ points: 58, verdict: 'right side', truth: 1.4 });
    expect(judge(3.5, 140)).toEqual({ points: 37, verdict: 'right side', truth: 1.4 });
    expect(judge(-2, 140)).toEqual({ points: 0, verdict: 'wrong side', truth: 1.4 });
    // Equal positions: a lean either way inside the equal band is not the wrong side.
    expect(judge(-0.1, 20).verdict).toBe('spot on');
    expect(judge(-0.2, 20).verdict).toBe('close');
    expect(judge(-0.5, 20).verdict).toBe('close');
    // But a clear call against a clear truth is.
    expect(judge(-0.4, 40).verdict).toBe('wrong side');
  });

  it('no longer rewards a constant guess as it did', () => {
    // The old scale gave a constant +0.5 about 76 points a position on the real pool; the
    // tighter one keeps it well below that, while a judge within half a pawn stays near 90.
    const pool = quietPositions();
    const average = (guess: (cp: number) => number) =>
      pool.reduce((sum, p) => sum + judge(guess(p.cp), p.cp).points, 0) / pool.length;
    expect(average(() => 0.5)).toBeLessThan(70);
    const near = (cp: number) => Math.round((cp / 100 + (cp % 2 === 0 ? 0.4 : -0.4)) * 10) / 10;
    expect(average(near)).toBeGreaterThan(85);
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
    expect(describeScale(0.2)).toBe('Equal');
    expect(describeScale(0.30000000000000004)).toBe('White is slightly better (0.3)');
    expect(describeScale(0.5)).toBe('White is slightly better (0.5)');
    expect(describeScale(-1.5)).toBe('Black is clearly better (1.5)');
    expect(describeScale(4)).toBe('White is winning (4.0)');
  });

  it('compares a finished round with the best from before it', () => {
    expect(describeRoundBest(420, null)).toBe('Your first round: 420 points to beat next time.');
    expect(describeRoundBest(520, 480)).toBe('A new best — up from 480.');
    expect(describeRoundBest(480, 480)).toBe('That equals your best, 480.');
    expect(describeRoundBest(300, 480)).toBe('Your best is 480.');
  });
});
