import { describe, expect, it } from 'vitest';
import {
  CHESS960_POSITIONS,
  CLASSICAL_CHESS960,
  Chess960Game,
  chess960BackRank,
  chess960Dests,
  chess960Headers,
  chess960LineToSan,
  chess960Number,
  chess960NumberOfBackRank,
  chess960Position,
  chess960SanToUci,
  chess960StartFen,
  chess960UciToSan,
  isChess960Fen,
  isChess960Game,
  isChess960Promotion,
  isChess960Variant,
  normalizeChess960Fen,
  playChess960,
  playChess960Typed,
  randomChess960,
} from './chess960';
import { START_FEN } from './startFen';

/** The pieces on one square of a FEN's placement, or null for an empty square. */
function at(fen: string, square: string): string | null {
  const rows = (fen.split(' ')[0] ?? '').split('/');
  const row = rows[8 - Number(square[1])] ?? '';
  const file = square.charCodeAt(0) - 97;
  let col = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      col += Number(ch);
      if (col > file) return null;
    } else {
      if (col === file) return ch;
      col++;
    }
  }
  return null;
}

/**
 * A start position with nothing on the back ranks but the kings and the rooks of one side
 * (the other rook could stand on a square castling needs): castling that way is free.
 */
function kingAndRook(n: number, side: 'a' | 'h'): string {
  const back = chess960BackRank(n);
  const rook = side === 'a' ? back.indexOf('R') : back.lastIndexOf('R');
  const rank = [...back].map((p, i) => (p === 'K' || i === rook ? p : '.')).join('');
  const compress = (row: string) => row.replace(/\.+/g, (dots) => String(dots.length));
  const rights = side === 'a' ? 'Qq' : 'Kk';
  return `${compress(rank.toLowerCase())}/pppppppp/8/8/8/8/PPPPPPPP/${compress(rank)} w ${rights} - 0 1`;
}

describe('Chess960 start positions', () => {
  it('numbers them as the standard table does: 518 is the classical position', () => {
    expect(chess960BackRank(CLASSICAL_CHESS960)).toBe('RNBQKBNR');
    expect(chess960StartFen(518)).toBe(START_FEN);
    // The start of the table, and its end.
    expect(chess960BackRank(0)).toBe('BBQNNRKR');
    expect(chess960BackRank(1)).toBe('BQNBNRKR');
    expect(chess960BackRank(2)).toBe('BQNNRBKR');
    expect(chess960BackRank(3)).toBe('BQNNRKRB');
    expect(chess960BackRank(4)).toBe('QBBNNRKR');
    expect(chess960BackRank(959)).toBe('RKRNNQBB');
  });

  it('has 960 different starts, each a legal Chess960 arrangement', () => {
    const seen = new Set<string>();
    for (let n = 0; n < CHESS960_POSITIONS; n++) {
      const rank = chess960BackRank(n);
      seen.add(rank);
      expect(rank.split('').sort().join('')).toBe('BBKNNQRR');
      const bishops = [...rank].flatMap((p, i) => (p === 'B' ? [i] : []));
      expect(((bishops[0] ?? 0) + (bishops[1] ?? 0)) % 2).toBe(1);
      const king = rank.indexOf('K');
      expect(rank.indexOf('R')).toBeLessThan(king);
      expect(rank.lastIndexOf('R')).toBeGreaterThan(king);
      expect(chess960NumberOfBackRank(rank)).toBe(n);
      expect(chess960Number(chess960StartFen(n))).toBe(n);
    }
    expect(seen.size).toBe(960);
  });

  it('refuses numbers and back ranks that are no start', () => {
    expect(() => chess960BackRank(960)).toThrow(RangeError);
    expect(() => chess960BackRank(-1)).toThrow(RangeError);
    expect(() => chess960BackRank(1.5)).toThrow(RangeError);
    // Bishops on squares of one colour; the king outside its rooks; a missing knight.
    expect(chess960NumberOfBackRank('RNBQBKNR')).toBeNull();
    expect(chess960NumberOfBackRank('RNBBKQNR')).toBe(533);
    expect(chess960NumberOfBackRank('KRNBQBNR')).toBeNull();
    expect(chess960NumberOfBackRank('RQBQKBNR')).toBeNull();
    expect(chess960NumberOfBackRank('rnbqkbnr')).toBeNull();
  });

  it('picks a random start with its number', () => {
    expect(randomChess960(() => 0)).toEqual({ number: 0, fen: chess960StartFen(0) });
    expect(randomChess960(() => 0.9999999).number).toBe(959);
    const pick = randomChess960(() => 274 / 960 + 0.0001);
    expect(pick.number).toBe(274);
    expect(chess960Number(pick.fen)).toBe(274);
  });

  it('knows a start position from its FEN, in any castling notation, and nothing else', () => {
    const fen = chess960StartFen(274);
    expect(chess960Number(fen)).toBe(274);
    const back = chess960BackRank(274);
    const rooks = [...back].flatMap((p, i) => (p === 'R' ? ['abcdefgh'[i] ?? ''] : []));
    const shredder = fen.replace(
      'KQkq',
      `${(rooks[1] ?? '').toUpperCase()}${(rooks[0] ?? '').toUpperCase()}${rooks[1] ?? ''}${rooks[0] ?? ''}`,
    );
    expect(chess960Number(shredder)).toBe(274);
    // Black to move, or a right gone: not the start.
    expect(chess960Number(fen.replace(' w ', ' b '))).toBeNull();
    expect(chess960Number(fen.replace('KQkq', 'Qkq'))).toBeNull();
    const moved = playChess960(fen, 'e2e4');
    expect(moved && chess960Number(moved.after)).toBeNull();
    expect(chess960Number('not a fen')).toBeNull();
  });
});

