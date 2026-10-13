// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelay } from './src/handler.mjs';
import {
  type DurableSocket,
  type DurableState,
  type DurableStorage,
  type LiveEnv,
  LiveLobby,
} from './src/live/cloudflare.mjs';
import { BROADCAST_MS } from './src/live/lobby.mjs';
import {
  ABUSE_LIMITS,
  CLOSE,
  GROUP_LIMITS,
  LIMITS,
  randomId,
  seekIdOf,
} from './src/live/shared.mjs';
import { memoryStore } from './src/memoryStore.mjs';
import { attachLive, nodeServer } from './src/server.mjs';
import { Client, type Message, NAME_A, NAME_B, seek, type World, world } from './testWorld';

/**
 * The waiting room's limits against abuse (lobby.mjs): what one address may
 * make and keep waiting, counted where reconnecting starts nothing over; the
 * seeks' secrets; the list sent at most twice a second; the refused messages
 * a socket may send.
 */

const X = '203.0.113.7';
const Y = '198.51.100.20';
const Z = '192.0.2.44';

/** A socket in the waiting room of `w`, from `address` (none: not known). */
const lobbyAt = (w: World, address = '') => new Client((s) => w.hub.openLobby(s, address));

const invitation = (over: Partial<Message> = {}): Message => ({
  t: 'create',
  game: 'chess',
  tc: '3d',
  color: 'white',
  name: NAME_A,
  rating: null,
  ...over,
});

const RACE_ROOM: Message = {
  t: 'create-room',
  kind: 'race',
  opts: { format: 'rounds', level: 1500 },
  name: NAME_A,
  rating: null,
};

/** The id of the seek `client` last posted. */
const postedId = (client: Client) => (client.last('posted')!.seek as { id: string }).id;

/* ------------------------------------------------------------------ */
/* Stand-ins for the Durable Object runtime                           */
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
    if (this.readyState !== 1 || this.closedWith) throw new Error('The socket is closed already.');
    this.closedWith = { code, reason };
  }

  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.attachment);
  }

  all(t: string): Message[] {
    return this.sent
      .filter((text) => text !== 'pong')
      .map((text) => JSON.parse(text) as Message)
      .filter((m) => m.t === t);
  }

  last(t: string): Message | undefined {
    return this.all(t).at(-1);
  }

  /** The client goes (or the object restarts): the runtime lists it no more. */
  leave() {
    this.readyState = 3;
  }
}

class FakeStorage implements DurableStorage {
  values = new Map<string, unknown>();
  /** Writes so far: on Cloudflare, rows written. */
  puts = 0;

  get(key: string) {
    return Promise.resolve(structuredClone(this.values.get(key)));
  }

  put(key: string, value: unknown) {
    this.puts += 1;
    this.values.set(key, structuredClone(value));
    return Promise.resolve();
  }

  deleteAll() {
    this.values.clear();
    return Promise.resolve();
  }

  setAlarm() {
    return Promise.resolve();
  }

  deleteAlarm() {
    return Promise.resolve();
  }
}

class FakeState implements DurableState {
  storage = new FakeStorage();
  sockets: FakeSocket[] = [];

  acceptWebSocket(ws: DurableSocket) {
    this.sockets.push(ws as FakeSocket);
  }

  getWebSockets() {
    return this.sockets.filter((ws) => ws.readyState !== 3);
  }

  setWebSocketAutoResponse() {
    // The runtime's own answer to pings: not needed here.
  }
}

/** A waiting room on Cloudflare whose game and group rooms take whatever they are sent. */
function cloudflareLobby(more: Partial<LiveEnv> = {}) {
  const taking = {
    idFromName: (name: string) => name,
    get: () => ({ fetch: () => Promise.resolve(new Response(null, { status: 201 })) }),
  };
  const env: LiveEnv = { LIVE_ROOMS: taking, LIVE_GROUPS: taking, ...more };
  const state = new FakeState();
  return { env, state, storage: state.storage, lobby: new LiveLobby(state, env) };
}

