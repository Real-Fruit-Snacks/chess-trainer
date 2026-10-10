import { LichessError } from '@/lib/lichess/api';
import { useLichess } from '@/store/lichess';
import { speedOf } from '../../../relay/src/live/shared.mjs';
import {
  backoff,
  lichessTiming,
  noteSignInRefused,
  pause,
  postToLichess,
  readLichessStream,
} from './lichessStream';
import type { ColorChoice, LivePlayer, Side, TimeControlSpec } from './types';

/**
 * Looking for an opponent on Lichess: a seek posted with the Board API, and
 * the event stream that says when a game starts. Lichess's own advice is
 * followed: the event stream opens first, so that a seek taken at once cannot
 * be missed. The games the event stream reports as it opens are games already
 * in progress, never the seek's: the seek is posted only once that report is
 * in. The seek stays up while its request stays open (closing it withdraws
 * the seek), so a seek whose request ends without a game is posted again.
 */

/** A game Lichess started from a seek. */
export interface LichessStart {
  gameId: string;
  color: Side;
  opponent: LivePlayer;
  rated: boolean;
  tc: string;
}

/** A seek posted on Lichess: `started` settles when Lichess pairs it, or fails. */
export interface LichessSeek {
  /** Settles once Lichess has taken the seek (it is then up for others to accept). */
  posted: Promise<void>;
  started: Promise<LichessStart>;
  /** Withdraws the seek (`started` then rejects with an AbortError). */
  cancel(): void;
}

/** Whether Lichess takes a time control from apps: rapid and slower only. */
export function lichessSeekAllowed(tc: TimeControlSpec): boolean {
  const speed = speedOf(tc);
  return speed === 'rapid' || speed === 'classical';
}

/** Aborts a Lichess game that has just started (one that slipped through a race). */
export async function abortLichessGame(gameId: string): Promise<void> {
  const account = useLichess.getState().account;
  if (!account) throw new LichessError('Not signed in to Lichess.', 'auth');
  try {
    await postToLichess(`/api/board/game/${encodeURIComponent(gameId)}/abort`, account.token);
  } catch (err) {
    noteSignInRefused(err);
    throw err;
  }
}

/** Lichess's titles: a titled player's name comes as "GM Name" in game events. */
const TITLES = new Set([
  'GM',
  'WGM',
  'IM',
  'WIM',
  'FM',
  'WFM',
  'CM',
  'WCM',
  'NM',
  'WNM',
  'LM',
  'BOT',
]);

/** A `gameStart` event's opponent as a player. */
export function playerOfEvent(value: unknown): LivePlayer {
  const opponent = (typeof value === 'object' && value !== null ? value : {}) as {
    username?: unknown;
    rating?: unknown;
  };
  const text = typeof opponent.username === 'string' ? opponent.username.trim() : '';
  // Lichess usernames have no spaces: a first word before one is a title.
  const space = text.indexOf(' ');
  const first = space > 0 ? text.slice(0, space) : '';
  const titled = TITLES.has(first);
  return {
    name: (titled ? text.slice(space + 1).trim() : text) || 'Anonymous',
    rating: typeof opponent.rating === 'number' ? Math.round(opponent.rating) : null,
    title: titled ? first : null,
  };
}

interface GameEvent {
  gameId?: unknown;
  id?: unknown;
  color?: unknown;
  source?: unknown;
  rated?: unknown;
  opponent?: unknown;
  compat?: { board?: unknown };
}

/**
 * Whether a new game can be the seek's: one from the lobby, or from a pool,
 * which Lichess uses for a seek whose time control has one. A challenge
 * accepted elsewhere ("friend"), a tournament game and the like are not.
 */
function fromASeek(game: GameEvent): boolean {
  const source = game.source;
  return (
    (source === undefined || source === 'lobby' || source === 'pool') &&
    game.compat?.board !== false
  );
}

