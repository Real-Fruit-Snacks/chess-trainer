import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LichessError } from '@/lib/lichess/api';
import { LICHESS_SCOPES, ratingsFrom } from '@/lib/lichess/auth';
import { useLichess } from '@/store/lichess';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import { parseTimeControl, type TimeControlSpec } from '../../../relay/src/live/shared.mjs';
import {
  abortLichessGame,
  lichessSeekAllowed,
  playerOfEvent,
  startLichessSeek,
  type LichessSeek,
} from './lichessSeek';
import { lichessTiming } from './lichessStream';

const defaults = { ...lichessTiming };
let lichess: FakeLichessHandle;
let seek: LichessSeek | null = null;

function tc(id: string): TimeControlSpec {
  const spec = parseTimeControl(id);
  if (!spec) throw new Error(`Not a time control: ${id}`);
  return spec;
}

/** Signs this device in to the stand-in's account; returns the token. */
function signIn(scopes?: readonly string[]): string {
  const token = lichess.fake.issueToken(scopes);
  useLichess
    .getState()
    .connect({ id: 'learner', username: 'Learner', token, expiresAt: null }, ratingsFrom(null));
  return token;
}

function post(options: Partial<Parameters<typeof startLichessSeek>[0]> = {}): LichessSeek {
  seek = startLichessSeek({ tc: tc('15+10'), color: 'random', rated: false, ...options });
  return seek;
}

const requests = (signature: string) => lichess.fake.requests.filter((r) => r === signature);

/** Whether a promise has settled by now (after pending callbacks have run). */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  return done;
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a failure');
}

beforeEach(() => {
  localStorage.clear();
  useLichess.getState().forget();
  lichess = installFakeLichess();
  Object.assign(lichessTiming, {
    openingMs: 20,
    repostMs: 30,
    repostMaxMs: 200,
    cancelGraceMs: 100,
    resumeMs: 10,
    retryMs: 10,
    retryMaxMs: 50,
  });
});

afterEach(async () => {
  seek?.cancel();
  seek = null;
  // Nothing may stay open on Lichess's side once a seek is done.
  await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));
  Object.assign(lichessTiming, defaults);
  vi.unstubAllGlobals();
});

