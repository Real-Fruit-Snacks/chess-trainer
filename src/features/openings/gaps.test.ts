import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { GameTree } from '@/chess/tree';
import type { Fen, LongColor } from '@/chess/types';
import {
  type ExplorerDatabase,
  ExplorerError,
  type ExplorerResult,
  lookupExplorerBatch,
} from '@/lib/explorer';
import {
  analyseGaps,
  answeredPositions,
  type GapOptions,
  lineText,
  numberMoves,
  oneGameIn,
  positionsToCheck,
  replayGap,
  suggestAnswer,
} from './gaps';
import { positionKey } from './model';

/** The position after a line of SAN moves from the start. */
function after(line: string): Fen {
  const chess = new Chess();
  for (const san of line.split(' ').filter(Boolean)) chess.move(san);
  return chess.fen();
}

/** An explorer answer: games per move, rare moves the explorer does not list, scores per move. */
function answer(
  games: Record<string, number>,
  { unlisted = 0, scores = {} }: { unlisted?: number; scores?: Record<string, number> } = {},
): ExplorerResult {
  const listed = Object.values(games).reduce((sum, n) => sum + n, 0);
  const total = listed + unlisted;
  return {
    database: 'lichess',
    white: total,
    draws: 0,
    black: 0,
    total,
    moves: Object.entries(games).map(([san, n]) => ({
      uci: '',
      san,
      white: n,
      draws: 0,
      black: 0,
      total: n,
      averageRating: null,
      share: total > 0 ? n / total : 0,
      score: scores[san] ?? 0.5,
    })),
    opening: null,
    topGames: [],
  };
}

/** The explorer as a table of answers by position (the line that reaches it). */
function explorer(table: Record<string, ExplorerResult>): (fen: Fen) => ExplorerResult | null {
  const byKey = new Map(
    Object.entries(table).map(([line, result]) => [positionKey(after(line)), result]),
  );
  return (fen) => byKey.get(positionKey(fen)) ?? null;
}

const LICHESS: GapOptions = { database: 'lichess', depth: 12 };

/** An Italian for White: one first move, Black's 3rd move answered both ways. */
const ITALIAN = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3) 4. c3 *';
const ITALIAN_DATA = {
  e4: answer({ e5: 500, c5: 300, e6: 120, c6: 60, d5: 15 }, { unlisted: 5 }),
  'e4 e5 Nf3': answer({ Nc6: 700, Nf6: 150, d6: 80, Bc5: 30 }, { unlisted: 40 }),
  'e4 e5 Nf3 Nc6 Bc4': answer({ Bc5: 400, Nf6: 450, Be7: 100, d6: 40 }, { unlisted: 10 }),
};

function report(
  pgn: string,
  color: LongColor,
  table: Record<string, ExplorerResult>,
  options: GapOptions = LICHESS,
  elsewhere?: ReadonlyMap<string, string>,
) {
  return analyseGaps(GameTree.fromPgn(pgn), color, options, explorer(table), elsewhere);
}

