import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLichess } from '@/store/lichess';
import { type GameRecord, useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { useAnalyses } from '@/store/analyses';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import fixtures from './fixtures/puzzles.json';
import { pgnForLichess } from './records';
import {
  GAMES_PULL_INTERVAL_MS,
  QUEUE_DELAY_MS,
  startLichessSync,
  syncNow,
  useLichessSync,
} from './sync';

const answers = fixtures as Record<string, unknown>;
let lichess: FakeLichessHandle;
let token: string;

function connect() {
  useLichess
    .getState()
    .connect(
      { id: 'learner', username: 'Learner', token, expiresAt: null },
      { puzzle: null, bullet: null, blitz: null, rapid: null, classical: null, at: 0 },
    );
}

function solve(id: string, outcome: 'solved' | 'failed' = 'solved') {
  useProgress.getState().recordPuzzle({
    id,
    puzzleRating: 1500,
    outcome,
    hintUsed: false,
    themes: 'fork',
    durationMs: 4000,
    rated: true,
  });
}

function otherDeviceGame(id: string, at: number): GameRecord {
  return {
    id,
    at,
    level: 4,
    color: 'black',
    result: '0-1',
    reason: 'resignation',
    plies: 4,
    pgn: '[Event "Casual"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    source: 'play',
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

const requests = (pattern: RegExp) => lichess.fake.requests.filter((r) => pattern.test(r)).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  localStorage.clear();
  setOnline(true);
  lichess = installFakeLichess();
  token = lichess.fake.issueToken();
  useLichess.getState().forget();
  useProgress.getState().resetAll();
  useProgress.setState({ puzzleRating: 1500, onboarded: true });
  useRepertoire.getState().resetAll();
  useAnalyses.getState().clear();
  useLichessSync.setState({ phase: 'idle', step: null, error: null, retryAt: null, report: null });
  connect();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the account sync', () => {
  it('sends what waits, brings in what happened elsewhere, and follows the Lichess rating', async () => {
    for (let i = 0; i < 60; i++) solve(`P${String(i).padStart(4, '0')}`);
    useProgress.getState().recordGame({
      level: 3,
      color: 'white',
      result: '1-0',
      reason: 'checkmate',
      plies: 7,
      pgn: '[Event "Casual"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    });
    useRepertoire
      .getState()
      .addCustom({ name: 'Italian', color: 'white', pgn: '1. e4 e5 2. Nf3 *' });
    // Elsewhere: puzzles played on lichess.org, a game played on another device.
    lichess.fake.puzzles.set('6Mhmf', answers['6Mhmf']);
    lichess.fake.addRounds([
      { id: 'XuTO3', win: true, rating: 1828, themes: ['promotion'] },
      { id: '6Mhmf', win: false, rating: 1369, themes: ['mateIn2'] },
    ]);
    lichess.fake.imports.push({
      id: 'gm999999',
      pgn: pgnForLichess(otherDeviceGame('g-elsewhere', 5)),
      userId: 'learner',
      at: 1,
    });

    await syncNow();

    const status = useLichessSync.getState();
    expect(status.phase).toBe('done');
    expect(status.report).toMatchObject({
      puzzlesSent: 60,
      roundsAdded: 2,
      reviewsAdded: 1,
      gamesSent: 1,
      gamesAdded: 1,
      problems: [],
    });
    expect(status.report?.studies?.pushed).toBe(1);
    // Two batches under Lichess's limit.
    expect(requests(/^POST \/api\/puzzle\/batch\/mix/)).toBe(2);
    const lichessState = useLichess.getState();
    expect(lichessState.outbox).toEqual({ puzzles: [], games: [] });
    expect(lichessState.lastSyncAt).not.toBeNull();
    // The rounds sent from here came back in the history and were not counted twice.
    expect(useProgress.getState().attempts).toHaveLength(60);
    expect(Object.keys(useProgress.getState().seen)).toHaveLength(62);
    expect(useProgress.getState().puzzleReviews['6Mhmf']).toBeDefined();
    expect(useProgress.getState().lichessPuzzles['6Mhmf']?.fen).toBeDefined();
    const games = useProgress.getState().games;
    expect(games.map((g) => g.id)).toContain('g-elsewhere');
    expect(games.find((g) => g.id !== 'g-elsewhere')?.lichessId).toMatch(/^gm/);
    // Sixty wins on Lichess (+8 each, as the stand-in rates them) is the rating here now.
    expect(useProgress.getState().puzzleRating).toBe(1720 + 60 * 8);

    // The next run only reads what is new.
    lichess.fake.addRounds([{ id: 'hfiyh', win: true, rating: 1944, themes: [] }]);
    await syncNow();
    expect(useLichessSync.getState().report).toMatchObject({ puzzlesSent: 0, roundsAdded: 1 });
    expect(requests(/^GET \/api\/games\/export\/imports/)).toBe(1);
  });

  it('reads the game history again only after a while, or when asked', async () => {
    await syncNow();
    await syncNow();
    expect(requests(/^GET \/api\/games\/export\/imports/)).toBe(1);
    await syncNow({ force: true });
    expect(requests(/^GET \/api\/games\/export\/imports/)).toBe(2);
    useLichess.getState().setCursor('games', Date.now() - GAMES_PULL_INTERVAL_MS - 1);
    await syncNow();
    expect(requests(/^GET \/api\/games\/export\/imports/)).toBe(3);
  });

  it('waits offline with everything kept, and says when Lichess cannot be reached', async () => {
    solve('AAAAA');
    setOnline(false);
    await syncNow();
    expect(useLichessSync.getState().phase).toBe('offline');
    expect(lichess.fake.requests).toEqual([]);

    setOnline(true);
    lichess.offline = true;
    await syncNow();
    expect(useLichessSync.getState()).toMatchObject({
      phase: 'failed',
      error: 'Lichess could not be reached.',
    });
    expect(useLichess.getState().outbox.puzzles).toHaveLength(1);

    // It tries again by itself.
    lichess.offline = false;
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(useLichessSync.getState().phase).toBe('done'));
    expect(useLichess.getState().outbox.puzzles).toEqual([]);
  });

  it('asks for a new connection when Lichess refuses the sign-in, losing nothing', async () => {
    solve('AAAAA');
    lichess.fake.tokens.clear();
    await syncNow();
    expect(useLichessSync.getState().phase).toBe('signed-out');
    expect(useLichess.getState().needsReconnect).toBe(true);
    expect(useLichess.getState().outbox.puzzles).toHaveLength(1);
    const before = lichess.fake.requests.length;
    await syncNow();
    expect(lichess.fake.requests.length).toBe(before);
  });

  it('pauses when Lichess asks, for as long as it asks', async () => {
    solve('AAAAA');
    lichess.fake.failNext(/^POST \/api\/puzzle\/batch/, 429, { headers: { 'retry-after': '120' } });
    await syncNow();
    const status = useLichessSync.getState();
    expect(status.phase).toBe('waiting');
    expect((status.retryAt ?? 0) - Date.now()).toBeGreaterThan(100_000);
    await syncNow();
    expect(requests(/^POST \/api\/puzzle\/batch/)).toBe(1);
    useLichessSync.setState({ retryAt: Date.now() - 1 });
    await syncNow();
    expect(useLichessSync.getState().phase).toBe('done');
    expect(useLichess.getState().outbox.puzzles).toEqual([]);
  });

  it('drops a batch Lichess will never take, and notes it', async () => {
    solve('AAAAA');
    lichess.fake.failNext(/^POST \/api\/puzzle\/batch/, 400, { body: '{"error":"Bad solutions"}' });
    await syncNow();
    const status = useLichessSync.getState();
    expect(status.phase).toBe('done');
    expect(status.report?.problems).toEqual(['Puzzle results: Bad solutions']);
    expect(useLichess.getState().outbox.puzzles).toEqual([]);
  });

  it('keeps to the chosen parts', async () => {
    solve('AAAAA');
    useLichess.getState().setOption('puzzles', false);
    useLichess.getState().setOption('studies', false);
    useLichess.getState().setOption('games', false);
    await syncNow();
    expect(lichess.fake.requests).toEqual(['GET /api/account']);
    expect(useLichess.getState().outbox.puzzles).toHaveLength(1);
  });

  it('stops after the part under way when the account is disconnected meanwhile', async () => {
    solve('AAAAA');
    const run = syncNow();
    useLichess.getState().disconnect();
    lichess.fake.tokens.clear();
    await run;
    expect(useLichessSync.getState().phase).toBe('idle');
    expect(useLichess.getState().needsReconnect).toBe(false);
    expect(useLichess.getState().lastSyncAt).toBeNull();
    expect(lichess.fake.requests).toEqual(['POST /api/puzzle/batch/mix']);
  });

  it('never runs twice at once: calls meanwhile make one more run', async () => {
    const first = syncNow();
    void syncNow();
    void syncNow();
    await first;
    expect(requests(/^GET \/api\/account/)).toBe(2);
  });

  it('runs on its own: soon after start, after results wait, and not once stopped', async () => {
    const stop = startLichessSync();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(requests(/^GET \/api\/account/)).toBe(1));
    solve('AAAAA');
    await vi.advanceTimersByTimeAsync(QUEUE_DELAY_MS);
    await vi.waitFor(() => expect(useLichess.getState().outbox.puzzles).toEqual([]));
    stop();
    solve('BBBBB');
    await vi.advanceTimersByTimeAsync(QUEUE_DELAY_MS * 2);
    expect(useLichess.getState().outbox.puzzles).toHaveLength(1);
  });
});
