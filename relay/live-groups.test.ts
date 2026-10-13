// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DurableNamespace, DurableSocket, LiveEnv } from './src/live/cloudflare.mjs';
import { LiveLobby } from './src/live/cloudflare.mjs';
import { racePlaces, racePoints, type Race } from './src/live/raceRoom.mjs';
import {
  CLOSE,
  DUEL_RULES,
  GROUP_LIMITS,
  groupOptions,
  LIMITS,
  MEMBER_PATTERN,
  RACE_ROOM,
  randomId,
} from './src/live/shared.mjs';
// The runtime finds the group rooms' class among the Worker's exports.
import worker, { LiveGroup } from './src/worker.mjs';
import { Client, type Message, NAME_A, NAME_B, type World, world } from './testWorld';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const NAMES = [
  NAME_A,
  NAME_B,
  'Quiet Rook',
  'Calm Castle',
  'Daring Fork',
  'Sharp Pin',
  'Witty Rook',
  'Royal Knight',
  'Humble Pawn',
];
const ROUNDS = { format: 'rounds', level: 1500 };
const TIMED = { format: 'timed', level: 1200 };

/** `count` race puzzles, all different. */
const puzzles = (count: number, prefix = 'pz') =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));

const name = (i: number) => NAMES[i];

interface Room {
  id: string;
  token: string;
  host: Client;
  hostId: string;
}

/** A race room made through the waiting room, its host's socket in it. */
async function makeRoom(w: World, opts: object = ROUNDS): Promise<Room> {
  const lobby = new Client((s) => w.hub.openLobby(s));
  await lobby.send({ t: 'create-room', kind: 'race', opts, name: NAME_A, rating: 1500 });
  const made = lobby.last('room-created');
  if (!made) throw new Error(`No room: ${JSON.stringify(lobby.messages)}`);
  const id = made.room as string;
  const host = new Client((s) => w.hub.openGroup(id, s));
  await host.send({ t: 'hello', token: made.token });
  return { id, token: made.token as string, host, hostId: host.last('room')!.you as string };
}

interface Joined {
  client: Client;
  token: string;
  member: string;
}

/** Someone with the link: opens the room, and joins it under `who`. */
async function join(w: World, id: string, who: string): Promise<Joined> {
  const client = new Client((s) => w.hub.openGroup(id, s));
  await client.send({ t: 'hello' });
  await client.send({ t: 'join', name: who, rating: null });
  const joined = client.last('joined');
  if (!joined) throw new Error(`Not joined: ${JSON.stringify(client.messages)}`);
  return { client, token: joined.token as string, member: joined.member as string };
}

/** A room with its host and `others` more members, all here. */
async function roomOf(w: World, others: number, opts: object = ROUNDS) {
  const room = await makeRoom(w, opts);
  const members: Joined[] = [];
  for (let i = 1; i <= others; i++) members.push(await join(w, room.id, name(i)));
  return { ...room, members };
}

const state = (client: Client) =>
  (client.last('race')?.state ?? client.last('room')?.state) as {
    opts: Record<string, unknown>;
    count: number;
    race:
      | (Record<string, unknown> & {
          racers: { id: string; name: string }[];
          scores: Record<string, number>;
          results: Record<string, { ok: boolean; ms: number }>;
          progress: Record<
            string,
            { index: number; solved: number; strikes: number; done: boolean }
          > | null;
          places: { id: string; place: number }[] | null;
          rounds: { round: number; points: Record<string, number> }[];
        })
      | null;
  };

/** Starts a race from the host, and runs the clock through its countdown. */
async function startRace(w: World, room: Room, opts: object = ROUNDS, items = puzzles(5)) {
  await room.host.send({ t: 'start', opts, items });
  await w.advance(DUEL_RULES.countdownMs);
}

