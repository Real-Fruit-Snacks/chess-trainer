// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { duplexPair } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelay, DEFAULT_MAX_BYTES } from './src/handler.mjs';
import type {
  DurableNamespace,
  DurableSocket,
  DurableState,
  DurableStorage,
  LiveEnv,
} from './src/live/cloudflare.mjs';
import { CLOSE, LIMITS, randomId } from './src/live/shared.mjs';
import {
  acceptKey,
  upgrade,
  type UpgradeOptions,
  type WebSocketConnection,
} from './src/live/websocket.mjs';
import { memoryStore } from './src/memoryStore.mjs';
import { attachLive, nodeServer } from './src/server.mjs';
// The Durable Object classes as the runtime finds them: exported by the Worker's module.
import worker, { LiveLobby, LiveRoom } from './src/worker.mjs';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                     */
/* ------------------------------------------------------------------ */

const ORIGIN = 'https://app.test';
const NAME_A = 'Patient Bishop';
const NAME_B = 'Swift Knight';

interface Message {
  t: string;
  [key: string]: unknown;
}

interface Paired extends Message {
  game: string;
  seat: string;
  color: string;
}

function seek(over: Partial<Message> = {}): Message {
  return {
    t: 'seek',
    tc: '5+3',
    color: 'random',
    name: NAME_A,
    rating: 1500,
    private: false,
    ...over,
  };
}

/** What a test leaves open, closed after it (the last opened first). */
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Waits for `check` to give something (these tests talk over real sockets). */
async function until<T>(check: () => T | null | undefined | false, ms = 3000): Promise<T> {
  const deadline = performance.now() + ms;
  for (;;) {
    const value = check();
    if (value !== null && value !== undefined && value !== false) return value;
    if (performance.now() > deadline) throw new Error('Gave up waiting.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/* ------------------------------------------------------------------ */
/* Frames, written and read by hand                                   */
/* ------------------------------------------------------------------ */

const OP = { continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa };

interface Frame {
  fin: boolean;
  opcode: number;
  masked: boolean;
  payload: Buffer;
}

/** A frame as a client sends it: masked, unless told otherwise. */
function frame(
  opcode: number,
  payload: string | Buffer = '',
  { fin = true, mask = true, rsv = 0 }: { fin?: boolean; mask?: boolean; rsv?: number } = {},
): Buffer {
  const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  let head = Buffer.from([0, data.length]);
  if (data.length >= 0x10000) {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(data.length), 2);
  } else if (data.length >= 126) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(data.length, 2);
  }
  head[0] = (fin ? 0x80 : 0) | rsv | opcode;
  if (!mask) return Buffer.concat([head, data]);
  head[1] |= 0x80;
  const key = randomBytes(4);
  for (let i = 0; i < data.length; i++) data[i] ^= key[i % 4];
  return Buffer.concat([head, key, data]);
}

/** A close frame's payload: the code, then the reason. */
const closing = (code: number, reason = '') =>
  Buffer.concat([Buffer.from([code >> 8, code & 0xff]), Buffer.from(reason)]);

/** A close frame's code and reason. */
const closeOf = (f: Frame) => ({
  code: f.payload.readUInt16BE(0),
  reason: f.payload.subarray(2).toString(),
});

/** The whole frames in what a server sent. */
function framesIn(bytes: Buffer): Frame[] {
  const frames: Frame[] = [];
  let at = 0;
  while (bytes.length - at >= 2) {
    let length = bytes[at + 1] & 0x7f;
    let size = 2;
    if (length === 126) {
      if (bytes.length - at < 4) break;
      length = bytes.readUInt16BE(at + 2);
      size = 4;
    } else if (length === 127) {
      if (bytes.length - at < 10) break;
      length = Number(bytes.readBigUInt64BE(at + 2));
      size = 10;
    }
    if (bytes.length - at < size + length) break;
    frames.push({
      fin: (bytes[at] & 0x80) !== 0,
      opcode: bytes[at] & 0x0f,
      masked: (bytes[at + 1] & 0x80) !== 0,
      payload: bytes.subarray(at + size, at + size + length),
    });
    at += size + length;
  }
  return frames;
}

interface Accepted {
  ws: WebSocketConnection;
  messages: string[];
  closed: Promise<{ code: number; reason: string }>;
}

/** An HTTP server that takes WebSockets with `upgrade`, and notes what each one hears. */
async function wsServer(options: UpgradeOptions = {}) {
  const accepted: Accepted[] = [];
  const sockets = new Set<Socket>();
  const server = createServer();
  server.on('connection', (socket: Socket) => sockets.add(socket));
  server.on('upgrade', (req, socket, head) => {
    const ws = upgrade(req, socket, head, options);
    if (!ws) return;
    const messages: string[] = [];
    ws.on('message', (text) => messages.push(text));
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason }));
    });
    accepted.push({ ws, messages, closed });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanups.push(
    () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(resolve);
      }),
  );
  return { port: (server.address() as AddressInfo).port, accepted };
}