describe('positions to check', () => {
  it('are the positions where the opponent is to move and the repertoire answers something', () => {
    const positions = positionsToCheck(GameTree.fromPgn(ITALIAN), 'white', 12);
    expect(positions.map((p) => p.line.join(' '))).toEqual([
      'e4',
      'e4 e5 Nf3',
      'e4 e5 Nf3 Nc6 Bc4',
    ]);
    expect(positions[0]?.key).toBe(positionKey(after('e4')));
  });

  it('stop at the depth limit, counted in moves', () => {
    const tree = GameTree.fromPgn(ITALIAN);
    expect(positionsToCheck(tree, 'white', 2)).toHaveLength(2);
    expect(positionsToCheck(tree, 'white', 3)).toHaveLength(3);
  });

  it('count a position reached by two move orders once, by its shortest line', () => {
    const tree = GameTree.fromPgn('1. d4 Nf6 2. c4 e6 3. Nc3 * ');
    tree.goStart();
    for (const san of ['c4', 'Nf6', 'd4', 'e6', 'Nf3']) tree.addMove(san);
    const positions = positionsToCheck(tree, 'white', 12);
    const keys = positions.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    // After 1. d4 Nf6 2. c4 and after 1. c4 Nf6 2. d4: one position.
    expect(keys.filter((k) => k === positionKey(after('d4 Nf6 c4')))).toHaveLength(1);
    expect(positions.find((p) => p.key === positionKey(after('c4 Nf6 d4')))?.line).toEqual([
      'd4',
      'Nf6',
      'c4',
    ]);
  });

  it('leave out the first move of a Black repertoire against that one move', () => {
    const tree = GameTree.fromPgn('1. e4 c5 2. Nf3 d6 3. d4 cxd4 *');
    const positions = positionsToCheck(tree, 'black', 12);
    expect(positions.map((p) => p.line.join(' '))).toEqual(['e4 c5', 'e4 c5 Nf3 d6']);
    const both = GameTree.fromPgn('1. e4 (1. d4 Nf6) 1... c5 *');
    expect(positionsToCheck(both, 'black', 12).map((p) => p.fen)).toEqual([START_FEN]);
  });
});

