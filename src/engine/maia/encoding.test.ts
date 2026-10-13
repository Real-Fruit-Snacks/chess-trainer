import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import {
  humanThinkMs,
  MAIA_BOARD_SIZE,
  MAIA_VOCABULARY_SIZE,
  type MaiaMove,
  maiaMoveIndex,
  maiaPolicy,
  maiaTokens,
  maiaValue,
  SAMPLE_FLOOR,
  sampleHumanMove,
} from './encoding';
import { DEFAULT_HUMAN_RATING, HUMAN_RATINGS, isHumanRating, stepHumanRating } from './ratings';

const PIECES = 'PNBRQKpnbrqk';
/** The piece on `square` (0 = a1 … 63 = h8) of a token grid, as a FEN letter. */
function pieceAt(tokens: Float32Array, square: number): string | null {
  for (let channel = 0; channel < 12; channel++) {
    if (tokens[square * 12 + channel] === 1) return PIECES.charAt(channel);
  }
  return null;
}
const sq = (name: string) => (Number(name.charAt(1)) - 1) * 8 + name.charCodeAt(0) - 97;

/** Logits that favour the given vocabulary indices, in order (everything else far below). */
function logitsFavouring(...indices: number[]): Float32Array {
  const logits = new Float32Array(MAIA_VOCABULARY_SIZE).fill(-20);
  indices.forEach((index, i) => {
    logits[index] = 10 - i;
  });
  return logits;
}

describe('the board as Maia-3 sees it', () => {
  it('one-hot codes the pieces from White’s side when White moves', () => {
    const tokens = maiaTokens(START_FEN);
    expect(tokens).toHaveLength(MAIA_BOARD_SIZE);
    expect(tokens.reduce((a, b) => a + b, 0)).toBe(32);
    expect(pieceAt(tokens, sq('e1'))).toBe('K');
    expect(pieceAt(tokens, sq('d8'))).toBe('q');
    expect(pieceAt(tokens, sq('a2'))).toBe('P');
    expect(pieceAt(tokens, sq('e4'))).toBeNull();
  });

  it('mirrors the board and swaps the colours when Black moves', () => {
    // After 1.e4: Black to move sees its own pieces as "White" on the first two ranks.
    const tokens = maiaTokens('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(pieceAt(tokens, sq('e1'))).toBe('K'); // Black's king, e8 mirrored
    expect(pieceAt(tokens, sq('d1'))).toBe('Q');
    expect(pieceAt(tokens, sq('e5'))).toBe('p'); // White's e4 pawn, mirrored
    expect(pieceAt(tokens, sq('e7'))).toBeNull();
    expect(pieceAt(tokens, sq('e8'))).toBe('k');
  });

  it('turns down a placement it cannot read', () => {
    expect(() => maiaTokens('rnbqkbnx/8/8/8/8/8/8/4K3 w - - 0 1')).toThrow(/Not a piece/);
  });
});

describe('moves in the model’s vocabulary', () => {
  it('indexes from-square × 64 + to-square, in the mover’s frame', () => {
    expect(maiaMoveIndex('e2e4', false)).toBe(12 * 64 + 28);
    // Black's e7–e5 is White's e2–e4 in the mirror.
    expect(maiaMoveIndex('e7e5', true)).toBe(12 * 64 + 28);
    expect(maiaMoveIndex('a1a1', false)).toBe(0);
    expect(maiaMoveIndex('h8h8', false)).toBe(4095);
    // Castling is the king's two-square move: O-O for either side.
    expect(maiaMoveIndex('e1g1', false)).toBe(4 * 64 + 6);
    expect(maiaMoveIndex('e8g8', true)).toBe(4 * 64 + 6);
  });

  it('indexes promotions after the 4,096 moves, by file, file and piece (q r b n)', () => {
    expect(maiaMoveIndex('a7a8q', false)).toBe(4096);
    expect(maiaMoveIndex('a7a8n', false)).toBe(4099);
    expect(maiaMoveIndex('a7b8q', false)).toBe(4100);
    expect(maiaMoveIndex('h7h8n', false)).toBe(MAIA_VOCABULARY_SIZE - 1);
    // Black's h2–h1 promotion is h7–h8 in the mirror.
    expect(maiaMoveIndex('h2h1q', true)).toBe(4096 + 7 * 32 + 7 * 4);
    expect(maiaMoveIndex('g2h1r', true)).toBe(4096 + 6 * 32 + 7 * 4 + 1);
  });
});

describe('the policy over the legal moves', () => {
  it('keeps to the legal moves, likeliest first, with probabilities that sum to one', () => {
    const logits = logitsFavouring(maiaMoveIndex('d2d4', false), maiaMoveIndex('e2e4', false));
    const moves = maiaPolicy(START_FEN, logits);
    expect(moves).toHaveLength(20);
    expect(moves.slice(0, 2).map((m) => m.san)).toEqual(['d4', 'e4']);
    expect(moves[0]?.uci).toBe('d2d4');
    expect(moves.reduce((sum, m) => sum + m.probability, 0)).toBeCloseTo(1, 6);
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i - 1]?.probability).toBeGreaterThanOrEqual(moves[i]?.probability ?? 0);
    }
  });

  it('reads Black’s moves back in the real frame, promotions and castling included', () => {
    const black = 'r3k2r/8/8/8/8/8/1p6/4K3 b kq - 0 1';
    const logits = logitsFavouring(maiaMoveIndex('b2b1n', true), maiaMoveIndex('e8g8', true));
    const moves = maiaPolicy(black, logits);
    expect(moves[0]).toMatchObject({ uci: 'b2b1n', san: 'b1=N' });
    expect(moves[1]).toMatchObject({ uci: 'e8g8', san: 'O-O' });
  });

  it('is empty when the game is over, and reads the value head as chances', () => {
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(maiaPolicy(mated, logitsFavouring(0))).toEqual([]);
    const value = maiaValue([0, 0, Math.log(2)]);
    expect(value.loss).toBeCloseTo(0.25);
    expect(value.draw).toBeCloseTo(0.25);
    expect(value.win).toBeCloseTo(0.5);
  });
});

