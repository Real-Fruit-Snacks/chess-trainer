import { describe, expect, it } from 'vitest';
import type { SearchParams, SearchResult } from '@/engine/EngineClient';
import type { MaiaMove } from '@/engine/maia/encoding';
import type { Score, SearchInfo } from '@/engine/uci';
import {
  checkMoves,
  HUMAN_MOVE_LIMIT,
  legalIn,
  type PositionCheck,
  topHumanMoves,
  trapNote,
  verdictOf,
} from './humanMoves';

/** White to move: Ne5 walks into dxe5. */
const FEN = '4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1';

const cp = (value: number): Score => ({ type: 'cp', value });

function check(
  best: [string, Score, string[]],
  others: [string, Score, string[]][],
): PositionCheck {
  const line = ([uci, score, pv]: [string, Score, string[]]) => ({ uci, score, pv: [uci, ...pv] });
  const lines = new Map([best, ...others].map((entry) => [entry[0], line(entry)]));
  return { depth: 12, best: line(best), lines };
}

describe('topHumanMoves', () => {
  it('keeps the likeliest few, and always the first', () => {
    const moves: MaiaMove[] = [
      { uci: 'e2e4', san: 'e4', probability: 0.5 },
      { uci: 'd2d4', san: 'd4', probability: 0.3 },
      { uci: 'g1f3', san: 'Nf3', probability: 0.1 },
      { uci: 'c2c4', san: 'c4', probability: 0.05 },
      { uci: 'b2b3', san: 'b3', probability: 0.03 },
      { uci: 'g2g3', san: 'g3', probability: 0.01 },
    ];
    expect(topHumanMoves(moves).map((m) => m.san)).toEqual(['e4', 'd4', 'Nf3', 'c4', 'b3']);
    expect(topHumanMoves(moves)).toHaveLength(HUMAN_MOVE_LIMIT);
    expect(topHumanMoves([{ uci: 'a2a3', san: 'a3', probability: 0.01 }])).toHaveLength(1);
    expect(topHumanMoves([])).toEqual([]);
  });
});

describe('verdicts', () => {
  const position = check(
    ['e1d2', cp(30), []],
    [
      ['f3e5', cp(-500), ['d6e5']],
      ['f3d4', cp(10), []],
      ['f3g5', cp(-150), []],
    ],
  );

  it('judges each move by the winning chances it gives away against the engine’s choice', () => {
    expect(verdictOf(position, 'e1d2')?.judgement).toBe('best');
    expect(verdictOf(position, 'f3d4')?.judgement).toBe('good');
    expect(verdictOf(position, 'f3g5')?.judgement).toBe('inaccuracy');
    expect(verdictOf(position, 'f3e5')).toMatchObject({ judgement: 'blunder', score: cp(-500) });
    expect(verdictOf(position, 'e1e2')).toBeNull();
  });

  it('calls a mate allowed a mistake at least', () => {
    const mated = check(['e1d2', cp(20), []], [['e1f2', { type: 'mate', value: -3 }, []]]);
    expect(verdictOf(mated, 'e1f2')?.judgement).toBe('blunder');
    const slightly = check(['e1d2', cp(-900), []], [['e1f2', { type: 'mate', value: -8 }, []]]);
    // From a position already lost, the mate costs little but is still called out.
    expect(verdictOf(slightly, 'e1f2')?.judgement).toBe('good');
  });

  it('flags the move most players choose when it is a mistake, and says why', () => {
    const top: MaiaMove = { uci: 'f3e5', san: 'Ne5', probability: 0.62 };
    expect(trapNote(FEN, top, position, 1500)).toBe(
      'A trap at 1500: most players choose Ne5 (62%), a blunder. Puts the knight where it can simply be taken: dxe5.',
    );
    expect(trapNote(FEN, { ...top, probability: 0.31 }, position, 1100)).toMatch(
      /^A trap at 1100: the most popular move is Ne5 \(31%\), a blunder\./,
    );
    // A good favourite, or one not yet checked, is no trap.
    expect(trapNote(FEN, { uci: 'f3d4', san: 'Nd4', probability: 0.5 }, position, 1500)).toBeNull();
    expect(trapNote(FEN, { uci: 'e1e2', san: 'Ke2', probability: 0.5 }, position, 1500)).toBeNull();
  });

  it('knows a move left over from another position', () => {
    const dests = new Map([['f3', ['e5', 'd4']]]);
    expect(legalIn(dests, 'f3e5')).toBe(true);
    expect(legalIn(dests, 'f3h4')).toBe(false);
    expect(legalIn(dests, 'e2e4')).toBe(false);
  });
});

