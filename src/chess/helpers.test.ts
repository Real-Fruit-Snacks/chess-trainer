import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  canStillMate,
  castlingKingDest,
  checkedKingSquare,
  gameStatus,
  isPromotionMove,
  isPromotionShorthand,
  isValidFen,
  legalDests,
  materialBalance,
  moveLabel,
  normalizeFen,
  parseUci,
  sanitizeFen,
  sanToUci,
  START_FEN,
  toUci,
  tryMove,
  tryNotation,
  turnOf,
  uciLineToSan,
  uciToSan,
  withRookCastleDests,
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
    // 4-field FENs (EPD style) and stale castling flags are accepted after normalisation.
    expect(isValidFen('4k3/8/8/8/8/8/8/4K3 w - -')).toBe(true);
    expect(isValidFen('4k3/8/8/8/8/8/4K3/R6R w KQkq - 0 1')).toBe(true);
    expect(isValidFen('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(false);
    expect(turnOf('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('black');
  });
});

describe('normalizeFen / sanitizeFen', () => {
  it('leaves a consistent FEN exactly as it is', () => {
    expect(normalizeFen(START_FEN)).toBe(START_FEN);
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(normalizeFen(afterE4)).toBe(afterE4);
    expect(normalizeFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 4 30')).toBe(
      'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 4 30',
    );
  });

  it('drops castling rights whose king or rook has moved', () => {
    // White king on e2: no white castling; Black is untouched.
    expect(normalizeFen('r3k2r/8/8/8/8/8/4K3/R6R w KQkq - 0 1')).toBe(
      'r3k2r/8/8/8/8/8/4K3/R6R w kq - 0 1',
    );
    // Only the h-rook is home.
    expect(normalizeFen('4k3/8/8/8/8/8/8/4K2R w KQkq - 0 1')).toBe(
      '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
    );
    // A rook of the wrong colour on h1 does not count.
    expect(normalizeFen('4k3/8/8/8/8/8/8/4K2r w K - 0 1')).toBe('4k3/8/8/8/8/8/8/4K2r w - - 0 1');
    // No phantom castling reaches chess.js.
    const chess = new Chess(normalizeFen('4k3/8/8/8/8/8/4K3/R6R w KQkq - 0 1'));
    expect(chess.moves().filter((m) => m.startsWith('O-O'))).toEqual([]);
  });

  it('clears an en passant square no pawn could have created', () => {
    // No white pawn on e4.
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      START_FEN.replace(' w ', ' b '),
    );
    // Right pawn, wrong side to move.
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    );
    // A black double step is kept.
    const blackStep = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    expect(normalizeFen(blackStep)).toBe(blackStep);
  });

  it('fills in missing counters so 4- and 5-field FENs load', () => {
    expect(normalizeFen('4k3/8/8/8/8/8/8/4K3 w - -')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(normalizeFen('4k3/8/8/8/8/8/8/4K3 w - - 7')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 7 1');
    expect(sanitizeFen('  4k3/8/8/8/8/8/8/4K3 w - - ')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  });

  it('returns null from sanitizeFen for text that is not a position', () => {
    expect(sanitizeFen('not a fen')).toBeNull();
    expect(sanitizeFen('8/8/8/8/8/8/8/8 w - - 0 1')).toBeNull();
    expect(sanitizeFen('')).toBeNull();
    expect(sanitizeFen(START_FEN)).toBe(START_FEN);
  });
});

describe('castling by dropping the king on its rook', () => {
  const BOTH = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

  it('legalDests lists the rook squares for the king when asked', () => {
    const plain = legalDests(new Chess(BOTH));
    expect(plain.get('e1')).not.toContain('h1');
    const dests = legalDests(new Chess(BOTH), { rookCastle: true });
    expect(dests.get('e1')).toEqual(expect.arrayContaining(['g1', 'c1', 'h1', 'a1']));
    expect(dests.get('e1')).toHaveLength(plain.get('e1')!.length + 2);
    // Without castling rights the rook squares stay off the list.
    const none = legalDests(new Chess('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1'), { rookCastle: true });
    expect(none.get('e1')).not.toContain('h1');
  });

  it('withRookCastleDests adds the rook squares only next to a real castling move', () => {
    const dests = withRookCastleDests(BOTH, legalDests(new Chess(BOTH)));
    expect(dests.get('e1')).toEqual(expect.arrayContaining(['h1', 'a1']));
    const plain = legalDests(new Chess());
    // Nothing to add: the same map comes back.
    expect(withRookCastleDests(START_FEN, plain)).toBe(plain);
    // Black to move, kingside only.
    const black = 'r3k2r/8/8/8/8/8/8/R3K2R b Kk - 0 1';
    const blackDests = withRookCastleDests(black, legalDests(new Chess(black)));
    expect(blackDests.get('e8')).toContain('h8');
    expect(blackDests.get('e8')).not.toContain('a8');
  });

  it('castlingKingDest translates the rook square into the king’s castling square', () => {
    expect(castlingKingDest(BOTH, 'e1', 'h1')).toBe('g1');
    expect(castlingKingDest(BOTH, 'e1', 'a1')).toBe('c1');
    expect(castlingKingDest('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8', 'a8')).toBe('c8');
    // Ordinary moves and anything that is not king-onto-own-rook pass through.
    expect(castlingKingDest(BOTH, 'e1', 'f1')).toBe('f1');
    expect(castlingKingDest(BOTH, 'a1', 'a8')).toBe('a8');
    expect(castlingKingDest('r3k2r/8/8/8/8/8/8/R3K2r w Qkq - 0 1', 'e1', 'h1')).toBe('h1');
  });
});

describe('tryNotation (typed moves)', () => {
  it('reads SAN and coordinates, lowercase pieces and promotions included', () => {
    expect(tryNotation(new Chess(), 'Nf3')?.san).toBe('Nf3');
    expect(tryNotation(new Chess(), 'nf3')?.san).toBe('Nf3');
    expect(tryNotation(new Chess(), 'g1f3')?.san).toBe('Nf3');
    expect(tryNotation(new Chess(), 'e4')?.san).toBe('e4');
    const promo = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    expect(tryNotation(new Chess(promo), 'a8=q')?.san).toBe('a8=Q');
    expect(tryNotation(new Chess(promo), 'a7a8r')?.san).toBe('a8=R');
    expect(tryNotation(new Chess(promo), 'a8')).toBeNull();
    expect(tryNotation(new Chess(promo), 'a7a8')).toBeNull();
    // With auto-queen on, a promotion typed without a piece becomes a queen.
    expect(tryNotation(new Chess(promo), 'a8', { autoQueen: true })?.san).toBe('a8=Q');
    expect(tryNotation(new Chess(promo), 'a7a8', { autoQueen: true })?.san).toBe('a8=Q');
    expect(tryNotation(new Chess(promo), 'a7a8r', { autoQueen: true })?.san).toBe('a8=R');
    expect(tryNotation(new Chess(), 'e4', { autoQueen: true })?.san).toBe('e4');
    expect(isPromotionShorthand('e8')).toBe(true);
    expect(isPromotionShorthand('dxe1+')).toBe(true);
    expect(isPromotionShorthand('e7e8')).toBe(true);
    expect(isPromotionShorthand('e8=Q')).toBe(false);
    expect(isPromotionShorthand('e4')).toBe(false);
    expect(isPromotionShorthand('Re8')).toBe(false);
    const castle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(tryNotation(new Chess(castle), 'o-o')?.san).toBe('O-O');
    expect(tryNotation(new Chess(castle), '0-0-0')?.san).toBe('O-O-O');
  });

  it('never mistakes a rank-disambiguated bishop move for coordinates', () => {
    // Two bishops on the b-file can reach c3: B2c3 must be read as SAN, not as b2 → c3 coordinates.
    const two = '4k3/8/8/8/1B6/8/1B6/4K3 w - - 0 1';
    expect(tryNotation(new Chess(two), 'B2c3')?.san).toBe('B2c3');
    expect(tryNotation(new Chess(two), 'B4c3')?.san).toBe('B4c3');
    // A pawn move is tried first: "b3" is the pawn, never a bishop.
    expect(tryNotation(new Chess(), 'b3')?.san).toBe('b3');
    expect(tryNotation(new Chess(), 'bxc3')).toBeNull();
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