/** A socket from `address` in `lobby`. */
function socketIn(lobby: LiveLobby, address = '') {
  const ws = new FakeSocket();
  lobby.accept(ws, address);
  return ws;
}

const say = (lobby: LiveLobby, ws: FakeSocket, message: Message) =>
  lobby.webSocketMessage(ws, JSON.stringify(message));

/* ------------------------------------------------------------------ */
/* Addresses                                                          */
/* ------------------------------------------------------------------ */

describe('the waiting room’s addresses', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts an IPv6 address by its /64 for the sockets of one address, on Cloudflare', () => {
    const { lobby } = cloudflareLobby();
    const block = Array.from({ length: LIMITS.socketsPerAddress + 1 }, (_, i) =>
      socketIn(lobby, `2001:db8:1:2:${(i + 1).toString(16)}::${i + 7}`),
    );
    expect(block.at(-1)!.closedWith?.code).toBe(CLOSE.full);
    expect(block.at(-2)!.closedWith).toBeNull();
    expect(block[0].deserializeAttachment()).toMatchObject({ address: '2001:db8:1:2::/64' });
    // The next /64 is another address; an IPv4 address written as IPv6 is the IPv4 one.
    expect(socketIn(lobby, '2001:db8:1:3::1').closedWith).toBeNull();
    const mapped = socketIn(lobby, '::ffff:203.0.113.7');
    expect(mapped.deserializeAttachment()).toMatchObject({ address: X });
  });
});