/** A WebSocket client written by hand, so that it can send anything at all. */
async function rawClient(port: number, first: Buffer = Buffer.alloc(0)) {
  const socket = connect(port, '127.0.0.1');
  socket.on('error', () => undefined);
  cleanups.push(() => socket.destroy());
  await once(socket, 'connect');
  socket.setNoDelay(true);
  let received = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    received = Buffer.concat([received, chunk]);
  });
  const gone = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  const key = randomBytes(16).toString('base64');
  const request = [
    'GET /live HTTP/1.1',
    'Host: relay.test',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');
  // The first frame goes in the same piece as the handshake: the server finds it in `head`.
  socket.write(Buffer.concat([Buffer.from(request), first]));
  const headEnd = await until(() => {
    const at = received.indexOf('\r\n\r\n');
    return at >= 0 ? at + 4 : null;
  });
  const body = () => received.subarray(headEnd);
  return {
    key,
    response: received.subarray(0, headEnd).toString(),
    /** Settles when the server has closed the connection. */
    gone,
    write: (bytes: Buffer) => socket.write(bytes),
    /** Writes `bytes` a few at a time, each piece on its own turn of the event loop. */
    async trickle(bytes: Buffer, size: number) {
      for (let i = 0; i < bytes.length; i += size) {
        socket.write(bytes.subarray(i, i + size));
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    frames: () => framesIn(body()),
    /** The first frame `where` picks, waiting for it. */
    frame: (where: (frame: Frame) => boolean) => until(() => framesIn(body()).find(where)),
  };
}

/** The status a WebSocket handshake gets: 101, or the error the server answered with. */
function handshake(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': '13',
        ...headers,
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

/** A handshake request as Node's http server hands it over, for a socket made by hand. */
const handshakeRequest = () =>
  ({
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      connection: 'Upgrade',
      'sec-websocket-key': randomBytes(16).toString('base64'),
      'sec-websocket-version': '13',
    },
  }) as unknown as IncomingMessage;

/* ------------------------------------------------------------------ */
/* The WebSocket server                                               */
/* ------------------------------------------------------------------ */

describe('the WebSocket server', { timeout: 15_000 }, () => {
  it('answers the handshake, and refuses requests that are not WebSocket ones', async () => {
    // RFC 6455's own example.
    expect(acceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    const { port } = await wsServer();
    const client = await rawClient(port);
    expect(client.response).toMatch(/^HTTP\/1\.1 101 Switching Protocols\r\n/);
    expect(client.response).toContain('Upgrade: websocket\r\n');
    expect(client.response).toContain(`Sec-WebSocket-Accept: ${acceptKey(client.key)}\r\n`);

    expect(await handshake(port, '/')).toBe(101);
    expect(await handshake(port, '/', { 'Sec-WebSocket-Version': '8' })).toBe(400);
    expect(await handshake(port, '/', { 'Sec-WebSocket-Key': 'short' })).toBe(400);
    expect(await handshake(port, '/', { Upgrade: 'h2c' })).toBe(400);
    expect(await handshake(port, '/', {}, 'POST')).toBe(400);
  });

  it('reads frames that come in pieces, fragmented messages, and every length', async () => {
    const { port, accepted } = await wsServer({ maxBytes: 100_000 });
    const client = await rawClient(port, frame(OP.text, 'with the handshake'));
    await until(() => accepted[0]?.messages.length === 1);
    const { ws, messages } = accepted[0];
    await client.trickle(
      Buffer.concat([
        frame(OP.text, 'Hel', { fin: false }),
        frame(OP.ping, 'still there?'),
        frame(OP.continuation, 'lo', { fin: false }),
        frame(OP.continuation, ', world'),
        // 'é' cut between two fragments.
        frame(OP.text, Buffer.from([0x63, 0x61, 0x66, 0xc3]), { fin: false }),
        frame(OP.continuation, Buffer.from([0xa9])),
        frame(OP.text, ''),
      ]),
      3,
    );
    client.write(frame(OP.text, 'x'.repeat(300)));
    client.write(frame(OP.text, 'é'.repeat(40_000)));
    await until(() => messages.length === 6);
    expect(messages).toEqual([
      'with the handshake',
      'Hello, world',
      'café',
      '',
      'x'.repeat(300),
      'é'.repeat(40_000),
    ]);
    const pong = await client.frame((f) => f.opcode === OP.pong);
    expect(pong.payload.toString()).toBe('still there?');

    ws.send('short');
    ws.send('y'.repeat(300));
    ws.send('z'.repeat(70_000));
    const texts = await until(() => {
      const frames = client.frames().filter((f) => f.opcode === OP.text);
      return frames.length === 3 ? frames : null;
    });
    expect(texts.map((f) => f.payload.toString())).toEqual([
      'short',
      'y'.repeat(300),
      'z'.repeat(70_000),
    ]);
    // A server's frames are whole and not masked.
    expect(client.frames().every((f) => f.fin && !f.masked)).toBe(true);
  });

  it('reads a stream of frames however it is cut', async () => {
    const stream = Buffer.concat([
      frame(OP.text, 'one'),
      frame(OP.text, 'tw', { fin: false }),
      frame(OP.ping, 'p'),
      frame(OP.continuation, 'o'),
      frame(OP.text, 'z'.repeat(200)),
      frame(OP.text, ''),
    ]);
    for (const size of [1, 2, 3, 5, 8, 13, 64, stream.length]) {
      const [server, client] = duplexPair();
      client.on('data', () => undefined);
      const ws = upgrade(handshakeRequest(), server, Buffer.alloc(0))!;
      const messages: string[] = [];
      ws.on('message', (text) => messages.push(text));
      for (let i = 0; i < stream.length; i += size) {
        client.write(stream.subarray(i, i + size));
        await new Promise((resolve) => setImmediate(resolve));
      }
      await until(() => messages.length === 4);
      expect(messages).toEqual(['one', 'two', 'z'.repeat(200), '']);
      server.destroy();
      client.destroy();
    }
  });

  it('closes by the handshake, whichever side starts', async () => {
    const { port, accepted } = await wsServer();

    // The client starts: the server answers with the same code and ends the connection.
    const leaving = await rawClient(port);
    leaving.write(frame(OP.close, closing(4000, 'Bye.')));
    expect(closeOf(await leaving.frame((f) => f.opcode === OP.close)).code).toBe(4000);
    await leaving.gone;
    expect(await accepted[0].closed).toEqual({ code: 4000, reason: 'Bye.' });

    // A close frame with no code is answered with one with none.
    const quiet = await rawClient(port);
    quiet.write(frame(OP.close));
    expect((await quiet.frame((f) => f.opcode === OP.close)).payload.length).toBe(0);
    await quiet.gone;
    expect(await accepted[1].closed).toEqual({ code: 1005, reason: '' });

    // The server starts: nothing is sent after its close frame, nothing that
    // arrives after it is passed on, and the client's answer ends the connection.
    const staying = await rawClient(port);
    const { ws, messages, closed } = accepted[2];
    ws.close(CLOSE.noGame, 'No such game.');
    ws.send('Too late.');
    const close = await staying.frame((f) => f.opcode === OP.close);
    expect(closeOf(close)).toEqual({ code: CLOSE.noGame, reason: 'No such game.' });
    staying.write(frame(OP.text, 'After the close.'));
    staying.write(frame(OP.close, closing(CLOSE.noGame)));
    await staying.gone;
    expect(await closed).toEqual({ code: CLOSE.noGame, reason: '' });
    expect(messages).toEqual([]);
    expect(staying.frames().map((f) => f.opcode)).toEqual([OP.close]);
  });

  it('cuts off a peer that never answers its close', async () => {
    const { port, accepted } = await wsServer({ closeTimeoutMs: 100 });
    const silent = await rawClient(port);
    accepted[0].ws.close(1001, 'Going away.');
    await silent.frame((f) => f.opcode === OP.close);
    const asked = performance.now();
    await silent.gone;
    expect(performance.now() - asked).toBeGreaterThanOrEqual(50);
    expect(await accepted[0].closed).toEqual({ code: 1006, reason: '' });
  });

  it('caps a message’s size, fragments and all, as soon as a header says too much', async () => {
    const { port, accepted } = await wsServer({ maxBytes: 1000 });
    await rawClient(port, frame(OP.text, 'a'.repeat(1000)));
    await until(() => accepted[0]?.messages[0]?.length === 1000);
    for (const bytes of [
      frame(OP.text, 'a'.repeat(1001)),
      Buffer.concat([
        frame(OP.text, 'a'.repeat(600), { fin: false }),
        frame(OP.continuation, 'a'.repeat(401)),
      ]),
      // A header saying 4 GiB follow, and nothing after it.
      Buffer.from([0x81, 0x80 | 127, 0, 0, 0, 1, 0, 0, 0, 0]),
    ]) {
      const client = await rawClient(port);
      client.write(bytes);
      expect(closeOf(await client.frame((f) => f.opcode === OP.close)).code).toBe(1009);
      await client.gone;
    }
    expect(accepted.slice(1).every((a) => a.messages.length === 0)).toBe(true);
  });

  it('refuses what the protocol does not allow, with the code that says why', async () => {
    const { port } = await wsServer();
    const cases: [number, Buffer][] = [
      [1002, frame(OP.text, 'Unmasked.', { mask: false })],
      [1003, frame(OP.binary, Buffer.from([1, 2, 3]))],
      [1007, frame(OP.text, Buffer.from([0x68, 0xff, 0x69]))],
      [
        1007,
        Buffer.concat([
          frame(OP.text, Buffer.from([0xe2, 0x82]), { fin: false }),
          frame(OP.continuation, Buffer.from([0x28])),
        ]),
      ],
      [1002, frame(OP.text, 'Compressed?', { rsv: 0x40 })],
      [1002, frame(OP.ping, 'x'.repeat(126))],
      [1002, frame(OP.ping, 'x', { fin: false })],
      [1002, frame(OP.continuation, 'Of nothing.')],
      [1002, Buffer.concat([frame(OP.text, 'a', { fin: false }), frame(OP.text, 'b')])],
      [1002, frame(0x3, 'Unknown.')],
      [1002, frame(OP.close, Buffer.from([3]))],
      [1002, frame(OP.close, closing(1005))],
      [1007, frame(OP.close, Buffer.concat([closing(1000), Buffer.from([0xff])]))],
    ];
    for (const [code, bytes] of cases) {
      const client = await rawClient(port);
      client.write(bytes);
      const close = await client.frame((f) => f.opcode === OP.close);
      expect(closeOf(close).code, bytes.toString('hex')).toBe(code);
      await client.gone;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Live games on the Node server, end to end                          */
/* ------------------------------------------------------------------ */

/** A player on Node's own WebSocket client, connecting as a browser does. */
class Player {
  readonly ws: WebSocket;
  readonly opened: Promise<void>;
  readonly closed: Promise<{ code: number; reason: string }>;
  private readonly queue: Message[] = [];

  constructor(url: string, headers: Record<string, string> = { Origin: ORIGIN }) {
    // Node's WebSocket (undici's) takes the handshake's headers in its second argument.
    this.ws = new WebSocket(url, { headers } as unknown as string[]);
    this.ws.addEventListener('message', (event: MessageEvent<string>) => {
      this.queue.push(event.data === 'pong' ? { t: 'pong' } : (JSON.parse(event.data) as Message));
    });
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('The socket did not open.')));
    });
    void this.opened.catch(() => undefined);
    this.closed = new Promise((resolve) => {
      this.ws.addEventListener('close', (event) =>
        resolve({ code: event.code, reason: event.reason }),
      );
    });
    cleanups.push(() => this.ws.close());
  }

  send(message: Message | string) {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** The next message of type `t` not taken yet, waiting for it. */
  take<T extends Message = Message>(t: string): Promise<T> {
    return until(() => {
      const at = this.queue.findIndex((m) => m.t === t);
      return at >= 0 ? (this.queue.splice(at, 1)[0] as T) : null;
    });
  }
}

/** The relay as `server.mjs` runs it: vaults and live games on one Node server. */
async function liveRelay(allowedOrigins = [ORIGIN]) {
  const server = nodeServer(createRelay({ store: memoryStore(), allowedOrigins, live: true }));
  const hub = attachLive(server, { allowedOrigins });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  let stopped: Promise<void> | null = null;
  const stop = () => (stopped ??= new Promise<void>((resolve) => server.close(() => resolve())));
  cleanups.push(stop);
  return { port, hub, stop, url: (path: string) => `ws://127.0.0.1:${port}${path}` };
}

describe('live games on the Node server', { timeout: 15_000 }, () => {
  it('pairs two players in the waiting room, seats them and passes their moves', async () => {
    const relay = await liveRelay();
    const a = new Player(relay.url('/v1/lobby'));
    const b = new Player(relay.url('/v1/lobby'));
    await a.take('lobby');
    await b.take('lobby');
    a.send(seek({ color: 'white' }));
    await a.take('posted');
    b.send(seek({ name: NAME_B, rating: null }));
    const pa = await a.take<Paired>('paired');
    const pb = await b.take<Paired>('paired');
    expect(pa).toMatchObject({ color: 'white', tc: '5+3', opponent: { name: NAME_B } });
    expect(pb).toMatchObject({ color: 'black', game: pa.game, opponent: { name: NAME_A } });
    expect(relay.hub.games()).toBe(1);

    const white = new Player(relay.url(`/v1/games/${pa.game}`));
    const black = new Player(relay.url(`/v1/games/${pb.game}`));
    await Promise.all([white.opened, black.opened]);
    white.send({ t: 'hello', seat: pa.seat });
    expect(await white.take('game')).toMatchObject({ you: 'white', moves: [], status: 'playing' });
    black.send({ t: 'hello', seat: pb.seat });
    expect(await black.take('game')).toMatchObject({
      you: 'black',
      white: { name: NAME_A, rating: 1500 },
      present: { white: true, black: true },
    });
    for (const [ply, uci] of ['e2e4', 'e7e5', 'g1f3'].entries()) {
      (ply % 2 === 0 ? white : black).send({ t: 'move', uci, ply });
      for (const player of [white, black]) {
        expect(await player.take('move')).toMatchObject({ uci, ply });
      }
    }
    white.send('ping');
    await white.take('pong');

    // Stopping the server closes every socket, in the lobby and in the games.
    await relay.stop();
    for (const player of [a, b, white, black]) {
      expect((await player.closed).code).toBe(CLOSE.closed);
    }
  });

  it('says so in its health check, and refuses other origins and other paths', async () => {
    const relay = await liveRelay();
    const health = await fetch(`http://127.0.0.1:${relay.port}/v1/health`);
    expect(await health.json()).toEqual({ ok: true, maxBytes: DEFAULT_MAX_BYTES, live: true });

    expect(await handshake(relay.port, '/v1/lobby', { Origin: ORIGIN })).toBe(101);
    expect(await handshake(relay.port, `/v1/games/${randomId(16)}`, { Origin: ORIGIN })).toBe(101);
    expect(await handshake(relay.port, '/v1/lobby', { Origin: 'https://elsewhere.test' })).toBe(
      403,
    );
    expect(await handshake(relay.port, '/v1/lobby')).toBe(403);
    expect(await handshake(relay.port, '/v1/games/not-a-game', { Origin: ORIGIN })).toBe(404);
    expect(await handshake(relay.port, '/v1/vaults/lobby', { Origin: ORIGIN })).toBe(404);
    const stranger = new Player(relay.url('/v1/lobby'), { Origin: 'https://elsewhere.test' });
    await expect(stranger.opened).rejects.toThrow();

    // With '*', any page may connect.
    const open = await liveRelay(['*']);
    expect(await handshake(open.port, '/v1/lobby', { Origin: 'https://elsewhere.test' })).toBe(101);
  });

  it('counts sockets by the address a proxy on the same machine passes on', async () => {
    const relay = await liveRelay();
    // The proxy adds the client's address last; what comes before it, the client wrote.
    const behind = (address: string) =>
      new Player(relay.url('/v1/lobby'), {
        Origin: ORIGIN,
        'X-Forwarded-For': `192.0.2.1, ${address}`,
      });
    for (let i = 0; i < LIMITS.socketsPerAddress; i++) await behind('203.0.113.9').opened;
    const one = behind('203.0.113.9');
    expect((await one.closed).code).toBe(CLOSE.full);
    // Another address, or this machine itself with no proxy in between, is not held back.
    await behind('198.51.100.7').opened;
    const local = new Player(relay.url('/v1/lobby'));
    expect(await local.take('lobby')).toMatchObject({ players: LIMITS.socketsPerAddress + 2 });
  });
});

/* ------------------------------------------------------------------ */
/* Live games on Cloudflare, against stand-ins for the runtime        */
/* ------------------------------------------------------------------ */

/** The object's end of a socket, as the runtime hands it over. */
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
    // The runtime's getWebSockets() may go on listing a socket after close(),
    // and nothing promises its readyState has moved on: here it has not.
    this.closedWith = { code, reason };
  }

  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.attachment);
  }

  /** The messages of type `t` the object sent to this socket. */
  all(t: string): Message[] {
    return this.sent
      .filter((text) => text !== 'pong')
      .map((text) => JSON.parse(text) as Message)
      .filter((m) => m.t === t);
  }

  last<T extends Message = Message>(t: string): T | undefined {
    return this.all(t).at(-1) as T | undefined;
  }

  /** The client goes: the runtime then tells the object. */
  leave() {
    this.readyState = 3;
  }
}

class FakeStorage implements DurableStorage {
  values = new Map<string, unknown>();
  alarm: number | null = null;

  get(key: string) {
    return Promise.resolve(structuredClone(this.values.get(key)));
  }

  put(key: string, value: unknown) {
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
  autoResponse: unknown = undefined;

  acceptWebSocket(ws: DurableSocket) {
    this.sockets.push(ws as FakeSocket);
  }

  /** Sockets the client has closed go; ones the object closed may linger. */
  getWebSockets() {
    return this.sockets.filter((ws) => ws.readyState !== 3);
  }

  setWebSocketAutoResponse(pair?: unknown) {
    this.autoResponse = pair;
  }
}

/** An environment whose LIVE_ROOMS objects live in this test, one state per name. */
function fakeCloudflare() {
  const rooms = new Map<string, { state: FakeState; room: LiveRoom }>();
  const env: LiveEnv = {};
  const roomOf = (id: string) => {
    let entry = rooms.get(id);
    if (!entry) {
      const state = new FakeState();
      entry = { state, room: new LiveRoom(state, env) };
      rooms.set(id, entry);
    }
    return entry;
  };
  env.LIVE_ROOMS = {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: (input, init) => roomOf(id as string).room.fetch(new Request(input, init)),
    }),
  };
  return { env, roomOf };
}

