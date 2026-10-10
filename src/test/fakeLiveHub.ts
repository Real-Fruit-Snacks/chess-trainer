import { vi } from 'vitest';
import {
  createLiveHub,
  type LiveHub,
  type Socket,
  type SocketEvents,
} from '../../relay/src/live/hub.mjs';

/**
 * The relay's live games — the waiting room and the game rooms of
 * relay/src/live/hub.mjs, the code the relay itself runs — behind a stand-in
 * `WebSocket`, for unit tests of the app's live-games code.
 *
 * Like a browser's, the stand-in never answers inside a call: opening,
 * messages both ways and closing are queued and happen when the test lets
 * them (`settle`), in order. The relay keeps a clock of its own, which only
 * `advance` moves (first moves, flags, claims), so the app's timers (real or
 * Vitest's fake ones) and the relay's never get in each other's way.
 *
 * The other player is a plain client of the relay (`lobbyClient`,
 * `roomClient`): what it is sent lands in its `messages` at once.
 */

/** Captured before any test fakes the timers: settling needs real turns of the event loop. */
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realTick = () => new Promise<void>((resolve) => realSetTimeout(resolve, 0));

export type Message = Record<string, unknown> & { t?: string };

const GAME_PATH = /^\/v1\/games\/([A-Za-z0-9_-]{22})$/;

function closeEvent(code: number, reason: string, wasClean: boolean): CloseEvent {
  if (typeof CloseEvent === 'function') return new CloseEvent('close', { code, reason, wasClean });
  // An environment without CloseEvent: an Event that carries the same fields.
  const event: CloseEvent = Object.assign(new Event('close'), { code, reason, wasClean });
  return event;
}

/** A client of the relay that is not the app: the other player. */
export class RelayClient {
  messages: (Message | 'pong')[] = [];
  closed: { code: number; reason: string } | null = null;
  private readonly events: SocketEvents;
  private readonly track: (work: Promise<unknown>) => void;

  constructor(open: (socket: Socket) => SocketEvents, track: (work: Promise<unknown>) => void) {
    this.track = track;
    const socket: Socket = {
      send: (text) => this.messages.push(text === 'pong' ? 'pong' : (JSON.parse(text) as Message)),
      close: (code, reason) => {
        this.closed = { code, reason };
        queueMicrotask(() => this.track(this.events.close()));
      },
    };
    this.events = open(socket);
  }

  async send(message: Message | string): Promise<void> {
    const work = this.events.message(
      typeof message === 'string' ? message : JSON.stringify(message),
    );
    this.track(work);
    await work;
  }

  /** Leaves: the relay hears of it at once. */
  async leave(): Promise<void> {
    this.closed = { code: 1000, reason: 'left' };
    const work = this.events.close();
    this.track(work);
    await work;
  }

  all(t: string): Message[] {
    return this.messages.filter((m): m is Message => m !== 'pong' && m.t === t);
  }

  last(t: string): Message | undefined {
    return this.all(t).at(-1);
  }

  clear(): void {
    this.messages = [];
  }
}

export interface FakeLiveRelay {
  hub: LiveHub;
  /** Every socket the app opened, oldest first. */
  sockets: FakeWebSocket[];
  /** The app's sockets that are open, on one path ('/v1/lobby', '/v1/games/<id>') or all. */
  openSockets(path?: string): FakeWebSocket[];
  /** While true, the relay cannot be reached: new sockets fail before they open. */
  offline: boolean;
  /** Delivers everything in flight, both ways, until nothing moves. */
  settle(): Promise<void>;
  /** Moves the relay's clock on, firing what falls due, and settles. */
  advance(ms: number): Promise<void>;
  /** Cuts a socket as a lost network does: the app hears of it; the relay too unless told otherwise. */
  drop(socket: FakeWebSocket, options?: { relayNotices?: boolean }): void;
  /** Nothing passes through the socket any more, either way, and nobody is told. */
  silence(socket: FakeWebSocket): void;
  /** The relay at last notices that a socket it still holds is gone. */
  forget(socket: FakeWebSocket): void;
  /** The other player, in the waiting room. */
  lobbyClient(): RelayClient;
  /** The other player, in a game room. */
  roomClient(game: string): RelayClient;
}

export interface FakeWebSocket extends WebSocket {
  /** The path asked for ('/v1/lobby', '/v1/games/<id>'). */
  readonly path: string;
  /** What the app sent, in order. */
  readonly sent: string[];
  /** The messages the app sent, as objects ('ping' left out). */
  sentMessages(): Message[];
  /** How it closed, once it has. */
  closedBy: 'app' | 'relay' | 'network' | null;
  closeCode: number | null;
}

/**
 * Installs the stand-in `WebSocket` over a fresh relay. Undo it with
 * `vi.unstubAllGlobals()`.
 */