describe('the rules of race rooms', () => {
  it('checks a room’s options', () => {
    expect(groupOptions('race', { format: 'rounds', level: 1800, extra: 1 })).toEqual({
      format: 'rounds',
      level: 1800,
    });
    expect(groupOptions('race', { format: 'best3', level: 1800 })).toBeNull();
    expect(groupOptions('race', { format: 'timed', level: 1750 })).toBeNull();
    expect(groupOptions('chess', {})).toBeNull();
  });

  it('scores a round by the order of the clean solves', () => {
    const solve = (ms: number) => ({ ok: true, ms });
    expect(
      racePoints({
        a: solve(9000),
        b: solve(5000),
        c: { ok: false, ms: 1000 },
        d: solve(7000),
        e: solve(12_000),
        f: solve(20_000),
        g: solve(30_000),
      }),
    ).toEqual({ b: 5, d: 4, a: 3, e: 2, f: 1, g: 1 });
    // The same time shares the better points; the next solve is placed after both.
    expect(racePoints({ a: solve(5000), b: solve(5000), c: solve(6000) })).toEqual({
      a: 5,
      b: 5,
      c: 3,
    });
    expect(racePoints({ a: { ok: false, ms: 10 } })).toEqual({});
  });

  it('places the racers, ties sharing a place', () => {
    const race = {
      format: 'rounds',
      racers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      scores: { a: 9, b: 14, c: 9, d: 3 },
      progress: null,
    } as unknown as Race;
    expect(racePlaces(race)).toEqual([
      { id: 'b', place: 1 },
      { id: 'a', place: 2 },
      { id: 'c', place: 2 },
      { id: 'd', place: 4 },
    ]);
    const timed = {
      format: 'timed',
      racers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      scores: {},
      progress: {
        a: { index: 9, solved: 7, strikes: 2, done: true },
        b: { index: 8, solved: 7, strikes: 1, done: false },
        c: { index: 9, solved: 8, strikes: 1, done: true },
      },
    } as unknown as Race;
    expect(racePlaces(timed)).toEqual([
      { id: 'c', place: 1 },
      { id: 'b', place: 2 },
      { id: 'a', place: 3 },
    ]);
  });
});

