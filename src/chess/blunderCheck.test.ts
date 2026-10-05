import { describe, expect, it } from 'vitest';
import { BLUNDER_MIN_LOSS, checkBlunder } from './blunderCheck';

/** 1.e4 e5 2.Nf3 Nc6, White to move. */
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

describe('checkBlunder', () => {
  it('lets ordinary moves through', () => {
    expect(checkBlunder(ITALIAN, { from: 'f1', to: 'c4' })).toBeNull();
    expect(checkBlunder(ITALIAN, { from: 'd2', to: 'd4' })).toBeNull();
    // A fair trade: the bishop for the knight.
    const pin = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/4P3/2N5/PPPP1PPP/R2QKBNR w KQkq - 4 4';
    expect(checkBlunder(pin, { from: 'g5', to: 'f6' })).toBeNull();
  });

  it('holds back a piece put where a pawn takes it', () => {
    expect(checkBlunder(ITALIAN, { from: 'f1', to: 'a6' })).toEqual({
      kind: 'material',
      move: { uci: 'f1a6', san: 'Ba6', from: 'f1', to: 'a6' },
      reply: { uci: 'b7a6', san: 'bxa6', from: 'b7', to: 'a6' },
      loss: 3,
      captured: 'b',
    });
  });

  it('holds back a capture that loses the capturing piece', () => {
    const scholar = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3';
    expect(checkBlunder(scholar, { from: 'h5', to: 'e5' })).toMatchObject({
      kind: 'material',
      reply: { san: 'Nxe5' },
      loss: 8,
      captured: 'q',
    });
  });

  it('notices a piece left hanging by a quiet move elsewhere', () => {
    // ...h6 attacks the knight on g5, which nothing defends.
    const fen = 'r1bqkb1r/pppp1pp1/2n2n1p/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 5';
    expect(checkBlunder(fen, { from: 'a2', to: 'a3' })).toMatchObject({
      kind: 'material',
      reply: { san: 'hxg5' },
      loss: 3,
      captured: 'n',
    });
    expect(checkBlunder(fen, { from: 'g5', to: 'f3' })).toBeNull();
  });

  it('holds back a move that allows mate in one', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
    expect(checkBlunder(fen, { from: 'g2', to: 'g4' })).toEqual({
      kind: 'mate',
      move: { uci: 'g2g4', san: 'g4', from: 'g2', to: 'g4' },
      reply: { uci: 'd8h4', san: 'Qh4#', from: 'd8', to: 'h4' },
      loss: 0,
    });
  });

  it('says nothing when every move loses as much (a fork)', () => {
    // The knight on c2 checks the king and attacks the rook: whatever White does, the rook goes.
    const fork = 'r3k3/8/8/8/8/8/2n5/R3K3 w Q - 0 1';
    expect(checkBlunder(fork, { from: 'e1', to: 'f2' })).toBeNull();
    expect(checkBlunder(fork, { from: 'e1', to: 'd2' })).toBeNull();
  });

  it('says nothing about a mate, an illegal move or a broken position', () => {
    const scholar = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    expect(checkBlunder(scholar, { from: 'h5', to: 'f7' })).toBeNull();
    expect(checkBlunder(ITALIAN, { from: 'f1', to: 'f5' })).toBeNull();
    expect(checkBlunder('not a position', { from: 'e2', to: 'e4' })).toBeNull();
  });

  it('only warns from two pawns down', () => {
    expect(BLUNDER_MIN_LOSS).toBe(2);
    // 3.b4 gives a pawn to ...Bxb4: a gambit, not a blunder check.
    expect(checkBlunder(ITALIAN, { from: 'b2', to: 'b4' })).toBeNull();
    // 3.Ng5 gives the knight to ...Qxg5.
    expect(checkBlunder(ITALIAN, { from: 'f3', to: 'g5' })).toMatchObject({
      kind: 'material',
      reply: { san: 'Qxg5' },
      loss: 3,
    });
  });
});