/** Two players paired in a LiveLobby; their game made in its LiveRoom. */
async function pairOnCloudflare() {
  const cf = fakeCloudflare();
  const lobbyState = new FakeState();
  const lobby = new LiveLobby(lobbyState, cf.env);
  const a = new FakeSocket();
  const b = new FakeSocket();
  lobby.accept(a, '203.0.113.1');
  lobby.accept(b, '203.0.113.2');
  await lobby.webSocketMessage(a, JSON.stringify(seek({ color: 'white' })));
  await lobby.webSocketMessage(b, JSON.stringify(seek({ name: NAME_B, rating: null })));
  const pa = a.last<Paired>('paired')!;
  const pb = b.last<Paired>('paired')!;
  return { cf, lobby, lobbyState, a, b, pa, pb, ...cf.roomOf(pa.game) };
}

/** A socket in `room` that has said which seat it is. */
async function seated(room: LiveRoom, seat: string) {
  const ws = new FakeSocket();
  await room.accept(ws);
  await room.webSocketMessage(ws, JSON.stringify({ t: 'hello', seat }));
  return ws;
}

describe('live games on Cloudflare', () => {
  const T0 = Date.UTC(2026, 9, 10, 12);
  const at = (ms: number) => vi.setSystemTime(T0 + ms);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pairs two players in the waiting room, whose game the room then makes', async () => {
    const { a, b, pa, pb, state } = await pairOnCloudflare();
    expect(pa).toMatchObject({
      color: 'white',
      tc: '5+3',
      opponent: { name: NAME_B, rating: null },
    });
    expect(pb).toMatchObject({ color: 'black', game: pa.game, opponent: { name: NAME_A } });
    // Each socket's data is its attachment, so it lasts while the object sleeps.
    expect(a.deserializeAttachment()).toMatchObject({ address: '203.0.113.1', seek: null });
    expect(b.last('lobby')).toMatchObject({ seeks: [], players: 2 });
    expect(await state.storage.get('game')).toMatchObject({
      id: pa.game,
      tc: { id: '5+3' },
      white: { name: NAME_A },
      black: { name: NAME_B },
      moves: [],
    });
    expect(state.storage.alarm).toBe(T0 + LIMITS.firstMoveMs);
  });

  it('seats the players and plays their moves, the room keeping the game and its deadline', async () => {
    const { room, state, pa, pb } = await pairOnCloudflare();
    const white = await seated(room, pa.seat);
    const black = await seated(room, pb.seat);
    expect(white.last('game')).toMatchObject({ you: 'white', present: { white: true } });
    expect(black.last('game')).toMatchObject({
      you: 'black',
      present: { white: true, black: true },
    });
    expect(white.deserializeAttachment()).toMatchObject({ seat: 'white' });
    at(5000);
    await room.webSocketMessage(white, JSON.stringify({ t: 'move', uci: 'e2e4', ply: 0 }));
    expect(black.last('move')).toMatchObject({ uci: 'e2e4', ply: 0 });
    expect(await state.storage.get('game')).toMatchObject({ moves: ['e2e4'] });
    // Black's first move is due 45 seconds after White's.
    expect(state.storage.alarm).toBe(T0 + 5000 + LIMITS.firstMoveMs);
  });

  it('carries a game on after hibernation, from storage and the attachments', async () => {
    const { cf, room, state, pa, pb } = await pairOnCloudflare();
    const white = await seated(room, pa.seat);
    const black = await seated(room, pb.seat);
    await room.webSocketMessage(white, JSON.stringify({ t: 'move', uci: 'd2d4', ply: 0 }));

    // The object was evicted: a new instance over the same state goes on.
    at(8000);
    const woken = new LiveRoom(state, cf.env);
    await woken.webSocketMessage(black, JSON.stringify({ t: 'move', uci: 'd7d5', ply: 1 }));
    expect(white.last('move')).toMatchObject({ uci: 'd7d5', ply: 1, clock: { running: 'white' } });
    expect(await state.storage.get('game')).toMatchObject({ moves: ['d2d4', 'd7d5'] });
    // White's flag would fall in five minutes.
    expect(state.storage.alarm).toBe(T0 + 8000 + 300_000);
    black.sent = [];
    await new LiveRoom(state, cf.env).webSocketMessage(black, JSON.stringify({ t: 'hello' }));
    expect(black.last('game')).toMatchObject({ you: 'black', moves: ['d2d4', 'd7d5'] });
  });

  it('aborts a game nobody starts when its alarm comes, and deletes it later', async () => {
    const { room, state, pa, pb } = await pairOnCloudflare();
    const white = await seated(room, pa.seat);
    const black = await seated(room, pb.seat);
    at(LIMITS.firstMoveMs);
    await room.alarm();
    for (const ws of [white, black]) {
      expect(ws.last('end')).toMatchObject({ result: '*', reason: 'no-start' });
    }
    expect(state.storage.alarm).toBe(T0 + LIMITS.firstMoveMs + LIMITS.keepAfterEndMs);
    at(LIMITS.firstMoveMs + LIMITS.keepAfterEndMs);
    await room.alarm();
    expect(white.closedWith?.code).toBe(CLOSE.closed);
    expect(black.closedWith?.code).toBe(CLOSE.closed);
    expect(state.storage.values.size).toBe(0);
    expect(state.storage.alarm).toBeNull();
  });

  it('keeps the waiting room’s seeks through hibernation, and stops counting sockets it closed', async () => {
    const cf = fakeCloudflare();
    const state = new FakeState();
    const a = new FakeSocket();
    new LiveLobby(state, cf.env).accept(a);
    await new LiveLobby(state, cf.env).webSocketMessage(a, JSON.stringify(seek()));
    const woken = new LiveLobby(state, cf.env);
    const b = new FakeSocket();
    woken.accept(b);
    expect(b.last('lobby')).toMatchObject({ seeks: [{ name: NAME_A, tc: '5+3' }], players: 2 });
    await woken.webSocketMessage(b, JSON.stringify(seek({ name: NAME_B })));
    expect(a.last('paired')).toMatchObject({ opponent: { name: NAME_B } });

    // Past the limit per address, a socket is closed, and is no longer counted.
    const crowd = new FakeState();
    const lobby = new LiveLobby(crowd, cf.env);
    const same = Array.from({ length: LIMITS.socketsPerAddress + 1 }, () => new FakeSocket());
    for (const ws of same) lobby.accept(ws, '203.0.113.9');
    expect(same.at(-1)!.closedWith?.code).toBe(CLOSE.full);
    expect(same.at(-2)!.closedWith).toBeNull();
    const elsewhere = new FakeSocket();
    lobby.accept(elsewhere, '198.51.100.1');
    expect(elsewhere.last('lobby')).toMatchObject({ players: LIMITS.socketsPerAddress + 1 });
  });

  it('closes a socket that sends binary, and answers pings when the runtime does not', async () => {
    const cf = fakeCloudflare();
    const state = new FakeState();
    const lobby = new LiveLobby(state, cf.env);
    expect(state.autoResponse).toBeUndefined();
    const binary = new FakeSocket();
    lobby.accept(binary);
    await lobby.webSocketMessage(binary, new ArrayBuffer(3));
    expect(binary.closedWith?.code).toBe(1003);
    const pinging = new FakeSocket();
    lobby.accept(pinging);
    await lobby.webSocketMessage(pinging, 'ping');
    expect(pinging.sent.at(-1)).toBe('pong');

    // Where the runtime can answer pings itself, both objects ask it to.
    class Pair {
      constructor(
        readonly request: string,
        readonly response: string,
      ) {}
    }
    vi.stubGlobal('WebSocketRequestResponsePair', Pair);
    const lobbyState = new FakeState();
    const roomState = new FakeState();
    new LiveLobby(lobbyState, cf.env).accept(new FakeSocket());
    await new LiveRoom(roomState, cf.env).accept(new FakeSocket());
    expect(lobbyState.autoResponse).toEqual(new Pair('ping', 'pong'));
    expect(roomState.autoResponse).toEqual(new Pair('ping', 'pong'));
  });

  it('hears of a socket’s end once: its seek goes, and its player is gone from the game', async () => {
    const { lobby, a, b, room, state, pa, pb } = await pairOnCloudflare();
    const c = new FakeSocket();
    lobby.accept(c);
    await lobby.webSocketMessage(c, JSON.stringify(seek({ tc: '3+0', name: 'Quiet Rook' })));
    expect(a.last('lobby')).toMatchObject({ seeks: [{ name: 'Quiet Rook' }], players: 3 });
    c.leave();
    lobby.webSocketClose(c, 1001, '', true);
    expect(a.last('lobby')).toMatchObject({ seeks: [], players: 2 });
    const heard = a.all('lobby').length;
    lobby.webSocketError(c, new Error('Gone.'));
    expect(a.all('lobby')).toHaveLength(heard);
    expect(b.last('lobby')).toMatchObject({ players: 2 });
    // A close the runtime has not answered yet is answered with the client's own code.
    const polite = new FakeSocket();
    const plain = new FakeSocket();
    lobby.accept(polite);
    lobby.accept(plain);
    lobby.webSocketClose(polite, 4000, 'Bye.', true);
    lobby.webSocketClose(plain, 1005, '', true);
    expect(polite.closedWith).toEqual({ code: 4000, reason: '' });
    expect(plain.closedWith).toEqual({ code: 1000, reason: '' });
    expect(a.last('lobby')).toMatchObject({ players: 2 });

    const white = await seated(room, pa.seat);
    const black = await seated(room, pb.seat);
    await room.webSocketMessage(white, JSON.stringify({ t: 'move', uci: 'e2e4', ply: 0 }));
    await room.webSocketMessage(black, JSON.stringify({ t: 'move', uci: 'e7e5', ply: 1 }));
    at(1000);
    black.leave();
    await room.webSocketClose(black, 1001, '', true);
    expect(white.last('present')).toMatchObject({
      white: true,
      black: false,
      gone: { color: 'black', claimInMs: LIMITS.goneClaimMs },
    });
    expect(await state.storage.get('game')).toMatchObject({ goneSince: { black: T0 + 1000 } });
    const told = white.all('present').length;
    await room.webSocketError(black, new Error('Gone.'));
    expect(white.all('present')).toHaveLength(told);
  });

  it('makes a game only when asked from inside: 201, then 409; 400 for what is not a game', async () => {
    const cf = fakeCloudflare();
    const id = randomId(16);
    const spec = {
      id,
      tc: '5+3',
      white: { name: NAME_A, rating: null, seatHash: 'a'.repeat(64) },
      black: { name: NAME_B, rating: 1200, seatHash: 'b'.repeat(64) },
    };
    const rooms = cf.env.LIVE_ROOMS!;
    const create = (body: string) =>
      rooms
        .get(rooms.idFromName(id))
        .fetch('https://live.internal/create', { method: 'POST', body });
    expect((await create(JSON.stringify(spec))).status).toBe(201);
    expect((await create(JSON.stringify(spec))).status).toBe(409);

    const { room, state } = cf.roomOf(randomId(16));
    const post = (url: string, body: string) =>
      room.fetch(new Request(url, { method: 'POST', body }));
    expect((await post('https://live.internal/create', 'Not JSON.')).status).toBe(400);
    expect(
      (await post('https://live.internal/create', JSON.stringify({ ...spec, tc: '0+0' }))).status,
    ).toBe(400);
    // The same path on any other origin is not the way in.
    expect((await post('https://relay.test/create', JSON.stringify(spec))).status).toBe(426);
    expect((await room.fetch(new Request('https://live.internal/create'))).status).toBe(426);
    expect(state.storage.values.size).toBe(0);
  });

  it('answers a WebSocket upgrade with 101 and the client’s end of a new socket', async () => {
    class Pair {
      0 = new FakeSocket();
      1 = new FakeSocket();
    }
    /** Node's Response refuses 101: a stand-in that keeps what it is given. */
    class Switching {
      constructor(
        readonly body: null,
        readonly init: { status: number; webSocket: unknown },
      ) {}
    }
    const cf = fakeCloudflare();
    const lobbyState = new FakeState();
    const lobby = new LiveLobby(lobbyState, cf.env);
    const { room, state } = cf.roomOf(randomId(16));
    const headers = { Upgrade: 'websocket', 'CF-Connecting-IP': '203.0.113.7' };
    const toLobby = new Request('https://relay.test/v1/lobby', { headers });
    const toRoom = new Request(`https://relay.test/v1/games/${randomId(16)}`, { headers });
    vi.stubGlobal('WebSocketPair', Pair);
    vi.stubGlobal('Response', Switching);
    const lobbyAnswer = lobby.fetch(toLobby) as unknown as Switching;
    const roomAnswer = (await room.fetch(toRoom)) as unknown as Switching;
    vi.unstubAllGlobals();

    expect(lobbyAnswer.init.status).toBe(101);
    expect(lobbyAnswer.init.webSocket).toBeInstanceOf(FakeSocket);
    const [server] = lobbyState.sockets;
    expect(lobbyAnswer.init.webSocket).not.toBe(server);
    expect(server.deserializeAttachment()).toMatchObject({ address: '203.0.113.7', seek: null });
    expect(server.last('lobby')).toMatchObject({ players: 1 });

    // A room's socket has a while to say which seat it is.
    expect(roomAnswer.init.status).toBe(101);
    expect(state.sockets[0].deserializeAttachment()).toMatchObject({ seat: null, openedAt: T0 });
    expect(state.storage.alarm).toBe(T0 + LIMITS.helloMs);
    at(LIMITS.helloMs);
    await room.alarm();
    expect(state.sockets[0].closedWith?.code).toBe(CLOSE.noHello);
    expect(state.storage.alarm).toBeNull();
  });
});