describe('group rooms', () => {
  it('are made through the waiting room, which hands the maker a member token', async () => {
    const w = world();
    const lobby = new Client((s) => w.hub.openLobby(s));
    await lobby.send({ t: 'create-room', kind: 'race', opts: ROUNDS, name: NAME_A, rating: 1500 });
    const made = lobby.last('room-created')!;
    expect(made).toMatchObject({ kind: 'race', opts: ROUNDS });
    expect(made.room).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.hub.groups()).toBe(1);

    for (const bad of [
      { kind: 'poker', opts: ROUNDS },
      { kind: 'race', opts: { format: 'best3', level: 1500 } },
      { kind: 'race', opts: ROUNDS, name: 'Somebody Else' },
    ]) {
      lobby.clear();
      await lobby.send({ t: 'create-room', name: NAME_A, rating: null, ...bad });
      expect(lobby.last('error')).toMatchObject({ code: 'bad-request' });
    }
    expect(w.hub.groups()).toBe(1);

    // The maker's socket says hello with the token: the host, here.
    const host = new Client((s) => w.hub.openGroup(made.room as string, s));
    await host.send({ t: 'hello', token: made.token });
    const room = host.last('room')!;
    expect(room).toMatchObject({
      id: made.room,
      kind: 'race',
      host: room.you,
      max: GROUP_LIMITS.members,
      members: [{ id: room.you, name: NAME_A, rating: 1500, here: true }],
      chat: [],
      state: { opts: ROUNDS, count: 0, race: null },
    });
    expect(room.you).toMatch(MEMBER_PATTERN);
  });

  it('lets the sockets of one address make only so many rooms an hour', async () => {
    const w = world();
    const one = new Client((s) => w.hub.openLobby(s, '203.0.113.5'));
    const two = new Client((s) => w.hub.openLobby(s, '203.0.113.5'));
    const elsewhere = new Client((s) => w.hub.openLobby(s, '198.51.100.9'));
    const create = { t: 'create-room', kind: 'race', opts: ROUNDS, name: NAME_A, rating: null };
    for (let i = 0; i < GROUP_LIMITS.rooms; i++) await (i % 2 ? one : two).send(create);
    expect(one.all('room-created').length + two.all('room-created').length).toBe(
      GROUP_LIMITS.rooms,
    );
    await one.send(create);
    expect(one.last('error')).toMatchObject({ code: 'busy' });
    await elsewhere.send(create);
    expect(elsewhere.last('room-created')).toBeDefined();
    // An hour later, the address may make more.
    await w.advance(GROUP_LIMITS.roomsWindowMs);
    one.clear();
    await one.send(create);
    expect(one.last('room-created')).toBeDefined();
  });

  it('takes visitors, who see the room and join under their names', async () => {
    const w = world();
    const room = await makeRoom(w);
    const visitor = new Client((s) => w.hub.openGroup(room.id, s));
    await visitor.send({ t: 'hello' });
    expect(visitor.last('room')).toMatchObject({
      you: null,
      host: room.hostId,
      members: [{ name: NAME_A, here: true }],
    });
    // A visitor sends nothing but hello and join.
    await visitor.send({ t: 'say', phrase: 'hello' });
    expect(visitor.last('error')).toMatchObject({ code: 'not-member' });
    await visitor.send({ t: 'join', name: 'Not A Name', rating: null });
    expect(visitor.last('error')).toMatchObject({ code: 'bad-request' });

    await visitor.send({ t: 'join', name: NAME_B, rating: 1640 });
    const joined = visitor.last('joined')!;
    expect(joined.room).toBe(room.id);
    expect(joined.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(visitor.last('room')).toMatchObject({ you: joined.member, host: room.hostId });
    expect(room.host.last('members')).toMatchObject({
      host: room.hostId,
      members: [
        { id: room.hostId, name: NAME_A, here: true },
        { id: joined.member, name: NAME_B, rating: 1640, here: true },
      ],
    });
    // The token reached the joiner alone.
    expect(JSON.stringify(room.host.messages)).not.toContain(joined.token as string);
  });

  it('takes eight members at most; a place given up, or long empty, goes to the next', async () => {
    const w = world();
    const room = await roomOf(w, GROUP_LIMITS.members - 1);
    expect(room.host.last('members')!.members).toHaveLength(GROUP_LIMITS.members);
    const ninth = new Client((s) => w.hub.openGroup(room.id, s));
    await ninth.send({ t: 'hello' });
    await ninth.send({ t: 'join', name: name(8), rating: null });
    expect(ninth.last('error')).toMatchObject({ code: 'full', message: 'This room is full.' });
    expect(ninth.last('joined')).toBeUndefined();

    // One leaves for good: their place is free, and their token no longer works.
    const leaving = room.members[2];
    await leaving.client.send({ t: 'leave' });
    expect(leaving.client.last('left')).toMatchObject({ room: room.id });
    expect(leaving.client.last('room')).toMatchObject({ you: null });
    expect(room.host.last('members')!.members).toHaveLength(GROUP_LIMITS.members - 1);
    await ninth.send({ t: 'join', name: name(8), rating: null });
    expect(ninth.last('joined')).toBeDefined();
    const again = new Client((s) => w.hub.openGroup(room.id, s));
    await again.send({ t: 'hello', token: leaving.token });
    expect(again.last('error')).toMatchObject({ code: 'not-member' });
    expect(again.last('room')).toMatchObject({ you: null });

    // Full again; one member has been gone a while: whoever joins takes that place.
    const gone = room.members[0];
    await gone.client.leave();
    await w.advance(GROUP_LIMITS.awayMs);
    await again.send({ t: 'join', name: name(2), rating: null });
    expect(again.last('joined')).toBeDefined();
    const members = room.host.last('members')!.members as { id: string }[];
    expect(members).toHaveLength(GROUP_LIMITS.members);
    expect(members.map((m) => m.id)).not.toContain(gone.member);
  });

  it('keeps a member’s place across reconnections, and shows who is here', async () => {
    const w = world();
    const room = await roomOf(w, 2);
    const [b, c] = room.members as [Joined, Joined];
    await b.client.leave();
    expect(room.host.last('members')!.members).toEqual([
      expect.objectContaining({ id: room.hostId, here: true }),
      expect.objectContaining({ id: b.member, here: false }),
      expect.objectContaining({ id: c.member, here: true }),
    ]);
    // Back with the token: the same member, here again.
    const back = new Client((s) => w.hub.openGroup(room.id, s));
    await back.send({ t: 'hello', token: b.token });
    expect(back.last('room')).toMatchObject({ you: b.member });
    expect(room.host.last('members')!.members).toContainEqual(
      expect.objectContaining({ id: b.member, here: true }),
    );
    // A second socket of the same member: leaving one keeps them here.
    const tab = new Client((s) => w.hub.openGroup(room.id, s));
    await tab.send({ t: 'hello', token: b.token });
    const told = room.host.all('members').length;
    await tab.leave();
    expect(room.host.all('members')).toHaveLength(told);
  });

  it('hands the room to the member here longest when the host is gone a while', async () => {
    const w = world();
    const room = await roomOf(w, 2);
    const [b, c] = room.members as [Joined, Joined];
    // B goes and comes back: C has now been here longer.
    await b.client.leave();
    await w.advance(1000);
    const b2 = new Client((s) => w.hub.openGroup(room.id, s));
    await b2.send({ t: 'hello', token: b.token });

    // The host steps out and back in time: still the host.
    await room.host.leave();
    await w.advance(GROUP_LIMITS.hostGoneMs - 1000);
    const host2 = new Client((s) => w.hub.openGroup(room.id, s));
    await host2.send({ t: 'hello', token: room.token });
    expect(host2.last('room')).toMatchObject({ you: room.hostId, host: room.hostId });

    // Gone for good: after a while, C takes the room over.
    await host2.leave();
    await w.advance(GROUP_LIMITS.hostGoneMs - 1);
    expect(c.client.last('members')!.host).toBe(room.hostId);
    await w.advance(1);
    expect(c.client.last('members')!.host).toBe(c.member);
    expect(b2.last('members')!.host).toBe(c.member);
    // The old host coming back is a member like the others.
    const host3 = new Client((s) => w.hub.openGroup(room.id, s));
    await host3.send({ t: 'hello', token: room.token });
    expect(host3.last('room')).toMatchObject({ you: room.hostId, host: c.member });

    // A host who leaves for good hands over at once, to B (here longer than the old host).
    await c.client.send({ t: 'leave' });
    expect(host3.last('members')!.host).toBe(b.member);
  });

  it('is deleted a while after everyone has left, and some hours after it was made', async () => {
    const w = world();
    const room = await roomOf(w, 1);
    const visitor = new Client((s) => w.hub.openGroup(room.id, s));
    await visitor.send({ t: 'hello' });
    await room.host.leave();
    await room.members[0].client.leave();
    await w.advance(GROUP_LIMITS.emptyKeepMs - 1000);
    expect(w.hub.groups()).toBe(1);
    // Someone back in time keeps it.
    const back = new Client((s) => w.hub.openGroup(room.id, s));
    await back.send({ t: 'hello', token: room.token });
    await back.leave();
    await w.advance(GROUP_LIMITS.emptyKeepMs - 1);
    expect(w.hub.groups()).toBe(1);
    await w.advance(1);
    expect(w.hub.groups()).toBe(0);
    expect(visitor.closed?.code).toBe(CLOSE.closed);
    // Gone: a socket for it is told so.
    const late = new Client((s) => w.hub.openGroup(room.id, s));
    await late.send({ t: 'hello', token: room.token });
    expect(late.closed?.code).toBe(CLOSE.noGame);

    // Even with people in it, a room lives some hours at most.
    const busy = await roomOf(w, 1);
    await w.advance(GROUP_LIMITS.ageMs);
    expect(busy.host.closed?.code).toBe(CLOSE.closed);
    expect(w.hub.groups()).toBe(0);
  });

  it('passes the set phrases between members, and limits messages as games do', async () => {
    const w = world();
    const room = await roomOf(w, 1);
    const b = room.members[0];
    const visitor = new Client((s) => w.hub.openGroup(room.id, s));
    await visitor.send({ t: 'hello' });
    await b.client.send({ t: 'say', phrase: 'luck' });
    expect(room.host.last('say')).toEqual({ t: 'say', by: b.member, phrase: 'luck' });
    expect(visitor.last('say')).toBeUndefined();
    // Not a phrase, or too soon after the last: nothing.
    await b.client.send({ t: 'say', phrase: 'Anything at all' });
    await b.client.send({ t: 'say', phrase: 'fun' });
    expect(room.host.all('say')).toHaveLength(1);
    await w.advance(LIMITS.phraseMs);
    await b.client.send({ t: 'say', phrase: 'fun' });
    expect(room.host.all('say')).toHaveLength(2);
    // Kept for whoever comes back.
    await room.host.send({ t: 'hello' });
    expect(room.host.last('room')!.chat).toEqual([
      { by: b.member, phrase: 'luck' },
      { by: b.member, phrase: 'fun' },
    ]);

    await b.client.send({ t: 'dance' });
    expect(b.client.last('error')).toMatchObject({ code: 'bad-request' });
    // An ordinary message is small: a member's big one closes their socket…
    await b.client.send({ t: 'say', phrase: 'x'.repeat(LIMITS.messageBytes) });
    expect(b.client.closed?.code).toBe(CLOSE.tooBig);
    // …and one who never says hello is let go.
    const silent = new Client((s) => w.hub.openGroup(room.id, s));
    await w.advance(LIMITS.helloMs);
    expect(silent.closed?.code).toBe(CLOSE.noHello);
    const rude = new Client((s) => w.hub.openGroup(room.id, s));
    await rude.send({ t: 'join', name: NAME_B, rating: null });
    expect(rude.closed?.code).toBe(CLOSE.noGame);
  });
});