/** An engine that answers each search from `answer`, and records them. */
function fakeEngine(answer: (params: SearchParams) => Partial<SearchResult>) {
  const searches: SearchParams[] = [];
  const stops: number[] = [];
  return {
    searches,
    stops,
    engine: {
      search: (params: SearchParams) => {
        searches.push(params);
        const id = searches.length;
        const result: SearchResult = {
          bestmove: { move: null },
          lines: new Map(),
          stopped: false,
          ...answer(params),
        };
        // The engine answers a moment later, as a worker does.
        const later = new Promise<SearchResult>((resolve) => setTimeout(() => resolve(result), 0));
        return { id, result: later, stop: () => stops.push(id) };
      },
    },
  };
}

const info = (multipv: number, value: number, pv: string[]): SearchInfo => ({
  depth: 12,
  multipv,
  score: cp(value),
  pv,
});

describe('checkMoves', () => {
  const scores: Record<string, number> = { e1d2: 30, f3e5: -500, f3d4: 10 };
  const answer = (params: SearchParams): Partial<SearchResult> => {
    if (!params.searchmoves) {
      return { bestmove: { move: 'e1d2' }, lines: new Map([[1, info(1, 30, ['e1d2'])]]) };
    }
    const lines = new Map(
      params.searchmoves.map((uci, i) => [i + 1, info(i + 1, scores[uci] ?? 0, [uci, 'e8d7'])]),
    );
    return { bestmove: { move: params.searchmoves[0] ?? null }, lines };
  };

  it('finds the engine’s move first when it has none, then searches it with the moves', async () => {
    const fake = fakeEngine(answer);
    const result = await checkMoves(fake.engine, FEN, ['f3e5', 'f3d4']);
    expect(fake.searches).toEqual([
      { fen: FEN, depth: 12, multipv: 1 },
      { fen: FEN, depth: 12, multipv: 3, searchmoves: ['e1d2', 'f3e5', 'f3d4'] },
    ]);
    expect(result?.best.uci).toBe('e1d2');
    expect([...(result?.lines.keys() ?? [])]).toEqual(['e1d2', 'f3e5', 'f3d4']);
    expect(result?.lines.get('f3e5')?.pv).toEqual(['f3e5', 'e8d7']);
  });

  it('takes the analysis’s best move as a hint, and searches only what it has not seen', async () => {
    const fake = fakeEngine(answer);
    const first = await checkMoves(fake.engine, FEN, ['f3e5'], { hint: 'e1d2' });
    expect(fake.searches).toHaveLength(1);
    const more = await checkMoves(fake.engine, FEN, ['f3e5', 'f3d4'], { known: first });
    expect(fake.searches[1]?.searchmoves).toEqual(['e1d2', 'f3d4']);
    expect([...(more?.lines.keys() ?? [])].sort()).toEqual(['e1d2', 'f3d4', 'f3e5']);
  });

  it('gives up when a search is stopped or the check is no longer wanted', async () => {
    const stopped = fakeEngine(() => ({ stopped: true }));
    expect(await checkMoves(stopped.engine, FEN, ['f3e5'], { hint: 'e1d2' })).toBeNull();
    const controller = new AbortController();
    const fake = fakeEngine((params) => {
      // The page moves on while the first search runs.
      queueMicrotask(() => controller.abort());
      return answer(params);
    });
    expect(await checkMoves(fake.engine, FEN, ['f3e5'], { signal: controller.signal })).toBeNull();
    expect(fake.stops).toEqual([1]);
    expect(fake.searches).toHaveLength(1);
    const aborted = new AbortController();
    aborted.abort();
    const idle = fakeEngine(answer);
    expect(await checkMoves(idle.engine, FEN, ['f3e5'], { signal: aborted.signal })).toBeNull();
    expect(idle.searches).toHaveLength(0);
  });

  it('crowns the strongest move searched, should a human move beat the hint', async () => {
    const fake = fakeEngine(() => ({
      lines: new Map([
        [1, info(1, 80, ['f3d4'])],
        [2, info(2, 30, ['e1d2'])],
      ]),
    }));
    const result = await checkMoves(fake.engine, FEN, ['f3d4'], { hint: 'e1d2' });
    expect(result?.best.uci).toBe('f3d4');
  });
});
