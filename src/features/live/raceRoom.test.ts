import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import {
  type FakeLiveRelay,
  installFakeLiveRelay,
  type Message,
  type RelayClient,
} from '@/test/fakeLiveHub';
import { CLOSE, DUEL_RULES, GROUP_LIMITS } from '../../../relay/src/live/shared.mjs';
import { useLivePrefs } from './prefs';
import { createRaceRoom, type PrepareRace, raceRoomStateOf, racing } from './raceRoom';
import { makeGroupRoom, membershipOf, memberships, rememberMembership } from './rooms';
import type { RacePuzzle, RaceRoomSession } from './types';

const ME = 'Patient Bishop';
const THEM = 'Swift Knight';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ROUNDS = { format: 'rounds', level: 1500 } as const;
const TIMED = { format: 'timed', level: 1200 } as const;

const puzzles = (count: number, prefix = 'pz'): RacePuzzle[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));

let relay: FakeLiveRelay;
const sessions: RaceRoomSession[] = [];

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  useProgress.setState({ puzzleRating: 1523.6 });
  useLivePrefs.getState().update({ name: ME, showRating: true });
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.close();
  vi.unstubAllGlobals();
});

/** A room made from this device (its host), as Play makes it. */
async function makeRoom(opts: object = ROUNDS): Promise<string> {
  const made = makeGroupRoom('race', opts);
  await relay.settle();
  return made;
}

function open(id: string, prepare?: PrepareRace) {
  const session = createRaceRoom(id, prepare);
  sessions.push(session);
  return session;
}

/** Someone else, who opens the link and joins. */
async function other(id: string, name = THEM): Promise<RelayClient> {
  const client = relay.groupClient(id);
  await client.send({ t: 'hello' });
  await client.send({ t: 'join', name, rating: null });
  await relay.settle();
  return client;
}

const sentTo = (id: string): Message[] =>
  relay.sockets.filter((s) => s.path === `/v1/rooms/${id}`).flatMap((s) => s.sentMessages());