describe('race rooms', () => {
  it('start when the host deals, with at least two here, the puzzles checked', async () => {
    const w = world();
    const room = await makeRoom(w);
    await room.host.send({ t: 'start', items: puzzles(5) });
    expect(room.host.last('error')).toMatchObject({
      code: 'not-now',
      message: 'A race takes at least two players here.',
    });
    const b = await join(w, room.id, NAME_B);
    await b.client.send({ t: 'start', items: puzzles(5) });
    expect(b.client.last('error')).toMatchObject({ code: 'not-host' });
    await room.host.send({ t: 'start', items: puzzles(4) });
    expect(room.host.last('error')).toMatchObject({ code: 'bad-request' });
    const illegal = puzzles(5).map((p, i) => (i === 3 ? { ...p, moves: 'e2e5 e7e5' } : p));
    await room.host.send({ t: 'start', items: illegal });
    expect(room.host.last('error')).toMatchObject({ code: 'bad-request' });
    // The host may change the options before the race; everyone sees them.
    await room.host.send({ t: 'options', opts: { format: 'rounds', level: 1800 } });
    expect(state(b.client).opts).toEqual({ format: 'rounds', level: 1800 });
    await b.client.send({ t: 'options', opts: TIMED });
    expect(b.client.last('error')).toMatchObject({ code: 'not-host' });

    const visitor = new Client((s) => w.hub.openGroup(room.id, s));
    await visitor.send({ t: 'hello' });
    await room.host.send({ t: 'start', items: puzzles(5) });
    for (const client of [room.host, b.client, visitor]) {
      const s = client.last('race')!.state as ReturnType<typeof state>;
      expect(s.count).toBe(1);
      expect(s.race).toMatchObject({
        number: 1,
        format: 'rounds',
        level: 1800,
        status: 'playing',
        items: puzzles(5),
        round: 0,
        phase: 'countdown',
        phaseIn: DUEL_RULES.countdownMs,
        racers: [
          { id: room.hostId, name: NAME_A },
          { id: b.member, name: NAME_B },
        ],
        scores: { [room.hostId]: 0, [b.member]: 0 },
      });
    }
    await room.host.send({ t: 'start', items: puzzles(5) });
    expect(room.host.last('error')).toMatchObject({ code: 'not-now' });
    // The race's next messages carry no puzzles.
    await w.advance(DUEL_RULES.countdownMs);
    expect(state(b.client).race).toMatchObject({ phase: 'live', phaseIn: DUEL_RULES.race.roundMs });
    expect(b.client.last('race')!.state).not.toHaveProperty('race.items');
  });

  it('scores each round by the order of clean solves, and ends it once everyone here is in', async () => {
    const w = world();
    const room = await roomOf(w, 3);
    const [b, c, d] = room.members as [Joined, Joined, Joined];
    await startRace(w, room);
    await c.client.send({ t: 'result', round: 0, ok: true, ms: 7000 });
    await room.host.send({ t: 'result', round: 0, ok: true, ms: 9000 });
    await d.client.send({ t: 'result', round: 0, ok: false, ms: 3000 });
    // Standings go to everyone as they change.
    expect(state(b.client).race!.results).toEqual({
      [c.member]: { ok: true, ms: 7000 },
      [room.hostId]: { ok: true, ms: 9000 },
      [d.member]: { ok: false, ms: 3000 },
    });
    expect(state(b.client).race!.phase).toBe('live');
    // A report once in stands; one for another round is refused.
    await c.client.send({ t: 'result', round: 0, ok: true, ms: 100 });
    await b.client.send({ t: 'result', round: 1, ok: true, ms: 100 });
    expect(b.client.last('error')).toMatchObject({ code: 'not-now' });
    // The last one in ends the round at once.
    await b.client.send({ t: 'result', round: 0, ok: true, ms: 5000 });
    const s = state(room.host).race!;
    expect(s.phase).toBe('reveal');
    expect(s.rounds).toEqual([
      expect.objectContaining({
        round: 0,
        points: { [b.member]: 5, [c.member]: 4, [room.hostId]: 3 },
      }),
    ]);
    expect(s.scores).toEqual({ [room.hostId]: 3, [b.member]: 5, [c.member]: 4, [d.member]: 0 });

    // The next round, after the result and a countdown.
    await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs);
    expect(state(room.host).race).toMatchObject({ round: 1, phase: 'live', results: {} });
  });

  it('ends a round at its limit, waits for nobody who left, and places everyone at the end', async () => {
    const w = world();
    const room = await roomOf(w, 2);
    const [b, c] = room.members as [Joined, Joined];
    await startRace(w, room);
    // Round 1: B solves; nobody else reports: the round runs to its limit.
    await b.client.send({ t: 'result', round: 0, ok: true, ms: 4000 });
    await w.advance(DUEL_RULES.race.roundMs - 1);
    expect(state(room.host).race!.phase).toBe('live');
    await w.advance(1);
    expect(state(room.host).race).toMatchObject({ phase: 'reveal', scores: { [b.member]: 5 } });

    // Round 2: C leaves; once the two left are in, the round ends without C.
    await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs);
    await c.client.leave();
    await room.host.send({ t: 'result', round: 1, ok: true, ms: 3000 });
    await b.client.send({ t: 'result', round: 1, ok: true, ms: 6000 });
    expect(state(room.host).race).toMatchObject({
      phase: 'reveal',
      scores: { [room.hostId]: 5, [b.member]: 9, [c.member]: 0 },
    });

    // Round 3: B reports, then the host goes: nobody else here is waited for.
    await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs);
    await b.client.send({ t: 'result', round: 2, ok: true, ms: 8000 });
    expect(state(b.client).race!.phase).toBe('live');
    await room.host.leave();
    expect(state(b.client).race!.phase).toBe('reveal');

    // Rounds 4 and 5 run to their limits; then the places.
    for (let round = 3; round < RACE_ROOM.rounds; round++) {
      await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs + DUEL_RULES.race.roundMs);
    }
    const end = state(b.client).race!;
    expect(end).toMatchObject({ status: 'over', phase: null });
    expect(end.rounds).toHaveLength(RACE_ROOM.rounds);
    expect(end.places).toEqual([
      { id: b.member, place: 1 },
      { id: room.hostId, place: 2 },
      { id: c.member, place: 3 },
    ]);
    await b.client.send({ t: 'result', round: 4, ok: true, ms: 1 });
    expect(b.client.last('error')).toMatchObject({ code: 'not-now' });
  });

  it('runs the three-minute race: each at their own pace, three wrong answers out', async () => {
    const w = world();
    const room = await roomOf(w, 2, TIMED);
    const [b, c] = room.members as [Joined, Joined];
    // Fewer than twenty puzzles is not a timed race.
    await room.host.send({ t: 'start', opts: TIMED, items: puzzles(5) });
    expect(room.host.last('error')).toMatchObject({ code: 'bad-request' });
    await startRace(w, room, TIMED, puzzles(DUEL_RULES.race.timedMax));
    expect(state(b.client).race).toMatchObject({
      format: 'timed',
      phase: 'live',
      phaseIn: DUEL_RULES.race.timedMs,
    });
    // The host: two solved. B: three wrong, out. C: one solved.
    await room.host.send({ t: 'result', index: 0, ok: true, ms: 4000 });
    await room.host.send({ t: 'result', index: 1, ok: true, ms: 5000 });
    for (let i = 0; i < DUEL_RULES.race.strikes; i++) {
      await b.client.send({ t: 'result', index: i, ok: false, ms: 2000 });
    }
    await c.client.send({ t: 'result', index: 0, ok: true, ms: 6000 });
    // A puzzle reported out of turn is refused.
    await c.client.send({ t: 'result', index: 5, ok: true, ms: 1 });
    expect(c.client.last('error')).toMatchObject({ code: 'not-now' });
    const progress = state(room.host).race!.progress!;
    expect(progress[room.hostId]).toEqual({ index: 2, solved: 2, strikes: 0, done: false });
    expect(progress[b.member]).toEqual({ index: 3, solved: 0, strikes: 3, done: true });
    expect(progress[c.member]).toMatchObject({ solved: 1 });
    await b.client.send({ t: 'result', index: 3, ok: true, ms: 1 });
    expect(state(room.host).race!.progress![b.member].solved).toBe(0);

    // Three minutes (and the last reports' grace) end it.
    await w.advance(DUEL_RULES.race.timedMs);
    expect(state(room.host).race!.status).toBe('playing');
    await w.advance(2000);
    expect(state(room.host).race).toMatchObject({
      status: 'over',
      places: [
        { id: room.hostId, place: 1 },
        { id: c.member, place: 2 },
        { id: b.member, place: 3 },
      ],
    });
  });

  it('ends the three-minute race early once everyone here is through', async () => {
    const w = world();
    const room = await roomOf(w, 1, TIMED);
    const b = room.members[0];
    await startRace(w, room, TIMED, puzzles(DUEL_RULES.race.timedMin));
    for (let i = 0; i < DUEL_RULES.race.strikes; i++) {
      await room.host.send({ t: 'result', index: i, ok: false, ms: 1000 });
      await b.client.send({ t: 'result', index: i, ok: i > 0, ms: 1000 });
    }
    expect(state(room.host).race!.status).toBe('playing');
    await b.client.leave();
    // B is not here: the host, through, ends it.
    expect(state(room.host).race).toMatchObject({
      status: 'over',
      places: [
        { id: b.member, place: 1 },
        { id: room.hostId, place: 2 },
      ],
    });
  });

  it('lets a late joiner watch the race and race the next one, which the host starts again', async () => {
    const w = world();
    const room = await roomOf(w, 1);
    const b = room.members[0];
    await startRace(w, room);
    const late = await join(w, room.id, 'Quiet Rook');
    expect(state(late.client).race).toMatchObject({ status: 'playing', items: puzzles(5) });
    await late.client.send({ t: 'result', round: 0, ok: true, ms: 1000 });
    expect(late.client.last('error')).toMatchObject({
      message: 'You are watching this race: you race in the next one.',
    });
    expect(state(late.client).race!.racers.map((r) => r.id)).toEqual([room.hostId, b.member]);

    for (let round = 0; round < RACE_ROOM.rounds; round++) {
      await room.host.send({ t: 'result', round, ok: true, ms: 2000 });
      await b.client.send({ t: 'result', round, ok: true, ms: 3000 });
      await w.advance(DUEL_RULES.revealMs + DUEL_RULES.countdownMs);
    }
    const over = state(late.client);
    expect(over.race).toMatchObject({
      status: 'over',
      scores: { [room.hostId]: 25, [b.member]: 20 },
    });

    // Again, as a three-minute race, with new puzzles: everyone here races, the late joiner too.
    await room.host.send({ t: 'start', opts: TIMED, items: puzzles(20, 'nx') });
    const again = state(late.client);
    expect(again.count).toBe(2);
    expect(again.opts).toEqual(TIMED);
    expect(again.race).toMatchObject({
      number: 2,
      format: 'timed',
      status: 'playing',
      places: null,
      racers: [{ id: room.hostId }, { id: b.member }, { id: late.member }],
    });
    expect(again.race!.progress![late.member]).toEqual({
      index: 0,
      solved: 0,
      strikes: 0,
      done: false,
    });
  });
});

