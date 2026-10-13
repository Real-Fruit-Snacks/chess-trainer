// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './src/handler.mjs';
import type {
  DurableSocket,
  DurableState,
  DurableStorage,
  LiveEnv,
} from './src/live/cloudflare.mjs';
import { ABUSE_LIMITS, DAY_MS, DUEL_RULES, LIMITS } from './src/live/shared.mjs';
// The Durable Object classes as the runtime finds them: exported by the Worker's module.
import worker, { LiveLobby, LiveRoom } from './src/worker.mjs';
import { Client, flush, type Message, NAME_A, NAME_B, seek, type World, world } from './testWorld';

/**
 * Games left before the first move (lobby.mjs, room.mjs): a game's room that
 * aborts a game because a player never made their first move (or calls off a
 * duel they never came to) tells the waiting room, which counts it against
 * that player's address. Past ABUSE_LIMITS.noShows in noShowWindowMs, the
 * address may post and join nothing, and its games waiting are taken back,
 * until the oldest is out of the window. On Cloudflare the room tells the
 * waiting room's object by a request from inside, which nothing outside can
 * make.
 */

const X = '203.0.113.7';
const Y = '198.51.100.20';
const Z = '192.0.2.44';
const ORIGIN = 'https://app.test';
const NO_SHOWS = 'Your last games ended before your first move: try again later.';
const refused = { t: 'error', code: 'busy', message: NO_SHOWS };
const JUDGE: Partial<Message> = { game: 'judge' };

interface Salt {
  day: number;
  value: string;
  previous: { value: string; until: number } | null;
}

/** The id of the seek `client` last posted. */
const postedId = (client: { last(t: string): Message | undefined }) =>
  (client.last('posted')!.seek as { id: string }).id;

/** The hash the waiting room counts `address` under with the salt `salt`. */
const keyFor = async (salt: string, address: string) =>
  (await hashToken(`${salt} address ${address}`)).slice(0, 32);

/* ------------------------------------------------------------------ */
/* On the Node server's hub                                           */
/* ------------------------------------------------------------------ */

/** A socket in the waiting room of `w`, from `address`. */
const lobbyAt = (w: World, address: string) => new Client((s) => w.hub.openLobby(s, address));

/** A socket in the room of game `game` that has said which seat it is. */
async function seatedIn(w: World, game: string, seat: string) {
  const client = new Client((s) => w.hub.openRoom(game, s));
  await client.send({ t: 'hello', seat });
  return client;
}

/** Lets what a room's timer set going (its word to the waiting room, and what follows) finish. */
async function settled() {
  for (let i = 0; i < 50; i++) await flush();
}

/**
 * `poster` posts a public game (`over`); `tapper` taps the same and is paired
 * with it at once. The game, and each one's seat.
 */
async function matched(poster: Client, tapper: Client, over: Partial<Message>) {
  poster.clear();
  tapper.clear();
  await poster.send(seek(over));
  await tapper.send(seek({ ...over, color: 'random', name: NAME_B, rating: null }));
  const mine = poster.last('paired');
  const theirs = tapper.last('paired');
  if (!mine || !theirs) {
    throw new Error(`Not paired: ${JSON.stringify([poster.messages, tapper.messages])}`);
  }
  return { game: mine.game as string, poster: mine.seat as string, tapper: theirs.seat as string };
}

