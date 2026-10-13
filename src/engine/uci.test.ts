import { describe, expect, it } from 'vitest';
import { cpToWinProbability, formatScore, parseBestMove, parseInfo, scoreToWhiteCp } from './uci';

describe('parseInfo', () => {
  it('parses a full info line', () => {
    const info = parseInfo(
      'info depth 18 seldepth 25 multipv 2 score cp -34 nodes 123456 nps 654321 hashfull 12 time 189 pv e7e5 g1f3 b8c6',
    );
    expect(info).toEqual({
      depth: 18,
      seldepth: 25,
      multipv: 2,
      score: { type: 'cp', value: -34 },
      nodes: 123456,
      nps: 654321,
      time: 189,
      hashfull: 12,
      pv: ['e7e5', 'g1f3', 'b8c6'],
    });
  });

  it('parses mate scores and bounds', () => {
    const info = parseInfo('info depth 12 score mate 3 lowerbound nodes 10 pv d1h5');
    expect(info?.score).toEqual({ type: 'mate', value: 3, bound: 'lower' });
    expect(info?.multipv).toBe(1);
  });

  it('ignores lines without a principal variation', () => {
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfo('info depth 5 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('bestmove e2e4')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('parses best move with ponder', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ move: 'e2e4', ponder: 'e7e5' });
  });
  it('handles (none)', () => {
    expect(parseBestMove('bestmove (none)')).toEqual({ move: null });
  });
  it('returns null for other lines', () => {
    expect(parseBestMove('readyok')).toBeNull();
  });
});

describe('score helpers', () => {
  it('flips centipawns to white perspective', () => {
    expect(scoreToWhiteCp({ type: 'cp', value: 50 }, true)).toBe(50);
    expect(scoreToWhiteCp({ type: 'cp', value: 50 }, false)).toBe(-50);
  });

  it('ranks faster mates above slower ones', () => {
    const m2 = scoreToWhiteCp({ type: 'mate', value: 2 }, true);
    const m5 = scoreToWhiteCp({ type: 'mate', value: 5 }, true);
    expect(m2).toBeGreaterThan(m5);
    expect(m5).toBeGreaterThan(10000);
    expect(scoreToWhiteCp({ type: 'mate', value: -3 }, true)).toBeLessThan(-10000);
  });

  it('maps evaluations to win probability', () => {
    expect(cpToWinProbability(0)).toBeCloseTo(0.5);
    expect(cpToWinProbability(300)).toBeGreaterThan(0.7);
    expect(cpToWinProbability(-300)).toBeLessThan(0.3);
    expect(cpToWinProbability(100000)).toBeCloseTo(1, 3);
  });

  it('formats scores for display', () => {
    expect(formatScore({ type: 'cp', value: 130 }, true)).toBe('+1.3');
    expect(formatScore({ type: 'cp', value: 130 }, false)).toBe('-1.3');
    expect(formatScore({ type: 'cp', value: 0 }, true)).toBe('0.0');
    expect(formatScore({ type: 'cp', value: 1250 }, true)).toBe('+13');
    expect(formatScore({ type: 'mate', value: 4 }, true)).toBe('M4');
    expect(formatScore({ type: 'mate', value: 4 }, false)).toBe('-M4');
    expect(formatScore({ type: 'mate', value: -2 }, true)).toBe('-M2');
  });
});
