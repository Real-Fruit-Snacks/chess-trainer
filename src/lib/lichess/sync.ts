import { create } from 'zustand';
import type { Puzzle } from '@/features/puzzles/puzzleService';
import { onLichessQueue, useLichess } from '@/store/lichess';
import { ACTIVE_PROFILE_ID } from '@/store/profiles';
import { useProgress } from '@/store/progress';
import { LichessError } from './api';
import { fetchAccount, LICHESS_SCOPES, testToken } from './auth';
import { importGame, readImportedRecords } from './games';
import {
  adoptLichessRating,
  mergeLichessGames,
  mergeLichessRounds,
  setGameLichessId,
} from './progressSync';
import {
  ACTIVITY_MAX,
  FIRST_ACTIVITY_MAX,
  fetchLichessPuzzle,
  type LichessRound,
  MISSED_FETCH_MAX,
  readPuzzleActivity,
  SOLVE_BATCH,
  sendPuzzleResults,
} from './puzzles';
import { pgnForLichess } from './records';
import { type StudySyncResult, syncStudies } from './studies';

/**
 * The account sync: one run sends what waits in the outbox (puzzle results,
 * then games), brings in what happened elsewhere (the puzzle history, games
 * played on other devices), reconciles repertoires and analyses with the
 * private studies, and refreshes the ratings. Runs never overlap — in this
 * tab or across tabs — and a failure leaves everything in place for the next
 * run: the outbox empties only as Lichess confirms.
 *
 * Runs start on their own once an account is connected (`startLichessSync`):
 * shortly after the app opens, when the device comes back online or the app
 * back into view, half a minute after results start to wait, and every
 * quarter of an hour while the app is in view.
 */

export type SyncPhase =
  | 'idle'
  | 'syncing'
  | 'done'
  /** No connection: the next run waits for one. */
  | 'offline'
  /** Lichess asked for a pause (`retryAt`). */
  | 'waiting'
  /** Lichess refused the sign-in: the account needs connecting again. */
  | 'signed-out'
  | 'failed';

export interface SyncReport {
  at: number;
  puzzlesSent: number;
  /** Puzzles from the Lichess history new to this device. */
  roundsAdded: number;
  /** Of those, misses put in the review queue. */
  reviewsAdded: number;
  gamesSent: number;
  gamesAdded: number;
  studies: StudySyncResult | null;
  /** Steps that went wrong without stopping the run. */
  problems: string[];
}

export interface SyncStatus {
  phase: SyncPhase;
  /** What the running sync is doing. */
  step: string | null;
  error: string | null;
  /** When the next run may start, after Lichess asked for a pause. */
  retryAt: number | null;
  /** What the last finished run did. */
  report: SyncReport | null;
}

export const useLichessSync = create<SyncStatus>()(() => ({
  phase: 'idle',
  step: null,
  error: null,
  retryAt: null,
  report: null,
}));

/** The game history is read again at most this often (it is the slowest read). */
export const GAMES_PULL_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** After a dropped connection or a server error, the next attempt. */
const NETWORK_RETRY_MS = 2 * 60 * 1000;
const SERVER_RETRY_MS = 5 * 60 * 1000;

const setStatus = (patch: Partial<SyncStatus>) => useLichessSync.setState(patch);
const onStep = (step: string) => setStatus({ step });

/** Errors that end a run: nothing more will work until the cause goes away. */
function stopsTheRun(err: unknown): boolean {
  return (
    err instanceof LichessError &&
    (err.kind === 'network' ||
      err.kind === 'auth' ||
      err.kind === 'forbidden' ||
      err.kind === 'rate-limited' ||
      err.kind === 'server')
  );
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs one part of a sync; a failure that does not stop the run is noted and the run goes on. */
async function part(name: string, report: SyncReport, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (stopsTheRun(err)) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    report.problems.push(`${name}: ${messageOf(err)}`);
  }
}

async function sendPuzzles(token: string, report: SyncReport): Promise<void> {
  for (;;) {
    const waiting = useLichess.getState().outbox.puzzles;
    if (waiting.length === 0) return;
    const batch = waiting.slice(0, SOLVE_BATCH);
    onStep(`Sending ${waiting.length} puzzle ${waiting.length === 1 ? 'result' : 'results'}`);
    try {
      const answer = await sendPuzzleResults(token, batch);
      if (answer.perf) useLichess.getState().setPuzzlePerf(answer.perf);
    } catch (err) {
      // Lichess will never take this batch as it is: it goes, rather than blocking the rest.
      if (!(err instanceof LichessError) || err.kind !== 'invalid') throw err;
      report.problems.push(`Puzzle results: ${err.message}`);
    }
    useLichess.getState().puzzlesSent(batch);
    report.puzzlesSent += batch.length;
  }
}