describe('gaps', () => {
  it('are the replies played in 5% of games and 50 of them that have no answer, most often met first', () => {
    const r = report(ITALIAN, 'white', ITALIAN_DATA);
    expect(r.checked).toBe(3);
    expect(
      r.gaps.map((g) => `${lineText(g.fen, [g.reply.san])} (${g.frequency.toFixed(3)})`),
    ).toEqual([
      '1... c5 (0.300)',
      '1... e6 (0.120)',
      '2... Nf6 (0.075)',
      '1... c6 (0.060)',
      '2... d6 (0.040)',
      '3... Be7 (0.035)',
    ]);
    // 1...d5 (1.5%), 2...Bc5 (3%) and 3...d6 (4%) are too rare to count.
    const c5 = r.gaps[0];
    expect(c5).toMatchObject({ line: ['e4'], games: 1000, inRepertoire: false, answeredIn: null });
    expect(c5?.reply).toMatchObject({ san: 'c5', total: 300, share: 0.3 });
    expect([c5?.replyFrom, c5?.replyTo]).toEqual(['c7', 'c5']);
    expect(c5?.lastMove).toEqual(['e2', 'e4']);
    expect(c5?.fenAfter).toBe(after('e4 c5'));
    expect(r.elsewhere).toEqual([]);
    expect(r.onlyAfter).toBeNull();
  });

  it('need enough games: 50 in Lichess games, 10 among the masters', () => {
    // 26 games of 426: 6%, but too few games for the Lichess database.
    const table = { e4: answer({ e5: 400, c5: 26 }) };
    expect(report('1. e4 e5 2. Nf3 *', 'white', table).gaps).toEqual([]);
    const masters = report('1. e4 e5 2. Nf3 *', 'white', table, {
      database: 'masters',
      depth: 12,
    });
    expect(masters.gaps.map((g) => g.reply.san)).toEqual(['c5']);
  });

  it('end at the depth limit', () => {
    const shallow = report(ITALIAN, 'white', ITALIAN_DATA, { database: 'lichess', depth: 2 });
    expect(shallow.positions).toHaveLength(2);
    expect(shallow.gaps.map((g) => g.reply.san)).not.toContain('Be7');
    expect(shallow.gaps).toHaveLength(5);
  });

  it('include a reply in the repertoire whose line stops before the answer', () => {
    const r = report('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *', 'white', ITALIAN_DATA);
    const nf6 = r.gaps.find((g) => g.reply.san === 'Nf6' && g.line.length === 5);
    expect(nf6).toMatchObject({ inRepertoire: true });
    // 3...Bc5, not in this repertoire at all.
    expect(r.gaps.find((g) => g.reply.san === 'Bc5' && g.line.length === 5)).toMatchObject({
      inRepertoire: false,
    });
  });

  it('leave out a reply that transposes into a position the repertoire answers', () => {
    const pgn = '1. d4 Nf6 (1... d5 2. c4 e6 3. Nc3 Nf6 4. Bg5) 2. c4 e6 3. Nc3 Bb4 4. Qc2 *';
    const r = report(pgn, 'white', {
      'd4 Nf6 c4 e6 Nc3': answer({ Bb4: 600, d5: 300, b6: 100 }),
    });
    // 3...d5 reaches the position after 1. d4 d5 2. c4 e6 3. Nc3 Nf6, where 4. Bg5 answers it.
    expect(r.gaps.map((g) => g.reply.san)).toEqual(['b6']);
    expect(r.positions).toHaveLength(5);
  });

  it('weigh each of the learner’s own choices equally', () => {
    const r = report('1. e4 (1. d4 d5 2. c4) 1... e5 2. Nf3 *', 'white', {
      e4: answer({ e5: 600, c5: 400 }),
      d4: answer({ d5: 500, Nf6: 500 }),
    });
    expect(r.gaps.map((g) => [g.reply.san, g.frequency])).toEqual([
      ['Nf6', 0.25],
      ['c5', 0.2],
    ]);
    expect(r.coverage).toBeCloseTo(0.55);
  });

  it('take a repertoire against one first move as starting with it', () => {
    const r = report('1. e4 c5 2. Nf3 d6 3. d4 cxd4 *', 'black', {
      'e4 c5': answer({ Nf3: 600, Nc3: 200, c3: 150, d4: 50 }),
      'e4 c5 Nf3 d6': answer({ d4: 800, 'Bb5+': 100, c3: 100 }),
    });
    expect(r.onlyAfter).toEqual(['e4']);
    expect(r.gaps.map((g) => `${lineText(g.fen, [g.reply.san])}`)).toEqual([
      '2. Nc3',
      '2. c3',
      '3. Bb5+',
      '3. c3',
      '2. d4',
    ]);
    expect(r.gaps[2]?.frequency).toBeCloseTo(0.06);
  });

  it('check every first move of a repertoire that answers several', () => {
    const r = report('1. e4 (1. d4 Nf6) 1... c5 *', 'black', {
      '': answer({ e4: 450, d4: 350, Nf3: 100, c4: 80 }, { unlisted: 20 }),
    });
    expect(r.onlyAfter).toBeNull();
    expect(r.gaps.map((g) => lineText(g.fen, [g.reply.san]))).toEqual(['1. Nf3', '1. c4']);
    expect(r.gaps[0]?.line).toEqual([]);
  });

  it('list replies another of the learner’s repertoires answers apart', () => {
    const alapin = answeredPositions(GameTree.fromPgn('1. e4 c5 2. c3 d5 3. exd5 *'), 'white');
    const elsewhere = new Map([...alapin].map((key) => [key, 'Alapin Sicilian']));
    const r = report(ITALIAN, 'white', ITALIAN_DATA, LICHESS, elsewhere);
    expect(r.gaps.map((g) => g.reply.san)).not.toContain('c5');
    expect(r.elsewhere.map((g) => [g.reply.san, g.answeredIn])).toEqual([
      ['c5', 'Alapin Sicilian'],
    ]);
    // Counted as answered.
    expect(r.coverage).toBeCloseTo(0.5975);
  });
});

