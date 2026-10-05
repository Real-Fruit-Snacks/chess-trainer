import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import type { Puzzle } from '@/features/puzzles/puzzleService';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import b0400 from '../../../public/puzzles/b0400-00.json?raw';
import b1400 from '../../../public/puzzles/b1400-00.json?raw';
import b1700 from '../../../public/puzzles/b1700-01.json?raw';
import b2000 from '../../../public/puzzles/b2000-00.json?raw';
import b2300 from '../../../public/puzzles/b2300-01.json?raw';
import b2600 from '../../../public/puzzles/b2600-01.json?raw';
import fixtures from './fixtures/puzzles.json';
import {
  fetchLichessPuzzle,
  puzzleFromLichess,
  readPuzzleActivity,
  roundFrom,
  sendPuzzleResults,
} from './puzzles';

/** The app's own copies of the fixture puzzles (from the Lichess puzzle database). */
const dataset = new Map(
  [b0400, b1400, b1700, b2000, b2300, b2600]
    .flatMap((text) => JSON.parse(text) as Puzzle[])
    .map((p) => [p.id, p]),
);
const answers = fixtures as Record<string, unknown>;

let lichess: FakeLichessHandle;

beforeEach(() => {
  lichess = installFakeLichess();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Lichess puzzles in the app’s form', () => {
  it.each(['VDwQY', 'XuTO3', 'BvSRn', 'hfiyh', '0QjMc', 'oiDl2', '6Mhmf'])(
    '%s comes out as the app’s own copy has it',
    (id) => {
      const converted = puzzleFromLichess(answers[id]);
      const own = dataset.get(id);
      expect(own).toBeDefined();
      expect(converted).toMatchObject({ id, fen: own?.fen, moves: own?.moves, url: own?.url });
    },
  );

  it('plays out legally: the set-up move, then the solution (promotion, castling, en passant)', () => {
    for (const id of Object.keys(answers)) {
      const puzzle = puzzleFromLichess(answers[id]);
      expect(puzzle, id).not.toBeNull();
      const chess = new Chess(puzzle?.fen);
      for (const uci of (puzzle?.moves ?? '').split(' ')) {
        expect(() =>
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }),
        ).not.toThrow();
      }
    }
  });

  it('keeps the rating, plays and sorted themes, and a puzzle not in the app’s files', () => {
    const puzzle = puzzleFromLichess(answers.D9GHX);
    expect(dataset.has('D9GHX')).toBe(false);
    expect(puzzle?.id).toBe('D9GHX');
    expect(puzzle?.themes.split(' ')).toEqual([...(puzzle?.themes.split(' ') ?? [])].sort());
    expect(puzzle?.rd).toBe(90);
    expect(puzzle?.popularity).toBe(0);
  });

  it('refuses answers that do not add up', () => {
    const good = answers['6Mhmf'] as { game: object; puzzle: object };
    expect(puzzleFromLichess(null)).toBeNull();
    expect(puzzleFromLichess({ ...good, puzzle: { ...good.puzzle, initialPly: 99 } })).toBeNull();
    expect(
      puzzleFromLichess({ ...good, puzzle: { ...good.puzzle, solution: ['e2e5'] } }),
    ).toBeNull();
    expect(puzzleFromLichess({ ...good, puzzle: { ...good.puzzle, solution: [] } })).toBeNull();
    expect(puzzleFromLichess({ ...good, game: { id: 'x', pgn: 'e4 e5 Ke3??' } })).toBeNull();
    expect(puzzleFromLichess({ ...good, puzzle: { ...good.puzzle, id: 'not an id' } })).toBeNull();
  });

  it('reads history lines, skipping anything that is not a puzzle round', () => {
    expect(
      roundFrom({ date: 5, win: false, puzzle: { id: 'AAAAA', rating: 1500, themes: ['fork'] } }),
    ).toEqual({ id: 'AAAAA', win: false, date: 5, rating: 1500, themes: 'fork' });
    expect(roundFrom({ date: 5, win: true, puzzle: { id: 'racer-1' } })).toBeNull();
    expect(roundFrom({ win: true, puzzle: { id: 'AAAAA' } })).toBeNull();
    expect(roundFrom('x')).toBeNull();
  });
});

describe('Puzzles on Lichess', () => {
  it('fetches a puzzle whole, and says when Lichess no longer has it', async () => {
    lichess.fake.puzzles.set('6Mhmf', answers['6Mhmf']);
    expect((await fetchLichessPuzzle('6Mhmf'))?.fen).toBe(dataset.get('6Mhmf')?.fen);
    expect(await fetchLichessPuzzle('ZZZZZ')).toBeNull();
  });

  it('sends results, rated or not, and hears the new rating', async () => {
    const token = lichess.fake.issueToken();
    const answer = await sendPuzzleResults(token, [
      { id: 'AAAAA', win: true, rated: true, at: 1 },
      { id: 'BBBBB', win: false, rated: false, at: 2 },
    ]);
    expect(answer.rounds).toEqual([
      { id: 'AAAAA', win: true, ratingDiff: 8 },
      { id: 'BBBBB', win: false, ratingDiff: 0 },
    ]);
    expect(answer.perf).toEqual({ rating: 1728, rd: 70, games: 0, prov: false });
    expect(lichess.fake.activity.map((r) => r.id)).toEqual(['BBBBB', 'AAAAA']);
    const sent = lichess.fetch.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(typeof sent === 'string' ? sent : '') as unknown;
    expect(body).toEqual({
      solutions: [
        { id: 'AAAAA', win: true, rated: true },
        { id: 'BBBBB', win: false, rated: false },
      ],
    });
  });

  it('reads the history newest first, from a moment on, up to a number', async () => {
    const token = lichess.fake.issueToken();
    lichess.fake.addRounds([
      { id: 'AAAAA', win: true, rating: 1500, themes: ['fork'] },
      { id: 'BBBBB', win: false, rating: 1600, themes: [] },
      { id: 'CCCCC', win: true, rating: 1700, themes: [] },
    ]);
    const all: string[] = [];
    await readPuzzleActivity(token, null, 10, (r) => all.push(r.id));
    expect(all).toEqual(['CCCCC', 'BBBBB', 'AAAAA']);
    const middle = lichess.fake.activity[1]?.date ?? 0;
    const since: string[] = [];
    await readPuzzleActivity(token, middle, 10, (r) => since.push(r.id));
    expect(since).toEqual(['CCCCC', 'BBBBB']);
    const one: string[] = [];
    await readPuzzleActivity(token, null, 1, (r) => one.push(r.id));
    expect(one).toEqual(['CCCCC']);
  });
});