async function sendGames(token: string, report: SyncReport): Promise<void> {
  for (;;) {
    const game = useLichess.getState().outbox.games[0];
    if (!game) return;
    onStep('Sending your games');
    try {
      const { id } = await importGame(token, pgnForLichess(game.record));
      setGameLichessId(game.record.id, id);
      report.gamesSent++;
    } catch (err) {
      if (!(err instanceof LichessError) || err.kind !== 'invalid') throw err;
      report.problems.push(`A game: ${err.message}`);
    }
    useLichess.getState().gameDone(game.record.id);
  }
}

async function bringPuzzles(token: string, report: SyncReport): Promise<void> {
  const since = useLichess.getState().cursors.activity;
  onStep('Reading your puzzle history');
  const rounds: LichessRound[] = [];
  await readPuzzleActivity(
    token,
    since,
    since === null ? FIRST_ACTIVITY_MAX : ACTIVITY_MAX,
    (r) => {
      rounds.push(r);
    },
  );
  if (rounds.length === 0) return;
  // Rounds sent from here come back in the history: this device already has them.
  const sent = useLichess.getState().sent;
  const fresh = rounds.filter((r) => !(r.id in sent));
  // Missed puzzles are fetched whole, newest first, so they can be reviewed here (offline too).
  const progress = useProgress.getState();
  const wanted = [
    ...new Set(
      fresh
        .filter((r) => !r.win && !progress.lichessPuzzles[r.id] && !progress.puzzleReviews[r.id])
        .sort((a, b) => b.date - a.date)
        .map((r) => r.id),
    ),
  ].slice(0, MISSED_FETCH_MAX);
  const puzzles: Puzzle[] = [];
  for (const [i, id] of wanted.entries()) {
    onStep(`Fetching missed puzzles (${i + 1} of ${wanted.length})`);
    const puzzle = await fetchLichessPuzzle(id);
    if (puzzle) puzzles.push(puzzle);
  }
  const merged = mergeLichessRounds(fresh, puzzles);
  report.roundsAdded += merged.added;
  report.reviewsAdded += merged.reviews;
  // `since` counts the round at that moment in: the next read starts just after the newest.
  useLichess.getState().setCursor('activity', Math.max(...rounds.map((r) => r.date)) + 1);
}

async function bringGames(token: string, report: SyncReport, force: boolean): Promise<void> {
  const last = useLichess.getState().cursors.games;
  if (!force && last !== null && Date.now() - last < GAMES_PULL_INTERVAL_MS) return;
  onStep('Reading your games on Lichess');
  const records = await readImportedRecords(token);
  report.gamesAdded += mergeLichessGames(records);
  useLichess.getState().setCursor('games', Date.now());
}

async function refreshRatings(token: string): Promise<void> {
  onStep('Reading your ratings');
  const account = await fetchAccount(token);
  const lichess = useLichess.getState();
  lichess.setRatings(account.ratings);
  const puzzle = account.ratings.puzzle;
  if (lichess.options.puzzles && lichess.options.rating && puzzle && !puzzle.prov) {
    adoptLichessRating(puzzle.rating, puzzle.rd);
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

function retryIn(ms: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow();
  }, ms);
}

function failed(err: unknown): void {
  setStatus({ step: null });
  if (!(err instanceof LichessError)) {
    setStatus({ phase: 'failed', error: messageOf(err) });
    return;
  }
  switch (err.kind) {
    case 'network': {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus({ phase: offline ? 'offline' : 'failed', error: err.message });
      if (!offline) retryIn(NETWORK_RETRY_MS);
      break;
    }
    case 'auth':
    case 'forbidden':
      useLichess.getState().setNeedsReconnect(true);
      setStatus({ phase: 'signed-out', error: err.message });
      break;
    case 'rate-limited': {
      const wait = (err.retryAfterSec ?? 60) * 1000;
      setStatus({ phase: 'waiting', error: err.message, retryAt: Date.now() + wait });
      retryIn(wait);
      break;
    }
    case 'server':
      setStatus({ phase: 'failed', error: err.message });
      retryIn(SERVER_RETRY_MS);
      break;
    default:
      setStatus({ phase: 'failed', error: err.message });
  }
}

