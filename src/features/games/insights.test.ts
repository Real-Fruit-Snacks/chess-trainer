import { describe, expect, it } from 'vitest';
import type { ReviewSummary } from '@/features/analyze/gameReview';
import type { StoredGame } from '@/store/games';
import { accuracyFromLoss, buildInsights, digestReview, phaseOf } from './insights';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('phases', () => {
  it('splits the game by move number and material', () => {
    expect(phaseOf(START, 1)).toBe('opening');
    expect(phaseOf(START, 21)).toBe('middlegame');
    // Queens off with two rooks and a minor piece each: an ending.
    expect(phaseOf('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 40', 40)).toBe('endgame');
    expect(phaseOf('r3k2r/pppppppp/2n5/8/8/2N5/PPPPPPPP/R3K2R w KQkq - 0 30', 30)).toBe('endgame');
    // Queens on with rooks and minors: still a middlegame even late.
    expect(phaseOf('r2qk2r/pppppppp/2n5/8/8/2N5/PPPPPPPP/R2QK2R w KQkq - 0 30', 30)).toBe(
      'middlegame',
    );
    // A queen and a rook each with nothing else: material 28 but that is an ending.
    expect(phaseOf('4k3/8/8/8/8/8/8/R2QK3 w - - 0 50', 50)).toBe('endgame');
  });

  it('maps loss to accuracy like game review', () => {
    expect(accuracyFromLoss(0, 10)).toBe(100);
    expect(accuracyFromLoss(1, 10)).toBe(61);
    expect(accuracyFromLoss(0, 0)).toBeNull();
  });
});

function move(
  ply: number,
  san: string,
  fen: string,
  loss: number,
  judgement: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder',
): ReviewSummary['moves'][number] {
  return {
    ply,
    san,
    mover: ply % 2 === 1 ? 'white' : 'black',
    winBefore: 0.5,
    winAfter: 0.5 - loss,
    loss,
    judgement,
    best: null,
    bestUci: null,
    scoreBefore: { type: 'cp', value: 0 },
    fen,
    scoreAfter: { type: 'cp', value: 0 },
    bestPv: [],
    replyUci: null,
    replyPv: [],
  };
}