describe('looking for an opponent on Lichess', () => {
  it('posts the seek once the games in progress are known, and starts the game an opponent takes', async () => {
    signIn();
    // A game already in progress when the seek starts is never the seek's.
    const earlier = lichess.fake.board.startGame({ moves: ['e2e4', 'e7e5'] });
    const { posted, started } = post({ color: 'black', rated: true });
    await posted;
    expect(lichess.fake.requests.indexOf('GET /api/stream/event')).toBeLessThan(
      lichess.fake.requests.indexOf('POST /api/board/seek'),
    );
    expect(lichess.fake.board.seeks).toMatchObject([
      { time: 15, increment: 10, rated: true, color: 'black' },
    ]);
    expect(lichess.fake.board.openStreams().sort()).toEqual(['events', 'seek']);
    expect(await settled(started)).toBe(false);

    const game = lichess.fake.board.pairSeek({
      opponent: { id: 'carlsen', name: 'DrNykterstein', title: 'GM', rating: 2850 },
    });
    expect(game.id).not.toBe(earlier.id);
    await expect(started).resolves.toEqual({
      gameId: game.id,
      color: 'black',
      opponent: { name: 'DrNykterstein', rating: 2850, title: 'GM' },
      rated: true,
      tc: '15+10',
    });
    // The seek and the event stream close once the game has started.
    await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));
    expect(lichess.fake.board.seeks).toEqual([]);
  });

  it('takes a game from a pool too, and leaves games that came another way alone', async () => {
    signIn();
    const { posted, started } = post({ tc: tc('10+5') });
    await posted;
    // A challenge accepted on lichess.org meanwhile is not the seek's game.
    lichess.fake.board.startGame({ source: 'friend' });
    expect(await settled(started)).toBe(false);
    const game = lichess.fake.board.pairSeek({ source: 'pool', color: 'white' });
    await expect(started).resolves.toMatchObject({ gameId: game.id, color: 'white', tc: '10+5' });
  });

  it('posts the seek again when its answer ends or drops without a game', async () => {
    signIn();
    const { posted, started } = post();
    await posted;
    lichess.fake.board.endStreams('seek');
    expect(lichess.fake.board.seeks).toEqual([]);
    await vi.waitFor(() => expect(lichess.fake.board.seeks).toHaveLength(1));
    lichess.fake.board.dropStreams('seek');
    await vi.waitFor(() => expect(requests('POST /api/board/seek')).toHaveLength(3));
    await vi.waitFor(() => expect(lichess.fake.board.seeks).toHaveLength(1));
    // The event stream dropping meanwhile changes nothing: it opens again.
    lichess.fake.board.dropStreams('events');
    await vi.waitFor(() => expect(requests('GET /api/stream/event')).toHaveLength(2));
    await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toContain('events'));
    const game = lichess.fake.board.pairSeek();
    await expect(started).resolves.toMatchObject({ gameId: game.id });
  });

  it('finds a game that started while the event stream was away, when it opens again', async () => {
    signIn();
    lichessTiming.resumeMs = 150;
    const { posted, started } = post();
    await posted;
    lichess.fake.board.endStreams('events');
    // Taken before the event stream is back: its opening report holds the new game.
    const game = lichess.fake.board.pairSeek();
    expect(await settled(started)).toBe(false);
    await expect(started).resolves.toMatchObject({ gameId: game.id });
  });

  it('withdraws the seek on cancel: both promises reject with an AbortError, and nothing stays open', async () => {
    signIn();
    const early = post();
    early.cancel();
    expect(await failure(early.posted)).toMatchObject({ name: 'AbortError' });
    expect(await failure(early.started)).toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));
    expect(lichess.fake.board.seeks).toEqual([]);

    const later = post();
    await later.posted;
    later.cancel();
    expect(await failure(later.started)).toBeInstanceOf(DOMException);
    // The seek goes at once; the event stream a moment later.
    await vi.waitFor(() => expect(lichess.fake.board.seeks).toEqual([]));
    await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));
    later.cancel();
  });

  it('aborts a game that slips through as the seek is withdrawn', async () => {
    signIn();
    const { posted, started, cancel } = post();
    await posted;
    cancel();
    // Lichess paired the seek just before it went.
    const game = lichess.fake.board.startGame({ source: 'lobby' });
    await vi.waitFor(() => expect(game.status).toBe('aborted'));
    expect(await failure(started)).toMatchObject({ name: 'AbortError' });
  });

  it('starts a new seek only once the one withdrawn before has stopped watching', async () => {
    signIn();
    lichessTiming.cancelGraceMs = 150;
    const first = post({ tc: tc('10+0') });
    await first.posted;
    first.cancel();
    const withdrawnAt = performance.now();
    const second = post({ tc: tc('15+10'), color: 'white' });
    await second.posted;
    expect(performance.now() - withdrawnAt).toBeGreaterThanOrEqual(140);
    // The old watch is over: the new seek's game is the new seek's, and nobody aborts it.
    const game = lichess.fake.board.pairSeek();
    await expect(second.started).resolves.toMatchObject({ gameId: game.id, tc: '15+10' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(game.status).toBe('started');
  });

  it('waits and posts again when Lichess still counts a seek whose connection dropped', async () => {
    signIn();
    const { posted, started } = post();
    await posted;
    lichess.fake.failNext(/^POST \/api\/board\/seek$/, 429, {
      body: 'Please only run 1 request(s) at a time',
    });
    lichess.fake.board.dropStreams('seek');
    await vi.waitFor(() => expect(requests('POST /api/board/seek')).toHaveLength(3));
    await vi.waitFor(() => expect(lichess.fake.board.seeks).toHaveLength(1));
    expect(await settled(started)).toBe(false);
    const game = lichess.fake.board.pairSeek();
    await expect(started).resolves.toMatchObject({ gameId: game.id });
  });

  it('fails with what Lichess says: slow down, no permission, a refused sign-in', async () => {
    const token = signIn();
    lichess.fake.failNext(/^POST \/api\/board\/seek$/, 429, { headers: { 'retry-after': '90' } });
    const slow = post();
    const error = await failure(slow.started);
    expect(error).toBeInstanceOf(LichessError);
    expect(error).toMatchObject({ kind: 'rate-limited', retryAfterSec: 90 });
    expect(await failure(slow.posted)).toBe(error);
    await vi.waitFor(() => expect(lichess.fake.board.openStreams()).toEqual([]));

    lichess.fake.tokens.set(token, [...LICHESS_SCOPES]);
    expect(await failure(post().started)).toMatchObject({ kind: 'forbidden' });
    expect(useLichess.getState().needsReconnect).toBe(false);

    lichess.fake.tokens.delete(token);
    expect(await failure(post().started)).toMatchObject({ kind: 'auth' });
    expect(useLichess.getState().needsReconnect).toBe(true);
  });

  it('gives up when Lichess cannot be reached', async () => {
    signIn();
    lichess.offline = true;
    expect(await failure(post().started)).toMatchObject({ kind: 'network' });
  });

  it('asks nothing of Lichess for a blitz game, or without a sign-in', async () => {
    expect(await failure(post().started)).toMatchObject({ kind: 'auth' });
    signIn();
    expect(await failure(post({ tc: tc('5+3') }).started)).toMatchObject({ kind: 'invalid' });
    expect(lichess.fake.requests).toEqual([]);
  });

  it('works with long polls too, as end-to-end tests serve the streams', async () => {
    lichess = installFakeLichess(lichess.fake, { streams: false });
    lichess.fake.board.pollMs = 30;
    signIn();
    const { posted, started } = post({ color: 'white' });
    await posted;
    // A long poll's seek lingers: the stand-in cannot see its client go.
    expect(lichess.fake.board.seeks).toHaveLength(1);
    await vi.waitFor(() =>
      expect(requests('GET /api/stream/event').length).toBeGreaterThanOrEqual(3),
    );
    const game = lichess.fake.board.pairSeek();
    await expect(started).resolves.toMatchObject({ gameId: game.id, color: 'white' });
  });
});

