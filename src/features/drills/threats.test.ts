import { describe, expect, it } from 'vitest';
import type { SearchInfo } from '@/engine/uci';
import type { ReviewedMove, ReviewSummary } from '@/features/analyze/gameReview';
import {
  describeThreat,
  dueOwnThreats,
  isOwnThreatId,
  isStoredDefence,
  isStoredThreat,
  learnerSide,
  missedThreatsNote,
  type OwnThreat,
  ownThreatId,
  ownThreatsFromReview,
  pickBundledThreat,
  type ThreatPosition,
  verifyDefence,
  verifyThreatGuess,
} from './threats';

/** 1.e4 e5 2.Bc4 Nc6 3.Qh5: Black to move, and White threatens Qxf7#. */
const SCHOLAR: ThreatPosition = {
  id: 'scholar',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  threat: 'h5f7',
  line: ['h5f7'],
  defences: ['g7g6', 'd8e7', 'd8f6'],
  rating: 900,
  kind: 'mate',
};

/** White to move; the queen on d6 eyes the loose knight on e5. */
const LOOSE_KNIGHT: ThreatPosition = {
  id: 'loose',
  fen: 'rnb1kbnr/pppp1ppp/3q4/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
  threat: 'd6e5',
  line: ['d6e5', 'd2d4', 'e5e4', 'f1e2'],
  defences: ['e5f3', 'd2d4'],
  rating: 1100,
  kind: 'material',
};

const position = (id: string, rating: number): ThreatPosition => ({ ...SCHOLAR, id, rating });

describe('threat helpers', () => {
  it('describe the threat from the opponent’s side, with what it does', () => {
    expect(describeThreat(SCHOLAR)).toEqual({ san: 'Qxf7#', outcome: 'mates' });
    expect(describeThreat(LOOSE_KNIGHT)).toEqual({ san: 'Qxe5', outcome: 'wins a piece' });
    expect(describeThreat({ ...SCHOLAR, line: [] })).toEqual({ san: 'Qxf7#', outcome: 'mates' });
    // A position whose side to move is in check has no threat to describe.
    expect(
      describeThreat({ ...SCHOLAR, fen: '4k3/8/8/8/8/8/8/r3K3 w - - 0 1', threat: 'a1a2' }),
    ).toBeNull();
  });

  it('know the learner’s side and the stored answers', () => {
    expect(learnerSide(SCHOLAR)).toBe('black');
    expect(isStoredThreat({ threat: 'a1a8', also: ['a1a7'] }, 'a1a7')).toBe(true);
    expect(isStoredThreat({ threat: 'a1a8' }, 'a1a7')).toBe(false);
    expect(isStoredDefence(SCHOLAR, 'g7g6')).toBe(true);
    expect(isStoredDefence(SCHOLAR, 'a7a6')).toBe(false);
  });

  it('give own threats a stable id of their own', () => {
    const id = ownThreatId(SCHOLAR.fen, 'h5f7');
    expect(id).toBe(ownThreatId(SCHOLAR.fen, 'h5f7'));
    expect(id).not.toBe(ownThreatId(SCHOLAR.fen, 'c4f7'));
    expect(isOwnThreatId(id)).toBe(true);
    expect(isOwnThreatId('scholar')).toBe(false);
  });

  it('bring back own threats still to learn, the least practised first', () => {
    const own = (id: string, extra: Partial<OwnThreat>): OwnThreat => ({
      ...SCHOLAR,
      id,
      source: { title: 'game', ply: 5, played: 'Nf6' },
      createdAt: 1,
      found: 0,
      missed: 0,
      streak: 0,
      ...extra,
    });
    const due = dueOwnThreats({
      a: own('a', { found: 1, missed: 1, streak: 1 }),
      b: own('b', { createdAt: 5 }),
      c: own('c', { found: 2, streak: 2 }),
      d: own('d', { createdAt: 9 }),
    });
    expect(due.map((t) => t.id)).toEqual(['d', 'b', 'a']);
  });

  it('pick a bundled position near the rating, passing over recent ones', () => {
    const all = [
      position('a', 1000),
      position('b', 1050),
      position('c', 1100),
      position('d', 2000),
    ];
    const first = () => 0;
    expect(pickBundledThreat(all, { rating: 1050, recent: [], random: first })?.id).toBe('a');
    expect(pickBundledThreat(all, { rating: 1050, recent: ['a'], random: first })?.id).toBe('b');
    // Too few fresh ones close by: the window widens.
    expect(
      pickBundledThreat(all, { rating: 1050, recent: ['a', 'b', 'c'], random: first })?.id,
    ).toBe('d');
    // Everything seen lately: a recent one comes back rather than nothing.
    expect(
      pickBundledThreat(all, { rating: 1050, recent: ['a', 'b', 'c', 'd'], random: first }),
    ).not.toBeNull();
    expect(
      pickBundledThreat(all, { rating: 1050, recent: [], excludeId: 'a', random: first })?.id,
    ).toBe('b');
    expect(pickBundledThreat([], { rating: 1500, recent: [] })).toBeNull();
  });
});