/* ------------------------------------------------------------------ */
/* On Cloudflare, against stand-ins for the runtime                   */
/* ------------------------------------------------------------------ */

class FakeSocket implements DurableSocket {
  readyState = 1;
  sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  private attachment: unknown = null;

  send(message: string) {
    if (this.readyState !== 1 || this.closedWith) throw new Error('The socket is closed.');
    this.sent.push(message);
  }

  close(code?: number, reason?: string) {
    this.closedWith = { code, reason };
  }

  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.attachment);
  }

  last(t: string): Message | undefined {
    return this.sent
      .map((text) => JSON.parse(text) as Message)
      .filter((m) => m.t === t)
      .at(-1);
  }
}

class FakeState {
  values = new Map<string, unknown>();
  alarm: number | null = null;
  sockets: FakeSocket[] = [];
  storage = {
    get: (key: string) => Promise.resolve(structuredClone(this.values.get(key))),
    put: (key: string, value: unknown) => {
      this.values.set(key, structuredClone(value));
      return Promise.resolve();
    },
    deleteAll: () => {
      this.values.clear();
      return Promise.resolve();
    },
    setAlarm: (at: number) => {
      this.alarm = at;
      return Promise.resolve();
    },
    deleteAlarm: () => {
      this.alarm = null;
      return Promise.resolve();
    },
  };

