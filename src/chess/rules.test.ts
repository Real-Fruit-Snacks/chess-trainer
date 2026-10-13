import { describe, expect, it } from 'vitest';
import { chess960StartFen } from './chess960';
import { START_FEN } from './helpers';
import { rulesFor } from './rules';

const standard = rulesFor('standard');
const chess960 = rulesFor('chess960');
/** Both sides may castle either way: the classical squares, played by either set of rules. */
const OPEN = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';

describe('rulesFor', () => {
  it('names its variant', () => {
    expect(standard.variant).toBe('standard');
    expect(chess960.variant).toBe('chess960');
  });

  it('plays standard chess as chess.js does: castling to the king’s square', () => {
    const move = standard.play(OPEN, 'O-O');
    expect(move).toMatchObject({ san: 'O-O', uci: 'e1g1', from: 'e1', to: 'g1', flags: 'k' });
    expect(move?.after).toBe('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 b kq - 1 1');
    expect(standard.play(OPEN, { from: 'e1', to: 'g1' })?.san).toBe('O-O');
    expect(standard.play(OPEN, 'e2e4')?.san).toBe('e4');
    expect(standard.play(OPEN, 'Qd4')).toBeNull();
    expect(standard.play('broken', 'e4')).toBeNull();
    expect(standard.position(OPEN).dests.get('e1')).toEqual(['f1', 'd1', 'g1', 'c1']);
  });

  it('plays Chess960 with the king onto its rook, from the same squares', () => {
    const move = chess960.play(OPEN, 'O-O');
    expect(move).toMatchObject({ san: 'O-O', uci: 'e1h1', from: 'e1', to: 'h1', flags: 'k' });
    expect(move?.after).toBe(standard.play(OPEN, 'O-O')?.after);
    expect(chess960.position(OPEN).dests.get('e1')).toEqual(
      expect.arrayContaining(['d1', 'f1', 'a1', 'h1']),
    );
    expect(chess960.play('broken', 'e4')).toBeNull();
  });

  it('reads FENs the way each variant keeps them', () => {
    const fen = chess960StartFen(0).replace('KQkq', 'HFhf');
    expect(chess960.readFen(fen)).toBe(chess960StartFen(0));
    // Standard chess cannot castle with those rooks: the rights go.
    expect(standard.readFen(fen)?.split(' ')[2]).toBe('-');
    expect(standard.readFen('nonsense')).toBeNull();
    expect(chess960.readFen('nonsense')).toBeNull();
  });

  it('describes a position', () => {
    for (const rules of [standard, chess960]) {
      const info = rules.position('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 30');
      expect(info).toMatchObject({ turn: 'black', inCheck: false, checkedKing: null });
      expect(info.moveNumber).toBe(30);
      expect(info.status.over).toBe(false);
    }
    expect(() => chess960.position('broken')).toThrow();
  });

  it('converts between UCI and SAN and reads typed moves', () => {
    expect(standard.uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
    expect(chess960.uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
    expect(standard.lineToSan(OPEN, ['e1g1', 'e8c8'])).toEqual(['O-O', 'O-O-O']);
    expect(chess960.lineToSan(OPEN, ['e1h1', 'e8a8'])).toEqual(['O-O', 'O-O-O']);
    expect(standard.sanToUci(OPEN, 'O-O-O')).toBe('e1c1');
    expect(chess960.sanToUci(OPEN, 'O-O-O')).toBe('e1a1');
    expect(standard.playTyped(OPEN, 'o-o')?.uci).toBe('e1g1');
    expect(chess960.playTyped(OPEN, 'o-o')?.uci).toBe('e1h1');
    expect(standard.playTyped('broken', 'e4')).toBeNull();
    const pawn = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';
    for (const rules of [standard, chess960]) {
      expect(rules.isPromotion(pawn, 'e7', 'e8')).toBe(true);
      expect(rules.isPromotion(pawn, 'e1', 'e2')).toBe(false);
      expect(rules.playTyped(pawn, 'e8', { autoQueen: true })?.san).toBe('e8=Q');
    }
  });

  it('replays a game, repetitions and all', () => {
    for (const rules of [standard, chess960]) {
      const game = rules.replay(START_FEN);
      expect(game.legalMoveCount()).toBe(20);
      for (let i = 0; i < 2; i++) {
        for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) expect(game.play(san)?.san).toBe(san);
      }
      expect(game.isGameOver()).toBe(true);
      expect(game.isCheckmate()).toBe(false);
      expect(game.turn()).toBe('white');
      expect(game.play('xx')).toBeNull();
    }
    const fools = rules960Mate();
    expect(fools.isCheckmate()).toBe(true);
  });
});

/** Fool's mate, replayed by the Chess960 rules. */
function rules960Mate() {
  const game = chess960.replay(START_FEN);
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) game.play(san);
  return game;
}