export function installFakeLiveRelay(): FakeLiveRelay {
  let time = 1_000_000;
  let timers: { at: number; run: () => void }[] = [];
  const hub = createLiveHub({
    now: () => time,
    timers: {
      set: (at, run) => {
        const handle = { at, run };
        timers.push(handle);
        return handle;
      },
      clear: (handle) => {
        timers = timers.filter((h) => h !== handle);
      },
    },
  });
  const queue: (() => void)[] = [];
  const inflight = new Set<Promise<unknown>>();
  const track = (work: Promise<unknown>) => {
    const done: Promise<unknown> = work
      .catch(() => undefined)
      .finally(() => {
        inflight.delete(done);
      });
    inflight.add(done);
  };
  const sockets: FakeWebSocket[] = [];

  class StandInWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readonly url: string;
    readonly path: string;
    readonly protocol = '';
    readonly extensions = '';
    readonly bufferedAmount = 0;
    binaryType: BinaryType = 'blob';
    readyState = 0;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    readonly sent: string[] = [];
    closedBy: 'app' | 'relay' | 'network' | null = null;
    closeCode: number | null = null;
    /** The network is gone: nothing passes, and the close is the network's. */
    cut = false;
    /** Nothing passes, and nobody hears of it. */
    silenced = false;
    events: SocketEvents | null = null;

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      this.path = new URL(this.url).pathname;
      sockets.push(this as unknown as FakeWebSocket);
      queue.push(() => this.reachRelay());
    }

    sentMessages(): Message[] {
      return this.sent.filter((text) => text !== 'ping').map((text) => JSON.parse(text) as Message);
    }

    send(data: string): void {
      if (this.readyState === 0) throw new DOMException('Still connecting.', 'InvalidStateError');
      if (this.readyState !== 1) return;
      this.sent.push(data);
      if (this.cut || this.silenced) return;
      const events = this.events;
      queue.push(() => {
        if (events) track(events.message(data));
      });
    }

    close(code = 1000, reason = ''): void {
      if (this.readyState === 2 || this.readyState === 3) return;
      const connecting = this.readyState === 0;
      this.readyState = 2;
      this.closedBy = 'app';
      this.closeCode = code;
      queue.push(() => {
        if (this.events && !this.cut && !this.silenced) track(this.events.close());
        this.finish(connecting ? 1006 : code, reason, !connecting);
      });
    }

    private reachRelay(): void {
      if (this.readyState !== 0) return;
      const game = GAME_PATH.exec(this.path)?.[1];
      if (relay.offline || (this.path !== '/v1/lobby' && !game)) {
        this.readyState = 3;
        this.closedBy = 'network';
        this.closeCode = 1006;
        this.fire('error', new Event('error'));
        this.fire('close', closeEvent(1006, '', false));
        return;
      }
      this.readyState = 1;
      const server: Socket = {
        send: (text) => {
          if (this.cut || this.silenced) return;
          queue.push(() => {
            if (this.readyState !== 1 || this.cut || this.silenced) return;
            this.fire('message', new MessageEvent('message', { data: text }));
          });
        },
        close: (code, reason) => {
          queue.push(() => {
            if (this.readyState === 3) return;
            this.closedBy = 'relay';
            this.closeCode = code;
            this.finish(code, reason, true);
            if (this.events) track(this.events.close());
          });
        },
      };
      this.events = game ? hub.openRoom(game, server) : hub.openLobby(server);
      this.fire('open', new Event('open'));
    }

    finish(code: number, reason: string, clean: boolean): void {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.fire('close', closeEvent(code, reason, clean));
    }

    fire(type: 'open' | 'message' | 'close' | 'error', event: Event): void {
      const handler = this[`on${type}`] as ((event: Event) => void) | null;
      handler?.call(this, event);
      this.dispatchEvent(event);
    }
  }

  const relay: FakeLiveRelay = {
    hub,
    sockets,
    offline: false,
    openSockets: (path) =>
      sockets.filter((s) => s.readyState === 1 && (path === undefined || s.path === path)),
    async settle() {
      let quiet = 0;
      for (let round = 0; round < 10_000; round++) {
        for (let i = 0; i < 5; i++) await Promise.resolve();
        if (inflight.size > 0) {
          await Promise.all([...inflight]);
          quiet = 0;
          continue;
        }
        const next = queue.shift();
        if (next) {
          next();
          quiet = 0;
          continue;
        }
        // Nothing queued: let real work finish (digests, response bodies) before calling it settled.
        await realTick();
        if (inflight.size === 0 && queue.length === 0 && ++quiet >= 3) return;
      }
      throw new Error('The fake relay never settled.');
    },
    async advance(ms) {
      const until = time + ms;
      for (;;) {
        await relay.settle();
        const due = timers.filter((h) => h.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((h) => h !== due);
        time = Math.max(time, due.at);
        due.run();
      }
      time = until;
      await relay.settle();
    },
    drop(socket, options = {}) {
      const s = socket as unknown as StandInWebSocket;
      if (s.readyState === 3 || s.cut) return;
      s.cut = true;
      if (options.relayNotices !== false && s.events && !s.silenced) track(s.events.close());
      queue.push(() => {
        s.closedBy = 'network';
        s.closeCode = 1006;
        s.finish(1006, '', false);
      });
    },
    silence(socket) {
      (socket as unknown as StandInWebSocket).silenced = true;
    },
    forget(socket) {
      const events = (socket as unknown as StandInWebSocket).events;
      if (events) track(events.close());
    },
    lobbyClient: () => new RelayClient((socket) => hub.openLobby(socket), track),
    roomClient: (game) => new RelayClient((socket) => hub.openRoom(game, socket), track),
  };

  vi.stubGlobal('WebSocket', StandInWebSocket);
  return relay;
}

/** A `fetch` that answers the relay's health check (live games on or off) and nothing else. */
export function stubHealth(live: boolean | 'unreachable'): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (live === 'unreachable' || !url.endsWith('/v1/health')) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, maxBytes: 1_400_000, live }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