  acceptWebSocket(ws: DurableSocket) {
    this.sockets.push(ws as FakeSocket);
  }

  getWebSockets() {
    return this.sockets.filter((ws) => ws.readyState !== 3);
  }

  /** The runtime's own answer to pings: not needed here. */
  autoResponse: unknown = null;

  setWebSocketAutoResponse(pair?: unknown) {
    this.autoResponse = pair;
  }
}

describe('group rooms on Cloudflare', () => {
  const T0 = Date.UTC(2026, 9, 11, 12);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes a room through the waiting room, keeps it through hibernation, then deletes it', async () => {
    const groups = new Map<string, FakeState>();
    const env: LiveEnv = {};
    const stateOf = (id: string) => {
      let s = groups.get(id);
      if (!s) {
        s = new FakeState();
        groups.set(id, s);
      }
      return s;
    };
    env.LIVE_GROUPS = {
      idFromName: (id) => id,
      get: (id) => ({
        fetch: (input, init) =>
          new LiveGroup(stateOf(id as string), env).fetch(new Request(input, init)),
      }),
    };
    const lobby = new LiveLobby(new FakeState(), env);
    const maker = new FakeSocket();
    lobby.accept(maker, '203.0.113.1');
    const create = { t: 'create-room', kind: 'race', opts: ROUNDS, name: NAME_A, rating: null };
    await lobby.webSocketMessage(maker, JSON.stringify(create));
    const made = maker.last('room-created')!;
    const state = stateOf(made.room as string);
    const stored = state.values.get('group') as { members: { tokenHash: string }[] };
    expect(stored).toMatchObject({ kind: 'race', members: [{ name: NAME_A }] });
    // Only the token's hash is kept.
    expect(JSON.stringify(stored)).not.toContain(made.token as string);
    // Nobody here yet: the room goes if nobody comes.
    expect(state.alarm).toBe(T0 + GROUP_LIMITS.emptyKeepMs);

    const host = new FakeSocket();
    await new LiveGroup(state, env).accept(host);
    await new LiveGroup(state, env).webSocketMessage(
      host,
      JSON.stringify({ t: 'hello', token: made.token }),
    );
    expect(host.deserializeAttachment()).toMatchObject({ member: host.last('room')!.you });
    expect(state.alarm).toBe(T0 + GROUP_LIMITS.ageMs);
    // Made twice: 409.
    const again = await new LiveGroup(state, env).fetch(
      new Request('https://live.internal/create', { method: 'POST', body: '{}' }),
    );
    expect(again.status).toBe(409);

    // The host goes; ten minutes later the alarm deletes the room.
    host.readyState = 3;
    await new LiveGroup(state, env).webSocketClose(host, 1000);
    expect(state.alarm).toBe(T0 + GROUP_LIMITS.emptyKeepMs);
    vi.setSystemTime(T0 + GROUP_LIMITS.emptyKeepMs);
    await new LiveGroup(state, env).alarm();
    expect(state.values.size).toBe(0);
    expect(state.alarm).toBeNull();
  });

  it('passes sockets for a room from the app’s origin to its object', async () => {
    const handed: { binding: string; name: string }[] = [];
    const namespace = (binding: string): DurableNamespace => ({
      idFromName: (name) => name,
      get: (id) => ({
        fetch: () => {
          handed.push({ binding, name: id as string });
          return Promise.resolve(new Response('Handed over.'));
        },
      }),
    });
    const ORIGIN = 'https://app.test';
    const env = {
      ALLOWED_ORIGINS: ORIGIN,
      LIVE_LOBBY: namespace('LIVE_LOBBY'),
      LIVE_ROOMS: namespace('LIVE_ROOMS'),
      LIVE_GROUPS: namespace('LIVE_GROUPS'),
    };
    const id = randomId(16);
    const socket = (path: string, headers: Record<string, string> = {}) =>
      new Request(`https://relay.test${path}`, {
        headers: { Origin: ORIGIN, Upgrade: 'websocket', ...headers },
      });
    expect(await (await worker.fetch(socket(`/v1/rooms/${id}`), env)).text()).toBe('Handed over.');
    expect(handed).toEqual([{ binding: 'LIVE_GROUPS', name: id }]);
    const status = async (request: Request, bindings: Record<string, unknown> = env) =>
      (await worker.fetch(request, bindings)).status;
    expect(await status(socket(`/v1/rooms/${id}`, { Origin: 'https://elsewhere.test' }))).toBe(403);
    expect(await status(socket('/v1/rooms/not-a-room'))).toBe(404);
    const { LIVE_GROUPS: _groups, ...withoutGroups } = env;
    expect(await status(socket(`/v1/rooms/${id}`), withoutGroups)).toBe(404);
    expect(handed).toHaveLength(1);
  });
});