describe('coverage', () => {
  it('is the share of games that find an answer at every checked position', () => {
    // Unanswered: half the games at move 1, 30% of the half that reach move 2, 15% of the 35%
    // that reach move 3.
    expect(report(ITALIAN, 'white', ITALIAN_DATA).coverage).toBeCloseTo(1 - 0.7025);
    // Up to move 2: games that reach move 3 count as answered.
    expect(
      report(ITALIAN, 'white', ITALIAN_DATA, { database: 'lichess', depth: 2 }).coverage,
    ).toBeCloseTo(0.35);
  });

  it('waits for every position, and says nothing when no games reach them', () => {
    const partial = report(ITALIAN, 'white', { e4: ITALIAN_DATA.e4 });
    expect(partial.checked).toBe(1);
    expect(partial.coverage).toBeNull();
    expect(partial.gaps.map((g) => g.reply.san)).toEqual(['c5', 'e6', 'c6']);
    const empty = answer({});
    const nothing = report(ITALIAN, 'white', {
      e4: empty,
      'e4 e5 Nf3': empty,
      'e4 e5 Nf3 Nc6 Bc4': empty,
    });
    expect(nothing.checked).toBe(3);
    expect(nothing.coverage).toBeNull();
    expect(nothing.gaps).toEqual([]);
  });

  it('is 100% when every reply has an answer', () => {
    const r = report('1. e4 e5 (1... c5 2. c3) 2. Nf3 *', 'white', {
      e4: answer({ e5: 700, c5: 300 }),
    });
    expect(r.gaps).toEqual([]);
    expect(r.coverage).toBe(1);
  });
});

describe('the suggested answer', () => {
  it('is the best-scoring move among those played in enough games', () => {
    const result = answer(
      { d3: 500, Ng5: 300, Nc3: 30, d4: 170 },
      { scores: { d3: 0.52, Ng5: 0.55, Nc3: 0.7, d4: 0.55 } },
    );
    // Nc3 scores best but is played in 3% of games; Ng5 and d4 tie, and Ng5 has more games.
    expect(suggestAnswer(result, 'lichess')?.san).toBe('Ng5');
  });

  it('falls back to the most played move with enough games, else nothing', () => {
    const rare = answer({ a3: 60, h3: 70, Nc3: 30 }, { unlisted: 5000 });
    expect(suggestAnswer(rare, 'lichess')?.san).toBe('h3');
    expect(suggestAnswer(answer({ a3: 20 }), 'lichess')).toBeNull();
    expect(suggestAnswer(answer({ a3: 20 }), 'masters')?.san).toBe('a3');
    expect(suggestAnswer(answer({}), 'lichess')).toBeNull();
    expect(suggestAnswer(null, 'lichess')).toBeNull();
  });
});