describe('a race room on the relay', () => {
  it('is made through the waiting room, and this device is its host', async () => {
    const id = await makeRoom();
    expect(membershipOf(id)).toMatchObject({ kind: 'race' });
    // The waiting room's socket was only for making it.
    expect(relay.openSockets('/v1/lobby')).toHaveLength(0);
    const sent = relay.sockets.find((s) => s.path === '/v1/lobby')!.sentMessages();
    expect(sent).toEqual([
      { t: 'create-room', kind: 'race', opts: ROUNDS, name: ME, rating: 1524 },
    ]);

    const session = open(id);
    expect(session.getView()).toMatchObject({ connection: 'connecting', you: null });
    await relay.settle();
    const view = session.getView();
    expect(view).toMatchObject({
      connection: 'open',
      kind: 'race',
      host: view.you,
      max: GROUP_LIMITS.members,
      members: [{ name: ME, rating: 1524, here: true }],
      state: { opts: ROUNDS, count: 0, race: null },
      dealing: false,
    });
    expect(view.you).not.toBeNull();
  });

  it('refuses what the relay refuses', async () => {
    await expect(makeGroupRoom('race', { format: 'best3', level: 1500 } as never)).rejects.toThrow(
      'That room cannot be made.',
    );
    relay.offline = true;
    const made = makeGroupRoom('race', ROUNDS).catch((err: unknown) => err);
    await relay.settle();
    expect(String(await made)).toContain('the relay could not be reached');
  });

  it('lets whoever opens the link look, then join under their name', async () => {
    const id = await makeRoom();
    const host = relay.groupClient(id);
    await host.send({ t: 'hello', token: membershipOf(id)!.token });
    // This device is the visitor now: a new profile with no membership.
    localStorage.clear();
    useLivePrefs.getState().update({ name: THEM, showRating: false });
    const session = open(id);
    await relay.settle();
    expect(session.getView()).toMatchObject({ you: null, members: [{ name: ME }], chat: [] });
    session.say('hello');
    expect(sentTo(id).filter((m) => m.t === 'say')).toHaveLength(0);

    session.join();
    expect(session.getView().joining).toBe(true);
    await relay.settle();
    const view = session.getView();
    expect(view.joining).toBe(false);
    expect(view.you).not.toBeNull();
    expect(membershipOf(id)).toMatchObject({ kind: 'race' });
    expect(host.last('members')!.members).toEqual([
      expect.objectContaining({ name: ME }),
      expect.objectContaining({ id: view.you, name: THEM, rating: null, here: true }),
    ]);

    // Phrases go both ways, named by member.
    session.say('luck');
    await relay.settle();
    expect(host.last('say')).toEqual({ t: 'say', by: view.you, phrase: 'luck' });
    await host.send({ t: 'say', phrase: 'thanks' });
    await relay.settle();
    expect(session.getView().chat).toEqual([
      { by: view.you, text: 'Good luck' },
      { by: view.host, text: 'Thank you' },
    ]);
  });

  it('keeps its place through a reconnection, and gives it up when it leaves', async () => {
    const id = await makeRoom();
    const session = open(id);
    await relay.settle();
    const me = session.getView().you;
    const guest = await other(id);
    relay.drop(relay.openSockets(`/v1/rooms/${id}`)[0]!);
    await relay.settle();
    expect(session.getView().connection).toBe('reconnecting');
    expect(guest.last('members')!.members).toContainEqual(
      expect.objectContaining({ id: me, here: false }),
    );
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(session.getView()).toMatchObject({ connection: 'open', you: me, host: me });

    session.leave();
    await relay.settle();
    expect(session.getView().you).toBeNull();
    expect(membershipOf(id)).toBeNull();
    // The guest has the room now.
    expect(guest.last('members')!.host).toBe(guest.last('joined')!.member);
  });

  it('says so when the room is gone, and forgets it', async () => {
    const id = await makeRoom();
    const session = open(id);
    await relay.settle();
    session.leave();
    await relay.settle();
    await relay.advance(GROUP_LIMITS.emptyKeepMs);
    expect(relay.sockets.at(-1)!.closeCode).toBe(CLOSE.closed);
    expect(session.getView()).toMatchObject({ missing: true, connection: 'closed' });
    // A membership kept for a room that is no more goes once the room says so.
    rememberMembership(id, 'x'.repeat(43), 'race');
    const again = open(id);
    await relay.settle();
    expect(again.getView().missing).toBe(true);
    expect(membershipOf(id)).toBeNull();
  });

  it('deals the puzzles on the host’s device, and races them by the room’s clock', async () => {
    const id = await makeRoom();
    const prepare = vi.fn<PrepareRace>(() => Promise.resolve(puzzles(5)));
    const session = open(id, prepare);
    await relay.settle();
    // Alone, the host cannot start.
    session.start();
    await relay.settle();
    expect(session.getView().error).toBe('A race takes at least two players here.');

    const guest = await other(id);
    const guestId = guest.last('joined')!.member as string;
    session.start();
    expect(session.getView().dealing).toBe(true);
    await relay.settle();
    expect(prepare).toHaveBeenCalledWith(ROUNDS, new Set());
    // The first (alone) was refused; this one starts the race.
    expect(sentTo(id).filter((m) => m.t === 'start')).toHaveLength(2);
    expect(sentTo(id).filter((m) => m.t === 'start')[1]).toEqual({
      t: 'start',
      opts: ROUNDS,
      items: puzzles(5),
    });
    let view = session.getView();
    expect(view.dealing).toBe(false);
    expect(view.error).toBeNull();
    expect(view.state!.race).toMatchObject({
      number: 1,
      status: 'playing',
      phase: 'countdown',
      round: 0,
      items: puzzles(5),
      racers: [
        { id: view.you, name: ME },
        { id: guestId, name: THEM },
      ],
    });
    expect(racing(view)).toBe(true);

    await relay.advance(DUEL_RULES.countdownMs);
    expect(session.getView().state!.race).toMatchObject({ phase: 'live', items: puzzles(5) });
    session.report({ round: 0, ok: true, ms: 4200 });
    await relay.settle();
    expect(session.getView().state!.race!.results).toEqual({
      [view.you!]: { ok: true, ms: 4200 },
    });
    await guest.send({ t: 'result', round: 0, ok: true, ms: 6100 });
    await relay.settle();
    view = session.getView();
    expect(view.state!.race).toMatchObject({
      phase: 'reveal',
      scores: { [view.you!]: 5, [guestId]: 4 },
    });
    expect(view.state!.race!.rounds).toHaveLength(1);
  });

  it('sends a result again after a reconnection, if the room never had it', async () => {
    const id = await makeRoom(TIMED);
    const session = open(id, () => Promise.resolve(puzzles(DUEL_RULES.race.timedMin)));
    await relay.settle();
    await other(id);
    session.start();
    await relay.settle();
    await relay.advance(DUEL_RULES.countdownMs);
    const me = session.getView().you!;
    session.report({ index: 0, ok: true, ms: 3000 });
    await relay.settle();
    // The connection drops; the next result is reported while it is down.
    relay.drop(relay.openSockets(`/v1/rooms/${id}`)[0]!);
    await relay.settle();
    session.report({ index: 1, ok: false, ms: 2000 });
    window.dispatchEvent(new Event('online'));
    await relay.settle();
    expect(session.getView().state!.race!.progress![me]).toEqual({
      index: 2,
      solved: 1,
      strikes: 1,
      done: false,
    });
  });

  it('starts another race with new puzzles, avoiding the last race’s', async () => {
    const id = await makeRoom();
    const prepare = vi.fn<PrepareRace>((_opts, avoid) =>
      Promise.resolve(puzzles(5, avoid.size > 0 ? 'nx' : 'pz')),
    );
    const session = open(id, prepare);
    await relay.settle();
    const guest = await other(id);
    session.start();
    await relay.settle();
    for (let round = 0; round < 5; round++) {
      await relay.advance(DUEL_RULES.countdownMs + DUEL_RULES.race.roundMs);
      await relay.advance(DUEL_RULES.revealMs);
    }
    expect(session.getView().state!.race).toMatchObject({ status: 'over' });
    expect(session.getView().state!.race!.places).toHaveLength(2);
    // The host changes the options; everyone sees them; the next race has them.
    session.setOptions({ format: 'timed', level: 1800 });
    await relay.settle();
    expect(guest.last('race')!.state).toMatchObject({ opts: { format: 'timed', level: 1800 } });
    prepare.mockImplementation(() => Promise.resolve(puzzles(20, 'nx')));
    session.start();
    await relay.settle();
    expect(prepare).toHaveBeenLastCalledWith(
      { format: 'timed', level: 1800 },
      new Set(puzzles(5).map((p) => p.id)),
    );
    expect(session.getView().state!.race).toMatchObject({
      number: 2,
      format: 'timed',
      status: 'playing',
    });
    expect(memberships()).toHaveLength(1);
  });

  it('says why the puzzles could not be dealt', async () => {
    const id = await makeRoom();
    const session = open(id, () => Promise.reject(new Error('Not enough puzzles.')));
    await relay.settle();
    await other(id);
    session.start();
    await relay.settle();
    expect(session.getView()).toMatchObject({ dealing: false, error: 'Not enough puzzles.' });
    expect(sentTo(id).filter((m) => m.t === 'start')).toHaveLength(0);
  });
});

