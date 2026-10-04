import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineClient, SearchHandle, SearchParams, SearchResult } from '@/engine/EngineClient';
import type { SearchInfo } from '@/engine/uci';
import { depthFor, judge, keyMoments, mateFloor, reviewGame } from './gameReview';

interface Scripted {
  cp?: number;
  mate?: number;
  best: string;
  stopped?: number;
  /**
   * Scores of single moves searched on their own (`searchmoves`), for the side to
   * move here. Without one, such a search reports the position after the move, flipped.
   */
  only?: Record<string, { cp?: number; mate?: number }>;
}

/** The position a search is about: its FEN with its moves played. */
function positionOf(params: SearchParams): string {
  if (!params.moves?.length) return params.fen;
  const chess = new Chess(params.fen);
  for (const uci of params.moves) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  return chess.fen();
}

/** A fake engine that returns scripted evaluations keyed by FEN. */
function fakeEngine(
  evaluations: Record<string, Scripted>,
  calls: SearchParams[] = [],
): EngineClient {
  const search = (params: SearchParams): SearchHandle => {
    calls.push(params);
    // The review sends the start position plus the moves played; script by the position reached.
    const fen = positionOf(params);
    const only = params.searchmoves?.length === 1 ? params.searchmoves[0] : undefined;
    if (only) {
      const scripted = evaluations[fen]?.only?.[only];
      const next = positionOf({ ...params, moves: [...(params.moves ?? []), only] });
      const after = evaluations[next];
      // The position after the move, seen from this side: mated in k there is a mate in k + 1 here.
      const derived =
        after?.mate !== undefined
          ? { mate: after.mate < 0 ? 1 - after.mate : -after.mate }
          : { cp: -(after?.cp ?? 0) };
      const value = scripted ?? derived;
      const info: SearchInfo = {
        depth: 12,
        multipv: 1,
        score:
          value.mate !== undefined
            ? { type: 'mate', value: value.mate }
            : { type: 'cp', value: value.cp ?? 0 },
        pv: [only],
      };
      const result: SearchResult = {
        bestmove: { move: only },
        lines: new Map([[1, info]]),
        stopped: false,
      };
      return { id: 1, result: Promise.resolve(result), stop: () => undefined };
    }
    const entry = evaluations[fen];
    if (!entry) throw new Error(`No scripted evaluation for ${fen}`);
    if (entry.stopped) {
      entry.stopped -= 1;
      const stopped: SearchResult = { bestmove: { move: null }, lines: new Map(), stopped: true };
      return { id: 1, result: Promise.resolve(stopped), stop: () => undefined };
    }
    const info: SearchInfo = {
      depth: 12,
      multipv: 1,
      score:
        entry.mate !== undefined
          ? { type: 'mate', value: entry.mate }
          : { type: 'cp', value: entry.cp ?? 0 },
      pv: [entry.best],
    };
    const result: SearchResult = {
      bestmove: { move: entry.best },
      lines: new Map([[1, info]]),
      stopped: false,
    };
    return { id: 1, result: Promise.resolve(result), stop: () => undefined };
  };
  return { search } as unknown as EngineClient;
}

const fenAfter = (start: string, ...sans: string[]) => {
  const c = new Chess(start);
  for (const san of sans) c.move(san);
  return c.fen();
};

describe('judge', () => {
  it('classifies by win-probability loss', () => {
    expect(judge(0)).toBe('good');
    expect(judge(0.12)).toBe('inaccuracy');
    expect(judge(0.22)).toBe('mistake');
    expect(judge(0.5)).toBe('blunder');
  });
});

