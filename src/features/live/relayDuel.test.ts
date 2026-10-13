import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeLiveRelay, installFakeLiveRelay, type Message } from '@/test/fakeLiveHub';
import { DUEL_RULES, randomId } from '../../../relay/src/live/shared.mjs';
import { createRelayDuel, type PrepareDuel } from './relayDuel';
import { seatOf } from './seats';
import type { DuelItems, DuelSession, GameOptions } from './types';

const ME = 'Patient Bishop';
const THEM = 'Swift Knight';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const puzzles = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `pz${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));
const judgeItems = () =>
  Array.from({ length: DUEL_RULES.judge.rounds }, (_, i) => ({
    fen: START,
    cp: 150,
    game: 'opera-game',
    ply: i,
  }));

let relay: FakeLiveRelay;
const sessions: DuelSession[] = [];

beforeEach(() => {
  relay = installFakeLiveRelay();
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.close();
  vi.unstubAllGlobals();
});

/**
 * A duel made through the waiting room. This device posted it (and hosts it)
 * unless `host` is false; the other player is seated already.
 */
async function newDuel(game: string, opts: GameOptions, { host = true } = {}) {
  const first = relay.lobbyClient();
  const second = relay.lobbyClient();
  const seek = { t: 'seek', game, opts, rating: null, private: false };
  await first.send({ ...seek, name: host ? ME : THEM, secret: randomId(32) });
  await second.send({ ...seek, name: host ? THEM : ME, secret: randomId(32) });
  const [mine, theirs] = host ? [first, second] : [second, first];
  const id = mine.last('paired')!.game as string;
  const opponent = relay.roomClient(id);
  await opponent.send({ t: 'hello', seat: theirs.last('paired')!.seat });
  return {
    id,
    seat: mine.last('paired')!.seat as string,
    color: mine.last('paired')!.color as 'white' | 'black',
    opponent,
  };
}

function open(id: string, seat: string, color: 'white' | 'black', prepare: PrepareDuel) {
  const session = createRelayDuel(id, seat, color, prepare);
  sessions.push(session);
  session.subscribe(() => undefined);
  return session;
}

const sentTo = (id: string): Message[] =>
  relay.sockets.filter((s) => s.path === `/v1/games/${id}`).flatMap((s) => s.sentMessages());

describe('a duel on the relay', () => {
  it('as the host, deals the rounds once and starts when both are there', async () => {
    const { id, seat, color, opponent } = await newDuel('race', {
      format: 'best3',
      level: 1500,
    });
    expect(color).toBe('white');
    const prepare = vi.fn<PrepareDuel>(() => Promise.resolve(puzzles(5) as DuelItems));
    const session = open(id, seat, color, prepare);
    expect(session.getView()).toMatchObject({ connection: 'connecting', host: true });
    await relay.settle();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith('race', { format: 'best3', level: 1500 });
    expect(sentTo(id).filter((m) => m.t === 'content')).toEqual([
      { t: 'content', items: puzzles(5) },
    ]);
    const view = session.getView();
    expect(view).toMatchObject({
      connection: 'open',
      game: 'race',
      opts: { format: 'best3', level: 1500 },
      you: 'white',
      white: { name: ME },
      black: { name: THEM },
      status: 'playing',
      phase: 'countdown',
      round: 0,
      items: puzzles(5),
      opponentPresent: true,
      preparing: false,
    });
    expect(view.phaseEnds! - performance.now()).toBeGreaterThan(DUEL_RULES.countdownMs - 500);
    expect(opponent.last('content')).toEqual({ t: 'content', items: puzzles(5) });
  });

  it('as the guest, plays the rounds the room runs, and shows how each ended', async () => {
    const { id, seat, color, opponent } = await newDuel(
      'race',
      { format: 'best3', level: 1500 },
      { host: false },
    );
    expect(color).toBe('black');
    const prepare = vi.fn<PrepareDuel>();
    const session = open(id, seat, color, prepare);
    await relay.settle();
    expect(session.getView()).toMatchObject({ host: false, status: 'setup', items: null });
    expect(session.getView().setupDeadline).not.toBeNull();
    // The other player hosts: it deals the rounds.
    await opponent.send({ t: 'content', items: puzzles(5) });
    await relay.settle();
    expect(prepare).not.toHaveBeenCalled();
    expect(session.getView()).toMatchObject({ items: puzzles(5), phase: 'countdown' });

    await relay.advance(DUEL_RULES.countdownMs);
    expect(session.getView()).toMatchObject({ phase: 'live', round: 0, mine: null });
    expect(session.getView().liveSince).not.toBeNull();
    // A result shows at once, and goes to the room.
    session.report({ round: 0, ok: true, ms: 6400.4 });
    expect(session.getView().mine).toEqual({ ok: true, ms: 6400 });
    await relay.settle();
    expect(opponent.last('reported')).toMatchObject({
      by: 'black',
      result: { ok: true, ms: 6400 },
    });
    // A second report of the same round is not sent.
    session.report({ round: 0, ok: false, ms: 1 });
    expect(sentTo(id).filter((m) => m.t === 'result')).toHaveLength(1);

    await opponent.send({ t: 'result', round: 0, ok: true, ms: 9000 });
    await relay.settle();
    expect(session.getView()).toMatchObject({
      phase: 'reveal',
      score: { white: 0, black: 1 },
      mine: { ok: true, ms: 6400 },
      theirs: { ok: true, ms: 9000 },
      rounds: [
        {
          round: 0,
          winner: 'black',
          points: { white: 0, black: 1 },
          results: { white: { ok: true, ms: 9000 }, black: { ok: true, ms: 6400 } },
        },
      ],
    });

    await relay.advance(DUEL_RULES.revealMs);
    expect(session.getView()).toMatchObject({
      phase: 'countdown',
      round: 1,
      mine: null,
      theirs: null,
    });
    await relay.advance(DUEL_RULES.countdownMs);
    session.report({ round: 1, ok: true, ms: 3000 });
    await relay.settle();
    await relay.advance(DUEL_RULES.race.graceMs);
    expect(session.getView()).toMatchObject({
      status: 'over',
      result: '0-1',
      reason: 'score',
      score: { white: 0, black: 2 },
      phase: null,
    });
  });

  it('keeps a judgement out of sight until the round ends', async () => {
    const { id, seat, color, opponent } = await newDuel('judge', {}, { host: false });
    const session = open(id, seat, color, vi.fn<PrepareDuel>());
    await relay.settle();
    await opponent.send({ t: 'content', items: judgeItems() });
    await relay.advance(DUEL_RULES.countdownMs);
    await opponent.send({ t: 'result', round: 0, guess: 1.5 });
    await relay.settle();
    expect(session.getView().theirs).toEqual({ locked: true });
    session.report({ round: 0, guess: 1.23 });
    expect(session.getView().mine).toEqual({ guess: 1.2 });
    await relay.settle();
    expect(session.getView()).toMatchObject({
      phase: 'reveal',
      theirs: { guess: 1.5 },
      mine: { guess: 1.2 },
      score: { white: 100, black: 91 },
    });
  });

  it('follows a timed race’s progress, puzzle by puzzle', async () => {
    const { id, seat, color, opponent } = await newDuel('race', { format: 'timed', level: 1200 });
    const session = open(id, seat, color, () =>
      Promise.resolve(puzzles(DUEL_RULES.race.timedMin) as DuelItems),
    );
    await relay.settle();
    await relay.advance(DUEL_RULES.countdownMs);
    expect(session.getView()).toMatchObject({ phase: 'live' });
    expect(session.getView().phaseEnds! - performance.now()).toBeGreaterThan(
      DUEL_RULES.race.timedMs - 1000,
    );
    session.report({ index: 0, ok: true, ms: 2000 });
    session.report({ index: 1, ok: false, ms: 900 });
    await relay.settle();
    expect(session.getView().progress).toEqual({
      white: { index: 2, solved: 1, strikes: 1, done: false },
      black: { index: 0, solved: 0, strikes: 0, done: false },
    });
    await opponent.send({ t: 'result', index: 0, ok: true, ms: 1500 });
    await relay.settle();
    expect(session.getView().progress!.black).toMatchObject({ index: 1, solved: 1 });
    await relay.advance(DUEL_RULES.race.timedMs + 2000);
    // As many solved: the fewer strikes win.
    expect(session.getView()).toMatchObject({ status: 'over', result: '0-1' });
  });

  it('calls the duel off when the rounds cannot be dealt, and says why', async () => {
    const { id, seat, color, opponent } = await newDuel('race', { format: 'best3', level: 1500 });
    const session = open(id, seat, color, () =>
      Promise.reject(new Error('Not enough puzzles could be loaded.')),
    );
    await relay.settle();
    expect(session.getView()).toMatchObject({
      status: 'over',
      reason: 'aborted',
      result: '*',
      preparing: false,
    });
    expect(opponent.last('end')).toMatchObject({ result: '*', reason: 'aborted' });
  });

  it('deals the rounds again after a reconnection when the room never had them', async () => {
    const { id, seat, color } = await newDuel('judge', {});
    let resolve!: (items: DuelItems) => void;
    const session = open(
      id,
      seat,
      color,
      () =>
        new Promise<DuelItems>((done) => {
          resolve = done;
        }),
    );
    await relay.settle();
    expect(session.getView().preparing).toBe(true);
    relay.drop(relay.openSockets(`/v1/games/${id}`)[0]!);
    await relay.settle();
    // Ready while the connection is down: kept, and sent once the room is back.
    resolve(judgeItems());
    await relay.settle();
    expect(session.getView().preparing).toBe(false);
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(session.getView()).toMatchObject({ status: 'playing', items: judgeItems() });
  });

  it('keeps a rematch’s seat as the same duel, with the other player hosting', async () => {
    const { id, seat, color, opponent } = await newDuel('arbiter', { pace: 'normal' });
    const session = open(
      id,
      seat,
      color,
      vi.fn<PrepareDuel>(() => new Promise(() => undefined)),
    );
    await relay.settle();
    session.abort();
    await relay.settle();
    expect(session.getView()).toMatchObject({ status: 'over', reason: 'aborted' });
    await opponent.send({ t: 'rematch', op: 'offer' });
    await relay.settle();
    expect(session.getView().offers.rematch).toBe('black');
    session.rematch('accept');
    await relay.settle();
    const next = session.getView().next!;
    expect(next.path).toMatch(/^\/play\/duel\/[A-Za-z0-9_-]{22}$/);
    expect(seatOf(next.path.split('/').at(-1)!)).toMatchObject({ kind: 'arbiter', color: 'black' });
  });

  it('says a duel is gone when the room has no such duel', async () => {
    const session = open('AAAAAAAAAAAAAAAAAAAAAA', 'B'.repeat(43), 'white', vi.fn<PrepareDuel>());
    await relay.settle();
    expect(session.getView()).toMatchObject({ missing: true, connection: 'closed' });
  });
});