function deferred<T>() {
  const parts = {} as {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  };
  parts.promise = new Promise<T>((resolve, reject) => {
    parts.resolve = resolve;
    parts.reject = reject;
  });
  return parts;
}

/** Failures worth another try: no answer, or Lichess's own trouble. */
function transient(err: unknown): boolean {
  return err instanceof LichessError && (err.kind === 'network' || err.kind === 'server');
}

/**
 * Settles once the seek withdrawn last has stopped watching for a game that
 * slipped through. Lichess keeps one event stream per account (a new one
 * closes the one before), so a new seek waits for that watch to end: two
 * would close each other's, and the old one could take the new seek's game
 * for a slipped one.
 */
let lastWatch: Promise<void> = Promise.resolve();

export function startLichessSeek(options: {
  tc: TimeControlSpec;
  color: ColorChoice;
  rated: boolean;
}): LichessSeek {
  const { tc, color, rated } = options;
  /** Everything of this seek: its streams and its pauses. */
  const everything = new AbortController();
  /** The seek's own request (and its posting again), withdrawn first on cancel. */
  const seeking = new AbortController();
  everything.signal.addEventListener('abort', () => seeking.abort(), { once: true });

  const posted = deferred<void>();
  const started = deferred<LichessStart>();
  // Nobody may be waiting on these: a failure must not go unhandled.
  posted.promise.catch(() => undefined);
  started.promise.catch(() => undefined);
  let postedSettled = false;
  let settled = false;
  const settle = (outcome: { start: LichessStart } | { error: unknown }) => {
    if (settled) return;
    settled = true;
    if (!postedSettled) {
      postedSettled = true;
      // A seek taken before its answer arrived was posted all the same.
      if ('start' in outcome) posted.resolve();
      else posted.reject(outcome.error);
    }
    if ('start' in outcome) started.resolve(outcome.start);
    else started.reject(outcome.error);
  };
  const fail = (error: unknown) => {
    noteSignInRefused(error);
    settle({ error });
    everything.abort();
  };

  /** The games seen so far: those in progress before the seek, and any since. */
  const known = new Set<string>();
  /** Set once the seek has gone: from then on a new game from a seek is its game. */
  let sent = false;
  /** Set by cancel(): a game that starts now slipped through, and is aborted. */
  let withdrawn = false;
  /** Settles once the event stream has reported the games already in progress. */
  const opening = deferred<void>();
  everything.signal.addEventListener('abort', () => opening.resolve(), { once: true });

  const onEvent = (value: unknown) => {
    const event = value as { type?: unknown; game?: unknown };
    if (event.type !== 'gameStart' || typeof event.game !== 'object' || event.game === null) {
      return;
    }
    const game = event.game as GameEvent;
    const id =
      typeof game.gameId === 'string' ? game.gameId : typeof game.id === 'string' ? game.id : null;
    // Each game once: an event stream that opens again reports the games in progress again.
    if (!id || known.has(id)) return;
    known.add(id);
    if (!sent || !fromASeek(game)) return;
    if (withdrawn) {
      // Lichess paired the seek as it was withdrawn: nobody here will play the game.
      abortLichessGame(id).catch(() => undefined);
      everything.abort();
      return;
    }
    settle({
      start: {
        gameId: id,
        color: game.color === 'black' ? 'black' : 'white',
        opponent: playerOfEvent(game.opponent),
        rated: game.rated === true,
        tc: tc.id,
      },
    });
    everything.abort();
  };

  const listen = async (token: string) => {
    let failures = 0;
    while (!everything.signal.aborted) {
      let opened = false;
      try {
        await readLichessStream('/api/stream/event', {
          token,
          signal: everything.signal,
          onOpen: () => {
            opened = true;
            failures = 0;
            // The games in progress come first, at once: give them a moment to arrive.
            pause(lichessTiming.openingMs, everything.signal).then(
              opening.resolve,
              () => undefined,
            );
          },
          onLine: onEvent,
        });
      } catch (err) {
        if (everything.signal.aborted) return;
        if (!transient(err) || ++failures > lichessTiming.seekRetries) {
          fail(err);
          return;
        }
      }
      // A stream that opened and ended (a long poll, say) has reported what was in progress.
      if (opened) opening.resolve();
      const wait = failures
        ? backoff(failures, lichessTiming.retryMs, lichessTiming.retryMaxMs)
        : lichessTiming.resumeMs;
      await pause(wait, everything.signal).catch(() => undefined);
    }
  };

  const seek = async (token: string) => {
    await opening.promise;
    let quickEnds = 0;
    let failures = 0;
    let limited = 0;
    while (!seeking.signal.aborted) {
      const since = Date.now();
      let opened = false;
      sent = true;
      try {
        await readLichessStream('/api/board/seek', {
          token,
          method: 'POST',
          form: {
            rated: String(rated),
            time: String(tc.initialMs / 60_000),
            increment: String(tc.incrementMs / 1000),
            color,
            variant: 'standard',
          },
          signal: seeking.signal,
          onOpen: () => {
            opened = true;
            failures = 0;
            limited = 0;
            if (!postedSettled) {
              postedSettled = true;
              posted.resolve();
            }
          },
          // Nothing but keep-alive lines comes on a seek's answer.
          onLine: () => undefined,
        });
      } catch (err) {
        if (seeking.signal.aborted) return;
        // Posting again soon after a connection dropped, Lichess may not have seen the
        // old seek go yet (it keeps one open seek per account): wait as asked, a few
        // times. Refused at the first post, the seek fails at once.
        if (
          postedSettled &&
          err instanceof LichessError &&
          err.kind === 'rate-limited' &&
          ++limited <= lichessTiming.seekRetries
        ) {
          const asked = Math.min((err.retryAfterSec ?? 60) * 1000, lichessTiming.repostMaxMs);
          await pause(Math.max(lichessTiming.repostMs, asked), seeking.signal).catch(
            () => undefined,
          );
          continue;
        }
        if (!transient(err) || (!opened && ++failures > lichessTiming.seekRetries)) {
          fail(err);
          return;
        }
      }
      // The answer ended without a game. Lichess ends it as it pairs the seek (the
      // game's start is then on its way), or it dropped: post again after a pause,
      // longer each time a seek ends early, to stay within Lichess's limit on seeks.
      quickEnds = Date.now() - since < lichessTiming.steadySeekMs ? quickEnds + 1 : 1;
      const wait = backoff(quickEnds, lichessTiming.repostMs, lichessTiming.repostMaxMs);
      await pause(wait, seeking.signal).catch(() => undefined);
    }
  };

  const account = useLichess.getState().account;
  if (!account) {
    settle({ error: new LichessError('Not signed in to Lichess.', 'auth') });
    everything.abort();
  } else if (!lichessSeekAllowed(tc)) {
    settle({
      error: new LichessError('Lichess takes rapid and slower games only from apps.', 'invalid'),
    });
    everything.abort();
  } else {
    const { token } = account;
    const before = lastWatch;
    const ended = new Promise<void>((resolve) => {
      everything.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    const begin = async () => {
      await Promise.race([before, ended]);
      if (everything.signal.aborted) return;
      await Promise.all([listen(token), seek(token)]);
    };
    begin().catch(fail);
  }

  return {
    posted: posted.promise,
    started: started.promise,
    cancel: () => {
      if (settled) return;
      settle({ error: new DOMException('The seek was withdrawn.', 'AbortError') });
      seeking.abort();
      if (!sent) {
        everything.abort();
        return;
      }
      // Lichess may have paired the seek as it went: the event stream stays a
      // moment longer, to abort that game rather than leave it to time out.
      withdrawn = true;
      lastWatch = new Promise<void>((resolve) => {
        everything.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      pause(lichessTiming.cancelGraceMs, everything.signal).then(
        () => everything.abort(),
        () => undefined,
      );
    },
  };
}