describe('reviewGame', () => {
  it('annotates a blunder and reports the better move', async () => {
    const chess = new Chess();
    const start = chess.fen();
    const afterE4 = (() => {
      const c = new Chess();
      c.move('e4');
      return c.fen();
    })();
    const afterF5 = (() => {
      const c = new Chess();
      c.move('e4');
      c.move('f5');
      return c.fen();
    })();

    chess.move('e4');
    chess.move('f5'); // ??
    const moves = chess.history({ verbose: true });

    const engine = fakeEngine({
      [start]: { cp: 30, best: 'e2e4' },
      [afterE4]: { cp: -30, best: 'e7e5' }, // black to move, slight white edge
      [afterF5]: { cp: 650, best: 'e4f5' }, // white to move, winning
    });

    const progress: number[] = [];
    const review = await reviewGame(engine, start, moves, {
      onProgress: (d, t) => progress.push(d / t),
    });

    expect(progress[progress.length - 1]).toBe(1);
    expect(review.moves).toHaveLength(2);
    expect(review.moves[0]).toMatchObject({ san: 'e4', judgement: 'best' });
    expect(review.moves[1]?.judgement).toBe('blunder');
    expect(review.moves[1]?.best).toBe('e5');
    expect(review.counts.black.blunder).toBe(1);
    expect(review.accuracy.white).toBe(100);
    expect(review.accuracy.black).toBeLessThan(50);
    // Per-ply win probabilities for the evaluation graph: start, after e4, after f5.
    expect(review.wins).toHaveLength(3);
    expect(review.wins[2]).toBeGreaterThan(review.wins[1] ?? 0);
    expect(review.depth).toBe(12);
    expect(review.moves[1]?.mover).toBe('black');

    const moments = keyMoments(review);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({
      ply: 2,
      san: 'f5',
      mover: 'black',
      judgement: 'blunder',
      best: 'e5',
    });
  });

  it('counts a missed mate as at least an inaccuracy and an allowed mate as a mistake', async () => {
    const start = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const chess = new Chess(start);
    chess.move('Kf1'); // misses Ra8#
    chess.move('h6');
    const moves = chess.history({ verbose: true });
    const engine = fakeEngine({
      [start]: { mate: 1, best: 'a1a8' },
      [fenAfter(start, 'Kf1')]: { cp: -600, best: 'g8h8' },
      [fenAfter(start, 'Kf1', 'h6')]: { mate: 1, best: 'a1a8' },
    });
    const review = await reviewGame(engine, start, moves);
    // Win probability barely moved (still winning), but the mate was thrown away.
    expect(review.moves[0]?.judgement).toBe('inaccuracy');
    expect(review.moves[0]?.best).toBe('Ra8#');
    // Black was losing already: allowing the mate again is no floor case.
    expect(review.moves[1]?.judgement).toBe('good');
    expect(review.counts.white.inaccuracy).toBe(1);
  });

  it('checks a flagged move again from the position before it, at the best move’s horizon', async () => {
    const calls: SearchParams[] = [];
    const start = new Chess().fen();
    const chess = new Chess();
    chess.move('e4');
    chess.move('d5'); // not the engine's choice, and the search after it sees trouble …
    chess.move('exd5');
    chess.move('Qxd5');
    const moves = chess.history({ verbose: true });
    const engine = fakeEngine(
      {
        [start]: { cp: 30, best: 'e2e4' },
        // … but searched from the position before, d5 costs next to nothing.
        [fenAfter(start, 'e4')]: { cp: -30, best: 'e7e5', only: { d7d5: { cp: -60 } } },
        [fenAfter(start, 'e4', 'd5')]: { cp: 400, best: 'e4d5' },
        // The other moves are the engine's own choices: no second search.
        [fenAfter(start, 'e4', 'd5', 'exd5')]: { cp: -60, best: 'd8d5' },
        [fenAfter(start, 'e4', 'd5', 'exd5', 'Qxd5')]: { cp: 60, best: 'b1c3' },
      },
      calls,
    );
    const review = await reviewGame(engine, start, moves, { depth: 14 });
    expect(review.moves.map((m) => m.judgement)).toEqual(['best', 'good', 'best', 'best']);
    expect(review.moves[1]?.loss).toBeLessThan(0.05);
    // One extra search, for the flagged move only, limited to it and at its position's depth.
    const limited = calls.filter((c) => c.searchmoves);
    expect(limited).toHaveLength(1);
    expect(limited[0]).toMatchObject({ moves: ['e2e4'], searchmoves: ['d7d5'], depth: 10 });
    // The graph keeps the plain evaluations.
    expect(review.wins[2]).toBeGreaterThan(0.8);
  });

  it('keeps the verdict when the second search agrees the move was a slip', async () => {
    const start = new Chess().fen();
    const chess = new Chess();
    chess.move('e4');
    chess.move('f5');
    const engine = fakeEngine({
      [start]: { cp: 30, best: 'e2e4' },
      [fenAfter(start, 'e4')]: { cp: -30, best: 'e7e5', only: { f7f5: { cp: -640 } } },
      [fenAfter(start, 'e4', 'f5')]: { cp: 650, best: 'e4f5' },
    });
    const review = await reviewGame(engine, start, chess.history({ verbose: true }));
    expect(review.moves[1]?.judgement).toBe('blunder');
  });

  it('does not punish the move that delivers mate', async () => {
    const start = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const chess = new Chess(start);
    chess.move('Ra8#');
    const engine = fakeEngine({ [start]: { mate: 1, best: 'a1b1' } });
    const review = await reviewGame(engine, start, chess.history({ verbose: true }));
    expect(review.moves[0]?.judgement).toBe('good');
  });

  it('applies the mate floors from the mover’s point of view', () => {
    const mate = (value: number) => ({ type: 'mate' as const, value });
    const cp = (value: number) => ({ type: 'cp' as const, value });
    expect(mateFloor('good', mate(2), cp(1500))).toBe('inaccuracy');
    expect(mateFloor('blunder', mate(2), cp(1500))).toBe('blunder');
    expect(mateFloor('good', mate(2), mate(5))).toBe('good');
    expect(mateFloor('good', cp(20), mate(-3))).toBe('mistake');
    expect(mateFloor('good', cp(-900), mate(-3))).toBe('good');
    expect(mateFloor('good', mate(-4), mate(-2))).toBe('good');
    expect(mateFloor('best', mate(2), cp(0))).toBe('best');
    expect(mateFloor('good', mate(1), null, true)).toBe('good');
  });

  it('retries a stopped search once and then gives up', async () => {
    const start = new Chess().fen();
    const chess = new Chess();
    chess.move('e4');
    const moves = chess.history({ verbose: true });
    const once = fakeEngine({
      [start]: { cp: 30, best: 'e2e4', stopped: 1 },
      [fenAfter(start, 'e4')]: { cp: -30, best: 'e7e5' },
    });
    const review = await reviewGame(once, start, moves);
    expect(review.moves[0]?.judgement).toBe('best');
    const twice = fakeEngine({
      [start]: { cp: 30, best: 'e2e4', stopped: 2 },
      [fenAfter(start, 'e4')]: { cp: -30, best: 'e7e5' },
    });
    await expect(reviewGame(twice, start, moves)).rejects.toThrow(/interrupted/);
  });

  it('searches forced moves and book positions less deeply', async () => {
    expect(depthFor(18, { legalMoves: 1, ply: 30, fromStart: true })).toBe(1);
    expect(depthFor(18, { legalMoves: 20, ply: 4, fromStart: true })).toBe(10);
    expect(depthFor(18, { legalMoves: 20, ply: 4, fromStart: false })).toBe(18);
    expect(depthFor(18, { legalMoves: 20, ply: 30, fromStart: true })).toBe(18);
    expect(depthFor(8, { legalMoves: 20, ply: 4, fromStart: true })).toBe(8);
    // A king with one legal reply is searched at depth 1; the game from the start is capped early.
    const calls: SearchParams[] = [];
    const start = new Chess().fen();
    const chess = new Chess();
    chess.move('e4');
    const engine = fakeEngine(
      {
        [start]: { cp: 30, best: 'e2e4' },
        [fenAfter(start, 'e4')]: { cp: -30, best: 'e7e5' },
      },
      calls,
    );
    await reviewGame(engine, start, chess.history({ verbose: true }), { depth: 18 });
    expect(calls.map((c) => c.depth)).toEqual([10, 10]);
    // Black's only legal move is Kxa7 (after it the position is a dead draw: no search).
    const forced = 'k7/P1K5/8/8/8/8/8/8 b - - 0 1';
    const only = new Chess(forced);
    expect(only.moves()).toEqual(['Kxa7']);
    only.move('Kxa7');
    const forcedCalls: SearchParams[] = [];
    await reviewGame(
      fakeEngine({ [forced]: { cp: 0, best: 'a8a7' } }, forcedCalls),
      forced,
      only.history({ verbose: true }),
      { depth: 18 },
    );
    expect(forcedCalls.map((c) => c.depth)).toEqual([1]);
  });

  it('sends the moves that led to each position, so the engine sees repetitions', async () => {
    const calls: SearchParams[] = [];
    const start = new Chess().fen();
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    await reviewGame(
      fakeEngine(
        {
          [start]: { cp: 30, best: 'e2e4' },
          [fenAfter(start, 'e4')]: { cp: -30, best: 'e7e5' },
          [fenAfter(start, 'e4', 'e5')]: { cp: 30, best: 'g1f3' },
        },
        calls,
      ),
      start,
      chess.history({ verbose: true }),
    );
    expect(calls.map((c) => c.fen)).toEqual([start, start, start]);
    expect(calls.map((c) => c.moves)).toEqual([[], ['e2e4'], ['e2e4', 'e7e5']]);
  });

  it('can be cancelled', async () => {
    const chess = new Chess();
    chess.move('e4');
    const controller = new AbortController();
    controller.abort();
    await expect(
      reviewGame(fakeEngine({}), new Chess().fen(), chess.history({ verbose: true }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/);
  });
});
