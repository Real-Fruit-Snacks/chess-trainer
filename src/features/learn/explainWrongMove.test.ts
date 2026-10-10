import { describe, expect, it } from 'vitest';
import { explainWrongMove } from './explainWrongMove';

describe('explainWrongMove', () => {
  it('names the mate a move allows, and plays it', () => {
    // The rook leaves the back rank: ...Re1 is mate.
    const fen = '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    expect(explainWrongMove(fen, 'Rd7')).toEqual({
      text: 'Careful: that allows Re1#, and it is checkmate.',
      refute: 'Re1#',
    });
  });

  it('says when a move gives stalemate', () => {
    // The queen takes the last square: no move, no check.
    const fen = 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1';
    expect(explainWrongMove(fen, 'Qc7')).toEqual({
      text: 'That is stalemate: Black has no legal move and is not in check, so the game is a draw.',
      refute: null,
    });
  });

  it('names a piece moved where it is simply taken', () => {
    const fen = '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1';
    expect(explainWrongMove(fen, 'Rd8+')).toEqual({
      text: 'The rook is unprotected on d8: Black simply takes it with Kxd8.',
      refute: 'Kxd8',
    });
  });

  it('names a piece a move leaves without its defender', () => {
    // The rook on d1 guards the knight on d4; Rf1 leaves it to ...Rxd4.
    const fen = '3r2k1/8/8/8/3N4/8/8/3R2K1 w - - 0 1';
    expect(explainWrongMove(fen, 'Rf1')).toEqual({
      text: 'That leaves your knight on d4 unprotected: Black takes it with Rxd4.',
      refute: 'Rxd4',
    });
  });

  it('calls an exchange that loses material what it is', () => {
    // The rook takes a pawn defended by a pawn: rook for pawn.
    const fen = '6k1/8/2p5/3p4/8/8/8/3R2K1 w - - 0 1';
    expect(explainWrongMove(fen, 'Rxd5')).toEqual({
      text: 'Black wins material with cxd5: the rook on d5 cannot be held.',
      refute: 'cxd5',
    });
  });

  it('follows the captures through: a piece that is taken back with interest is no loss', () => {
    // The bishop on a6 looks free, but ...bxa6 lets Nxc6 win the knight back and hit the queen.
    // Black's real win is ...Nxd4 first, and the bishop falls after the trades.
    const fen = 'r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 3 9';
    expect(explainWrongMove(fen, 'Ba6')).toEqual({
      text: 'That loses material: Black wins it with a series of captures, starting with Nxd4.',
      refute: 'Nxd4',
    });
  });

  it('says when a move lets a pawn promote', () => {
    // Rh8 would stop the pawn; the rook goes elsewhere and nothing stops ...h1=Q.
    const fen = '6R1/8/8/8/8/k7/4K2p/8 w - - 0 1';
    expect(explainWrongMove(fen, 'Rg7')).toEqual({
      text: 'That lets Black promote: h1=Q.',
      refute: 'h1=Q',
    });
    // Promoting where the new queen is taken at once is no promotion to speak of.
    expect(explainWrongMove('8/8/8/8/8/k7/7p/K6R w - - 0 1', 'Rb1')).toBeNull();
  });

  it('does not call a piece unprotected when taking back only loses more', () => {
    // The d4 pawn is guarded by the knight, but Nxd4 would drop the knight to Bxd4 or Nxd4.
    const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    expect(explainWrongMove(fen, 'd4')).toEqual({
      text: 'Black wins material with exd4: the pawn on d4 cannot be held.',
      refute: 'exd4',
    });
  });

  it('says nothing of an even trade, a safe move, or a move it cannot read', () => {
    // Bishop takes a knight that a pawn recaptures: an even trade.
    expect(explainWrongMove('6k1/8/2p5/3n4/8/1B6/8/6K1 w - - 0 1', 'Bxd5')).toBeNull();
    expect(explainWrongMove('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', 'Ra4')).toBeNull();
    expect(explainWrongMove('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', 'Rxh8')).toBeNull();
  });
});
