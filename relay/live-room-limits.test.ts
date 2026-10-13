// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './src/handler.mjs';
import {
  type DurableSocket,
  type DurableState,
  type DurableStorage,
  LiveGroup,
  LiveRoom,
} from './src/live/cloudflare.mjs';
import { createRoom, roomData, type RoomConn, type RoomData } from './src/live/room.mjs';
import {
  ABUSE_LIMITS,
  CLOSE,
  DUEL_RULES,
  GROUP_LIMITS,
  LIMITS,
  randomId,
} from './src/live/shared.mjs';
import {
  Client,
  type Message,
  NAME_A,
  NAME_B,
  paired,
  pairedWith,
  play,
  type World,
  world,
} from './testWorld';

/**
 * The live rooms against abuse: each storage write and each alarm set is a
 * row written, which the free plan counts per day for every room together, so
 * a refusal or a message that changes nothing must write nothing; the sockets
 * one seat, one address and one room may hold; refusals counted per socket;
 * rematches in a row; sockets for rooms that are not there; and writes the
 * platform refuses.
 */

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RACE = { game: 'race', opts: { format: 'best3', level: 1500 } };

/** `count` race puzzles, all different. */
const puzzles = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `pz${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));

/** A group room of `kind` made through the waiting room, its maker's socket in it. */
async function makeRoom(w: World, kind: 'race' | 'analysis', opts: object) {
  const lobby = new Client((s) => w.hub.openLobby(s));
  await lobby.send({ t: 'create-room', kind, opts, name: NAME_A, rating: 1500 });
  const made = lobby.last('room-created');
  if (!made) throw new Error(`No room: ${JSON.stringify(lobby.messages)}`);
  const id = made.room as string;
  const token = made.token as string;
  const host = new Client((s) => w.hub.openGroup(id, s));
  await host.send({ t: 'hello', token });
  return { id, token, host };
}

/** Someone with the link: opens the room and joins it. */
async function joinRoom(w: World, id: string, who = NAME_B) {
  const client = new Client((s) => w.hub.openGroup(id, s));
  await client.send({ t: 'hello' });
  await client.send({ t: 'join', name: who, rating: null });
  if (!client.last('joined')) throw new Error(`Not joined: ${JSON.stringify(client.messages)}`);
  return client;
}

const ANALYSIS = { variant: 'standard', fen: START, moves: 'e2e4 e7e5', result: '*' };

/** A socket refused while every socket yet to say hello has only just connected. */
const AT_ONCE = 'Too many connections at once: try again in a moment.';

describe('a game room writes only what changed', () => {
  it('writes nothing for refused moves and offers, and an offer made again only once, later', async () => {
    const w = world();
    const { game, white, black } = await paired(w);
    let before = w.writes(game);
    await black.send({ t: 'move', uci: 'e7e5', ply: 0 });
    await white.send({ t: 'move', uci: 'e2e5', ply: 0 });
    await white.send({ t: 'draw', op: 'offer' });
    await white.send({ t: 'dance' });
    await white.send({ t: 'say', phrase: 'Anything at all' });
    expect(white.all('error').map((e) => e.code)).toEqual(['illegal', 'not-now', 'bad-request']);
    expect(w.writes(game)).toEqual(before);

    // Moves are written at once, with their new deadlines.
    await play({ white, black }, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    before = w.writes(game);
    // Offers are light changes: offered again, taken back and asked twice, they wait together.
    await white.send({ t: 'draw', op: 'offer' });
    await white.send({ t: 'draw', op: 'offer' });
    await white.send({ t: 'takeback', op: 'offer' });
    await white.send({ t: 'takeback', op: 'offer' });
    await black.send({ t: 'draw', op: 'decline' });
    await black.send({ t: 'draw', op: 'decline' });
    expect(w.writes(game)).toEqual(before);
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(game)).toEqual({ ...before, store: before.store + 1 });

    // Over: a rematch offered twice is written once, with the next light changes.
    await white.send({ t: 'resign' });
    before = w.writes(game);
    await black.send({ t: 'rematch', op: 'offer' });
    await black.send({ t: 'rematch', op: 'offer' });
    await white.send({ t: 'move', uci: 'f1c4', ply: 4 });
    expect(white.last('error')).toMatchObject({ code: 'over' });
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(game)).toEqual({ ...before, store: before.store + 1 });
  });

  it('writes nothing for a duel’s refused rounds, and the rounds once they are taken', async () => {
    const w = world();
    const { game, white, black } = await pairedWith(w, RACE);
    const before = w.writes(game);
    await black.send({ t: 'content', items: puzzles(5) });
    await white.send({ t: 'content', items: puzzles(4) });
    await white.send({
      t: 'content',
      items: [...puzzles(4), { ...puzzles(1)[0], fen: 'nonsense' }],
    });
    await white.send({ t: 'result', round: 0, ok: true, ms: 10 });
    expect(white.all('error').map((e) => e.code)).toEqual([
      'bad-request',
      'bad-request',
      'not-now',
    ]);
    expect(w.writes(game)).toEqual(before);
    await white.send({ t: 'content', items: puzzles(5) });
    // The rounds, and the countdown's deadline.
    expect(w.writes(game)).toEqual({
      ...before,
      store: before.store + 1,
      schedule: before.schedule + 1,
    });
  });

  it('leaves the timer where it was, and a flag still falls on time', async () => {
    const w = world();
    const { game, white, black } = await paired(w, '1+0');
    await play({ white, black }, ['e2e4', 'e7e5']);
    const before = w.writes(game);
    await w.advance(30_000);
    await black.send({ t: 'move', uci: 'd7d5', ply: 2 });
    await white.send({ t: 'move', uci: 'e4e6', ply: 2 });
    await white.send({ t: 'hello' });
    expect(w.writes(game)).toEqual(before);
    await w.advance(30_000 - 1);
    expect(black.last('end')).toBeUndefined();
    await w.advance(1);
    expect(black.last('end')).toMatchObject({ result: '0-1', reason: 'time' });
  });

  it('writes nothing for a socket that connects and says hello, as a player or a watcher', async () => {
    const w = world();
    const { game, seats } = await paired(w);
    const before = w.writes(game);
    const again = new Client((s) => w.hub.openRoom(game, s));
    await again.send({ t: 'hello', seat: seats.white });
    const watcher = new Client((s) => w.hub.openRoom(game, s));
    await watcher.send({ t: 'hello', watch: true });
    await w.advance(LIMITS.helloMs + ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(game)).toEqual(before);
    expect([again, watcher].every((c) => c.closed === null)).toBe(true);
  });
});

describe('a group room writes only what changed', () => {
  it('writes nothing for an analysis room’s refusals, or a step to where it is', async () => {
    const w = world();
    const { id, host } = await makeRoom(w, 'analysis', ANALYSIS);
    const before = w.writes(id);
    // Where the shared position is already, a line that is the main line already.
    await host.send({ t: 'at', node: 0 });
    await host.send({ t: 'promote', node: 2 });
    // Not legal, not there, not a move to delete.
    await host.send({ t: 'move', node: 0, uci: 'e2e5' });
    await host.send({ t: 'move', node: 99, uci: 'e2e4' });
    await host.send({ t: 'delete', node: 0 });
    await host.send({ t: 'shapes', node: 1, shapes: [{ orig: 'z9', brush: 'green' }] });
    expect(host.all('error').map((e) => e.code)).toEqual([
      'illegal',
      'bad-request',
      'bad-request',
      'bad-request',
    ]);
    expect(w.writes(id)).toEqual(before);
    // A step is written once; the same step again is nothing.
    await host.send({ t: 'move', node: 0, uci: 'e2e4' });
    await host.send({ t: 'move', node: 0, uci: 'e2e4' });
    await host.send({ t: 'at', node: 1 });
    expect(w.writes(id)).toEqual({ ...before, store: before.store + 1 });
  });

  it('writes nothing for a race room’s refusals', async () => {
    const w = world();
    const { id, host } = await makeRoom(w, 'race', { format: 'rounds', level: 1500 });
    const guest = await joinRoom(w, id);
    const before = w.writes(id);
    await guest.send({ t: 'options', opts: { format: 'timed', level: 1200 } });
    await guest.send({ t: 'start', opts: { format: 'rounds', level: 1500 }, items: puzzles(5) });
    await host.send({ t: 'start', opts: { format: 'rounds', level: 1500 }, items: puzzles(4) });
    await host.send({ t: 'result', round: 0, ok: true, ms: 10 });
    await host.send({ t: 'options', opts: { format: 'rounds', level: 1234 } });
    expect(w.writes(id)).toEqual(before);
    await host.send({ t: 'start', opts: { format: 'rounds', level: 1500 }, items: puzzles(5) });
    expect(w.writes(id)).toEqual({
      ...before,
      store: before.store + 1,
      schedule: before.schedule + 1,
    });
  });
});

describe('the sockets a room takes', () => {
  it('takes six on one seat: a seventh is refused, and the player and their tabs stay', async () => {
    const w = world();
    const { game, white, black, seats } = await paired(w);
    const tabs = [];
    for (let i = 1; i < ABUSE_LIMITS.socketsPerSeat; i++) {
      const tab = new Client((s) => w.hub.openRoom(game, s));
      await tab.send({ t: 'hello', seat: seats.white });
      tabs.push(tab);
    }
    expect(tabs.every((tab) => tab.last('game')?.you === 'white')).toBe(true);
    const before = w.writes(game);
    const seventh = new Client((s) => w.hub.openRoom(game, s));
    await seventh.send({ t: 'hello', seat: seats.white });
    // Closed as one past a full room is, with no message: its app tries again later.
    expect(seventh.closed).toEqual({
      code: CLOSE.full,
      reason: 'This game is open in too many tabs or windows.',
    });
    expect(seventh.messages).toEqual([]);
    // Nothing written, and no timer set.
    expect(w.writes(game)).toEqual(before);
    expect([white, ...tabs].every((tab) => tab.closed === null)).toBe(true);
    expect(black.all('present').every((p) => p.white === true)).toBe(true);
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(black.last('move')).toMatchObject({ uci: 'e2e4' });
    // One tab goes: the next gets in.
    await tabs[0].leave();
    const next = new Client((s) => w.hub.openRoom(game, s));
    await next.send({ t: 'hello', seat: seats.white });
    expect(next.last('game')).toMatchObject({ you: 'white', moves: ['e2e4'] });
  });

  it('takes six on one member’s token in a group room', async () => {
    const w = world();
    const { id, token, host } = await makeRoom(w, 'race', { format: 'rounds', level: 1500 });
    for (let i = 1; i < ABUSE_LIMITS.socketsPerSeat; i++) {
      await new Client((s) => w.hub.openGroup(id, s)).send({ t: 'hello', token });
    }
    const seventh = new Client((s) => w.hub.openGroup(id, s));
    await seventh.send({ t: 'hello', token });
    expect(seventh.closed).toEqual({
      code: CLOSE.full,
      reason: 'This room is open in too many tabs or windows.',
    });
    expect(seventh.messages).toEqual([]);
    expect(host.closed).toBeNull();
    expect(host.last('room')).toMatchObject({ members: [{ name: NAME_A, here: true }] });
  });

  it('keeps four sockets yet to say hello from one address: a fifth sends its own oldest away', async () => {
    const w = world();
    const { game, white, black } = await paired(w);
    const from = (address: string) => new Client((s) => w.hub.openRoom(game, s, address));
    const four = Array.from({ length: ABUSE_LIMITS.unsaidPerAddress }, () => from('203.0.113.5'));
    const other = from('198.51.100.1');
    await w.advance(0);
    const before = w.writes(game);
    const fifth = from('203.0.113.5');
    await w.advance(0);
    expect(four[0].closed).toEqual({ code: CLOSE.noHello, reason: 'Say which seat first.' });
    expect([...four.slice(1), fifth, other, white, black].every((c) => c.closed === null)).toBe(
      true,
    );
    expect(w.writes(game)).toEqual(before);

    const room = await makeRoom(w, 'analysis', ANALYSIS);
    const quiet = Array.from(
      { length: ABUSE_LIMITS.unsaidPerAddress + 1 },
      () => new Client((s) => w.hub.openGroup(room.id, s, '203.0.113.5')),
    );
    await w.advance(0);
    expect(quiet.map((c) => c.closed)).toEqual([
      { code: CLOSE.noHello, reason: 'Say hello first.' },
      ...Array.from({ length: ABUSE_LIMITS.unsaidPerAddress }, () => null),
    ]);
  });

  it('keeps twenty in a room: the address holding the most makes way, unless the new one’s holds as many', async () => {
    const w = world();
    const { game } = await paired(w);
    const from = (address: string) => new Client((s) => w.hub.openRoom(game, s, address));
    // Four addresses hold four each, and four more one each: twenty.
    const crowd: Client[] = [];
    for (let a = 0; a < 4; a++) {
      for (let i = 0; i < ABUSE_LIMITS.unsaidPerAddress; i++) crowd.push(from(`203.0.113.${a}`));
    }
    const singles = Array.from({ length: 4 }, (_, i) => from(`198.51.100.${i}`));
    await w.advance(0);
    expect([...crowd, ...singles].every((c) => c.closed === null)).toBe(true);
    // Someone from elsewhere: the oldest of the address holding four that came last goes.
    const newcomer = from('192.0.2.1');
    await w.advance(0);
    expect(newcomer.closed).toBeNull();
    expect(crowd.map((c) => c.closed?.code ?? null)).toEqual([
      ...Array.from({ length: 12 }, () => null),
      CLOSE.noHello,
      null,
      null,
      null,
    ]);
    // From an address holding one, as do the few at the most: refused, to try again later.
    const other = await paired(w);
    const to = (address: string) => new Client((s) => w.hub.openRoom(other.game, s, address));
    const twenty = Array.from({ length: ABUSE_LIMITS.unsaid }, (_, i) => to(`203.0.113.${i}`));
    await w.advance(0);
    const again = to('203.0.113.3');
    await w.advance(0);
    expect(again.closed).toEqual({ code: CLOSE.full, reason: AT_ONCE });
    expect(twenty.every((c) => c.closed === null)).toBe(true);
    // From an address holding none: in, and the one heard from last makes way.
    const fresh = to('192.0.2.1');
    await w.advance(0);
    expect(fresh.closed).toBeNull();
    expect(twenty.filter((c) => c.closed !== null)).toEqual([twenty[ABUSE_LIMITS.unsaid - 1]]);
  });

  it('spares a socket just connected from a burst of silent ones, each from its own address', async () => {
    const w = world();
    const { game, white, black, seats } = await paired(w);
    await play({ white, black }, ['e2e4', 'e7e5']);
    await white.leave();
    // White's socket is on its way back, its hello not here yet, when twenty others come at once.
    const back = new Client((s) => w.hub.openRoom(game, s, '192.0.2.50'));
    await w.advance(500);
    const burst = Array.from(
      { length: ABUSE_LIMITS.unsaid },
      (_, i) => new Client((s) => w.hub.openRoom(game, s, `203.0.113.${i}`)),
    );
    await w.advance(0);
    expect(back.closed).toBeNull();
    // The room keeps twenty waiting: one of the burst made way (the address heard from last).
    expect(burst.filter((c) => c.closed !== null).map((c) => c.closed)).toEqual([
      { code: CLOSE.noHello, reason: 'Say which seat first.' },
    ]);
    await back.send({ t: 'hello', seat: seats.white });
    expect(back.last('game')).toMatchObject({ you: 'white', moves: ['e2e4', 'e7e5'] });
    expect(black.last('present')).toMatchObject({ white: true });
  });

  it('lets a player into their game whatever silent sockets flood it, and lets them move first', async () => {
    const w = world();
    const p = await pairedWith(w, { tc: '5+3', color: 'white' }, { seat: false });
    // Silent sockets from six addresses, each replaced every tenth of a second.
    const flood: Client[] = [];
    const open = (i: number) => new Client((s) => w.hub.openRoom(p.game, s, `203.0.113.${i % 6}`));
    for (let i = 0; i < 30; i++) flood.push(open(i));
    await w.advance(0);
    let refused = 0;
    for (let t = 0; t < 5000; t += 100) {
      await flood.shift()!.leave();
      flood.push(open(t / 100));
      if (t % 1000 === 0) {
        // White's app tries; more of the flood comes before its hello.
        const mine = new Client((s) => w.hub.openRoom(p.game, s, '198.51.100.20'));
        for (let i = 0; i < 6; i++) flood.push(open(100 + i));
        await mine.send({ t: 'hello', seat: p.seats.white });
        if (mine.closed !== null || !mine.last('game')) refused += 1;
        await mine.leave();
      }
      await w.advance(100);
    }
    expect(refused).toBe(0);
    const white = new Client((s) => w.hub.openRoom(p.game, s, '198.51.100.20'));
    await white.send({ t: 'hello', seat: p.seats.white });
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(white.last('move')).toMatchObject({ uci: 'e2e4' });
  });

  it('lets a player who dropped back in at once, so nobody may claim against them', async () => {
    const w = world();
    const { game, white, black, seats } = await paired(w);
    await play({ white, black }, ['e2e4', 'e7e5']);
    await black.leave();
    const flood: Client[] = [];
    const open = (i: number) => new Client((s) => w.hub.openRoom(game, s, `203.0.113.${i % 6}`));
    for (let i = 0; i < 30; i++) flood.push(open(i));
    await w.advance(0);
    const back = new Client((s) => w.hub.openRoom(game, s, '198.51.100.20'));
    for (let i = 0; i < 6; i++) flood.push(open(100 + i));
    await back.send({ t: 'hello', seat: seats.black });
    expect(back.closed).toBeNull();
    expect(white.last('present')).toMatchObject({ black: true, gone: null });
    for (let t = 0; t < LIMITS.goneClaimMs + 1000; t += 100) {
      await flood.shift()!.leave();
      flood.push(open(t / 100));
      await w.advance(100);
    }
    await white.send({ t: 'claim', op: 'win' });
    expect(white.last('error')).toMatchObject({ code: 'not-now' });
    expect(white.last('end')).toBeUndefined();
  });

  it('lets a member back into their room past every visitor and a flood of silent sockets', async () => {
    const w = world();
    const { id, token, host } = await makeRoom(w, 'analysis', ANALYSIS);
    for (let i = 0; i < GROUP_LIMITS.visitors; i++) {
      const c = new Client((s) => w.hub.openGroup(id, s, `198.51.100.${i}`));
      await c.send({ t: 'hello' });
    }
    Array.from(
      { length: 30 },
      (_, i) => new Client((s) => w.hub.openGroup(id, s, `203.0.113.${i % 6}`)),
    );
    await w.advance(0);
    await host.leave();
    const back = new Client((s) => w.hub.openGroup(id, s, '192.0.2.50'));
    await back.send({ t: 'hello', token });
    expect(back.closed).toBeNull();
    expect(back.last('room')).toMatchObject({ members: [{ name: NAME_A, here: true }] });
  });

  it('does not hear a socket refused as it opened, whose hello was on its way', async () => {
    const w = world();
    const { game, white, black, seats } = await paired(w);
    await play({ white, black }, ['e2e4', 'e7e5']);
    const B = '198.51.100.9';
    for (let i = 0; i < ABUSE_LIMITS.roomSocketsPerAddress; i++) {
      await new Client((s) => w.hub.openRoom(game, s, B)).send({ t: 'hello', watch: true });
    }
    await black.leave();
    white.clear();
    // Black tries from the address with all its sockets: refused, its hello is not heard.
    const refused = new Client((s) => w.hub.openRoom(game, s, B));
    await refused.send({ t: 'hello', seat: seats.black });
    expect(refused.closed?.code).toBe(CLOSE.full);
    expect(refused.all('game')).toEqual([]);
    expect(white.all('present')).toEqual([]);
    // Black's time gone runs on from when they left: White may claim.
    await w.advance(LIMITS.goneClaimMs);
    await white.send({ t: 'claim', op: 'win' });
    expect(white.last('end')).toMatchObject({ result: '1-0', reason: 'abandoned' });
  });

  it('takes twelve from one address in one room, an IPv6 address counted by its /64', async () => {
    const w = world();
    const { game } = await paired(w);
    const from = async (address: string) => {
      const c = new Client((s) => w.hub.openRoom(game, s, address));
      await c.send({ t: 'hello', watch: true });
      return c;
    };
    const twelve = [];
    for (let i = 0; i < ABUSE_LIMITS.roomSocketsPerAddress; i++)
      twelve.push(await from('203.0.113.5'));
    const thirteenth = await from('203.0.113.5');
    const elsewhere = await from('198.51.100.1');
    expect(twelve.every((c) => c.closed === null)).toBe(true);
    expect(thirteenth.closed).toEqual({
      code: CLOSE.full,
      reason: 'Too many connections to this game from one address.',
    });
    expect(elsewhere.closed).toBeNull();

    // Addresses of one /64, or its key as the Node server passes it on, are one address.
    const other = await paired(w);
    const to = async (address: string) => {
      const c = new Client((s) => w.hub.openRoom(other.game, s, address));
      await c.send({ t: 'hello', watch: true });
      return c;
    };
    const block = [];
    for (let i = 1; i < ABUSE_LIMITS.roomSocketsPerAddress; i++) {
      block.push(await to(`2001:db8:1:2::${i}`));
    }
    const key = await to('2001:db8:1:2::/64');
    const over = await to('2001:db8:1:2:ffff::9');
    expect([...block, key].every((c) => c.closed === null)).toBe(true);
    expect(over.closed?.code).toBe(CLOSE.full);
  });

  it('takes twelve from one address in a group room', async () => {
    const w = world();
    const { id } = await makeRoom(w, 'analysis', ANALYSIS);
    const same = [];
    for (let i = 0; i <= ABUSE_LIMITS.roomSocketsPerAddress; i++) {
      const c = new Client((s) => w.hub.openGroup(id, s, '203.0.113.5'));
      await c.send({ t: 'hello' });
      same.push(c);
    }
    expect(same.filter((c) => c.closed !== null).map((c) => c.closed)).toEqual([
      { code: CLOSE.full, reason: 'Too many connections to this room from one address.' },
    ]);
    expect(same.at(-1)!.closed).not.toBeNull();
  });
});

describe('refused messages', () => {
  it('closes a player’s socket refused too often in a minute; another may come', async () => {
    const w = world();
    const { game, white, seats } = await paired(w);
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) {
      await white.send({ t: 'move', uci: 'e2e5', ply: 0 });
    }
    expect(white.all('error')).toHaveLength(ABUSE_LIMITS.refusals);
    expect(white.closed).toBeNull();
    await white.send({ t: 'move', uci: 'e2e5', ply: 0 });
    expect(white.last('error')).toEqual({
      t: 'error',
      code: 'rate',
      message: 'Too many refused messages: wait a moment.',
    });
    expect(white.closed).toEqual({ code: CLOSE.policy, reason: 'Too many refused messages.' });

    // The player comes back; a minute later the count starts again.
    const back = new Client((s) => w.hub.openRoom(game, s));
    await back.send({ t: 'hello', seat: seats.white });
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) await back.send({ t: 'peek' });
    w.jump(ABUSE_LIMITS.refusalWindowMs);
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) await back.send({ t: 'peek' });
    expect(back.closed).toBeNull();
    await back.send({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(back.last('move')).toMatchObject({ uci: 'e2e4' });
  });

  it('counts a watcher’s, a duel’s and a group room’s refusals too', async () => {
    const w = world();
    const { game } = await paired(w);
    const watcher = new Client((s) => w.hub.openRoom(game, s));
    await watcher.send({ t: 'hello', watch: true });
    for (let i = 0; i <= ABUSE_LIMITS.refusals; i++) await watcher.send({ t: 'resign' });
    expect(watcher.closed?.code).toBe(CLOSE.policy);

    const duel = await pairedWith(w, RACE);
    for (let i = 0; i <= ABUSE_LIMITS.refusals; i++) {
      await duel.black.send({ t: 'content', items: puzzles(5) });
    }
    expect(duel.black.closed?.code).toBe(CLOSE.policy);
    expect(duel.white.closed).toBeNull();

    const { host } = await makeRoom(w, 'analysis', ANALYSIS);
    for (let i = 0; i <= ABUSE_LIMITS.refusals; i++) {
      await host.send({ t: 'move', node: 0, uci: 'a1a8' });
    }
    expect(host.all('error').filter((e) => e.code === 'illegal')).toHaveLength(
      ABUSE_LIMITS.refusals,
    );
    expect(host.closed?.code).toBe(CLOSE.policy);
  });
});

describe('rematches in a row', () => {
  it('refuses a rematch once enough have led to the game, and says to start from Play', async () => {
    const w = world();
    let { white, black } = await paired(w);
    for (let i = 0; i < ABUSE_LIMITS.rematches; i++) {
      await white.send({ t: 'abort' });
      await white.send({ t: 'rematch', op: 'offer' });
      await black.send({ t: 'rematch', op: 'accept' });
      const mine = white.last('rematch') as Message;
      const theirs = black.last('rematch') as Message;
      const next = mine.game as string;
      const a = new Client((s) => w.hub.openRoom(next, s));
      const b = new Client((s) => w.hub.openRoom(next, s));
      await a.send({ t: 'hello', seat: mine.seat });
      await b.send({ t: 'hello', seat: theirs.seat });
      [white, black] = mine.color === 'white' ? [a, b] : [b, a];
    }
    await white.send({ t: 'abort' });
    await white.send({ t: 'rematch', op: 'offer' });
    expect(white.last('error')).toEqual({
      t: 'error',
      code: 'limit',
      message: `No more rematches after ${ABUSE_LIMITS.rematches} in a row: start a new game from Play.`,
    });
    // The offer never stood: the other player heard nothing of it.
    expect(black.last('offers')).toBeUndefined();
    await black.send({ t: 'rematch', op: 'accept' });
    expect(black.last('error')).toMatchObject({ code: 'limit' });
    expect(black.last('rematch')).toBeUndefined();
  });
});

describe('light changes', () => {
  it('writes a run of phrases once a window, the last of them by the room’s timer', async () => {
    const w = world();
    const { game, white, black } = await paired(w);
    const before = w.writes(game);
    await white.send({ t: 'say', phrase: 'hello' });
    await w.advance(LIMITS.phraseMs);
    await black.send({ t: 'say', phrase: 'luck' });
    await w.advance(LIMITS.phraseMs);
    await white.send({ t: 'say', phrase: 'fun' });
    expect(w.writes(game)).toEqual(before);
    // A window after the first: one write for the three.
    await w.advance(ABUSE_LIMITS.lightWriteMs - 2 * LIMITS.phraseMs - 1);
    expect(w.writes(game)).toEqual(before);
    await w.advance(1);
    expect(w.writes(game)).toEqual({ ...before, store: before.store + 1 });
    // The next run: one more, a window after its own first.
    await black.send({ t: 'say', phrase: 'game' });
    await w.advance(LIMITS.phraseMs);
    await white.send({ t: 'say', phrase: 'thanks' });
    await w.advance(ABUSE_LIMITS.lightWriteMs - LIMITS.phraseMs);
    expect(w.writes(game)).toEqual({ ...before, store: before.store + 2 });
    expect(black.last('game')).toBeDefined();
  });

  it('writes a move right after a phrase once, with both', async () => {
    const w = world();
    const { game, white } = await paired(w);
    // A second on, so that the move moves the deadline (Black's first move).
    await w.advance(1000);
    const before = w.writes(game);
    await white.send({ t: 'say', phrase: 'luck' });
    await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    const once = { ...before, store: before.store + 1, schedule: before.schedule + 1 };
    expect(w.writes(game)).toEqual(once);
    // Nothing is left for the room's timer to write.
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(game)).toEqual(once);
  });

  it('writes steps through an analysis and its drawings once a window, and a move at once with them', async () => {
    const w = world();
    const { id, host } = await makeRoom(w, 'analysis', ANALYSIS);
    const before = w.writes(id);
    for (const node of [1, 2, 1, 0, 2]) await host.send({ t: 'at', node });
    await host.send({ t: 'shapes', node: 2, shapes: [{ orig: 'e2', dest: 'e4', brush: 'green' }] });
    expect(w.writes(id)).toEqual(before);
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(id)).toEqual({ ...before, store: before.store + 1 });
    await host.send({ t: 'at', node: 1 });
    await host.send({ t: 'move', node: 2, uci: 'g1f3' });
    expect(w.writes(id)).toEqual({ ...before, store: before.store + 2 });
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(id)).toEqual({ ...before, store: before.store + 2 });
  });

  it('writes who is here within a window, and a room left empty at once', async () => {
    const w = world();
    const { id, host } = await makeRoom(w, 'race', { format: 'rounds', level: 1500 });
    const guest = await joinRoom(w, id);
    const before = w.writes(id);
    await guest.leave();
    expect(w.writes(id)).toEqual(before);
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(id)).toEqual({ ...before, store: before.store + 1 });
    // The last one goes: the room's end moves, and is written with it at once.
    await host.leave();
    expect(w.writes(id)).toEqual({
      ...before,
      store: before.store + 2,
      schedule: before.schedule + 1,
    });
  });

  it('writes a light change still waiting when the alarm comes, with what the alarm does', async () => {
    const w = world();
    const { game, white, black } = await paired(w, '1+0');
    await play({ white, black }, ['e2e4', 'e7e5']);
    await w.advance(60_000 - 1000);
    const before = w.writes(game);
    await black.send({ t: 'say', phrase: 'luck' });
    await w.advance(1000);
    expect(black.last('end')).toMatchObject({ reason: 'time' });
    const once = { ...before, store: before.store + 1, schedule: before.schedule + 1 };
    expect(w.writes(game)).toEqual(once);
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(game)).toEqual(once);
  });

  it('writes nothing light once the room is deleted', async () => {
    const w = world();
    const { game, white, black } = await paired(w);
    await white.send({ t: 'abort' });
    await w.advance(LIMITS.keepAfterEndMs - 1000);
    await black.send({ t: 'say', phrase: 'game' });
    await w.advance(1000);
    expect(w.hub.games()).toBe(0);
    const removed = w.writes(game);
    expect(removed.remove).toBe(1);
    await w.advance(ABUSE_LIMITS.lightWriteMs);
    expect(w.writes(game)).toEqual(removed);
    expect(w.hub.games()).toBe(0);
  });
});

describe('a duel called off before it started', () => {
  const judgeItems = () =>
    Array.from({ length: DUEL_RULES.judge.rounds }, (_, ply) => ({
      fen: START,
      cp: 150,
      game: 'opera-game',
      ply,
    }));

  /** A duel's room on its own, its platform stand-ins noting whom it tells the waiting room of. */
  async function duel() {
    let time = 1_000_000;
    let stored: unknown = null;
    const sockets: { data: RoomData; open: boolean }[] = [];
    const blamed: string[] = [];
    const conn = (s: { data: RoomData; open: boolean }): RoomConn => ({
      data: s.data,
      send: () => undefined,
      close: () => {
        s.open = false;
      },
      save: () => undefined,
    });
    const room = createRoom({
      connections: () => sockets.filter((s) => s.open).map(conn),
      load: () => Promise.resolve(stored as never),
      store: (state) => {
        stored = structuredClone(state);
        return Promise.resolve();
      },
      remove: () => {
        stored = null;
        return Promise.resolve();
      },
      schedule: () => undefined,
      createGame: () => Promise.resolve(),
      now: () => time,
      noShow: (key) => {
        blamed.push(key);
        return Promise.resolve();
      },
    });
    const seats = { white: randomId(32), black: randomId(32) };
    await room.create({
      id: randomId(16),
      game: 'judge',
      opts: {},
      tc: null,
      white: { name: NAME_A, rating: null, seatHash: await hashToken(seats.white), key: 'host' },
      black: { name: NAME_B, rating: null, seatHash: await hashToken(seats.black), key: 'guest' },
    });
    /** A player's socket in the room; the host (White) may send its rounds. */
    const come = async (color: 'white' | 'black', rounds = false) => {
      const socket = { data: roomData(time), open: true };
      sockets.push(socket);
      await room.open(conn(socket));
      await room.message(conn(socket), JSON.stringify({ t: 'hello', seat: seats[color] }));
      if (rounds) {
        await room.message(conn(socket), JSON.stringify({ t: 'content', items: judgeItems() }));
      }
      return socket;
    };
    const go = async (socket: { data: RoomData; open: boolean }) => {
      socket.open = false;
      await room.close(conn(socket));
    };
    /** The setup's time runs out: whom the room says never came. */
    const due = async () => {
      time += DUEL_RULES.setupMs;
      await room.timer();
      return blamed;
    };
    return { come, go, due };
  }

  it('blames the host, White, whose rounds never came, whoever else was there', async () => {
    const both = await duel();
    await both.come('white');
    await both.come('black');
    expect(await both.due()).toEqual(['host']);
    const alone = await duel();
    await alone.come('black');
    expect(await alone.due()).toEqual(['host']);
    const nobody = await duel();
    expect(await nobody.due()).toEqual(['host']);
    // The host there and silent; the guest came, waited for rounds that never came, and went.
    const silent = await duel();
    await silent.come('white');
    await silent.go(await silent.come('black'));
    expect(await silent.due()).toEqual(['host']);
  });

  it('blames the guest who never came once the rounds were in, the host there or gone', async () => {
    const waiting = await duel();
    await waiting.come('white', true);
    expect(await waiting.due()).toEqual(['guest']);
    const gone = await duel();
    await gone.go(await gone.come('white', true));
    expect(await gone.due()).toEqual(['guest']);
  });

  it('blames the host who sent the rounds and went, when the guest is there', async () => {
    const d = await duel();
    await d.go(await d.come('white', true));
    await d.come('black');
    expect(await d.due()).toEqual(['host']);
  });
});

describe('a room that is not there', () => {
  it('closes a socket for a game or a group room at once, and writes nothing for it', async () => {
    const w = world();
    const game = randomId(16);
    const room = randomId(16);
    const toGame = new Client((s) => w.hub.openRoom(game, s));
    const toRoom = new Client((s) => w.hub.openGroup(room, s));
    await w.advance(0);
    expect(toGame.closed).toEqual({ code: CLOSE.noGame, reason: 'No such game.' });
    expect(toRoom.closed).toEqual({ code: CLOSE.noGame, reason: 'No such room.' });
    expect(w.writes(game)).toEqual({ store: 0, schedule: 0, remove: 0 });
    expect(w.writes(room)).toEqual({ store: 0, schedule: 0, remove: 0 });
    expect(w.hub.games()).toBe(0);
    expect(w.hub.groups()).toBe(0);
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
    if (this.closedWith) throw new Error('The socket is closed.');
    this.sent.push(message);
  }

  close(code?: number, reason?: string) {
    if (this.closedWith) throw new Error('The socket is closed already.');
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

/**
 * Storage that counts what is written, and refuses it all while `full` (a day's rows used up),
 * or only the operations in `refusing`.
 */
class CountingStorage implements DurableStorage {
  values = new Map<string, unknown>();
  alarm: number | null = null;
  puts = 0;
  alarms = 0;
  full = false;
  refusing = new Set<'put' | 'setAlarm' | 'deleteAll' | 'deleteAlarm'>();

  private refuse(op: 'put' | 'setAlarm' | 'deleteAll' | 'deleteAlarm') {
    if (this.full || this.refusing.has(op)) {
      throw new Error('Exceeded allowed rows written in Durable Objects free tier.');
    }
  }

  get(key: string) {
    return Promise.resolve(structuredClone(this.values.get(key)));
  }

  put(key: string, value: unknown) {
    this.refuse('put');
    this.puts += 1;
    this.values.set(key, structuredClone(value));
    return Promise.resolve();
  }

  deleteAll() {
    this.refuse('deleteAll');
    this.values.clear();
    return Promise.resolve();
  }

  setAlarm(at: number) {
    this.refuse('setAlarm');
    this.alarms += 1;
    this.alarm = at;
    return Promise.resolve();
  }

  deleteAlarm() {
    this.refuse('deleteAlarm');
    this.alarm = null;
    return Promise.resolve();
  }

  getAlarm() {
    return Promise.resolve(this.alarm);
  }
}

class FakeState implements DurableState {
  storage = new CountingStorage();
  sockets: FakeSocket[] = [];

  acceptWebSocket(ws: DurableSocket) {
    this.sockets.push(ws as FakeSocket);
  }

  getWebSockets() {
    return this.sockets.filter((ws) => ws.readyState !== 3);
  }

  autoResponse: unknown = undefined;

  setWebSocketAutoResponse(pair?: unknown) {
    this.autoResponse = pair;
  }
}

describe('rooms on Cloudflare', () => {
  const T0 = Date.UTC(2026, 9, 12, 12);
  const at = (ms: number) => vi.setSystemTime(T0 + ms);
  beforeEach(() => {
    // The rooms' timers in memory too: they fire only when a test moves the clock on.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A game made in a fresh object, with its two seats' tokens. */
  async function gameRoom(over: Record<string, unknown> = {}) {
    const state = new FakeState();
    const room = new LiveRoom(state, {});
    const seats = { white: randomId(32), black: randomId(32) };
    const spec = {
      id: randomId(16),
      tc: '5+3',
      white: { name: NAME_A, rating: null, seatHash: await hashToken(seats.white) },
      black: { name: NAME_B, rating: null, seatHash: await hashToken(seats.black) },
      ...over,
    };
    const made = await room.fetch(
      new Request('https://live.internal/create', { method: 'POST', body: JSON.stringify(spec) }),
    );
    return { state, room, seats, made };
  }

  async function seated(room: LiveRoom, seat: string, address = '') {
    const ws = new FakeSocket();
    await room.accept(ws, address);
    await room.webSocketMessage(ws, JSON.stringify({ t: 'hello', seat }));
    return ws;
  }

  const say = (room: LiveRoom, ws: FakeSocket, message: Message) =>
    room.webSocketMessage(ws, JSON.stringify(message));

  it('writes and sets nothing for refusals on an object woken from hibernation', async () => {
    const { state, room, seats } = await gameRoom();
    const white = await seated(room, seats.white);
    const black = await seated(room, seats.black);
    await say(room, white, { t: 'move', uci: 'e2e4', ply: 0 });
    await say(room, black, { t: 'move', uci: 'e7e5', ply: 1 });
    await say(room, white, { t: 'draw', op: 'offer' });
    const { puts, alarms, alarm } = state.storage;
    // A new instance reads the alarm rather than setting it again; the same offer writes nothing.
    const woken = new LiveRoom(state, {});
    await say(woken, white, { t: 'draw', op: 'offer' });
    await say(woken, black, { t: 'move', uci: 'd7d5', ply: 2 });
    await say(woken, white, { t: 'move', uci: 'e4e6', ply: 2 });
    expect(white.last('error')).toMatchObject({ code: 'illegal' });
    expect(state.storage).toMatchObject({ puts, alarms, alarm });
    // A move writes the game and its next deadline.
    at(1000);
    await say(woken, white, { t: 'move', uci: 'g1f3', ply: 2 });
    expect(state.storage).toMatchObject({ puts: puts + 1, alarms: alarms + 1 });
    // Black's clock runs: its flag is the deadline now.
    expect(state.storage.alarm).toBe(T0 + 1000 + 300_000);
  });

  it('closes a socket for a game that is not there, with no alarm and no write', async () => {
    const state = new FakeState();
    const room = new LiveRoom(state, {});
    const ws = new FakeSocket();
    await room.accept(ws, '203.0.113.7');
    expect(ws.closedWith).toEqual({ code: CLOSE.noGame, reason: 'No such game.' });
    const group = new FakeState();
    const socket = new FakeSocket();
    await new LiveGroup(group, {}).accept(socket);
    expect(socket.closedWith).toEqual({ code: CLOSE.noGame, reason: 'No such room.' });
    for (const s of [state, group]) {
      expect(s.storage).toMatchObject({ puts: 0, alarms: 0, alarm: null });
      expect(s.storage.values.size).toBe(0);
    }
  });

  it('counts a socket’s refusals through hibernation, and its address from the request', async () => {
    const { state, room, seats } = await gameRoom();
    const white = await seated(room, seats.white, '2001:db8:aa:bb::1');
    expect(white.deserializeAttachment()).toMatchObject({ address: '2001:db8:aa:bb::/64' });
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) {
      await say(new LiveRoom(state, {}), white, { t: 'claim', op: 'win' });
    }
    expect(white.closedWith).toBeNull();
    await say(new LiveRoom(state, {}), white, { t: 'claim', op: 'win' });
    expect(white.closedWith).toEqual({ code: CLOSE.policy, reason: 'Too many refused messages.' });
  });

  it('refuses a duel’s rematch after enough in a row', async () => {
    const { room, seats, made } = await gameRoom({
      game: 'race',
      opts: RACE.opts,
      tc: null,
      rematches: ABUSE_LIMITS.rematches,
    });
    expect(made.status).toBe(201);
    const white = await seated(room, seats.white);
    await say(room, white, { t: 'abort' });
    expect(white.last('end')).toMatchObject({ reason: 'aborted' });
    await say(room, white, { t: 'rematch', op: 'offer' });
    expect(white.last('error')).toMatchObject({ code: 'limit' });
  });

  it('goes on in memory when a write is refused, and writes it with the next save', async () => {
    const { state, room, seats } = await gameRoom();
    const white = await seated(room, seats.white);
    const black = await seated(room, seats.black);
    state.storage.full = true;
    await say(room, white, { t: 'move', uci: 'e2e4', ply: 0 });
    expect(black.last('move')).toMatchObject({ uci: 'e2e4' });
    expect(state.storage.values.get('game')).toMatchObject({ moves: [] });
    state.storage.full = false;
    await say(room, black, { t: 'move', uci: 'e7e5', ply: 1 });
    expect(state.storage.values.get('game')).toMatchObject({ moves: ['e2e4', 'e7e5'] });
    expect(state.storage.alarm).toBe(T0 + 300_000);
  });

  it('fails an alarm whose save is refused, for the runtime to run again, and keeps what was stored', async () => {
    const { state, room, seats } = await gameRoom();
    await seated(room, seats.white);
    at(LIMITS.firstMoveMs);
    state.storage.full = true;
    await expect(room.alarm()).rejects.toThrow();
    expect(state.storage.values.get('game')).toMatchObject({ status: 'playing' });
    state.storage.full = false;
    await room.alarm();
    expect(state.storage.values.get('game')).toMatchObject({ status: 'over', reason: 'no-start' });
    expect(state.storage.alarm).toBe(T0 + LIMITS.firstMoveMs + LIMITS.keepAfterEndMs);

    // Deleting it fails too: the game stays until the alarm comes again.
    at(LIMITS.firstMoveMs + LIMITS.keepAfterEndMs);
    state.storage.full = true;
    await expect(new LiveRoom(state, {}).alarm()).rejects.toThrow();
    expect(state.storage.values.size).toBe(1);
    state.storage.full = false;
    await new LiveRoom(state, {}).alarm();
    expect(state.storage.values.size).toBe(0);
    expect(state.storage.alarm).toBeNull();
  });

  it('makes a game whose first write was refused when asked again', async () => {
    const state = new FakeState();
    const room = new LiveRoom(state, {});
    const spec = {
      id: randomId(16),
      tc: '5+3',
      white: { name: NAME_A, rating: null, seatHash: 'a'.repeat(64) },
      black: { name: NAME_B, rating: null, seatHash: 'b'.repeat(64) },
    };
    const create = () =>
      room.fetch(
        new Request('https://live.internal/create', {
          method: 'POST',
          body: JSON.stringify(spec),
        }),
      );
    state.storage.full = true;
    expect((await create()).status).toBe(400);
    state.storage.full = false;
    expect((await create()).status).toBe(201);
    expect(state.storage.values.get('game')).toMatchObject({ id: spec.id });
  });

  it('sets a group room’s alarm only when its deadline moves', async () => {
    const state = new FakeState();
    const group = new LiveGroup(state, {});
    const token = randomId(32);
    const spec = {
      id: randomId(16),
      kind: 'race',
      opts: { format: 'rounds', level: 1500 },
      host: { name: NAME_A, rating: null, tokenHash: await hashToken(token) },
    };
    await group.fetch(
      new Request('https://live.internal/create', { method: 'POST', body: JSON.stringify(spec) }),
    );
    const host = new FakeSocket();
    await group.accept(host);
    await group.webSocketMessage(host, JSON.stringify({ t: 'hello', token }));
    const { puts, alarms } = state.storage;
    const woken = new LiveGroup(state, {});
    await woken.webSocketMessage(host, JSON.stringify({ t: 'start', items: puzzles(5) }));
    await woken.webSocketMessage(host, JSON.stringify({ t: 'say', phrase: 'nope' }));
    expect(host.last('error')).toMatchObject({ code: 'not-now' });
    expect(state.storage).toMatchObject({ puts, alarms });
    expect(state.storage.alarm).toBe(T0 + GROUP_LIMITS.ageMs);
  });

  const createIn = (target: { fetch(request: Request): Promise<Response> }, spec: object) =>
    target.fetch(
      new Request('https://live.internal/create', { method: 'POST', body: JSON.stringify(spec) }),
    );

  const gameSpec = () => ({
    id: randomId(16),
    tc: '5+3',
    white: { name: NAME_A, rating: null, seatHash: 'a'.repeat(64) },
    black: { name: NAME_B, rating: null, seatHash: 'b'.repeat(64) },
  });

  it('writes nothing when a socket connects and says hello, on an object just woken too', async () => {
    const { state, room, seats } = await gameRoom();
    const { puts, alarms } = state.storage;
    await seated(room, seats.white);
    await seated(room, seats.black);
    const woken = new LiveRoom(state, {});
    const tab = await seated(woken, seats.white);
    const watcher = new FakeSocket();
    await woken.accept(watcher);
    await say(woken, watcher, { t: 'hello', watch: true });
    expect(tab.last('game')).toMatchObject({ you: 'white' });
    expect(watcher.last('game')).toMatchObject({ you: null });
    await vi.advanceTimersByTimeAsync(LIMITS.helloMs + ABUSE_LIMITS.lightWriteMs);
    expect(state.storage).toMatchObject({ puts, alarms, alarm: T0 + LIMITS.firstMoveMs });
  });

  it('closes a socket that says nothing in time by its timer in memory, setting no alarm', async () => {
    const { state, room, seats } = await gameRoom();
    const silent = new FakeSocket();
    await room.accept(silent);
    expect(state.storage).toMatchObject({ alarms: 1, alarm: T0 + LIMITS.firstMoveMs });
    await vi.advanceTimersByTimeAsync(LIMITS.helloMs - 1);
    expect(silent.closedWith).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(silent.closedWith).toEqual({ code: CLOSE.noHello, reason: 'Say which seat first.' });
    expect(state.storage.alarms).toBe(1);

    // An object evicted before its timer fired closes such a socket at its next event.
    const late = new FakeSocket();
    await room.accept(late);
    at(LIMITS.helloMs * 3);
    await seated(new LiveRoom(state, {}), seats.white);
    expect(late.closedWith?.code).toBe(CLOSE.noHello);
  });

  it('writes the last light change by its timer, and a move after a phrase once with both', async () => {
    const { state, room, seats } = await gameRoom();
    const white = await seated(room, seats.white);
    const black = await seated(room, seats.black);
    const puts = state.storage.puts;
    await say(room, white, { t: 'say', phrase: 'luck' });
    expect(state.storage.puts).toBe(puts);
    await vi.advanceTimersByTimeAsync(ABUSE_LIMITS.lightWriteMs);
    expect(state.storage.puts).toBe(puts + 1);
    expect(state.storage.values.get('game')).toMatchObject({
      chat: [{ by: 'white', phrase: 'luck' }],
    });
    await say(room, black, { t: 'say', phrase: 'fun' });
    await say(room, white, { t: 'move', uci: 'e2e4', ply: 0 });
    expect(state.storage.puts).toBe(puts + 2);
    expect(state.storage.values.get('game')).toMatchObject({
      moves: ['e2e4'],
      chat: [
        { by: 'white', phrase: 'luck' },
        { by: 'black', phrase: 'fun' },
      ],
    });
    await vi.advanceTimersByTimeAsync(ABUSE_LIMITS.lightWriteMs);
    expect(state.storage.puts).toBe(puts + 2);
  });

  it('undoes a game or a group room whose first alarm cannot be set: it was not made', async () => {
    const state = new FakeState();
    const room = new LiveRoom(state, {});
    const spec = gameSpec();
    state.storage.refusing.add('setAlarm');
    expect((await createIn(room, spec)).status).toBe(400);
    expect(state.storage.values.size).toBe(0);
    expect(state.storage.alarm).toBeNull();
    state.storage.refusing.clear();
    expect((await createIn(room, spec)).status).toBe(201);
    expect(state.storage.alarm).toBe(T0 + LIMITS.firstMoveMs);

    const groupState = new FakeState();
    const group = new LiveGroup(groupState, {});
    const groupSpec = { id: randomId(16), kind: 'analysis', opts: ANALYSIS, host: null };
    groupState.storage.refusing.add('setAlarm');
    expect((await createIn(group, groupSpec)).status).toBe(400);
    expect(groupState.storage.values.size).toBe(0);
    groupState.storage.refusing.clear();
    expect((await createIn(group, groupSpec)).status).toBe(201);
    expect(groupState.storage.alarm).toBe(T0 + GROUP_LIMITS.emptyKeepMs);
  });

  it('sets the alarm of a room it could not undo when its next socket comes', async () => {
    const state = new FakeState();
    const room = new LiveRoom(state, {});
    state.storage.refusing.add('setAlarm').add('deleteAll');
    expect((await createIn(room, gameSpec())).status).toBe(400);
    // Left in storage with no alarm: the next socket, once alarms can be set again, sets one.
    expect(state.storage.values.size).toBe(1);
    state.storage.refusing.clear();
    const ws = new FakeSocket();
    await room.accept(ws);
    expect(ws.closedWith).toBeNull();
    expect(state.storage.alarm).toBe(T0 + LIMITS.firstMoveMs);
  });

  it('leaves a light change it could not write to the next event, keeping no timer for it', async () => {
    const { state, room, seats } = await gameRoom();
    const white = await seated(room, seats.white);
    await seated(room, seats.black);
    state.storage.full = true;
    await say(room, white, { t: 'say', phrase: 'luck' });
    await vi.advanceTimersByTimeAsync(ABUSE_LIMITS.lightWriteMs);
    // Refused: no timer is left to keep the room awake, trying again until the day is over.
    expect(vi.getTimerCount()).toBe(0);
    expect(state.storage.values.get('game')).toMatchObject({ chat: [] });
    state.storage.full = false;
    await say(room, white, { t: 'move', uci: 'e2e4', ply: 0 });
    expect(state.storage.values.get('game')).toMatchObject({
      moves: ['e2e4'],
      chat: [{ by: 'white', phrase: 'luck' }],
    });

    // A group room's the same.
    const groupState = new FakeState();
    const group = new LiveGroup(groupState, {});
    const token = randomId(32);
    await createIn(group, {
      id: randomId(16),
      kind: 'analysis',
      opts: ANALYSIS,
      host: { name: NAME_A, rating: null, tokenHash: await hashToken(token) },
    });
    const host = new FakeSocket();
    await group.accept(host);
    await group.webSocketMessage(host, JSON.stringify({ t: 'hello', token }));
    groupState.storage.full = true;
    await group.webSocketMessage(host, JSON.stringify({ t: 'at', node: 2 }));
    await vi.advanceTimersByTimeAsync(ABUSE_LIMITS.lightWriteMs);
    expect(vi.getTimerCount()).toBe(0);
  });
});
