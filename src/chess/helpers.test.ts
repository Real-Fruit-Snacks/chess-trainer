import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  canStillMate,
  checkedKingSquare,
  gameStatus,
  isPromotionMove,
  isValidFen,
  legalDests,
  materialBalance,
  moveLabel,
  parseUci,
  sanToUci,
  START_FEN,
  toUci,
  tryMove,
  turnOf,
  uciLineToSan,
  uciToSan,
} from './helpers';

describe('chess helpers', () => {
  it('converts between UCI and SAN', () => {
    expect(uciToSan(START_FEN, 'e2e4')).toBe('e4');
    expect(uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
    expect(sanToUci(START_FEN, 'Nf3')).toBe('g1f3');
    expect(uciToSan(START_FEN, 'e2e5')).toBeNull();
    expect(uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'zz'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('parses promotions in UCI', () => {
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' });
    const chess = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    const move = chess.move({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(toUci(move)).toBe('e7e8q');
  });

  it('detects promotion moves before they are made', () => {
    const chess = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    expect(isPromotionMove(chess, 'e7', 'e8')).toBe(true);
    expect(isPromotionMove(chess, 'e1', 'e2')).toBe(false);
  });

  it('computes legal destinations', () => {
    const dests = legalDests(new Chess());
    expect(dests.get('e2')).toEqual(['e3', 'e4']);
    expect(dests.get('g1')).toEqual(['f3', 'h3']);
    expect(dests.has('e1')).toBe(false);
  });

  it('never throws on illegal moves', () => {
    expect(tryMove(new Chess(), 'Ke2')).toBeNull();
    expect(tryMove(new Chess(), 'e4')).not.toBeNull();
  });

  it('reports game status', () => {
    const mate = new Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    mate.move('Ra8#');
    expect(gameStatus(mate)).toMatchObject({
      over: true,
      result: '1-0',
      reason: 'checkmate',
      winner: 'white',
    });

    const stalemate = new Chess('7k/5Q2/8/8/8/8/8/4K3 b - - 0 1');
    expect(gameStatus(stalemate)).toMatchObject({
      over: true,
      result: '1/2-1/2',
      reason: 'stalemate',
    });

    expect(gameStatus(new Chess()).over).toBe(false);
  });

  it('finds the checked king', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    chess.move('Ra8+');
    expect(checkedKingSquare(chess)).toBe('e8');
    expect(checkedKingSquare(new Chess())).toBeNull();
  });

  it('computes material balance', () => {
    expect(materialBalance(new Chess())).toBe(0);
    expect(materialBalance(new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'))).toBe(5);
  });

  it('labels moves by number', () => {
    expect(moveLabel(0)).toBe('1.');
    expect(moveLabel(1)).toBe('1...');
    expect(moveLabel(2)).toBe('2.');
    expect(moveLabel(0, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      '1...',
    );
  });

  it('validates FENs and reads the side to move', () => {
    expect(isValidFen(START_FEN)).toBe(true);
    expect(isValidFen('not a fen')).toBe(false);
    expect(turnOf('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('black');
  });
});

describe('canStillMate (flag fall)', () => {
  const can = (fen: string, color: 'white' | 'black') => canStillMate(new Chess(fen), color);

  it('a pawn, rook or queen can always mate', () => {
    expect(can('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'white')).toBe(true);
    expect(can('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'white')).toBe(true);
    expect(can('4k3/8/8/8/8/8/8/3QK3 w - - 0 1', 'white')).toBe(true);
  });

  it('a bare king or a lone minor against a bare king cannot', () => {
    expect(can('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'black')).toBe(false);
    expect(can('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'white')).toBe(false);
    expect(can('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'white')).toBe(false);
  });

  it('a lone minor can mate when the defender has men to box its own king in', () => {
    expect(can('k7/p7/8/8/8/8/8/2B1K3 w - - 0 1', 'white')).toBe(true);
    expect(can('k7/8/8/8/8/8/8/1N2K2r w - - 0 1', 'white')).toBe(true);
  });

  it('two minors can mate a bare king unless they are bishops on one square colour', () => {
    expect(can('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1', 'white')).toBe(true);
    expect(can('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1', 'white')).toBe(true);
    // c1 and e3 are both dark squares.
    expect(can('4k3/8/8/8/8/4B3/8/2B1K3 w - - 0 1', 'white')).toBe(false);
  });
});