describe('Chess960 FENs', () => {
  it('writes X-FEN: KQkq for the outermost rooks, the file otherwise', () => {
    const start = chess960StartFen(0); // BBQNNRKR
    expect(normalizeChess960Fen(start.replace('KQkq', 'HFhf'))).toBe(start);
    // Two rooks on the king's h-side, castling with the inner one: its file.
    const inner = 'rk5r/8/8/8/8/8/8/RK2R2R w E - 0 1';
    expect(normalizeChess960Fen(inner)).toBe('rk5r/8/8/8/8/8/8/RK2R2R w E - 0 1');
    expect(normalizeChess960Fen('rk5r/8/8/8/8/8/8/RK2R2R w H - 0 1')).toBe(
      'rk5r/8/8/8/8/8/8/RK2R2R w K - 0 1',
    );
  });

  it('completes short FENs and drops rights without their rook or king', () => {
    expect(normalizeChess960Fen('4k3/8/8/8/8/8/8/4K2R w')).toBe('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
    expect(normalizeChess960Fen('4k3/8/8/8/8/8/8/4K2R w KQ -')).toBe(
      '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
    );
    // An en passant square no pawn can take on goes.
    expect(normalizeChess960Fen('4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1')).toBe(
      '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1',
    );
  });

  it('refuses what is no position', () => {
    expect(normalizeChess960Fen('')).toBeNull();
    expect(normalizeChess960Fen('hello')).toBeNull();
    expect(normalizeChess960Fen('8/8/8/8/8/8/8/8 w - - 0 1')).toBeNull();
    // The side not to move in check; pawns on the back rank; crazyhouse pockets.
    expect(normalizeChess960Fen('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
    expect(normalizeChess960Fen('P3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
    expect(normalizeChess960Fen('4k3/8/8/8/8/8/8/4K3[Qq] w - - 0 1')).toBeNull();
  });

  it('tells a FEN only Chess960 has: castling by file, or a start other than the classical one', () => {
    expect(isChess960Fen(chess960StartFen(0))).toBe(true);
    expect(isChess960Fen(chess960StartFen(0).replace('KQkq', 'HFhf'))).toBe(true);
    expect(isChess960Fen('rk5r/8/8/8/8/8/8/RK2R2R w E - 0 1')).toBe(true);
    expect(isChess960Fen(START_FEN)).toBe(false);
    expect(isChess960Fen('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(false);
    // Stale KQkq with the king elsewhere is a standard diagram's, not Chess960's.
    expect(isChess960Fen('r3k2r/8/8/8/8/8/8/1K5R w KQkq - 0 1')).toBe(false);
    expect(isChess960Fen('nonsense w HAha - 0 1')).toBe(false);
  });

  it('reads the Variant tag as the sites write it', () => {
    for (const name of ['Chess960', 'chess 960', 'Fischerandom', 'Fischer Random', '960']) {
      expect(isChess960Variant(name)).toBe(true);
    }
    for (const name of [undefined, '', 'Standard', 'From Position', 'Crazyhouse']) {
      expect(isChess960Variant(name)).toBe(false);
    }
    expect(isChess960Game({ Variant: 'Chess960' })).toBe(true);
    expect(isChess960Game({ FEN: chess960StartFen(100) })).toBe(true);
    expect(isChess960Game({}, chess960StartFen(100))).toBe(true);
    expect(isChess960Game({ FEN: START_FEN })).toBe(false);
    expect(isChess960Game({})).toBe(false);
    // Shredder-FEN rights by file, with no Variant tag at all.
    expect(isChess960Game({}, 'bqnbrkrn/pppppppp/8/8/8/8/PPPPPPPP/BQNBRKRN w GEge - 0 1')).toBe(
      true,
    );
    expect(isChess960Game({ Variant: 'Standard' }, '8/8/8/8/8/8/8/K6k w - - 0 1')).toBe(false);
    expect(chess960Headers(START_FEN)).toEqual({ Variant: 'Chess960', SetUp: '1', FEN: START_FEN });
  });
});

describe('Chess960 castling', () => {
  it('castles both ways for both sides in every start position once the way is clear', () => {
    for (let n = 0; n < CHESS960_POSITIONS; n++) {
      const back = chess960BackRank(n);
      const king = `${'abcdefgh'[back.indexOf('K')] ?? ''}1`;
      const aRook = `${'abcdefgh'[back.indexOf('R')] ?? ''}1`;
      const hRook = `${'abcdefgh'[back.lastIndexOf('R')] ?? ''}1`;

      const kingside = kingAndRook(n, 'h');
      // The board offers castling as the king onto its rook.
      expect(chess960Dests(kingside).get(king as never)).toContain(hRook);
      const short = playChess960(kingside, { from: king as never, to: hRook as never });
      expect(short?.san).toBe('O-O');
      expect(short?.uci).toBe(`${king}${hRook}`);
      expect(short?.flags).toBe('k');
      expect(short?.castle).toBe('h');
      expect(at(short?.after ?? '', 'g1')).toBe('K');
      expect(at(short?.after ?? '', 'f1')).toBe('R');
      expect(short?.after.split(' ')[2]).toBe('k');
      // Black, after a quiet white move.
      const blackShort = playChess960(
        playChess960(kingside, 'a3')?.after ?? '',
        `${king[0]}8${hRook[0]}8`,
      );
      expect(blackShort?.san).toBe('O-O');
      expect(at(blackShort?.after ?? '', 'g8')).toBe('k');
      expect(at(blackShort?.after ?? '', 'f8')).toBe('r');
      expect(blackShort?.after.split(' ')[2]).toBe('K');

      const queenside = kingAndRook(n, 'a');
      expect(chess960Dests(queenside).get(king as never)).toContain(aRook);
      const long = playChess960(queenside, { from: king as never, to: aRook as never });
      expect(long?.san).toBe('O-O-O');
      expect(long?.flags).toBe('q');
      expect(long?.castle).toBe('a');
      expect(at(long?.after ?? '', 'c1')).toBe('K');
      expect(at(long?.after ?? '', 'd1')).toBe('R');
      expect(long?.after.split(' ')[2]).toBe('q');
      const blackLong = playChess960(playChess960(queenside, 'a3')?.after ?? '', 'O-O-O');
      expect(blackLong?.uci).toBe(`${king[0]}8${aRook[0]}8`);
      expect(at(blackLong?.after ?? '', 'c8')).toBe('k');
      expect(at(blackLong?.after ?? '', 'd8')).toBe('r');
      expect(blackLong?.after.split(' ')[2]).toBe('Q');
    }
  });

  it('lets the other rook stand in the way', () => {
    // King b1 between rooks a1 and c1: O-O-O needs c1 and d1, and the c1 rook holds c1.
    const fen = 'rkr5/pppppppp/8/8/8/8/PPPPPPPP/RKR5 w KQkq - 0 1';
    expect(playChess960(fen, 'O-O-O')).toBeNull();
    expect(playChess960(fen, 'O-O')?.after.split(' ')[0]).toBe(
      'rkr5/pppppppp/8/8/8/8/PPPPPPPP/R4RK1',
    );
  });

  it('swaps a king and rook that stand side by side', () => {
    // King f1, rook g1: O-O puts the king on g1 and the rook on f1.
    const fen = 'r4kr1/pppppppp/8/8/8/8/PPPPPPPP/R4KR1 w KQkq - 0 1';
    expect(chess960Dests(fen).get('f1')).toContain('g1');
    const short = playChess960(fen, { from: 'f1', to: 'g1' });
    expect(short?.san).toBe('O-O');
    expect(short?.after.split(' ')[0]).toBe('r4kr1/pppppppp/8/8/8/8/PPPPPPPP/R4RK1');
    // King d1, rook c1: O-O-O swaps them too.
    const queenside = '2rk3r/pppppppp/8/8/8/8/PPPPPPPP/2RK3R w KQkq - 0 1';
    const long = playChess960(queenside, { from: 'd1', to: 'c1' });
    expect(long?.san).toBe('O-O-O');
    expect(long?.after.split(' ')[0]).toBe('2rk3r/pppppppp/8/8/8/8/PPPPPPPP/2KR3R');
  });

  it('castles with a king that stays where it is', () => {
    // King g1: only the rook moves on O-O.
    const fen = 'r5kr/8/8/8/8/8/8/R5KR w KQkq - 0 1';
    const short = playChess960(fen, { from: 'g1', to: 'h1' });
    expect(short?.san).toBe('O-O');
    expect(short?.after.split(' ')[0]).toBe('r5kr/8/8/8/8/8/8/R4RK1');
    // King c1: only the rook moves on O-O-O.
    const long = playChess960('r1k4r/8/8/8/8/8/8/R1K4R w KQkq - 0 1', { from: 'c1', to: 'a1' });
    expect(long?.san).toBe('O-O-O');
    expect(long?.after.split(' ')[0]).toBe('r1k4r/8/8/8/8/8/8/2KR3R');
  });

  it('castles when the rook passes the king', () => {
    // King b1, rook a1: the rook crosses b1 and c1 to reach d1.
    const fen = 'rk5r/8/8/8/8/8/8/RK5R w KQkq - 0 1';
    const long = playChess960(fen, { from: 'b1', to: 'a1' });
    expect(long?.san).toBe('O-O-O');
    expect(long?.after.split(' ')[0]).toBe('rk5r/8/8/8/8/8/8/2KR3R');
    // King e1, rook g1: the king lands on its rook's square.
    const onto = playChess960('4k3/8/8/8/8/8/8/R3K1R1 w KQ - 0 1', { from: 'e1', to: 'g1' });
    expect(onto?.san).toBe('O-O');
    expect(onto?.after.split(' ')[0]).toBe('4k3/8/8/8/8/8/8/R4RK1');
  });

  it('reads standard-style UCI when it can only mean castling', () => {
    // The classical position played as Chess960: e1g1 and e1h1 are the same move.
    const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(playChess960(fen, 'e1g1')?.uci).toBe('e1h1');
    expect(playChess960(fen, 'e1c1')?.uci).toBe('e1a1');
    expect(playChess960(fen, { from: 'e1', to: 'g1' })?.san).toBe('O-O');
    // A king one file from its castling square moves there as a king: f1g1 is no castling.
    const near = playChess960('4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1', 'f1g1');
    expect(near?.san).toBe('Kg1');
    expect(near?.after.split(' ')[2]).toBe('-');
    // A king sent two squares the wrong way does not castle.
    expect(playChess960('4k3/8/8/8/8/8/8/RK5R w KQ - 0 1', 'b1d1')).toBeNull();
  });

  it('does not castle out of, through or into check, or past a piece', () => {
    const blocked = playChess960(chess960StartFen(0), 'O-O');
    expect(blocked).toBeNull();
    // A rook on g8 covers g1: no O-O (the king would land in check), O-O-O still fine.
    const covered = '4k1r1/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(playChess960(covered, 'O-O')).toBeNull();
    expect(playChess960(covered, 'O-O-O')?.san).toBe('O-O-O');
    // In check: neither.
    const checked = '4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(playChess960(checked, 'O-O')).toBeNull();
    expect(playChess960(checked, 'O-O-O')).toBeNull();
    // Through an attacked square (f1).
    expect(playChess960('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'O-O')).toBeNull();
    // A piece on the rook's way.
    expect(playChess960('4k3/8/8/8/8/8/8/R2BK2R w KQ - 0 1', 'O-O-O')).toBeNull();
  });

  it('gives up the rights when the king or a rook moves, or a rook is taken', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(playChess960(fen, 'Kd1')?.after.split(' ')[2]).toBe('kq');
    expect(playChess960(fen, 'Rh2')?.after.split(' ')[2]).toBe('Qkq');
    expect(playChess960(fen, 'Rxa8+')?.after.split(' ')[2]).toBe('Kk');
  });
});

describe('Chess960 moves', () => {
  it('plays captures, promotions and en passant with chess.js flags', () => {
    const capture = playChess960('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'exd5');
    expect(capture).toMatchObject({ san: 'exd5', flags: 'c', captured: 'p', piece: 'p' });
    const double = playChess960(START_FEN, 'e4');
    expect(double).toMatchObject({ uci: 'e2e4', flags: 'b', color: 'w', from: 'e2', to: 'e4' });
    expect(double?.after).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    const ep = playChess960('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'exd6');
    expect(ep).toMatchObject({ flags: 'e', captured: 'p', san: 'exd6' });
    // A promotion needs its piece.
    expect(playChess960('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', 'e7e8')).toBeNull();
    const promoted = playChess960('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', {
      from: 'e7',
      to: 'e8',
      promotion: 'q',
    });
    expect(promoted).toMatchObject({ san: 'e8=Q', uci: 'e7e8q', promotion: 'q', flags: 'p' });
    expect(isChess960Promotion('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', 'e7', 'e8')).toBe(true);
    expect(isChess960Promotion('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', 'e1', 'e2')).toBe(false);
  });

  it('marks check and mate in the SAN', () => {
    expect(playChess960('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8')?.san).toBe('Ra8+');
    expect(playChess960('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8')?.san).toBe('Ra8#');
  });

  it('refuses what is not legal, and never throws', () => {
    expect(playChess960(START_FEN, 'e5')).toBeNull();
    expect(playChess960(START_FEN, 'e7e5')).toBeNull();
    expect(playChess960(START_FEN, 'xyz')).toBeNull();
    expect(playChess960('not a fen', 'e4')).toBeNull();
    expect(playChess960(START_FEN, { from: 'e2', to: 'e5' })).toBeNull();
    // Long algebraic must name the piece that stands there.
    expect(playChess960(START_FEN, 'Ng1-f3')?.san).toBe('Nf3');
    expect(playChess960(START_FEN, 'Bg1-f3')).toBeNull();
  });

  it('converts between UCI and SAN, and reads engine lines with castling', () => {
    const fen = chess960StartFen(0);
    expect(chess960UciToSan(fen, 'd1c3')).toBe('Nc3');
    expect(chess960SanToUci(fen, 'Nc3')).toBe('d1c3');
    expect(chess960UciToSan(fen, 'a1a2')).toBeNull();
    const clear = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(chess960LineToSan(clear, ['e1h1', 'e8a8', 'f1f2', 'zzzz', 'a7a6'])).toEqual([
      'O-O',
      'O-O-O',
    ]);
    expect(chess960SanToUci(clear, 'O-O-O')).toBe('e1a1');
  });

  it('takes typed moves as forgivingly as the standard helper', () => {
    const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/RN2K2R w KQkq - 0 1';
    expect(playChess960Typed(fen, 'o-o')?.san).toBe('O-O');
    expect(playChess960Typed(fen, '0-0')?.san).toBe('O-O');
    expect(playChess960Typed(fen, 'nc3')?.san).toBe('Nc3');
    expect(playChess960Typed(fen, 'b1c3')?.san).toBe('Nc3');
    expect(playChess960Typed(fen, 'b3')?.san).toBe('b3');
    expect(playChess960Typed(fen, 'hello')).toBeNull();
    const pawn = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';
    expect(playChess960Typed(pawn, 'e8')).toBeNull();
    expect(playChess960Typed(pawn, 'e8', { autoQueen: true })?.san).toBe('e8=Q');
    expect(playChess960Typed(pawn, 'e7e8', { autoQueen: true })?.san).toBe('e8=Q');
    expect(playChess960Typed(pawn, 'e8=n')?.san).toBe('e8=N+');
    expect(playChess960Typed('nonsense', 'e4')).toBeNull();
  });

  it('describes a position on its own', () => {
    const view = chess960Position('6k1/5ppp/8/8/8/8/8/R5K1 b - - 3 40');
    expect(view).toMatchObject({ turn: 'black', inCheck: false, moveNumber: 40 });
    expect(view?.status.over).toBe(false);
    const mated = chess960Position('R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1');
    expect(mated).toMatchObject({ inCheck: true, checkedKing: 'g8' });
    expect(mated?.status).toEqual({
      over: true,
      result: '1-0',
      reason: 'checkmate',
      winner: 'white',
    });
    expect(chess960Position('bad')).toBeNull();
    expect(chess960Dests('bad').size).toBe(0);
  });
});

describe('Chess960Game', () => {
  it('plays a game: history, take-backs and the position after each move', () => {
    const start = chess960StartFen(274);
    const game = new Chess960Game(start);
    expect(game.startFen).toBe(start);
    expect(game.turn()).toBe('white');
    expect(game.move('e4')?.san).toBe('e4');
    expect(game.move('e5')?.san).toBe('e5');
    expect(game.move('a1a1')).toBeNull();
    expect(game.history().map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(game.turn()).toBe('white');
    expect(game.undo()?.san).toBe('e5');
    expect(game.fen()).toBe(game.history()[0]?.after);
    expect(game.undo()?.san).toBe('e4');
    expect(game.undo()).toBeNull();
    expect(game.fen()).toBe(start);
    expect(Chess960Game.from('nonsense')).toBeNull();
    expect(() => new Chess960Game('nonsense')).toThrow();
  });

  it('answers what chess.js answers about the position', () => {
    const game = new Chess960Game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(game.pieceAt('a1')).toEqual({ color: 'w', type: 'r' });
    expect(game.pieceAt('b1')).toBeNull();
    expect(game.legalMoveCount()).toBe(5 + 10);
    game.move('Ra8+');
    expect(game.inCheck()).toBe(true);
    expect(game.checkedKing()).toBe('e8');
    expect(game.dests().get('e8')).toEqual(expect.arrayContaining(['d7', 'e7', 'f7']));
    const promotion = new Chess960Game('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1');
    expect(promotion.isPromotion('e7', 'e8')).toBe(true);
    // Four promotions, five king moves.
    expect(promotion.legalMoveCount()).toBe(4 + 5);
  });

  it('ends on mate, stalemate and insufficient material', () => {
    const mate = new Chess960Game('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    mate.move('Ra8');
    expect(mate.isCheckmate()).toBe(true);
    expect(mate.status()).toMatchObject({ over: true, result: '1-0', reason: 'checkmate' });
    const stalemate = new Chess960Game('k7/8/1Q6/8/8/8/8/6K1 w - - 0 1');
    stalemate.move('Qb6c7');
    expect(stalemate.status()).toMatchObject({ over: true, reason: 'stalemate', winner: null });
    const bare = new Chess960Game('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1');
    bare.move('Kxe2');
    expect(bare.status()).toMatchObject({ over: true, reason: 'insufficient material' });
    expect(bare.isGameOver()).toBe(true);
  });

  it('counts repetitions: the third time a position comes up draws', () => {
    // Position 274, BNRKNBRQ: the b-file knights go out and back.
    expect(chess960BackRank(274)).toBe('BNRKNBRQ');
    const game = new Chess960Game(chess960StartFen(274));
    const shuffle = () => {
      for (const san of ['Nc3', 'Nc6', 'Nb1', 'Nb8']) expect(game.move(san)?.san).toBe(san);
    };
    shuffle();
    expect(game.isThreefoldRepetition()).toBe(false);
    shuffle();
    expect(game.status()).toMatchObject({ over: true, reason: 'threefold repetition' });
    game.undo();
    expect(game.status().over).toBe(false);
  });

  it('draws by repetition in any start, castling rights counted', () => {
    // The classical start with its knights: back and forth twice.
    const game = new Chess960Game(START_FEN);
    for (let i = 0; i < 2; i++) {
      for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(san);
    }
    expect(game.status().reason).toBe('threefold repetition');
    // A rook that moves and comes back has lost its right: the position is a new one.
    const rights = new Chess960Game('r3k2r/p7/8/8/8/8/P7/R3K2R w KQkq - 0 1');
    for (const san of ['Rb1', 'Rb8', 'Ra1', 'Ra8']) rights.move(san);
    for (const san of ['Rb1', 'Rb8', 'Ra1', 'Ra8']) rights.move(san);
    expect(rights.isThreefoldRepetition()).toBe(false);
    for (const san of ['Rb1', 'Rb8', 'Ra1', 'Ra8']) rights.move(san);
    expect(rights.isThreefoldRepetition()).toBe(true);
  });

  it('draws after fifty moves without a capture or a pawn move', () => {
    const game = new Chess960Game('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
    expect(game.status().over).toBe(false);
    game.move('Ra2');
    expect(game.status()).toMatchObject({ over: true, reason: 'fifty-move rule' });
    // Mate on the hundredth half-move is still mate.
    const mating = new Chess960Game('6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 80');
    mating.move('Ra8');
    expect(mating.status().reason).toBe('checkmate');
  });

  it('writes a PGN with the Chess960 tags', () => {
    const start = chess960StartFen(0);
    const game = new Chess960Game(start);
    game.move('d1c3');
    game.move('Nc6');
    const pgn = game.pgn({ White: 'You', Black: 'Stockfish', Result: '*', TimeControl: '60+0' });
    expect(pgn).toBe(
      [
        '[Event "?"]',
        '[Site "?"]',
        '[Date "????.??.??"]',
        '[Round "?"]',
        '[White "You"]',
        '[Black "Stockfish"]',
        '[Result "*"]',
        '[TimeControl "60+0"]',
        '[Variant "Chess960"]',
        '[SetUp "1"]',
        `[FEN "${start}"]`,
        '',
        '1. Nc3 Nc6 *',
      ].join('\n'),
    );
    // From a position with Black to move, the first move is numbered "12...".
    const black = new Chess960Game('4k3/8/8/8/8/8/8/R3K3 b - - 0 12');
    black.move('Kd7');
    black.move('Ra7+');
    expect(black.pgn({ Result: '1/2-1/2', Event: 'a "quoted" event' })).toContain(
      '[Event "a \\"quoted\\" event"]',
    );
    expect(black.pgn().endsWith('12... Kd7 13. Ra7+ *')).toBe(true);
  });
});