describe('choosing a move like a player of the rating', () => {
  const moves: MaiaMove[] = [
    { uci: 'b1c3', san: 'Nxd5', probability: 0.9 },
    { uci: 'g1f3', san: 'Nf3', probability: 0.07 },
    { uci: 'd2d4', san: 'd4', probability: 0.025 },
    { uci: 'a2a3', san: 'a3', probability: 0.005 },
  ];

  it('draws in proportion to the probabilities, leaving out the long tail', () => {
    expect(sampleHumanMove(moves, () => 0)?.san).toBe('Nxd5');
    expect(sampleHumanMove(moves, () => 0.92)?.san).toBe('Nf3');
    // a3 is under the floor: even the very top of the draw lands on d4.
    expect(moves[3]?.probability).toBeLessThan(SAMPLE_FLOOR);
    expect(sampleHumanMove(moves, () => 0.999999)?.san).toBe('d4');
    expect(sampleHumanMove([], () => 0.5)).toBeNull();
  });

  it('always keeps the likeliest move, however unlikely', () => {
    const flat: MaiaMove[] = [
      { uci: 'a2a3', san: 'a3', probability: 0.01 },
      { uci: 'h2h3', san: 'h3', probability: 0.01 },
    ];
    expect(sampleHumanMove(flat, () => 0.7)?.san).toBe('a3');
  });

  it('thinks briefly over an obvious move, longer over an open one, and never flags itself', () => {
    const obvious: MaiaMove[] = [{ uci: 'b1c3', san: 'Nxd5', probability: 0.95 }];
    const open: MaiaMove[] = [{ uci: 'g1f3', san: 'Nf3', probability: 0.2 }];
    const middlegame = { ply: 30, clockMs: null };
    expect(humanThinkMs(obvious, middlegame, () => 0)).toBe(Math.round(300 + 1200 * 0.05));
    expect(humanThinkMs(open, middlegame, () => 0)).toBe(Math.round(300 + 1200 * 0.8));
    expect(humanThinkMs(open, middlegame, () => 1)).toBe(Math.round(2 * (300 + 1200 * 0.8)));
    // The opening goes at twice the pace.
    expect(humanThinkMs(open, { ply: 4, clockMs: null }, () => 0)).toBe(
      Math.round((300 + 960) / 2),
    );
    // A slice of the clock at most, and next to nothing when short of time.
    expect(humanThinkMs(open, { ply: 30, clockMs: 20_000 }, () => 1)).toBe(500);
    expect(humanThinkMs(open, { ply: 30, clockMs: 8_000 }, () => 1)).toBe(200);
  });
});

describe('the ratings it plays at', () => {
  it('go from 600 to 2600 in hundreds, starting at 1200', () => {
    expect(HUMAN_RATINGS[0]).toBe(600);
    expect(HUMAN_RATINGS.at(-1)).toBe(2600);
    expect(HUMAN_RATINGS).toHaveLength(21);
    expect(isHumanRating(DEFAULT_HUMAN_RATING)).toBe(true);
    expect(isHumanRating(1250)).toBe(false);
    expect(isHumanRating('1500')).toBe(false);
    expect(stepHumanRating(1500, 1)).toBe(1600);
    expect(stepHumanRating(600, -1)).toBe(600);
    expect(stepHumanRating(2600, 1)).toBe(2600);
  });
});
