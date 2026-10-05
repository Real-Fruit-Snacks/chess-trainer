import { describe, expect, it } from 'vitest';
import type { ImportedGame } from '@/lib/gameImport';
import { groupDeviations, repertoireDeviations } from './deviations';
import {
  guessPlayer,
  learnerColor,
  learnerSideOf,
  mainLineOfPgn,
  openingStats,
  outcomeFor,
  resultSummary,
} from './gameStats';

function game(
  id: string,
  white: string,
  black: string,
  result: string,
  moves: string,
): ImportedGame {
  return {
    id,
    pgn: `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`,
    white,
    black,
    result,
    date: '2026.09.29',
    event: 'Test',
    url: null,
    plies: moves.split(' ').filter((t) => !/^\d+\.$/.test(t)).length,
    speed: 'blitz',
    rated: true,
    timestamp: 1,
  };
}

const TABLE = {
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': ['B00', "King's Pawn Game"],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['C40', "King's Knight Opening"],
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['C50', 'Italian Game'],
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -': ['A40', "Queen's Pawn Game"],
} as Record<string, [string, string]>;

const GAMES = [
  game('g1', 'alice', 'bob', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
  game('g2', 'carol', 'alice', '0-1', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6'),
  game('g3', 'alice', 'dave', '1/2-1/2', '1. d4 d5'),
  game('g4', 'erin', 'frank', '1-0', '1. e4 e5'),
  game('g5', 'alice', 'gus', '0-1', '1. e4 e5 2. Nf3 Nc6 3. Bb5'),
];

describe('game statistics', () => {
  it('identifies the learner and the outcome', () => {
    expect(learnerColor(GAMES[0]!, 'Alice')).toBe('white');
    expect(learnerColor(GAMES[1]!, 'alice')).toBe('black');
    expect(learnerColor(GAMES[3]!, 'alice')).toBeNull();
    expect(learnerColor(GAMES[0]!, '')).toBeNull();
    expect(outcomeFor('1-0', 'white')).toBe('win');
    expect(outcomeFor('1-0', 'black')).toBe('loss');
    expect(outcomeFor('1/2-1/2', 'black')).toBe('draw');
    expect(outcomeFor('*', 'white')).toBeNull();
  });

  it('tells the learner’s side of a game on the board from its headers', () => {
    // Games against the engine call the learner "You".
    expect(learnerSideOf({ White: 'You', Black: 'Stockfish level 3' }, '')).toBe('white');
    expect(learnerSideOf({ White: 'Stockfish level 3', Black: 'You' }, 'alice')).toBe('black');
    // Imported games: by the name the learner imports under.
    expect(learnerSideOf({ White: 'carol', Black: 'Alice' }, 'alice')).toBe('black');
    // Two people at one board, a stranger's game, or no headers: unknown.
    expect(learnerSideOf({ White: 'White', Black: 'Black' }, '')).toBeNull();
    expect(learnerSideOf({ White: 'erin', Black: 'frank' }, 'alice')).toBeNull();
    expect(learnerSideOf({}, 'alice')).toBeNull();
  });

  it('groups openings per colour with scores', () => {
    const stats = openingStats(GAMES, 'alice', TABLE);
    expect(stats.unknown).toBe(1);
    expect(stats.white.map((r) => [r.name, r.games, r.score])).toEqual([
      ['Italian Game', 1, 1],
      // Shown as the app writes them, with curly apostrophes.
      ['King’s Knight Opening', 1, 0],
      ['Queen’s Pawn Game', 1, 0.5],
    ]);
    expect(stats.black).toHaveLength(1);
    expect(stats.black[0]).toMatchObject({ name: 'Italian Game', games: 1, wins: 1 });
    const summary = resultSummary(GAMES, 'alice');
    expect(summary).toEqual({ games: 4, wins: 2, draws: 1, losses: 1, unknown: 1 });
  });

  it('guesses the learner from the most frequent name', () => {
    expect(guessPlayer(GAMES)).toBe('alice');
    expect(guessPlayer([])).toBe('');
  });

  it('parses a main line and rejects garbage', () => {
    expect(mainLineOfPgn(GAMES[2]!.pgn)?.sans).toEqual(['d4', 'd5']);
    expect(mainLineOfPgn('1. e4 e5 2. Ke2xx')).toBeNull();
    // Memoised: the same text gives the same object back.
    expect(mainLineOfPgn(GAMES[2]!.pgn)).toBe(mainLineOfPgn(GAMES[2]!.pgn));
  });
});

describe('repertoire deviations', () => {
  const ITALIAN = {
    id: 'italian',
    name: 'Italian Game',
    color: 'white' as const,
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3) 4. c3 *',
  };
  const CARO = {
    id: 'caro',
    name: 'Caro-Kann',
    color: 'black' as const,
    pgn: '1. e4 c6 2. d4 d5 *',
  };

  it('finds where the learner left the repertoire, and who left first', () => {
    const report = repertoireDeviations(GAMES, 'alice', [ITALIAN, CARO]);
    // g1 stays in book (3...Bc5 4.c3 not reached), g2 is a Black game where the
    // learner answered 1.e4 with ...e5 instead of ...c6, g3 (1.d4) has no
    // repertoire, g4 is unknown, g5 deviated with 3.Bb5.
    expect(report.unknown).toBe(1);
    expect(report.uncovered).toBe(1);
    const byGame = Object.fromEntries(report.coverage.map((c) => [c.gameId, c]));
    expect(byGame.g1?.status).toBe('in-book');
    expect(byGame.g2).toMatchObject({ status: 'deviated', repertoireId: 'caro' });
    expect(byGame.g2?.deviation).toMatchObject({ ply: 2, played: 'e5', recommended: 'c6' });
    expect(byGame.g5?.deviation).toMatchObject({
      ply: 5,
      played: 'Bb5',
      recommended: 'Bc4',
      alternatives: [],
    });
    expect(report.deviations).toHaveLength(2);
  });

  it('reports when the opponent leaves the book', () => {
    const games = [game('x', 'alice', 'bob', '1-0', '1. e4 e5 2. Nf3 d6 3. d4')];
    const report = repertoireDeviations(games, 'alice', [ITALIAN]);
    expect(report.coverage[0]).toMatchObject({ status: 'opponent-left', depth: 3 });
  });

  it('groups repeated deviations', () => {
    const games = [
      game('a', 'alice', 'bob', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bb5'),
      game('b', 'alice', 'cid', '0-1', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'),
      game('c', 'alice', 'dan', '1-0', '1. e4 e5 2. Nf3 Nc6 3. d4'),
    ];
    const grouped = groupDeviations(repertoireDeviations(games, 'alice', [ITALIAN]).deviations);
    expect(grouped.map((g) => [g.played, g.count])).toEqual([
      ['Bb5', 2],
      ['d4', 1],
    ]);
  });
});