describe('the waiting room’s addresses on the Node server', { timeout: 15_000 }, () => {
  it('counts an IPv6 address by its /64 too, behind a proxy on the same machine', async () => {
    const ORIGIN = 'https://app.test';
    const server = nodeServer(
      createRelay({ store: memoryStore(), allowedOrigins: [ORIGIN], live: true }),
    );
    attachLive(server, { allowedOrigins: [ORIGIN] });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const sockets: WebSocket[] = [];
    try {
      const from = (ip: string) => {
        // Node's WebSocket (undici's) takes the handshake's headers in its second argument.
        const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/lobby`, {
          headers: { Origin: ORIGIN, 'X-Forwarded-For': ip },
        } as unknown as string[]);
        sockets.push(ws);
        const closed = new Promise<number>((resolve) =>
          ws.addEventListener('close', (event) => resolve(event.code)),
        );
        // Open, and given the list: the waiting room has counted it.
        const listed = new Promise<void>((resolve) =>
          ws.addEventListener('message', () => resolve(), { once: true }),
        );
        return { closed, listed };
      };
      for (let i = 0; i < LIMITS.socketsPerAddress; i++) {
        await from(`2001:db8:5:6:${i + 1}::1`).listed;
      }
      expect(await from('2001:db8:5:6:ffff:ffff:ffff:ffff').closed).toBe(CLOSE.full);
      await from('2001:db8:5:7::1').listed;
    } finally {
      for (const ws of sockets) ws.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

/* ------------------------------------------------------------------ */
/* What an address makes                                              */
/* ------------------------------------------------------------------ */

describe('what one address may make', () => {
  it('keeps its counts when its sockets go and come back', async () => {
    const w = world();
    for (let i = 0; i < LIMITS.invites; i++) {
      const socket = lobbyAt(w, X);
      await socket.send(invitation());
      expect(socket.last('created')).toBeDefined();
      await socket.leave();
    }
    const again = lobbyAt(w, X);
    await again.send(invitation());
    expect(again.last('error')).toMatchObject({
      code: 'busy',
      message: 'That is enough invitations for now.',
    });
    expect(again.last('created')).toBeUndefined();

    for (let i = 0; i < GROUP_LIMITS.rooms; i++) {
      const socket = lobbyAt(w, X);
      await socket.send(RACE_ROOM);
      expect(socket.last('room-created')).toBeDefined();
      await socket.leave();
    }
    const more = lobbyAt(w, X);
    await more.send(RACE_ROOM);
    expect(more.last('error')).toMatchObject({
      code: 'busy',
      message: 'That is enough rooms for now.',
    });

    // Another address makes its own; an hour on, this one may again.
    const elsewhere = lobbyAt(w, Y);
    await elsewhere.send(invitation());
    expect(elsewhere.last('created')).toBeDefined();
    await w.advance(LIMITS.invitesWindowMs);
    await again.send(invitation());
    expect(again.last('created')).toBeDefined();
  });

  it('pairs an address into so many games an hour, counting each side, its own sockets too', async () => {
    const w = world();
    const owner = lobbyAt(w, X);
    const self = lobbyAt(w, X);
    const other = lobbyAt(w, Y);
    // X posts every game: half joined by its own second socket, half from Y. The clock moves
    // without the rooms' timers: nobody plays these games, and what that costs is counted apart
    // (live-lobby-noshow.test.ts).
    for (let i = 0; i < ABUSE_LIMITS.pairings; i++) {
      await owner.send(seek({ private: true }));
      const joiner = i % 2 === 0 ? self : other;
      await joiner.send({ t: 'join', seek: postedId(owner), name: NAME_B, rating: null });
      expect(owner.all('paired')).toHaveLength(i + 1);
      // Within each socket's allowance of messages.
      w.jump(1000);
    }
    expect(w.hub.games()).toBe(ABUSE_LIMITS.pairings);
    await owner.send(seek({ private: true }));
    expect(owner.last('error')).toMatchObject({
      code: 'busy',
      message: 'That is enough games for now.',
    });
    const waiting = lobbyAt(w, Z);
    await waiting.send(seek({ private: true, name: NAME_B }));
    await self.send({ t: 'join', seek: postedId(waiting), name: NAME_A, rating: null });
    expect(self.last('error')).toMatchObject({
      code: 'busy',
      message: 'That is enough games for now.',
    });

    // Y joined half: as many again, and it is done too.
    for (let i = 0; i < ABUSE_LIMITS.pairings / 2; i++) {
      await waiting.send(seek({ private: true, name: NAME_B }));
      await other.send({ t: 'join', seek: postedId(waiting), name: NAME_A, rating: null });
      expect(other.last('error')).toBeUndefined();
      w.jump(1000);
    }
    await waiting.send(seek({ private: true, name: NAME_B }));
    await other.send({ t: 'join', seek: postedId(waiting), name: NAME_A, rating: null });
    expect(other.last('error')).toMatchObject({ code: 'busy' });
    // An hour on, X may play again.
    w.jump(ABUSE_LIMITS.pairingsWindowMs);
    await owner.send(seek({ private: true }));
    expect(owner.last('posted')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* Games waiting                                                      */
/* ------------------------------------------------------------------ */

describe('games waiting', () => {
  it('lets one address keep so many games waiting, public and private together', async () => {
    const w = world();
    const mine = Array.from({ length: ABUSE_LIMITS.seeksPerAddress }, () => lobbyAt(w, X));
    // White against white never pairs: every one waits.
    for (const [i, socket] of mine.entries()) {
      await socket.send(seek({ color: 'white', private: i % 2 === 1 }));
      expect(socket.last('posted')).toBeDefined();
    }
    const extra = lobbyAt(w, X);
    await extra.send(seek({ color: 'white', private: true }));
    expect(extra.last('error')).toMatchObject({
      code: 'busy',
      message: 'That is enough games waiting for now.',
    });
    // One of them may post again (its game replaced); another address may post.
    const last = mine.at(-1)!;
    last.clear();
    await last.send(seek({ color: 'white', tc: '10+0' }));
    expect(last.last('posted')).toBeDefined();
    const elsewhere = lobbyAt(w, Y);
    await elsewhere.send(seek({ color: 'white' }));
    expect(elsewhere.last('posted')).toBeDefined();
    // A game that goes makes room.
    await mine[0].send({ t: 'cancel' });
    await extra.send(seek({ color: 'white', private: true }));
    expect(extra.last('posted')).toBeDefined();
  });

  it('caps public and private games apart, so that filling one leaves the other', async () => {
    const w = world();
    const publics: Client[] = [];
    for (let i = 0; i < LIMITS.seeks; i++) {
      const socket = lobbyAt(w);
      // White against white never pairs: every one waits.
      await socket.send(seek({ color: 'white' }));
      publics.push(socket);
    }
    const late = lobbyAt(w);
    await late.send(seek({ color: 'white' }));
    expect(late.last('error')).toMatchObject({
      code: 'busy',
      message: 'Too many games are waiting.',
    });
    await late.send(seek({ color: 'white', private: true }));
    expect(late.last('posted')).toMatchObject({ seek: { private: true } });
    for (let i = 1; i < LIMITS.privateSeeks; i++) {
      const socket = lobbyAt(w);
      await socket.send(seek({ private: true }));
      expect(socket.last('posted')).toBeDefined();
    }
    const later = lobbyAt(w);
    await later.send(seek({ private: true }));
    expect(later.last('error')).toMatchObject({
      code: 'busy',
      message: 'Too many games are waiting.',
    });
    // A public game that goes makes room for a public one.
    await publics[0].send({ t: 'cancel' });
    await later.send(seek({ color: 'white' }));
    expect(later.last('posted')).toMatchObject({ seek: { private: false } });
  });
});

/* ------------------------------------------------------------------ */
/* A seek's secret                                                    */
/* ------------------------------------------------------------------ */

describe('a seek’s secret', () => {
  it('gives the seek its id, so that nobody else can post under it, ever', async () => {
    const w = world();
    const secret = randomId(32);
    const id = await seekIdOf(secret);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const poster = lobbyAt(w, X);
    await poster.send(seek({ id, secret, private: true }));
    expect(poster.last('posted')).toMatchObject({ seek: { id } });
    expect(JSON.stringify(poster.messages)).not.toContain(secret);

    // Without a secret, with another, with one that is not one: refused.
    const stranger = lobbyAt(w, Y);
    const theirs = { id, private: true, name: NAME_B };
    for (const other of [undefined, randomId(32), 'short']) {
      await stranger.send(seek({ ...theirs, secret: other }));
    }
    const refused = { code: 'bad-request', message: 'That game cannot be posted.' };
    expect(stranger.all('error').map(({ code, message }) => ({ code, message }))).toEqual([
      refused,
      refused,
      refused,
    ]);
    // Nor once the poster's connection has gone, however long ago.
    await poster.leave();
    await w.advance(60 * 60_000);
    await stranger.send(seek({ ...theirs, secret: randomId(32) }));
    expect(stranger.last('posted')).toBeUndefined();
    // The poster may, from anywhere, whenever: the link shared before still leads to them.
    const back = lobbyAt(w, Z);
    await back.send(seek({ id, secret, private: true }));
    expect(back.last('posted')).toMatchObject({ seek: { id } });
    const friend = lobbyAt(w);
    await friend.send({ t: 'join', seek: id, name: NAME_B, rating: null });
    expect(back.last('paired')).toMatchObject({ opponent: { name: NAME_B } });
  });

  it('hands the seek over to its poster’s new socket from the old one still held', async () => {
    const w = world();
    const secret = randomId(32);
    const id = await seekIdOf(secret);
    const old = lobbyAt(w, X);
    await old.send(seek({ id, secret, color: 'white' }));
    // The phone changed networks: a new socket, from another address, the old not gone yet.
    const fresh = lobbyAt(w, Y);
    await fresh.send(seek({ id, secret, color: 'white' }));
    expect(fresh.last('posted')).toMatchObject({ seek: { id } });
    await w.listed();
    expect(fresh.last('lobby')!.seeks).toEqual([expect.objectContaining({ id })]);
    await old.leave();
    const friend = lobbyAt(w, Z);
    await friend.send({ t: 'join', seek: id, name: NAME_B, rating: null });
    expect(fresh.last('paired')).toBeDefined();
    expect(old.last('paired')).toBeUndefined();
  });

  it('holds through a restart on Cloudflare, with nothing of it in storage', async () => {
    const before = cloudflareLobby();
    const secret = randomId(32);
    const id = await seekIdOf(secret);
    const poster = socketIn(before.lobby, X);
    await say(before.lobby, poster, seek({ id, secret, private: true }));
    expect(poster.last('posted')).toMatchObject({ seek: { id } });
    expect(JSON.stringify([...before.storage.values])).not.toContain(id);
    // A deploy drops every socket without a word: a fresh object, its storage empty.
    poster.leave();
    const after = cloudflareLobby();
    const stranger = socketIn(after.lobby, Y);
    for (const other of [randomId(32), undefined]) {
      await say(after.lobby, stranger, seek({ id, secret: other, private: true, name: NAME_B }));
      expect(stranger.last('error')).toMatchObject({ code: 'bad-request' });
    }
    expect(stranger.last('posted')).toBeUndefined();
    const back = socketIn(after.lobby, X);
    await say(after.lobby, back, seek({ id, secret, private: true }));
    expect(back.last('posted')).toMatchObject({ seek: { id } });
    const friend = socketIn(after.lobby, Z);
    await say(after.lobby, friend, { t: 'join', seek: id, name: NAME_B, rating: null });
    expect(back.last('paired')).toBeDefined();
    expect(stranger.last('paired')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* The list                                                           */
/* ------------------------------------------------------------------ */

describe('the list of games', () => {
  it('goes to everyone at most once in half a second, and only when it has changed', async () => {
    const w = world();
    const watcher = lobbyAt(w);
    expect(watcher.all('lobby')).toHaveLength(1);
    await w.listed();
    // After a quiet while, a change goes at once.
    const a = lobbyAt(w, X);
    expect(watcher.all('lobby')).toHaveLength(2);
    // Changes within the half second wait, and go together.
    const b = lobbyAt(w, Y);
    const secret = randomId(32);
    const id = await seekIdOf(secret);
    await a.send(seek({ color: 'white' }));
    await b.send(seek({ id, secret, color: 'white', tc: '3+0' }));
    // The newcomer had the list at once, all the same.
    expect(b.all('lobby')).toHaveLength(1);
    expect(watcher.all('lobby')).toHaveLength(2);
    await w.advance(BROADCAST_MS - 1);
    expect(watcher.all('lobby')).toHaveLength(2);
    await w.advance(1);
    expect(watcher.all('lobby')).toHaveLength(3);
    expect(watcher.last('lobby')).toMatchObject({
      players: 3,
      seeks: [{ tc: '5+3' }, { id, tc: '3+0' }],
    });

    // The same game again, a private one, a cancel of nothing: nothing to tell.
    await w.listed();
    await b.send(seek({ id, secret, color: 'white', tc: '3+0' }));
    await watcher.send(seek({ private: true }));
    await watcher.send({ t: 'cancel' });
    await w.listed();
    expect(watcher.all('lobby')).toHaveLength(3);

    // A socket turned away, as it comes and as it goes, tells nobody.
    const crowd = Array.from({ length: LIMITS.socketsPerAddress - 1 }, () => lobbyAt(w, X));
    await w.listed();
    const heard = watcher.all('lobby').length;
    const turned = lobbyAt(w, X);
    expect(turned.closed?.code).toBe(CLOSE.full);
    await w.listed();
    expect(watcher.all('lobby')).toHaveLength(heard);
    expect(crowd.every((c) => c.closed === null)).toBe(true);
  });

  it('waits on a timer of the object’s own on Cloudflare', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    try {
      const { lobby } = cloudflareLobby();
      const a = socketIn(lobby);
      const b = socketIn(lobby);
      expect(a.all('lobby')).toHaveLength(1);
      expect(b.last('lobby')).toMatchObject({ players: 2 });
      await vi.advanceTimersByTimeAsync(BROADCAST_MS - 1);
      expect(a.all('lobby')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(a.last('lobby')).toMatchObject({ players: 2 });
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Refused messages                                                   */
/* ------------------------------------------------------------------ */

describe('refused messages', () => {
  it('close a socket refused too often; the count starts over after a while', async () => {
    const w = world();
    const a = lobbyAt(w);
    // Any refusal counts: a message that is not one, a game gone, a limit.
    const refused = [
      { t: 'dance' },
      seek({ tc: '0+0' }),
      { t: 'join', seek: randomId(16), name: NAME_A, rating: null },
    ];
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) await a.send(refused[i % refused.length]);
    expect(a.closed).toBeNull();
    expect(a.all('error').length + a.all('gone').length).toBe(ABUSE_LIMITS.refusals);
    await a.send({ t: 'dance' });
    expect(a.last('error')).toMatchObject({ code: 'rate' });
    expect(a.closed?.code).toBe(CLOSE.policy);

    const b = lobbyAt(w);
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) await b.send({ t: 'dance' });
    await w.advance(ABUSE_LIMITS.refusalWindowMs);
    for (let i = 0; i < ABUSE_LIMITS.refusals; i++) await b.send({ t: 'dance' });
    expect(b.closed).toBeNull();
  });

  it('are counted in the socket’s attachment on Cloudflare, through hibernation', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    try {
      const cf = cloudflareLobby();
      const ws = socketIn(cf.lobby);
      for (let i = 0; i < 6; i++) await say(cf.lobby, ws, { t: 'dance' });
      const woken = new LiveLobby(cf.state, cf.env);
      for (let i = 6; i < ABUSE_LIMITS.refusals; i++) await say(woken, ws, { t: 'dance' });
      expect(ws.closedWith).toBeNull();
      await say(woken, ws, { t: 'dance' });
      expect(ws.closedWith?.code).toBe(CLOSE.policy);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------------------------------------------ */
/* What the waiting room keeps                                        */
/* ------------------------------------------------------------------ */

describe('what the waiting room keeps', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(Date.UTC(2026, 9, 13, 23, 45));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps no address, only salted hashes, writing once for each thing made', async () => {
    const cf = cloudflareLobby();
    const v4 = socketIn(cf.lobby, X);
    const v6 = socketIn(cf.lobby, '2001:db8:1:2::5');
    await say(cf.lobby, v4, invitation());
    await say(cf.lobby, v6, invitation());
    await say(cf.lobby, v6, RACE_ROOM);
    await say(cf.lobby, v4, seek({ private: true }));
    const id = (v4.last('posted')!.seek as { id: string }).id;
    await say(cf.lobby, v6, { t: 'join', seek: id, name: NAME_B, rating: null });
    expect(v6.last('paired')).toBeDefined();
    const stored = JSON.stringify([...cf.storage.values]);
    // (Parts with a dot or a colon: no hash, id or time has one.)
    for (const part of ['203.0.113', '.7"', '2001:db8', 'db8:1:2']) {
      expect(stored).not.toContain(part);
    }
    expect([...cf.storage.values.keys()]).toContain('salt');

    // One write for an invitation, a room; at most one an address for a game.
    const before = cf.storage.puts;
    await say(cf.lobby, v4, invitation());
    expect(cf.storage.puts).toBe(before + 1);
    await say(cf.lobby, v4, RACE_ROOM);
    expect(cf.storage.puts).toBe(before + 2);
    await say(cf.lobby, v4, seek({ private: true }));
    const next = (v4.last('posted')!.seek as { id: string }).id;
    await say(cf.lobby, v6, { t: 'join', seek: next, name: NAME_B, rating: null });
    expect(cf.storage.puts).toBeLessThanOrEqual(before + 4);
  });

  it('keys its counts by HMACs under the relay’s QUOTA_SECRET, when it has one', async () => {
    const hmac = (secret: string, text: string) =>
      createHmac('sha256', secret).update(text).digest('hex').slice(0, 32);
    const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
    const keysIn = (storage: FakeStorage) =>
      [...storage.values]
        .filter(([key]) => key.startsWith('counts:'))
        .flatMap(([, shard]) => (shard as { entries: { key: string }[] }).entries)
        .map((entry) => entry.key);

    const keyed = cloudflareLobby({ QUOTA_SECRET: 'S3cret' });
    await say(keyed.lobby, socketIn(keyed.lobby, X), invitation());
    const salt = (keyed.storage.values.get('salt') as { value: string }).value;
    expect(keysIn(keyed.storage)).toEqual([hmac('S3cret', `${salt} address ${X}`)]);
    expect(keysIn(keyed.storage)).not.toContain(sha(`${salt} address ${X}`));

    // Without one, the plain salted SHA-256, as before.
    const plain = cloudflareLobby();
    await say(plain.lobby, socketIn(plain.lobby, X), invitation());
    const plainSalt = (plain.storage.values.get('salt') as { value: string }).value;
    expect(keysIn(plain.storage)).toEqual([sha(`${plainSalt} address ${X}`)]);
  });

  it('counts across midnight under the day before’s salt, kept only as long as its counts', async () => {
    interface Salt {
      day: number;
      value: string;
      previous: { value: string; until: number } | null;
    }
    const tooMany = { code: 'busy', message: 'That is enough invitations for now.' };
    vi.setSystemTime(Date.UTC(2026, 9, 13, 23, 50));
    const cf = cloudflareLobby();
    const ws = socketIn(cf.lobby, X);
    for (let i = 0; i < LIMITS.invites; i++) await say(cf.lobby, ws, invitation());
    await say(cf.lobby, ws, invitation());
    expect(ws.last('error')).toMatchObject(tooMany);
    const yesterday = cf.storage.values.get('salt') as Salt;
    expect(yesterday.previous).toBeNull();

    // Past midnight UTC, within the invitations' hour: a new salt, with yesterday's kept until
    // an hour into the day, and the address's counts under it still count.
    vi.setSystemTime(Date.UTC(2026, 9, 14, 0, 5));
    ws.sent = [];
    await say(cf.lobby, ws, invitation());
    expect(ws.last('error')).toMatchObject(tooMany);
    expect(ws.last('created')).toBeUndefined();
    const today = cf.storage.values.get('salt') as Salt;
    expect(today.value).not.toBe(yesterday.value);
    expect(today.previous).toEqual({
      value: yesterday.value,
      until: Date.UTC(2026, 9, 14, 1, 0),
    });
    vi.setSystemTime(Date.UTC(2026, 9, 14, 0, 49, 59));
    await say(cf.lobby, ws, invitation());
    expect(ws.last('created')).toBeUndefined();

    // An hour after they were made, they are out of their window: the address may again.
    vi.setSystemTime(Date.UTC(2026, 9, 14, 0, 50));
    const puts = cf.storage.puts;
    await say(cf.lobby, ws, invitation());
    expect(ws.last('created')).toBeDefined();
    expect(cf.storage.puts).toBe(puts + 1);

    // Yesterday's salt goes with the first count after that hour; no address is kept anywhere.
    vi.setSystemTime(Date.UTC(2026, 9, 14, 1, 0));
    await say(cf.lobby, ws, RACE_ROOM);
    expect(ws.last('room-created')).toBeDefined();
    expect(cf.storage.values.get('salt')).toEqual({ ...today, previous: null });
    const stored = JSON.stringify([...cf.storage.values]);
    expect(stored).not.toContain(yesterday.value);
    for (const part of ['203.0.113', '.7"']) expect(stored).not.toContain(part);
  });
});