describe('the Worker, for live games', () => {
  /** Durable Object namespaces that note what they are handed. */
  function objects() {
    const handed: { binding: string; name: string; url: string }[] = [];
    const namespace = (binding: string): DurableNamespace => ({
      idFromName: (name) => name,
      get: (id) => ({
        fetch: (input) => {
          handed.push({ binding, name: id as string, url: (input as Request).url });
          return Promise.resolve(new Response('Handed over.'));
        },
      }),
    });
    return { handed, LIVE_LOBBY: namespace('LIVE_LOBBY'), LIVE_ROOMS: namespace('LIVE_ROOMS') };
  }

  const socket = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    new Request(`https://relay.test${path}`, {
      method,
      headers: { Origin: ORIGIN, Upgrade: 'websocket', ...headers },
    });

  it('passes sockets from the app’s origin to the objects, and nothing else', async () => {
    const { handed, ...bindings } = objects();
    const env = { ALLOWED_ORIGINS: ORIGIN, ...bindings };
    const game = randomId(16);
    expect(await (await worker.fetch(socket('/v1/lobby'), env)).text()).toBe('Handed over.');
    expect(await (await worker.fetch(socket(`/v1/games/${game}`), env)).text()).toBe(
      'Handed over.',
    );
    expect(handed).toEqual([
      { binding: 'LIVE_LOBBY', name: 'lobby', url: 'https://relay.test/v1/lobby' },
      { binding: 'LIVE_ROOMS', name: game, url: `https://relay.test/v1/games/${game}` },
    ]);

    const status = async (request: Request) => (await worker.fetch(request, env)).status;
    expect(await status(socket('/v1/lobby', { Origin: 'https://elsewhere.test' }))).toBe(403);
    expect(
      await status(
        new Request('https://relay.test/v1/lobby', { headers: { Upgrade: 'websocket' } }),
      ),
    ).toBe(403);
    expect(await status(socket('/v1/lobby', { Upgrade: '' }))).toBe(426);
    expect(await status(socket(`/v1/games/${game}`, {}, 'POST'))).toBe(426);
    // Not a game id, and the objects' own path: the vault API's 404.
    expect(await status(socket('/v1/games/not-a-game'))).toBe(404);
    expect(await status(socket('/create', {}, 'POST'))).toBe(404);
    expect(await status(socket(`/v1/games/${game}/create`, {}, 'POST'))).toBe(404);
    expect(handed).toHaveLength(2);
  });

  it('says whether live games are set up', async () => {
    const health = async (env: Record<string, unknown>) =>
      (
        await worker.fetch(new Request('https://relay.test/v1/health'), env)
      ).json() as Promise<unknown>;
    const { handed: _handed, ...bindings } = objects();
    expect(await health({ ...bindings })).toMatchObject({ ok: true, live: true });
    expect(await health({})).toMatchObject({ ok: true, live: false });
    const missing = await worker.fetch(socket('/v1/lobby'), {});
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Live games are not set up on this relay.' });
  });
});