describe('engine checks', () => {
  const engineScoring = (cps: Record<string, number>) => {
    const calls: { fen: string; searchmoves?: string[] }[] = [];
    return {
      calls,
      engine: {
        search: (params: { fen: string; searchmoves?: string[] }) => {
          calls.push(params);
          const lines = new Map<number, SearchInfo>();
          (params.searchmoves ?? []).forEach((uci, i) => {
            const cp = cps[uci];
            if (cp === undefined) return;
            lines.set(i + 1, { score: { type: 'cp', value: cp }, pv: [uci] } as SearchInfo);
          });
          const best = [...lines.values()].sort((a, b) => b.score.value - a.score.value)[0]?.pv[0];
          return {
            id: 1,
            stop: () => undefined,
            result: Promise.resolve({ stopped: false, bestmove: { move: best ?? null }, lines }),
          };
        },
      },
    };
  };

  it('accept another move that carries out the same threat', async () => {
    const { engine, calls } = engineScoring({ d6e5: 320, d6d4: 300, a7a6: 0 });
    expect(await verifyThreatGuess(engine, LOOSE_KNIGHT, 'd6d4')).toBe(true);
    expect(await verifyThreatGuess(engine, LOOSE_KNIGHT, 'a7a6')).toBe(false);
    // The search is asked in the position after a pass: Black to move.
    expect(calls[0]?.fen.split(' ')[1]).toBe('b');
    expect(calls[0]?.searchmoves).toEqual(['d6e5', 'd6d4']);
    expect(await verifyThreatGuess(engine, LOOSE_KNIGHT, 'd6e5')).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('accept a defence the list does not name when it holds as well', async () => {
    const { engine } = engineScoring({ e5f3: 10, e5c4: -40, b1c3: -300 });
    expect(await verifyDefence(engine, LOOSE_KNIGHT, 'e5c4')).toBe(true);
    expect(await verifyDefence(engine, LOOSE_KNIGHT, 'b1c3')).toBe(false);
    expect(await verifyDefence(engine, LOOSE_KNIGHT, 'e5f3')).toBe(true);
    expect(await verifyDefence(engine, { ...LOOSE_KNIGHT, defences: [] }, 'e5f3')).toBe(false);
  });
});

describe('own threats from a review', () => {
  /** 3...Nf6?? in the Scholar's position: Qxf7# was threatened before the move. */
  const blunder: ReviewedMove = {
    ply: 6,
    san: 'Nf6',
    mover: 'black',
    winBefore: 0.5,
    winAfter: 1,
    loss: 0.5,
    judgement: 'blunder',
    best: 'g6',
    bestUci: 'g7g6',
    scoreBefore: { type: 'cp', value: -20 },
    fen: SCHOLAR.fen,
    scoreAfter: { type: 'mate', value: -1 },
    bestPv: ['g7g6'],
    replyUci: 'h5f7',
    replyPv: ['h5f7'],
    passThreat: { uci: 'h5f7', pv: ['h5f7'], score: { type: 'mate', value: 1 }, also: [] },
  };
  const reviewWith = (...moves: ReviewedMove[]): ReviewSummary => ({
    moves,
    counts: {
      white: { inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { inaccuracy: 0, mistake: 0, blunder: 1 },
    },
    accuracy: { white: 100, black: 50 },
    wins: [],
    depth: 12,
  });
  const meta = { title: 'me – Bot', url: 'https://lichess.org/abc', rating: 1432.6 };

  it('keeps a mistake that ignored a threat already on the board', () => {
    expect(ownThreatsFromReview(reviewWith(blunder), meta, 'black', 99)).toEqual([
      {
        id: ownThreatId(SCHOLAR.fen, 'h5f7'),
        fen: SCHOLAR.fen,
        threat: 'h5f7',
        line: ['h5f7'],
        defences: ['g7g6'],
        rating: 1433,
        kind: 'mate',
        source: {
          title: 'me – Bot',
          ply: 6,
          played: 'Nf6',
          url: 'https://lichess.org/abc',
          byLearner: true,
        },
        createdAt: 99,
        found: 0,
        missed: 0,
        streak: 0,
      },
    ]);
  });

  it('passes over the other side, new problems, small threats and lost positions', () => {
    expect(ownThreatsFromReview(reviewWith(blunder), meta, 'white')).toEqual([]);
    // The answer to the move was something else: the move made a problem of its own.
    expect(ownThreatsFromReview(reviewWith({ ...blunder, replyUci: 'c4f7' }), meta)).toEqual([]);
    const small = {
      ...blunder,
      passThreat: { uci: 'h5f7', pv: ['h5f7'], score: { type: 'cp', value: 150 }, also: [] },
    } satisfies ReviewedMove;
    expect(ownThreatsFromReview(reviewWith(small), meta)).toEqual([]);
    expect(
      ownThreatsFromReview(
        reviewWith({ ...blunder, scoreBefore: { type: 'cp', value: -400 } }),
        meta,
      ),
    ).toEqual([]);
    expect(ownThreatsFromReview(reviewWith({ ...blunder, judgement: 'inaccuracy' }), meta)).toEqual(
      [],
    );
    const { passThreat: _gone, ...noPass } = blunder;
    expect(ownThreatsFromReview(reviewWith(noPass), meta)).toEqual([]);
    // A material threat worth enough, carried out by a move as strong as the stored one.
    const material = {
      ...blunder,
      replyUci: 'c4f7',
      passThreat: {
        uci: 'h5f7',
        pv: ['h5f7'],
        score: { type: 'cp', value: 350 },
        also: ['c4f7'],
      },
    } satisfies ReviewedMove;
    expect(ownThreatsFromReview(reviewWith(material), meta)[0]).toMatchObject({
      kind: 'material',
      also: ['c4f7'],
    });
  });

  it('marks the moves as the learner’s only when it is known which side they played', () => {
    const [known] = ownThreatsFromReview(reviewWith(blunder), meta, 'black');
    expect(known?.source.byLearner).toBe(true);
    const [unknown] = ownThreatsFromReview(reviewWith(blunder), meta, 'both');
    expect(unknown).toBeDefined();
    expect(unknown?.source).not.toHaveProperty('byLearner');
  });

  it('counts missed threats as the learner’s own moves only when they are', () => {
    const mine = { source: { title: 't', ply: 6, played: 'Nf6', byLearner: true } };
    const anyone = { source: { title: 't', ply: 7, played: 'Qxb2' } };
    expect(missedThreatsNote([mine], 'game')).toBe(
      'One of your moves ignored a threat that was already on the board.',
    );
    expect(missedThreatsNote([mine, mine], 'games')).toBe(
      '2 of your moves ignored a threat that was already on the board.',
    );
    expect(missedThreatsNote([anyone], 'game')).toBe(
      'One move in this game ignored a threat that was already on the board.',
    );
    expect(missedThreatsNote([mine, anyone, anyone], 'games')).toBe(
      '3 moves in your games ignored a threat that was already on the board.',
    );
  });
});