describe('a game left before the first move', () => {
  it('counts against the side that never moved, and past the limit its address plays no more for a while', async () => {
    const w = world();
    const x = lobbyAt(w, X);
    const y = lobbyAt(w, Y);
    /** When the first was counted. */
    let first = 0;
    // Each pairing below the limit going through shows X still plays until it is reached.
    for (let i = 0; i < ABUSE_LIMITS.noShows; i++) {
      if (i % 2 === 0) {
        // X waits as Black: Y taps, plays White's first move, and Black's never comes.
        const game = await matched(x, y, { color: 'black' });
        const white = await seatedIn(w, game.game, game.tapper);
        await white.send({ t: 'move', uci: 'e2e4', ply: 0 });
        await w.advance(LIMITS.firstMoveMs);
        await settled();
        expect(white.last('end')).toMatchObject({ result: '*', reason: 'no-start' });
      } else {
        // X waits as White, and nobody moves: White's first move never came (Black's was not due).
        await matched(x, y, { color: 'white' });
        await w.advance(LIMITS.firstMoveMs);
        await settled();
      }
      first ||= w.now();
      await w.advance(60_000);
    }

    // X's address may post nothing, from any of its sockets, nor join a game.
    x.clear();
    await x.send(seek({ color: 'black' }));
    expect(x.last('error')).toEqual(refused);
    expect(x.last('posted')).toBeUndefined();
    const z = lobbyAt(w, Z);
    await z.send(seek({ private: true, name: NAME_B }));
    const elsewhere = lobbyAt(w, X);
    await elsewhere.send({ t: 'join', seek: postedId(z), name: NAME_A, rating: null });
    expect(elsewhere.last('error')).toEqual(refused);
    await elsewhere.send(seek({ tc: '3+0', private: true }));
    expect(elsewhere.last('posted')).toBeUndefined();
    expect(z.last('paired')).toBeUndefined();
    // Y, who moved (or whose move it never was), and Z play on.
    await y.send(seek({ tc: '3+0', name: NAME_B }));
    expect(y.last('posted')).toBeDefined();
    await y.send({ t: 'join', seek: postedId(z), name: NAME_B, rating: null });
    expect(y.last('paired')).toBeDefined();

    // Once the oldest is out of the window, X may again.
    await w.advance(first + ABUSE_LIMITS.noShowWindowMs - 1 - w.now());
    x.clear();
    await x.send(seek({ color: 'black' }));
    expect(x.last('error')).toEqual(refused);
    await w.advance(1);
    x.clear();
    await x.send(seek({ color: 'black' }));
    expect(x.last('posted')).toBeDefined();
  });

  it('takes back the games its address has waiting once the last is counted', async () => {
    const w = world();
    const x = lobbyAt(w, X);
    const y = lobbyAt(w, Y);
    const z = lobbyAt(w, Z);
    for (let i = 0; i < ABUSE_LIMITS.noShows - 1; i++) {
      await matched(x, y, { color: 'white' });
      await w.advance(LIMITS.firstMoveMs);
      await settled();
    }
    // One more left, and meanwhile X has games waiting: one in the list, one for a link.
    await matched(x, y, { color: 'white' });
    const listed = lobbyAt(w, X);
    const linked = lobbyAt(w, X);
    await listed.send(seek({ tc: '10+0', color: 'white' }));
    await linked.send(seek({ private: true }));
    const ids = [postedId(listed), postedId(linked)];
    await w.listed();
    expect(z.last('lobby')!.seeks).toEqual([expect.objectContaining({ id: ids[0] })]);
    await w.advance(LIMITS.firstMoveMs);
    // Each socket hears that its game is taken back, and why (once the waiting room has
    // hashed each socket's address to find them).
    await vi.waitFor(() => {
      expect(listed.last('error')).toEqual({ ...refused, seek: ids[0] });
      expect(linked.last('error')).toEqual({ ...refused, seek: ids[1] });
    });
    await w.listed();
    expect(z.last('lobby')!.seeks).toEqual([]);
    // Nobody is paired with them any more: a tap waits, a link finds nothing.
    await z.send(seek({ tc: '10+0', name: NAME_B }));
    expect(z.last('posted')).toBeDefined();
    expect(z.last('paired')).toBeUndefined();
    const friend = lobbyAt(w, Y);
    await friend.send({ t: 'join', seek: ids[1], name: NAME_B, rating: null });
    expect(friend.last('gone')).toEqual({ t: 'gone', seek: ids[1] });
  });

  it('counts nothing for a game both sides started, or one that ended otherwise', async () => {
    const w = world();
    const x = lobbyAt(w, X);
    const y = lobbyAt(w, Y);
    // X has left games already: one more counted, and it could play no more.
    for (let i = 0; i < ABUSE_LIMITS.noShows - 1; i++) {
      await matched(x, y, { color: 'white' });
      await w.advance(LIMITS.firstMoveMs);
      await settled();
    }
    /** X as White and Y as Black, both seated. */
    const seatedPair = async (over: Partial<Message> = {}) => {
      const game = await matched(x, y, { color: 'white', ...over });
      const white = await seatedIn(w, game.game, game.poster);
      const black = await seatedIn(w, game.game, game.tapper);
      return { white, black };
    };
    // Aborted by either side before anyone moved, or resigned before moving (an abort too).
    let p = await seatedPair();
    await p.white.send({ t: 'abort' });
    expect(p.black.last('end')).toMatchObject({ reason: 'aborted' });
    p = await seatedPair();
    await p.black.send({ t: 'abort' });
    expect(p.white.last('end')).toMatchObject({ reason: 'aborted' });
    p = await seatedPair();
    await p.white.send({ t: 'resign' });
    expect(p.black.last('end')).toMatchObject({ reason: 'aborted' });
    // Both moved: then White's flag falls, or Black resigns.
    p = await seatedPair({ tc: '1+0' });
    await p.white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await p.black.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await w.advance(60_000);
    await settled();
    expect(p.black.last('end')).toMatchObject({ result: '0-1', reason: 'time' });
    p = await seatedPair();
    await p.white.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await p.black.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await p.black.send({ t: 'resign' });
    expect(p.white.last('end')).toMatchObject({ result: '1-0', reason: 'resign' });
    // Every deadline past: nothing more was counted, and X still plays.
    await w.advance(LIMITS.firstMoveMs);
    await settled();
    x.clear();
    await x.send(seek({ color: 'white', private: true }));
    expect(x.last('posted')).toBeDefined();
  });

  it('counts a duel called off before it started against the player it waited for', async () => {
    const w = world();
    const x = lobbyAt(w, X);
    const y = lobbyAt(w, Y);
    for (let i = 0; i < ABUSE_LIMITS.noShows; i++) {
      if (i % 3 === 0) {
        // X posts (its device would send the rounds) and never comes; Y is there.
        const duel = await matched(x, y, JUDGE);
        const guest = await seatedIn(w, duel.game, duel.tapper);
        await w.advance(DUEL_RULES.setupMs);
        await settled();
        expect(guest.last('end')).toMatchObject({ result: '*', reason: 'no-start' });
      } else if (i % 3 === 1) {
        // Y posts and is there, its rounds sent, with nothing to wait for but X, who tapped and
        // never came.
        const duel = await matched(y, x, JUDGE);
        const host = await seatedIn(w, duel.game, duel.poster);
        const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const items = Array.from({ length: DUEL_RULES.judge.rounds }, (_, ply) => ({
          fen,
          cp: 150,
          game: 'opera-game',
          ply,
        }));
        await host.send({ t: 'content', items });
        expect(host.last('content')).toBeDefined();
        await w.advance(DUEL_RULES.setupMs);
        await settled();
      } else {
        // X posts and comes, but never sends the rounds (the app sends them at once).
        const duel = await matched(x, y, JUDGE);
        await seatedIn(w, duel.game, duel.poster);
        await seatedIn(w, duel.game, duel.tapper);
        await w.advance(DUEL_RULES.setupMs);
        await settled();
      }
    }

    x.clear();
    await x.send(seek(JUDGE));
    expect(x.last('error')).toEqual(refused);
    // Y was there every time.
    y.clear();
    await y.send(seek(JUDGE));
    expect(y.last('posted')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* On Cloudflare, against stand-ins for the Durable Object runtime    */
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
}

class FakeStorage implements DurableStorage {
  values = new Map<string, unknown>();
  /** Writes so far: on Cloudflare, rows written. */
  puts = 0;
  alarm: number | null = null;

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

  setAlarm(at: number) {
    this.alarm = at;
    return Promise.resolve();
  }

  deleteAlarm() {
    this.alarm = null;
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

/**
 * The waiting room's object and the game rooms' objects, each on a state of
 * its own, through their bindings. Every request the waiting room's object is
 * handed is noted.
 */
function cloudflare() {
  const env: LiveEnv = {};
  const lobbyState = new FakeState();
  const lobby = new LiveLobby(lobbyState, env);
  const handed: { name: string; method: string; url: string; body: string }[] = [];
  const rooms = new Map<string, { state: FakeState; room: LiveRoom }>();
  const roomOf = (id: string) => {
    let entry = rooms.get(id);
    if (!entry) {
      const state = new FakeState();
      entry = { state, room: new LiveRoom(state, env) };
      rooms.set(id, entry);
    }
    return entry;
  };
  env.LIVE_LOBBY = {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const body = await request.clone().text();
        handed.push({ name: id as string, method: request.method, url: request.url, body });
        return lobby.fetch(request);
      },
    }),
  };
  env.LIVE_ROOMS = {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: (input, init) => roomOf(id as string).room.fetch(new Request(input, init)),
    }),
  };
  return { env, lobby, storage: lobbyState.storage, handed, roomOf };
}

/** A socket from `address` in the waiting room's object. */
function socketIn(lobby: LiveLobby, address: string) {
  const ws = new FakeSocket();
  lobby.accept(ws, address);
  return ws;
}

const say = (lobby: LiveLobby, ws: FakeSocket, message: Message) =>
  lobby.webSocketMessage(ws, JSON.stringify(message));

/** A socket in a game's object that has said which seat it is. */
async function seatedAt(room: LiveRoom, seat: string) {
  const ws = new FakeSocket();
  await room.accept(ws);
  await room.webSocketMessage(ws, JSON.stringify({ t: 'hello', seat }));
  return ws;
}

const play = (room: LiveRoom, ws: FakeSocket, uci: string, ply: number) =>
  room.webSocketMessage(ws, JSON.stringify({ t: 'move', uci, ply }));

describe('a game left before the first move, on Cloudflare', () => {
  const T0 = Date.UTC(2026, 9, 13, 12);
  const at = (ms: number) => vi.setSystemTime(T0 + ms);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** X waits as Black and Y taps, in `cf`'s waiting room: the game's object and the seats. */
  async function blackWaits(cf: ReturnType<typeof cloudflare>, x: FakeSocket, y: FakeSocket) {
    x.sent = [];
    y.sent = [];
    await say(cf.lobby, x, seek({ color: 'black' }));
    await say(cf.lobby, y, seek({ name: NAME_B, rating: null }));
    const black = x.last('paired')!;
    const white = y.last('paired')!;
    expect(white.color).toBe('white');
    return {
      ...cf.roomOf(white.game as string),
      white: white.seat as string,
      black: black.seat as string,
    };
  }

  it('is told by the game’s object to the waiting room’s, one request and one row each', async () => {
    const cf = cloudflare();
    const x = socketIn(cf.lobby, X);
    const y = socketIn(cf.lobby, Y);
    const game = await blackWaits(cf, x, y);
    const salt = (cf.storage.values.get('salt') as Salt).value;
    const keys = { x: await keyFor(salt, X), y: await keyFor(salt, Y) };
    // Each seat keeps its player's key; no player or watcher is ever sent one.
    expect(game.state.storage.values.get('game')).toMatchObject({
      white: { key: keys.y },
      black: { key: keys.x },
    });
    const white = await seatedAt(game.room, game.white);
    at(1000);
    await play(game.room, white, 'e2e4', 0);
    const rows = cf.storage.puts;
    at(1000 + LIMITS.firstMoveMs);
    await game.room.alarm();
    expect(white.last('end')).toMatchObject({ result: '*', reason: 'no-start' });
    expect(cf.handed).toEqual([
      {
        name: 'lobby',
        method: 'POST',
        url: 'https://live.internal/no-show',
        body: JSON.stringify({ key: keys.x }),
      },
    ]);
    expect(cf.storage.puts).toBe(rows + 1);
    expect(JSON.stringify([...x.sent, ...y.sent, ...white.sent])).not.toMatch(
      new RegExp(`${keys.x}|${keys.y}`),
    );

    // As many more as the limit, and X's address is refused; Y's is not.
    for (let i = 1; i < ABUSE_LIMITS.noShows; i++) {
      const start = i * 100_000;
      at(start);
      const next = await blackWaits(cf, x, y);
      const seated = await seatedAt(next.room, next.white);
      await play(next.room, seated, 'd2d4', 0);
      at(start + LIMITS.firstMoveMs);
      await next.room.alarm();
    }
    expect(cf.handed.map(({ body }) => body)).toEqual(
      Array.from({ length: ABUSE_LIMITS.noShows }, () => JSON.stringify({ key: keys.x })),
    );
    x.sent = [];
    await say(cf.lobby, x, seek({ color: 'black' }));
    expect(x.last('error')).toEqual(refused);
    await say(cf.lobby, y, seek({ tc: '3+0', name: NAME_B }));
    expect(y.last('posted')).toBeDefined();
    // Kept: hashes and times, never an address.
    const stored = JSON.stringify([...cf.storage.values]);
    expect(stored).toContain(keys.x);
    for (const part of ['203.0.113', '198.51.100', '.7"', '.20"']) {
      expect(stored).not.toContain(part);
    }
  });

  it('is not told of a game both sides started, one that ended otherwise, or a correspondence game', async () => {
    const cf = cloudflare();
    const x = socketIn(cf.lobby, X);
    const y = socketIn(cf.lobby, Y);
    // Both moved; then White's flag falls, the room's alarm says.
    let game = await blackWaits(cf, x, y);
    let white = await seatedAt(game.room, game.white);
    let black = await seatedAt(game.room, game.black);
    await play(game.room, white, 'e2e4', 0);
    await play(game.room, black, 'e7e5', 1);
    at(5 * 60_000);
    await game.room.alarm();
    expect(black.last('end')).toMatchObject({ result: '0-1', reason: 'time' });
    // Aborted before anyone moved.
    at(10 * 60_000);
    game = await blackWaits(cf, x, y);
    white = await seatedAt(game.room, game.white);
    black = await seatedAt(game.room, game.black);
    await game.room.webSocketMessage(black, JSON.stringify({ t: 'abort' }));
    expect(white.last('end')).toMatchObject({ reason: 'aborted' });
    at(10 * 60_000 + LIMITS.firstMoveMs);
    await game.room.alarm();
    // A correspondence game nobody started in its days: no first move was due in 45 seconds.
    await say(cf.lobby, x, {
      t: 'create',
      game: 'chess',
      tc: '1d',
      color: 'white',
      name: NAME_A,
      rating: null,
    });
    const created = x.last('created')!;
    const corr = cf.roomOf(created.game as string);
    const host = await seatedAt(corr.room, created.seat as string);
    const friend = new FakeSocket();
    await corr.room.accept(friend);
    await corr.room.webSocketMessage(friend, JSON.stringify({ t: 'hello', watch: true }));
    await corr.room.webSocketMessage(friend, JSON.stringify({ t: 'join', name: NAME_B }));
    // White's day runs from the join.
    at(10 * 60_000 + LIMITS.firstMoveMs + DAY_MS);
    await corr.room.alarm();
    expect(host.last('end')).toMatchObject({ result: '*', reason: 'no-start' });
    expect(cf.handed).toEqual([]);
  });

  it('matches a key made under the day before’s salt while that salt is kept', async () => {
    const cf = cloudflare();
    const x = socketIn(cf.lobby, X);
    const y = socketIn(cf.lobby, Y);
    /** X waits as White and never moves: the room's alarm comes 45 seconds after the pairing. */
    async function leaves(when: number) {
      vi.setSystemTime(when);
      x.sent = [];
      y.sent = [];
      await say(cf.lobby, x, seek({ color: 'white' }));
      await say(cf.lobby, y, seek({ name: NAME_B, rating: null }));
      const { room } = cf.roomOf(x.last('paired')!.game as string);
      vi.setSystemTime(when + LIMITS.firstMoveMs);
      await room.alarm();
    }
    // All but the last paired a minute apart before midnight, the first at `first`.
    const midnight = Date.UTC(2026, 9, 14);
    const first = midnight - 60_000 - (ABUSE_LIMITS.noShows - 1) * 60_000;
    for (let i = 0; i < ABUSE_LIMITS.noShows - 1; i++) await leaves(first + i * 60_000);
    const yesterday = (cf.storage.values.get('salt') as Salt).value;
    // The last paired before midnight, aborted after it: the key the room hands back is
    // yesterday's.
    await leaves(midnight - 30_000);
    expect(midnight - 30_000 + LIMITS.firstMoveMs).toBeGreaterThan(midnight);
    expect(cf.handed.at(-1)!.body).toBe(JSON.stringify({ key: await keyFor(yesterday, X) }));

    // Under today's salt, X's no-shows still count, for an hour from when the first was counted.
    vi.setSystemTime(midnight + 60_000);
    x.sent = [];
    await say(cf.lobby, x, seek({ color: 'white' }));
    expect(x.last('error')).toEqual(refused);
    const today = cf.storage.values.get('salt') as Salt;
    expect(today.value).not.toBe(yesterday);
    expect(today.previous?.value).toBe(yesterday);
    const lifted = first + LIMITS.firstMoveMs + ABUSE_LIMITS.noShowWindowMs;
    // (Yesterday's salt is still kept then.)
    expect(today.previous!.until).toBeGreaterThan(lifted);
    vi.setSystemTime(lifted - 1000);
    x.sent = [];
    await say(cf.lobby, x, seek({ color: 'white' }));
    expect(x.last('error')).toEqual(refused);
    vi.setSystemTime(lifted);
    x.sent = [];
    await say(cf.lobby, x, seek({ color: 'white', private: true }));
    expect(x.last('posted')).toBeDefined();
  });
});

describe('the waiting room’s word from the rooms', () => {
  it('cannot be reached from outside: not through the Worker, nor on any other origin or path', async () => {
    const cf = cloudflare();
    const env = {
      ALLOWED_ORIGINS: ORIGIN,
      LIVE_LOBBY: cf.env.LIVE_LOBBY,
      LIVE_ROOMS: cf.env.LIVE_ROOMS,
    };
    const body = JSON.stringify({ key: 'a'.repeat(32) });
    const headers = { Origin: ORIGIN, Upgrade: 'websocket', 'Content-Type': 'application/json' };
    const status = async (url: string) =>
      (await worker.fetch(new Request(url, { method: 'POST', headers, body }), env)).status;
    // The Worker passes on only WebSocket upgrades of its own paths, as they came.
    expect(await status('https://relay.test/no-show')).toBe(404);
    expect(await status('https://relay.test/v1/lobby')).toBe(426);
    expect(await status('https://relay.test/v1/lobby/no-show')).toBe(404);
    expect(await status('https://live.internal/no-show')).toBe(404);
    expect(cf.handed).toEqual([]);

    // The object itself counts only a key, POSTed to its own origin and path.
    const post = async (url: string, text = body) =>
      (await cf.lobby.fetch(new Request(url, { method: 'POST', body: text }))).status;
    expect(await post('https://relay.test/no-show')).toBe(426);
    expect(await post('https://live.internal/create')).toBe(426);
    expect((await cf.lobby.fetch(new Request('https://live.internal/no-show'))).status).toBe(426);
    expect(await post('https://live.internal/no-show', 'Not JSON.')).toBe(400);
    expect(await post('https://live.internal/no-show', JSON.stringify({ key: X }))).toBe(400);
    expect(
      await post('https://live.internal/no-show', JSON.stringify({ key: 'A'.repeat(32) })),
    ).toBe(400);
    expect(cf.storage.puts).toBe(0);
    expect(await post('https://live.internal/no-show')).toBe(204);
    expect(cf.storage.puts).toBe(1);
  });
});