describe('Lichess and apps', () => {
  it('takes rapid and slower games only', () => {
    expect(lichessSeekAllowed(tc('10+0'))).toBe(true);
    expect(lichessSeekAllowed(tc('8+0'))).toBe(true);
    expect(lichessSeekAllowed(tc('30+20'))).toBe(true);
    expect(lichessSeekAllowed(tc('5+3'))).toBe(false);
    expect(lichessSeekAllowed(tc('3+2'))).toBe(false);
    expect(lichessSeekAllowed(tc('1+0'))).toBe(false);
  });

  it('reads the opponent of a game event, a title written before the name', () => {
    expect(playerOfEvent({ id: 'x', username: 'IM Somebody', rating: 2401.4 })).toEqual({
      name: 'Somebody',
      rating: 2401,
      title: 'IM',
    });
    expect(playerOfEvent({ username: 'Plain' })).toEqual({
      name: 'Plain',
      rating: null,
      title: null,
    });
    expect(playerOfEvent(null)).toEqual({ name: 'Anonymous', rating: null, title: null });
  });

  it('aborts a game that has just started, and not one both sides have moved in', async () => {
    signIn();
    const fresh = lichess.fake.board.startGame({ announce: false });
    await abortLichessGame(fresh.id);
    expect(fresh.status).toBe('aborted');
    const going = lichess.fake.board.startGame({ moves: ['e2e4', 'e7e5'], announce: false });
    await expect(abortLichessGame(going.id)).rejects.toMatchObject({
      kind: 'invalid',
      message: 'This game can no longer be aborted',
    });
  });
});
