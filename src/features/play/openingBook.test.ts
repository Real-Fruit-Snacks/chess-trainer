import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { bookReply, createBook, describeDeviation, followBook } from './openingBook';

const REP = {
  id: 'test',
  name: 'Test Italian',
  color: 'white' as const,
  pgn: '1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5 d6 4. Nf3) 3. Bc4 Bc5 4. c3 *',
};

function history(...sans: string[]) {
  const chess = new Chess();
  return sans.map((san) => chess.move(san));
}

describe('opening book', () => {
  it('follows the game through the tree and knows when the book ends', () => {
    const book = createBook(REP);
    expect(book.status).toBe('in-book');
    const mid = followBook(book, history('e4', 'e5', 'Nf3'));
    expect(mid.status).toBe('in-book');
    expect(mid.node?.san).toBe('Nf3');
    const end = followBook(book, history('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'));
    expect(end.status).toBe('out-of-book');
    expect(end.endedAtPly).toBe(7);
    expect(end.deviation).toBeNull();
  });

  it('records a deviation when the learner leaves the book, not when the opponent does', () => {
    const book = createBook(REP);
    const learner = followBook(book, history('e4', 'e5', 'Nc3'));
    expect(learner.status).toBe('deviated');
    expect(learner.deviation).toMatchObject({ ply: 3, played: 'Nc3', expected: ['Nf3'] });
    expect(learner.deviation?.cardKey).toBe('e2e4 e7e5 g1f3');
    expect(describeDeviation(learner.deviation!)).toBe(
      'Left the book at move 2: 2. Nc3 instead of Nf3.',
    );
    const opponent = followBook(book, history('e4', 'c5'));
    expect(opponent.status).toBe('out-of-book');
    expect(opponent.deviation).toBeNull();
    expect(opponent.endedAtPly).toBe(1);
  });

  it('describes a black deviation with the ellipsis', () => {
    const black = createBook({ ...REP, color: 'black' });
    const dev = followBook(black, history('e4', 'c5'));
    expect(dev.status).toBe('deviated');
    expect(describeDeviation(dev.deviation!)).toBe('Left the book at move 1: 1… c5 instead of e5.');
  });

  it('replies from the book, preferring lines whose next learner move is unknown', () => {
    const book = followBook(createBook(REP), history('e4', 'e5', 'Nf3'));
    // Two candidate replies: ...Nc6 (learner then plays Bc4) and ...Nf6 (learner plays Nxe5).
    const replies = new Set<string>();
    for (let i = 0; i < 40; i++) replies.add(bookReply(book, {}, 0, Math.random) ?? '');
    expect(replies).toEqual(new Set(['Nc6', 'Nf6']));
    // With Bc4 well learned and Nxe5 never seen, the weighting favours ...Nf6.
    const cards = {
      'e2e4 e7e5 g1f3 b8c6 f1c4': {
        ease: 2.5,
        interval: 30,
        due: Number.MAX_SAFE_INTEGER,
        reps: 6,
        lapses: 0,
        lastReviewed: 1,
      },
    };
    // Weights: Nc6 → 1, Nf6 → 1 + 3 = 4; a low roll picks the first (Nc6), a high roll Nf6.
    expect(bookReply(book, cards, 0, () => 0.1)).toBe('Nc6');
    expect(bookReply(book, cards, 0, () => 0.5)).toBe('Nf6');
    expect(
      bookReply(followBook(book, history('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3')), {}),
    ).toBeNull();
  });
});
