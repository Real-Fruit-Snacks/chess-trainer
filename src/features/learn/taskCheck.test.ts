import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { judgeTaskMove, normalizeSan } from './taskCheck';

describe('normalizeSan', () => {
  it('strips check and mate markers', () => {
    expect(normalizeSan('Qh8+')).toBe('Qh8');
    expect(normalizeSan('Ra8#')).toBe('Ra8');
  });
  it('normalises castling written with zeros', () => {
    expect(normalizeSan('0-0')).toBe('O-O');
    expect(normalizeSan('0-0-0')).toBe('O-O-O');
  });
  it('keeps promotions comparable', () => {
    expect(normalizeSan('e8=Q')).toBe('e8=Q');
    expect(normalizeSan('e8Q')).toBe('e8=Q');
  });
});

describe('judgeTaskMove', () => {
  const fen = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';

  it('accepts listed moves regardless of suffix', () => {
    const chess = new Chess(fen);
    const move = chess.move('Ra8#');
    expect(judgeTaskMove({ prompt: '', moves: ['Ra8'] }, move, chess)).toBe('correct');
  });

  it('rejects other moves', () => {
    const chess = new Chess(fen);
    const move = chess.move('Ra7');
    expect(judgeTaskMove({ prompt: '', moves: ['Ra8#'] }, move, chess)).toBe('wrong');
  });

  it('accepts any mate when allowed', () => {
    const chess = new Chess('7k/8/4Q1K1/8/8/8/8/8 w - - 0 1');
    const move = chess.move('Qc8#');
    expect(judgeTaskMove({ prompt: '', moves: ['Qe8#'], acceptAnyMate: true }, move, chess)).toBe(
      'correct',
    );
    const other = new Chess('7k/8/4Q1K1/8/8/8/8/8 w - - 0 1');
    const stalemating = other.move('Qf7');
    expect(
      judgeTaskMove({ prompt: '', moves: ['Qe8#'], acceptAnyMate: true }, stalemating, other),
    ).toBe('wrong');
  });
});