describe('notation helpers', () => {
  it('number moves from the position they start in', () => {
    expect(lineText(START_FEN, ['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    expect(lineText(after('e4'), ['e5', 'Nf3', 'Nc6'])).toBe('1... e5 2. Nf3 Nc6');
    expect(numberMoves(after('e4 e5 Nf3 Nc6 Bc4'), ['Nf6'])).toEqual([
      { number: '3...', san: 'Nf6' },
    ]);
  });

  it('round how often a gap comes to a figure that does not pretend to precision', () => {
    expect(oneGameIn(0.25)).toBe(4);
    expect(oneGameIn(0.0234)).toBe(45);
    expect(oneGameIn(0.0048)).toBe(200);
    expect(oneGameIn(0.0005)).toBeNull();
    expect(oneGameIn(0)).toBeNull();
  });

  it('replay a gap from the start, or refuse an illegal one', () => {
    expect(replayGap(START_FEN, ['e4', 'e5', 'Nf3'], 'Nc6')).toMatchObject({
      fenBefore: after('e4 e5 Nf3'),
      fenAfter: after('e4 e5 Nf3 Nc6'),
      reply: 'Nc6',
      from: 'b8',
      to: 'c6',
    });
    expect(replayGap(START_FEN, ['e4', 'e5'], 'Ke2')).not.toBeNull();
    expect(replayGap(START_FEN, ['e4', 'e4'], 'Nc6')).toBeNull();
    expect(replayGap(START_FEN, ['e4'], 'Nf3')).toBeNull();
  });
});

describe('a scan with the explorer', () => {
  const tree = GameTree.fromPgn(ITALIAN);
  const positions = positionsToCheck(tree, 'white', 12);
  const lookupFrom = (table: Record<string, ExplorerResult>) => {
    const read = explorer(table);
    return vi.fn((fen: Fen, _database: ExplorerDatabase) => {
      const result = read(fen);
      return result ? Promise.resolve(result) : Promise.reject(new Error('no such position'));
    });
  };
  const run = async (
    lookup: (fen: Fen, database: ExplorerDatabase) => Promise<ExplorerResult>,
    signal?: AbortSignal,
    onAnswer?: (index: number) => void,
  ) => {
    const answers = new Map<string, ExplorerResult>();
    const sleeps: number[] = [];
    const waits: (number | null)[] = [];
    const outcome = await lookupExplorerBatch(
      positions.map((p) => p.fen),
      'lichess',
      {
        lookup,
        signal,
        cached: () => null,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        onWait: (seconds) => waits.push(seconds),
        onResult: (result, index) => {
          const position = positions[index];
          if (position) answers.set(position.key, result);
          onAnswer?.(index);
        },
      },
    ).then(
      () => 'done',
      (err: unknown) => err,
    );
    const r = analyseGaps(tree, 'white', LICHESS, (fen) => answers.get(positionKey(fen)) ?? null);
    return { outcome, report: r, sleeps, waits };
  };

  it('asks about each position once, with a pause between requests, and finds the gaps', async () => {
    const lookup = lookupFrom(ITALIAN_DATA);
    const { outcome, report: r, sleeps } = await run(lookup);
    expect(outcome).toBe('done');
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 500]);
    expect(r.gaps).toHaveLength(6);
    expect(r.coverage).toBeCloseTo(0.2975);
  });

  it('waits as long as a 429 says, then asks the same position again', async () => {
    const answers = lookupFrom(ITALIAN_DATA);
    let limited = false;
    const lookup = vi.fn((fen: Fen, database: ExplorerDatabase) => {
      if (fen === positions[1]?.fen && !limited) {
        limited = true;
        return Promise.reject(
          new ExplorerError('The explorer is rate-limiting requests.', 'rate-limited', 30),
        );
      }
      return answers(fen, database);
    });
    const { outcome, report: r, sleeps, waits } = await run(lookup);
    expect(outcome).toBe('done');
    expect(lookup.mock.calls.map(([fen]) => positions.findIndex((p) => p.fen === fen))).toEqual([
      0, 1, 1, 2,
    ]);
    expect(sleeps).toEqual([500, 30_000, 500]);
    expect(waits).toEqual([30, null]);
    expect(r.checked).toBe(3);
  });

  it('gives up after three 429s in a row, keeping what came before', async () => {
    const answers = lookupFrom(ITALIAN_DATA);
    const lookup = vi.fn((fen: Fen, database: ExplorerDatabase) =>
      fen === positions[0]?.fen
        ? answers(fen, database)
        : Promise.reject(new ExplorerError('Busy.', 'rate-limited', null)),
    );
    const { outcome, report: r, sleeps, waits } = await run(lookup);
    expect(outcome).toBeInstanceOf(ExplorerError);
    expect(waits).toEqual([60, null, 60, null]);
    expect(sleeps).toEqual([500, 60_000, 60_000]);
    expect(r.checked).toBe(1);
    expect(r.coverage).toBeNull();
  });

  it('stops when asked, with the gaps found so far', async () => {
    const lookup = lookupFrom(ITALIAN_DATA);
    const controller = new AbortController();
    const { outcome, report: r } = await run(lookup, controller.signal, (index) => {
      if (index === 0) controller.abort();
    });
    expect((outcome as Error).name).toBe('AbortError');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(r.checked).toBe(1);
    expect(r.gaps.map((g) => g.reply.san)).toEqual(['c5', 'e6', 'c6']);
  });
});
