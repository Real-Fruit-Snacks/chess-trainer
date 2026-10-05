import { beforeEach, describe, expect, it } from 'vitest';
import type { Puzzle } from '@/features/puzzles/puzzleService';
import { findPuzzleById } from '@/features/puzzles/puzzleService';
import type { LichessRound } from '@/lib/lichess/puzzles';
import { lichessBacklog } from '@/lib/lichess/backlog';
import {
  adoptLichessRating,
  mergeLichessGames,
  mergeLichessRounds,
  setGameLichessId,
} from '@/lib/lichess/progressSync';
import { useLichess } from './lichess';
import { type GameRecord, MAX_GAMES, useProgress } from './progress';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 10, 12);

const puzzle = (id: string, rating = 1500): Puzzle => ({
  id,
  fen: 'r2qkbnr/ppp3pp/2np1p2/4N2b/2B1P3/2N4P/PPPP1PP1/R1BQ1RK1 b kq - 0 7',
  moves: 'h5d1 c4f7 e8e7 c3d5',
  rating,
  rd: 90,
  popularity: 0,
  plays: 10,
  themes: 'mateIn2 short',
  url: 'https://lichess.org/abc#14',
});

const round = (id: string, win: boolean, date: number, themes = 'fork'): LichessRound => ({
  id,
  win,
  date,
  rating: 1500,
  themes,
});

function connect(now = T0) {
  useLichess
    .getState()
    .connect(
      { id: 'learner', username: 'Learner', token: 'lip_x', expiresAt: null },
      { puzzle: null, bullet: null, blitz: null, rapid: null, classical: null, at: 0 },
      now,
    );
}

const game = (overrides: Partial<GameRecord> = {}): Omit<GameRecord, 'at' | 'id' | 'source'> => ({
  level: 2,
  color: 'white',
  result: '1-0',
  reason: 'checkmate',
  plies: 7,
  pgn: '[Event "Casual"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
  ...overrides,
});

