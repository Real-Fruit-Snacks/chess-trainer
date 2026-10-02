import { describe, expect, it } from 'vitest';
import { figurineSan, notateText, SAN_IN_TEXT, sanParts } from './notation';

describe('move notation', () => {
  it('splits a move into its piece letters and the rest', () => {
    expect(sanParts('Nf3')).toEqual([{ piece: 'N', text: 'N' }, { text: 'f3' }]);
    expect(sanParts('e4')).toEqual([{ text: 'e4' }]);
    expect(sanParts('exd8=Q+')).toEqual([
      { text: 'exd8=' },
      { piece: 'Q', text: 'Q' },
      { text: '+' },
    ]);
    expect(sanParts('O-O-O')).toEqual([{ text: 'O-O-O' }]);
    // Only the leading letter and a promotion piece are pieces: the files are not.
    expect(sanParts('Rfe8')).toEqual([{ piece: 'R', text: 'R' }, { text: 'fe8' }]);
  });

  it('writes a move with figurines', () => {
    expect(figurineSan('Nf3')).toBe('♘f3');
    expect(figurineSan('Qxh7#')).toBe('♕xh7#');
    expect(figurineSan('e8=Q+')).toBe('e8=♕+');
    expect(figurineSan('Kxe2')).toBe('♔xe2');
    expect(figurineSan('Bb5')).toBe('♗b5');
    expect(figurineSan('O-O')).toBe('O-O');
    expect(figurineSan('a6')).toBe('a6');
  });

  it('finds the moves in prose and leaves the words alone', () => {
    const text =
      'After 1. e4 e5 2. Nf3 Nc6 3. Bb5, Be careful: Rxe8+ and exd8=Q+ both win. Kb1? No. N3 is not a move.';
    const found = [...text.matchAll(SAN_IN_TEXT)].map((m) => m[0]);
    expect(found).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Rxe8+', 'exd8=Q+', 'Kb1']);
    expect(notateText(text, 'figurine')).toBe(
      'After 1. e4 e5 2. ♘f3 ♘c6 3. ♗b5, Be careful: ♖xe8+ and exd8=♕+ both win. ♔b1? No. N3 is not a move.',
    );
    expect(notateText(text, 'letters')).toBe(text);
  });

  it('does not touch words, squares or castling', () => {
    expect(notateText('The e4 square, the Ne2 idea and O-O-O.', 'figurine')).toBe(
      'The e4 square, the ♘e2 idea and O-O-O.',
    );
    expect(notateText('Benoni, Reti, Najdorf, Kan and Queens', 'figurine')).toBe(
      'Benoni, Reti, Najdorf, Kan and Queens',
    );
    expect(notateText('Already ♘f3', 'figurine')).toBe('Already ♘f3');
  });
});