describe('reading a race room’s state', () => {
  it('keeps only what it can read, and the race’s puzzles across its messages', () => {
    const first = raceRoomStateOf(
      {
        opts: ROUNDS,
        count: 1,
        race: {
          number: 1,
          format: 'rounds',
          level: 1500,
          status: 'playing',
          racers: [
            { id: 'abcdefgh', name: ME, rating: 1500 },
            { id: 'bad id', name: THEM },
          ],
          items: puzzles(5),
          round: 0,
          phase: 'live',
          phaseIn: 1000,
          liveFor: 500,
          results: { abcdefgh: { ok: true, ms: 1200 }, nobody: { ok: true, ms: 1 } },
          rounds: [],
          scores: { abcdefgh: 0 },
          progress: null,
          places: null,
        },
      },
      null,
    )!;
    expect(first.race).toMatchObject({
      racers: [{ id: 'abcdefgh', name: ME, rating: 1500 }],
      items: puzzles(5),
      results: { abcdefgh: { ok: true, ms: 1200 } },
    });
    expect(first.race!.phaseEnds).not.toBeNull();
    const next = raceRoomStateOf(
      { opts: { format: 'nonsense' }, count: 1, race: { ...first.race, items: undefined } },
      first,
    )!;
    expect(next.opts).toEqual(ROUNDS);
    // No puzzles in the message: the race's own are kept…
    const without = { ...(next.race as object) } as Record<string, unknown>;
    delete without.items;
    expect(raceRoomStateOf({ opts: ROUNDS, count: 1, race: without }, first)!.race!.items).toEqual(
      puzzles(5),
    );
    // …but not for another race.
    expect(
      raceRoomStateOf({ opts: ROUNDS, count: 2, race: { ...without, number: 2 } }, first)!.race!
        .items,
    ).toEqual([]);
    expect(raceRoomStateOf('nothing', null)).toBeNull();
  });
});
