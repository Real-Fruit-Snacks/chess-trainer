import { describe, expect, it } from 'vitest';
import type { ImportedGame } from '@/lib/gameImport';
import { epd, groupDeviations, repertoireDeviations, type RepertoireLike } from './deviations';

const game = (id: string, white: string, black: string, moves: string): ImportedGame => ({
  id,
  pgn: `[White "${white}"]\n[Black "${black}"]\n[Result "*"]\n\n${moves} *`,
  white,
  black,
  result: '*',
  date: '',
  event: '',
  url: null,
  plies: 0,
  speed: null,
  rated: null,
  timestamp: null,
});

const ITALIAN: RepertoireLike = {
  id: 'italian',
  name: 'Italian',
  color: 'white',
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 (3. Bb5 a6) 3... Bc5 4. c3 *',
};
const FRENCH: RepertoireLike = {
  id: 'french',
  name: 'French',
  color: 'black',
  pgn: '1. e4 e6 2. d4 d5 3. Nc3 Nf6 *',
};

describe('repertoire deviations', () => {
  it('reports the first learner move outside the book, with the recommendation', () => {
    const report = repertoireDeviations(
      [game('g1', 'me', 'opp', '1. e4 e5 2. Nf3 Nc6 3. d4 exd4')],
      'me',
      [ITALIAN, FRENCH],
    );
    expect(report.coverage).toHaveLength(1);
    expect(report.coverage[0]).toMatchObject({ status: 'deviated', depth: 4 });
    expect(report.deviations[0]).toMatchObject({
      ply: 5,
      played: 'd4',
      recommended: 'Bc4',
      alternatives: ['Bb5'],
    });
  });

  it('never counts a game as covered when the first move already differs', () => {
    // As White the learner opened 1. d4: the Italian never matched.
    const white = repertoireDeviations([game('g1', 'me', 'opp', '1. d4 d5')], 'me', [ITALIAN]);
    expect(white.coverage).toHaveLength(0);
    expect(white.uncovered).toBe(1);
    // As Black the opponent opened 1. d4: not "opponent left first" for the French, but uncovered.
    const black = repertoireDeviations([game('g2', 'opp', 'me', '1. d4 d5 2. c4')], 'me', [FRENCH]);
    expect(black.coverage).toHaveLength(0);
    expect(black.uncovered).toBe(1);
    // 1. e4 e6 against the French is covered.
    const covered = repertoireDeviations(
      [game('g3', 'opp', 'me', '1. e4 e6 2. d4 d5 3. e5')],
      'me',
      [FRENCH],
    );
    expect(covered.coverage[0]).toMatchObject({ status: 'opponent-left', depth: 4 });
  });

  it('matches moves by the position reached, so transpositions stay in book', () => {
    // 1. Nf3 Nc6 2. e4 e5 reaches the same position as 1. e4 e5 2. Nf3 Nc6.
    const report = repertoireDeviations(
      [game('g1', 'me', 'opp', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6')],
      'me',
      [ITALIAN],
    );
    expect(report.coverage[0]?.status).toBe('in-book');
    // A different move order into the same book position is not a deviation either.
    const transposed = repertoireDeviations(
      [game('g2', 'me', 'opp', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3')],
      'me',
      [
        {
          ...ITALIAN,
          pgn: '1. e4 e5 2. Nf3 Nc6 3. c3 Bc5 4. Bc4 *',
        },
      ],
    );
    expect(transposed.coverage[0]?.status).toBe('in-book');
    expect(epd('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
    );
  });

  it('groups repeated deviations', () => {
    const report = repertoireDeviations(
      [
        game('g1', 'me', 'a', '1. e4 e5 2. Nf3 Nc6 3. d4'),
        game('g2', 'me', 'b', '1. e4 e5 2. Nf3 Nc6 3. d4'),
      ],
      'me',
      [ITALIAN],
    );
    const grouped = groupDeviations(report.deviations);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ count: 2, gameIds: ['g1', 'g2'] });
  });
});