describe('progress and the Lichess sync', () => {
  beforeEach(() => {
    localStorage.clear();
    useLichess.getState().forget();
    useProgress.getState().resetAll();
    useProgress.setState({ puzzleRating: 1500, onboarded: true });
  });

  it('queues Lichess puzzle results as they are recorded, and games as they end', () => {
    connect();
    const progress = useProgress.getState();
    const solve = (id: string, extra: object = {}) =>
      progress.recordPuzzle({
        id,
        puzzleRating: 1500,
        outcome: 'solved',
        hintUsed: false,
        themes: 'fork',
        durationMs: 5000,
        rated: true,
        ...extra,
      });
    solve('AAAAA');
    solve('BBBBB', { hintUsed: true, hintLevel: 1 });
    solve('own-xyz');
    progress.recordUnratedOutcome('CCCCC', 'fork', 'failed');
    progress.recordBlind({ id: 'DDDDD', depth: 'short', outcome: 'solved', peeked: false });
    expect(
      useLichess.getState().outbox.puzzles.map(({ id, win, rated }) => [id, win, rated]),
    ).toEqual([
      ['AAAAA', true, true],
      ['BBBBB', false, true],
      ['CCCCC', false, false],
      ['DDDDD', true, false],
    ]);

    progress.recordGame(game());
    progress.recordGame({ ...game(), source: 'drill' });
    const queued = useLichess.getState().outbox.games;
    expect(queued).toHaveLength(1);
    expect(queued[0]?.record).toEqual(useProgress.getState().games[1]);
  });

  it('brings in the Lichess history: new puzzles counted, misses to review, days trained', () => {
    useProgress.setState({ seen: { AAAAA: 'solved' } });
    const result = mergeLichessRounds(
      [
        round('AAAAA', false, T0),
        round('BBBBB', true, T0 + DAY, 'fork pin'),
        round('CCCCC', false, T0 + 2 * DAY),
        round('DDDDD', false, T0 + 2 * DAY),
        // Lost first, solved later: nothing to review.
        round('EEEEE', false, T0 + 3 * DAY),
        round('EEEEE', true, T0 + 4 * DAY),
      ],
      [puzzle('CCCCC'), puzzle('EEEEE')],
      T0 + 5 * DAY,
    );
    expect(result).toEqual({ added: 4, reviews: 1 });
    const state = useProgress.getState();
    expect(state.seen).toMatchObject({
      AAAAA: 'solved',
      BBBBB: 'solved',
      CCCCC: 'failed',
      DDDDD: 'failed',
      EEEEE: 'failed',
    });
    expect(state.themeStats.pin).toEqual({ solved: 1, failed: 0 });
    // A miss is reviewable only with the whole puzzle at hand (fetched or already kept).
    expect(Object.keys(state.puzzleReviews)).toEqual(['CCCCC']);
    expect(Object.keys(state.lichessPuzzles)).toEqual(['CCCCC']);
    expect(state.trainingDays).toHaveLength(5);
    expect(state.bestStreak).toBeGreaterThanOrEqual(5);
  });

  it('keeps a missed Lichess puzzle while its review card lasts, and finds it offline', async () => {
    mergeLichessRounds([round('CCCCC', false, T0)], [puzzle('CCCCC')], T0);
    expect((await findPuzzleById('CCCCC'))?.moves).toBe('h5d1 c4f7 e8e7 c3d5');
    useProgress.getState().dismissReview('CCCCC');
    expect(useProgress.getState().lichessPuzzles).toEqual({});
  });

  it('brings in games from other devices by id, the newest kept', () => {
    useProgress.getState().recordGame(game());
    const mine = useProgress.getState().games[0];
    const other = (n: number): GameRecord => ({
      ...game(),
      id: `g-other-${n}`,
      at: T0 + n,
      source: 'play',
    });
    const added = mergeLichessGames([other(1), other(2), ...(mine ? [mine] : [])]);
    expect(added).toBe(2);
    expect(useProgress.getState().games.map((g) => g.id)).toEqual([
      mine?.id,
      'g-other-2',
      'g-other-1',
    ]);
    const many = Array.from({ length: MAX_GAMES + 5 }, (_, i) => other(100 + i));
    mergeLichessGames(many);
    expect(useProgress.getState().games).toHaveLength(MAX_GAMES);
    expect(useProgress.getState().games.some((g) => g.id === 'g-other-1')).toBe(false);

    setGameLichessId(mine?.id ?? '', 'abcdefgh');
    expect(useProgress.getState().games[0]?.lichessId).toBe('abcdefgh');
  });

  it('takes the Lichess puzzle rating as its own', () => {
    useProgress.setState({ calibration: { total: 10, done: 2, startedAt: 1 }, puzzleRd: 200 });
    adoptLichessRating(1834.4, 20, T0);
    const state = useProgress.getState();
    expect([state.puzzleRating, state.puzzleRd, state.calibration]).toEqual([1834, 45, null]);
    expect(state.ratingHistory.at(-1)).toEqual({ at: T0, rating: 1834 });
    const length = state.ratingHistory.length;
    adoptLichessRating(1834, 45, T0 + 1);
    expect(useProgress.getState().ratingHistory).toHaveLength(length);
    adoptLichessRating(Number.NaN, 50, T0 + 2);
    expect(useProgress.getState().puzzleRating).toBe(1834);
  });

  it('offers what was recorded before connecting, once sent nothing again', () => {
    const progress = useProgress.getState();
    progress.recordPuzzle({
      id: 'AAAAA',
      puzzleRating: 1500,
      outcome: 'solved',
      hintUsed: false,
      themes: 'fork',
      durationMs: 5000,
      rated: true,
    });
    progress.recordPuzzle({
      id: 'BBBBB',
      puzzleRating: 1500,
      outcome: 'failed',
      hintUsed: false,
      themes: 'fork',
      durationMs: 5000,
      rated: false,
    });
    progress.recordGame(game());
    progress.recordGame({ ...game(), source: 'drill' });
    connect(Date.now() + 1000);
    const backlog = lichessBacklog(useProgress.getState(), useLichess.getState());
    expect(backlog.puzzles.map(({ id, win, rated }) => [id, win, rated])).toEqual([
      ['AAAAA', true, true],
      ['BBBBB', false, false],
    ]);
    expect(backlog.games).toHaveLength(1);
    useLichess.getState().queueBacklog(backlog.puzzles, backlog.games);
    useLichess.getState().puzzlesSent(useLichess.getState().outbox.puzzles, Date.now() + 2000);
    const sent = useLichess.getState().outbox.games[0];
    useLichess.getState().gameDone(sent?.record.id ?? '');
    setGameLichessId(sent?.record.id ?? '', 'abcdefgh');
    const again = lichessBacklog(useProgress.getState(), useLichess.getState());
    expect(again).toEqual({ puzzles: [], games: [] });
  });

  it('starts the matching over after an import, and forgets the account on a reset', () => {
    connect();
    useLichess.getState().setStudySync({ studyStamps: { st000001: 1 } });
    const backup = useProgress.getState().exportState();
    expect(useProgress.getState().importState(JSON.parse(backup))).toMatchObject({ ok: true });
    expect(useLichess.getState().studyStamps).toEqual({});
    expect(useLichess.getState().account?.username).toBe('Learner');
    useProgress.getState().resetAll();
    expect(useLichess.getState().account).toBeNull();
  });
});
