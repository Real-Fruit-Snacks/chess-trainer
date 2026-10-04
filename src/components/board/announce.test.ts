import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { describeMove, describeSan } from './announce';

function after(
  fen: string,
  san: string,
): { before: string; after: string; move: [string, string] } {
  const chess = new Chess(fen);
  const move = chess.move(san);
  return { before: fen, after: chess.fen(), move: [move.from, move.to] };
}

const START = new Chess().fen();

describe('describeMove', () => {
  it('names the mover, the piece and the squares', () => {
    const m = after(START, 'Nf3');
    expect(describeMove(m.before, m.after, m.move)).toBe('White plays knight g1 to f3.');
    const reply = after(m.after, 'e5');
    expect(describeMove(reply.before, reply.after, reply.move)).toBe('Black plays pawn e7 to e5.');
  });

  it('describes captures, checks and mates', () => {
    const scholar = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6';
    const chess = new Chess();
    for (const san of scholar.split(' ').filter((t) => !/^\d+\.$/.test(t))) chess.move(san);
    const fen = chess.fen();
    const mate = after(fen, 'Qxf7#');
    expect(describeMove(mate.before, mate.after, mate.move)).toBe(
      'White queen takes pawn on f7, checkmate.',
    );
    const check = after('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8+');
    expect(describeMove(check.before, check.after, check.move)).toBe(
      'White plays rook a1 to a8, check.',
    );
  });

  it('describes castling, promotion and en passant', () => {
    const castle = after('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O');
    expect(describeMove(castle.before, castle.after, castle.move)).toBe('White castles kingside.');
    const long = after('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O');
    expect(describeMove(long.before, long.after, long.move)).toBe('Black castles queenside.');
    const promo = after('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a8=Q');
    expect(describeMove(promo.before, promo.after, promo.move)).toBe(
      'White plays pawn a7 to a8, promotes to queen.',
    );
    const ep = after('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'exd6');
    expect(describeMove(ep.before, ep.after, ep.move)).toBe(
      'White pawn takes pawn on d6 en passant.',
    );
  });

  it('copes without a previous position and with bad input', () => {
    const m = after(START, 'e4');
    expect(describeMove(null, m.after, m.move)).toBe('White plays pawn e2 to e4.');
    expect(describeMove(m.before, m.after, null)).toBeNull();
    expect(describeMove(m.before, 'not a fen', m.move)).toBeNull();
    expect(describeMove(m.before, m.after, ['a3', 'a4'])).toBeNull();
  });

  it('does not invent a capture when stepping back through a game', () => {
    // 1. e4 d5 2. exd5, then the user steps back: the board shows the position after d5
    // with d5 as the last move, while the previous board had a white pawn on d5.
    const e4 = after(START, 'e4');
    const d5 = after(e4.after, 'd5');
    const exd5 = after(d5.after, 'exd5');
    expect(describeMove(exd5.after, d5.after, d5.move)).toBe('Black plays pawn d7 to d5.');
    // Stepping back once more: the previous board had a black pawn on d5, the move is e2–e4.
    expect(describeMove(d5.after, e4.after, e4.move)).toBe('White plays pawn e2 to e4.');
  });

  it('describes a jump from the position it lands on, and keeps real captures and checks', () => {
    const e4 = after(START, 'e4');
    const d5 = after(e4.after, 'd5');
    const exd5 = after(d5.after, 'exd5');
    // Jumping from the start straight to 2. exd5: the move is described from the board shown.
    expect(describeMove(START, exd5.after, exd5.move)).toBe('White plays pawn e4 to d5.');
    // Consecutive positions still get the full account.
    expect(describeMove(exd5.before, exd5.after, exd5.move)).toBe('White pawn takes pawn on d5.');
    const check = after('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8+');
    expect(describeMove(START, check.after, check.move)).toBe('White plays rook a1 to a8, check.');
    // A castling jump is still recognised from the king's two-square step.
    const castle = after('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O');
    expect(describeMove(START, castle.after, castle.move)).toBe('White castles kingside.');
  });

  it('describes a move for a move list, from the position it is played in', () => {
    expect(describeSan(START, 'Nf3')).toBe('Knight g1 to f3');
    const scholar = new Chess();
    for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) scholar.move(san);
    expect(describeSan(scholar.fen(), 'Qxf7#')).toBe('Queen takes pawn on f7, checkmate');
    expect(describeSan('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O')).toBe('Castles queenside');
    expect(describeSan('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a8=Q')).toBe(
      'Pawn a7 to a8, promotes to queen',
    );
    expect(describeSan(START, 'Ke2')).toBeNull();
  });
});
