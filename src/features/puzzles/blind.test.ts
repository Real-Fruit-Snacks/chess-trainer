import { describe, expect, it } from 'vitest';
import {
  BLIND_DEPTH_LABELS,
  BLIND_DEPTHS,
  BLIND_MAX_LEVEL,
  BLIND_MIN_LEVEL,
  blindLevel,
  isBlindDepth,
  nextBlindLevel,
  startingBlindLevel,
} from './blind';
import { blindFen, blindLine, judgeBlindMove, prepareBlind } from './blindLine';

describe('blind puzzle levels', () => {
  it('start below the puzzle rating, further for the longer lines', () => {
    expect(startingBlindLevel(1500, 'short')).toBe(1200);
    expect(startingBlindLevel(1500, 'long')).toBe(1050);
    expect(startingBlindLevel(1500, 'veryLong')).toBe(900);
    // Never below the easiest puzzles, and a broken rating falls back to a middling one.
    expect(startingBlindLevel(500, 'veryLong')).toBe(BLIND_MIN_LEVEL);
    expect(startingBlindLevel(Number.NaN, 'short')).toBe(1200);
  });

  it('use the depth’s own level once it has one', () => {
    expect(blindLevel({ long: 1333 }, 'long', 1800)).toBe(1333);
    expect(blindLevel({ long: 1333 }, 'short', 1800)).toBe(1500);
    expect(blindLevel({ short: 99_999 }, 'short', 1800)).toBe(BLIND_MAX_LEVEL);
    expect(blindLevel({ short: Number.NaN }, 'short', 1800)).toBe(1500);
  });

  it('go up after a clean solve, stay after a peek, and drop after a miss', () => {
    expect(nextBlindLevel(1200, 'solved', false)).toBe(1240);
    expect(nextBlindLevel(1200, 'solved', true)).toBe(1200);
    expect(nextBlindLevel(1200, 'failed', false)).toBe(1140);
    expect(nextBlindLevel(1200, 'failed', true)).toBe(1140);
    expect(nextBlindLevel(BLIND_MIN_LEVEL, 'failed', false)).toBe(BLIND_MIN_LEVEL);
    expect(nextBlindLevel(BLIND_MAX_LEVEL, 'solved', false)).toBe(BLIND_MAX_LEVEL);
  });

  it('know the three depths by their tags', () => {
    expect(BLIND_DEPTHS.map((d) => BLIND_DEPTH_LABELS[d])).toEqual([
      '2 moves',
      '3 moves',
      '4+ moves',
    ]);
    expect(isBlindDepth('long')).toBe(true);
    expect(isBlindDepth('mateIn2')).toBe(false);
    expect(isBlindDepth(3)).toBe(false);
  });
});

describe('blind puzzle lines', () => {
  // Black's 20...Bf6 walks into a mate in two: 21.Qh7+ Kf8 22.Qxf7#.
  const MATE_IN_TWO = {
    fen: 'r1bq2k1/pp3pb1/4p1n1/2p3NQ/4P3/2P3P1/PP3PBP/R5K1 b - - 1 20',
    moves: 'g7f6 h5h7 g8f8 h7f7',
  };

  it('start after the opponent’s move, with the solver to play', () => {
    const setup = prepareBlind(MATE_IN_TWO);
    expect(setup).toMatchObject({
      startFen: 'r1bq2k1/pp3p2/4pbn1/2p3NQ/4P3/2P3P1/PP3PBP/R5K1 w - - 2 21',
      setup: { uci: 'g7f6', san: 'Bf6', from: 'g7', to: 'f6', label: '20...' },
      solverColor: 'white',
      solution: ['h5h7', 'g8f8', 'h7f7'],
    });
    expect(prepareBlind({ fen: MATE_IN_TWO.fen, moves: 'g7f6' })).toBeNull();
    expect(prepareBlind({ fen: MATE_IN_TWO.fen, moves: 'g7f6 h5h7 a1a8' })).toBeNull();
    expect(prepareBlind({ fen: 'not a fen', moves: 'e2e4 e7e5' })).toBeNull();
  });

  it('number the line the way a scoresheet does', () => {
    const setup = prepareBlind(MATE_IN_TWO);
    if (!setup) throw new Error('no setup');
    expect(blindLine(setup, ['h5h7', 'g8f8', 'h7f7'])).toEqual([
      { uci: 'h5h7', san: 'Qh7+', by: 'you', label: '21.' },
      { uci: 'g8f8', san: 'Kf8', by: 'opponent', label: null },
      { uci: 'h7f7', san: 'Qxf7#', by: 'you', label: '22.' },
    ]);
    expect(blindFen(setup, ['h5h7', 'g8f8'])).toBe(
      'r1bq1k2/pp3p1Q/4pbn1/2p3N1/4P3/2P3P1/PP3PBP/R5K1 w - - 4 22',
    );
    // Black solving: its first move carries the number, the rest of Black's do not.
    const black = prepareBlind({
      fen: '6k1/5ppp/8/8/8/8/r4PPP/6K1 w - - 0 30',
      moves: 'g1f1 a2a1 f1e2 a1a2',
    });
    if (!black) throw new Error('no setup');
    expect(blindLine(black, ['a2a1', 'f1e2', 'a1a2']).map((m) => m.label)).toEqual([
      '30...',
      '31.',
      null,
    ]);
  });

  it('take the stored move, tell a wrong move from an illegal one, and finish on the last', () => {
    const setup = prepareBlind(MATE_IN_TWO);
    if (!setup) throw new Error('no setup');
    expect(judgeBlindMove(setup, [], { from: 'h5', to: 'h7' })).toEqual({
      kind: 'correct',
      uci: 'h5h7',
      san: 'Qh7+',
      done: false,
    });
    expect(judgeBlindMove(setup, [], { from: 'h5', to: 'h6' })).toEqual({
      kind: 'wrong',
      uci: 'h5h6',
      san: 'Qh6',
    });
    // The rook on a1 is blocked by its own pawn.
    expect(judgeBlindMove(setup, [], { from: 'a1', to: 'a8' })).toEqual({ kind: 'illegal' });
    expect(judgeBlindMove(setup, ['h5h7', 'g8f8'], { from: 'h7', to: 'f7' })).toMatchObject({
      kind: 'correct',
      done: true,
    });
  });

  it('accept any mate, not only the stored one', () => {
    // After 1...Kg8 both Ra8# and Qd8# mate; Ra8 is the stored answer.
    const setup = prepareBlind({
      fen: '7k/5ppp/8/8/8/8/5PPP/R2Q2K1 b - - 0 1',
      moves: 'h8g8 a1a8',
    });
    if (!setup) throw new Error('no setup');
    expect(judgeBlindMove(setup, [], { from: 'd1', to: 'd8' })).toEqual({
      kind: 'correct',
      uci: 'd1d8',
      san: 'Qd8#',
      done: true,
    });
  });
});