async function runOnce(force: boolean): Promise<void> {
  const lichess = useLichess.getState();
  const account = lichess.account;
  if (!account || lichess.needsReconnect) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ phase: 'offline', step: null, error: null });
    return;
  }
  const { retryAt } = useLichessSync.getState();
  if (retryAt !== null && retryAt > Date.now()) return;

  setStatus({ phase: 'syncing', step: 'Starting', error: null, retryAt: null });
  const report: SyncReport = {
    at: Date.now(),
    puzzlesSent: 0,
    roundsAdded: 0,
    reviewsAdded: 0,
    gamesSent: 0,
    gamesAdded: 0,
    studies: null,
    problems: [],
  };
  const { token, username } = account;
  const { options } = lichess;
  // Each part runs only while the account the run started with is still connected.
  const connected = () => useLichess.getState().account?.token === token;
  const step = (name: string, run: () => Promise<void>) =>
    connected() ? part(name, report, run) : Promise.resolve();
  try {
    if (options.puzzles) await step('Puzzle results', () => sendPuzzles(token, report));
    if (options.games) await step('Games', () => sendGames(token, report));
    if (options.puzzles) await step('Puzzle history', () => bringPuzzles(token, report));
    if (options.games) await step('Games', () => bringGames(token, report, force));
    if (options.studies) {
      await step('Repertoires and analyses', async () => {
        report.studies = await syncStudies(token, username, onStep);
      });
    }
    await step('Ratings', () => refreshRatings(token));
  } catch (err) {
    // Disconnected meanwhile (its token revoked): the failure is the disconnection's.
    if (!connected()) setStatus({ phase: 'idle', step: null, error: null });
    else failed(err);
    setStatus({ report: { ...report, at: Date.now() } });
    return;
  }
  if (!connected()) {
    setStatus({ phase: 'idle', step: null, error: null });
    return;
  }
  useLichess.getState().markSynced();
  setStatus({ phase: 'done', step: null, error: null, report: { ...report, at: Date.now() } });
}

/** Runs `task` unless another tab of this profile is syncing (then that tab's run serves). */
async function exclusively(task: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    await task();
    return;
  }
  await locks.request(
    `chess-trainer:lichess-sync:${ACTIVE_PROFILE_ID}`,
    { ifAvailable: true },
    async (lock) => {
      if (lock) await task();
    },
  );
}

let running: Promise<void> | null = null;
let again = false;
let forceNext = false;

/**
 * Syncs now. A call while a run is going makes one more run follow it (what
 * changed meanwhile goes too), and resolves when that is done. `force` reads
 * the game history even if it was read recently ("Sync now").
 */
export function syncNow(options: { force?: boolean } = {}): Promise<void> {
  if (options.force) forceNext = true;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const force = forceNext;
        forceNext = false;
        await exclusively(() => runOnce(force));
      } while (again);
    } catch (err) {
      failed(err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Looks again, as the app opens, at a sign-in marked as refused: when Lichess
 * still knows the token — this account's, with every permission the sync
 * needs — the mark goes and syncing resumes. (0.17.0 took Lichess's refusal to
 * export a study for a refused sign-in.) Offline, or on any failure, the mark
 * stays, and Settings goes on offering to connect again.
 */
export async function recheckSignIn(): Promise<void> {
  const account = useLichess.getState().account;
  if (!account || !useLichess.getState().needsReconnect) return;
  let info: Awaited<ReturnType<typeof testToken>>;
  try {
    info = await testToken(account.token);
  } catch {
    return;
  }
  if (info?.userId !== account.id) return;
  const { scopes } = info;
  if (!LICHESS_SCOPES.every((scope) => scopes.includes(scope))) return;
  const lichess = useLichess.getState();
  if (lichess.account?.token === account.token && lichess.needsReconnect) {
    lichess.setNeedsReconnect(false);
  }
}

/** After results start to wait, how soon they go (more join them meanwhile). */
export const QUEUE_DELAY_MS = 30_000;
/** How long the app opens before the first run (start-up comes first). */
const START_DELAY_MS = 3_000;
/** A run while the app is in view this often, for what happened on other devices. */
const PERIODIC_MS = 15 * 60 * 1000;
/** Coming back into view syncs when the last run is older than this. */
const STALE_MS = 2 * 60 * 1000;

/**
 * Starts syncing on its own for the connected account; returns a function
 * that stops it. Does nothing (and returns a no-op) without an account.
 */
export function startLichessSync(): () => void {
  if (!useLichess.getState().account) return () => undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, task: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      task();
    }, ms);
    timers.add(timer);
    return timer;
  };
  const stale = () => {
    const last = useLichess.getState().lastSyncAt;
    return last === null || Date.now() - last > STALE_MS;
  };

  later(START_DELAY_MS, () => void syncNow());
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === 'visible' && stale()) void syncNow();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const periodic = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, PERIODIC_MS);
  let queued: ReturnType<typeof setTimeout> | null = null;
  const stopQueue = onLichessQueue(() => {
    queued ??= later(QUEUE_DELAY_MS, () => {
      queued = null;
      void syncNow();
    });
  });

  return () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    clearInterval(periodic);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    stopQueue();
  };
}
