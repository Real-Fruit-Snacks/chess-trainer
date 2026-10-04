import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { legalDests } from '@/chess/helpers';
import {
  callAccuracy,
  describeCall,
  destsForType,
  FULL_WEIGHT_CALLS,
  GRADE_LABEL,
  gradeLoss,
  HAND_AND_BRAIN_SCORING,
  handAndBrainScore,
  MIN_SCORED_CALLS,
  movableTypes,
  movesForType,
  scoreToCp,
  summarizeCalls,
} from './handAndBrain';

describe('hand and brain', () => {
  it('lists the piece types that can move, in display order', () => {
    const start = new Chess();
    expect(movableTypes(start, legalDests(start))).toEqual(['n', 'p']);
    const open = new Chess('r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 8');
    expect(movableTypes(open, legalDests(open))).toEqual(['k', 'q', 'r', 'n', 'p']);
  });

  it('restricts destinations and moves to one piece type', () => {
    const start = new Chess();
    const knights = destsForType(start, legalDests(start), 'n');
    expect([...knights.keys()].sort()).toEqual(['b1', 'g1']);
    expect(movesForType(start, 'n').sort()).toEqual(['b1a3', 'b1c3', 'g1f3', 'g1h3']);
    expect(movesForType(start, 'q')).toEqual([]);
  });

  it('turns engine scores into centipawns with mates at the extremes', () => {
    expect(scoreToCp({ type: 'cp', value: 35 })).toBe(35);
    expect(scoreToCp({ type: 'mate', value: 3 })).toBe(9997);
    expect(scoreToCp({ type: 'mate', value: -2 })).toBe(-9998);
    expect(scoreToCp(null)).toBe(0);
  });

  it('grades and scores the loss against the best move', () => {
    expect(gradeLoss(0)).toBe('best');
    expect(gradeLoss(5)).toBe('good');
    expect(gradeLoss(30)).toBe('good');
    expect(gradeLoss(80)).toBe('inaccuracy');
    expect(gradeLoss(200)).toBe('mistake');
    expect(gradeLoss(500)).toBe('blunder');
    expect(callAccuracy(0)).toBe(100);
    expect(callAccuracy(50)).toBe(75);
    expect(callAccuracy(400)).toBe(0);
  });

  it('summarises a game of calls', () => {
    const summary = summarizeCalls([
      { ply: 1, type: 'p', san: 'e4', bestSan: 'e4', bestType: 'p', lossCp: 0, grade: 'best' },
      { ply: 3, type: 'n', san: 'Nc3', bestSan: 'Nf3', bestType: 'n', lossCp: 30, grade: 'good' },
      {
        ply: 5,
        type: 'b',
        san: 'Bc4',
        bestSan: 'd4',
        bestType: 'p',
        lossCp: 150,
        grade: 'mistake',
      },
    ]);
    expect(summary.calls).toBe(3);
    expect(summary.accuracy).toBe(Math.round((100 + 85 + 25) / 3));
    expect(summary.counts).toEqual({ best: 1, good: 1, inaccuracy: 0, mistake: 1, blunder: 0 });
    expect(summarizeCalls([]).accuracy).toBe(0);
  });

  it('describes calls differently for each role', () => {
    const call = {
      ply: 5,
      type: 'b' as const,
      san: 'Bc4',
      bestSan: 'd4',
      bestType: 'p' as const,
      lossCp: 150,
      grade: 'mistake' as const,
    };
    expect(describeCall(call, 'brain')).toMatch(/Bishop was a mistake: pawn was the piece \(d4\)/);
    expect(describeCall(call, 'hand')).toMatch(/Bc4 was a mistake: d4 was the move/);
    expect(describeCall({ ...call, lossCp: 0, grade: 'best' }, 'brain')).toMatch(
      /every bit as good/,
    );
    expect(describeCall({ ...call, san: 'd4', lossCp: 0, grade: 'best' }, 'brain')).toMatch(
      /engine agrees/,
    );
  });

  it('scores accuracy by the engine level and the length of the game', () => {
    // A full game against level 4 at 90%.
    expect(
      handAndBrainScore({ accuracy: 90, calls: FULL_WEIGHT_CALLS, levelId: 4, resigned: false }),
    ).toBe(360);
    // Longer games count no more than a full one.
    expect(handAndBrainScore({ accuracy: 90, calls: 80, levelId: 4, resigned: false })).toBe(360);
    // Half a game counts half.
    expect(
      handAndBrainScore({
        accuracy: 90,
        calls: FULL_WEIGHT_CALLS / 2,
        levelId: 4,
        resigned: false,
      }),
    ).toBe(180);
    // The same accuracy against a stronger engine scores more.
    expect(handAndBrainScore({ accuracy: 80, calls: 40, levelId: 8, resigned: false })).toBe(640);
  });

  it('does not score a resignation before the tenth call: one call and resign is no 100%', () => {
    expect(handAndBrainScore({ accuracy: 100, calls: 1, levelId: 1, resigned: true })).toBeNull();
    expect(
      handAndBrainScore({
        accuracy: 100,
        calls: MIN_SCORED_CALLS - 1,
        levelId: 8,
        resigned: true,
      }),
    ).toBeNull();
    // From the tenth call a resignation is scored, in proportion to the game's length.
    expect(
      handAndBrainScore({ accuracy: 100, calls: MIN_SCORED_CALLS, levelId: 3, resigned: true }),
    ).toBe(Math.round((100 * 3 * MIN_SCORED_CALLS) / FULL_WEIGHT_CALLS));
    // A short game that ended on the board (a quick mate) is scored.
    expect(handAndBrainScore({ accuracy: 100, calls: 4, levelId: 1, resigned: false })).toBe(
      Math.round((100 * 4) / FULL_WEIGHT_CALLS),
    );
    expect(HAND_AND_BRAIN_SCORING).toMatch(/not scored/);
  });

  it('labels the grades for the page', () => {
    expect(GRADE_LABEL.best).toBe('Best');
    expect(GRADE_LABEL.inaccuracy).toBe('Inaccuracy');
    expect(Object.keys(GRADE_LABEL)).toHaveLength(5);
  });
});