describe('digestReview', () => {
  it('counts moves, losses and errors per phase and side, and names the mistakes', () => {
    // A knight that hangs to a pawn: the commentary calls it a hanging piece.
    const hangs = move(1, 'Ne5', '4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1', 0.3, 'blunder');
    hangs.replyUci = 'd6e5';
    hangs.scoreAfter = { type: 'cp', value: -300 };
    const summary: ReviewSummary = {
      moves: [
        hangs,
        move(2, 'e5', START, 0, 'best'),
        move(
          23,
          'Qh5',
          'r2qk2r/pppppppp/2n5/8/8/2N5/PPPPPPPP/R2QK2R w KQkq - 0 12',
          0.12,
          'mistake',
        ),
      ],
      counts: {
        white: { inaccuracy: 0, mistake: 1, blunder: 1 },
        black: { inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      accuracy: { white: 50, black: 100 },
      wins: [],
      depth: 12,
    };
    const digest = digestReview(summary);
    // A bare-board position counts as an ending whatever the move number.
    expect(digest.phases.endgame.white).toEqual({ moves: 1, loss: 0.3, errors: 1 });
    expect(digest.phases.opening.white).toEqual({ moves: 0, loss: 0, errors: 0 });
    expect(digest.phases.opening.black).toEqual({ moves: 1, loss: 0, errors: 0 });
    expect(digest.phases.middlegame.white).toEqual({ moves: 1, loss: 0.12, errors: 1 });
    expect(digest.motifs.white['hanging-piece']).toBe(1);
    expect(digest.motifs.black).toEqual({});
  });
});

function game(
  id: string,
  color: 'white' | 'black',
  result: string,
  digest: StoredGame['review'] extends infer R
    ? R extends { digest?: infer D }
      ? D
      : never
    : never,
): StoredGame {
  return {
    id,
    pgn: '1. e4 e5 *',
    white: color === 'white' ? 'alice' : 'bob',
    black: color === 'black' ? 'alice' : 'bob',
    result,
    date: '2026.09.01',
    event: '',
    url: null,
    plies: 2,
    speed: null,
    rated: null,
    timestamp: null,
    source: 'pgn',
    importedAt: 1,
    review: {
      accuracy: { white: 80, black: 80 },
      counts: {
        white: { inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      depth: 12,
      at: 1,
      digest,
    },
  };
}

const blank = { moves: 0, loss: 0, errors: 0 };

describe('buildInsights', () => {
  it('aggregates phases, mistakes, colours, openings and engine levels for the learner', () => {
    const games = [
      game('g1', 'white', '1-0', {
        phases: {
          opening: { white: { moves: 10, loss: 0.1, errors: 0 }, black: blank },
          middlegame: { white: { moves: 20, loss: 2.0, errors: 3 }, black: blank },
          endgame: { white: blank, black: blank },
        },
        motifs: { white: { 'hanging-piece': 2, fork: 1 }, black: {} },
      }),
      game('g2', 'black', '0-1', {
        phases: {
          opening: { white: blank, black: { moves: 10, loss: 0.2, errors: 0 } },
          middlegame: { white: blank, black: { moves: 15, loss: 1.2, errors: 2 } },
          endgame: { white: blank, black: { moves: 12, loss: 0.1, errors: 0 } },
        },
        motifs: { white: { fork: 5 }, black: { 'hanging-piece': 1 } },
      }),
      game('g3', 'black', '1-0', {
        phases: {
          opening: { white: blank, black: { moves: 8, loss: 0.05, errors: 0 } },
          middlegame: { white: blank, black: blank },
          endgame: { white: blank, black: blank },
        },
        motifs: { white: {}, black: {} },
      }),
    ];
    const insights = buildInsights(
      games,
      'alice',
      [
        {
          id: 'g1',
          source: 'play',
          at: 1,
          level: 3,
          color: 'white',
          result: '1-0',
          reason: 'checkmate',
          plies: 40,
          pgn: '',
        },
        {
          id: 'g2',
          source: 'play',
          at: 2,
          level: 3,
          color: 'black',
          result: '1-0',
          reason: 'resignation',
          plies: 30,
          pgn: '',
        },
        {
          id: 'g3',
          source: 'book',
          at: 3,
          level: 4,
          color: 'white',
          result: '1/2-1/2',
          reason: 'stalemate',
          plies: 60,
          pgn: '',
          book: { repertoireId: 'italian', status: 'deviated', endedAtPly: 6, deviationPly: 7 },
        },
      ],
      { g1: 'Italian Game', g2: 'Sicilian Defense', g3: 'Sicilian Defense' },
    );
    expect(insights.reviewedGames).toBe(3);
    const middlegame = insights.phases.find((p) => p.phase === 'middlegame');
    expect(middlegame?.moves).toBe(35);
    expect(middlegame?.errors).toBe(5);
    expect(middlegame?.accuracy).toBe(Math.round(100 * Math.exp(-5 * (3.2 / 35))));
    // The opponent's forks are not counted against the learner.
    expect(insights.motifs[0]).toMatchObject({ motif: 'hanging-piece', count: 3, reliable: true });
    expect(insights.motifs.find((m) => m.motif === 'fork')).toMatchObject({
      count: 1,
      reliable: false,
    });
    // Small samples are flagged: the endgame has few moves, one game as White is nothing.
    expect(middlegame?.reliable).toBe(true);
    expect(insights.phases.find((p) => p.phase === 'endgame')?.reliable).toBe(false);
    expect(insights.colours[0]?.reliable).toBe(false);
    expect(insights.openings[0]?.reliable).toBe(false);
    expect(insights.motifs[0]?.lessonId).toBe('piece-values');
    expect(insights.motifs[0]?.themeName).toBe('Hanging piece');
    expect(insights.colours[0]).toMatchObject({ color: 'white', games: 1, wins: 1 });
    expect(insights.colours[1]).toMatchObject({ color: 'black', games: 2, wins: 1, losses: 1 });
    expect(insights.openings[0]).toMatchObject({ name: 'Sicilian Defense', games: 2, score: 50 });
    expect(insights.levels).toEqual([
      { level: 3, games: 2, wins: 1, draws: 0, losses: 1 },
      { level: 4, games: 1, wins: 0, draws: 1, losses: 0 },
    ]);
    expect(insights.book).toEqual({ games: 1, deviated: 1, averageBookMoves: 3 });
    // Work on: the most frequent mistake, then the weakest phase.
    expect(insights.workOn.map((w) => w.id)).toEqual(['motif:hanging-piece', 'phase:middlegame']);
    expect(insights.workOn[1]?.lessonId).toBe('planning-basics');
  });

  it('is empty without reviews or a known player', () => {
    const insights = buildInsights([], '', []);
    expect(insights.reviewedGames).toBe(0);
    expect(insights.workOn).toEqual([]);
    expect(insights.phases.every((p) => p.accuracy === null)).toBe(true);
  });
});
