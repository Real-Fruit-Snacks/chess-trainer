/**
 * Live games on Cloudflare: the waiting room and each game room as a Durable
 * Object (SQLite-backed, the kind the Workers Free plan has), each running the
 * same platform-free core as the Node server (lobby.mjs, room.mjs).
 *
 *   LiveLobby  one object (named 'lobby'): the sockets of `GET /v1/lobby`
 *   LiveRoom   one object per game (named by the game's id): `GET /v1/games/:id`
 *
 * Sockets go through the WebSocket Hibernation API: an object whose sockets
 * are quiet is evicted from memory without dropping them, and woken (a new
 * instance, its core loading lazily) when a message or an alarm comes. Each
 * socket's own data travels as its attachment; a game is kept in the room's
 * storage under 'game', and its next deadline (a flag, a first move, the
 * room's end) is the room's alarm. Raw `ping` is answered with `pong` by the
 * runtime itself, without waking the object.
 *
 * The waiting room makes a game by POSTing its spec to the room's object at
 * https://live.internal/create; so does a room for a rematch. The Worker
 * (worker.mjs) passes on WebSocket upgrades only, so nobody outside can.
 *
 * The classes are written the old way (a constructor taking the state and the
 * environment, no `cloudflare:workers` import) so the tests can run them under
 * Node against stand-ins.
 */
import { createLobby, lobbyData } from './lobby.mjs';
import { createRoom, roomData } from './room.mjs';

/** WebSocket.OPEN. */
const OPEN = 1;
/** The origin of requests between the objects. */
const INTERNAL = 'https://live.internal';

/**
 * @typedef {{
 *   readyState: number,
 *   send(message: string): void,
 *   close(code?: number, reason?: string): void,
 *   serializeAttachment(value: unknown): void,
 *   deserializeAttachment(): any,
 * }} DurableSocket
 *
 * @typedef {{
 *   get(key: string): Promise<any>,
 *   put(key: string, value: unknown): Promise<void>,
 *   deleteAll(): Promise<void>,
 *   setAlarm(at: number): Promise<void>,
 *   deleteAlarm(): Promise<void>,
 * }} DurableStorage
 *
 * @typedef {{
 *   storage: DurableStorage,
 *   acceptWebSocket(ws: DurableSocket): void,
 *   getWebSockets(): DurableSocket[],
 *   setWebSocketAutoResponse(pair?: unknown): void,
 * }} DurableState
 *
 * @typedef {{
 *   idFromName(name: string): unknown,
 *   get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> },
 * }} DurableNamespace
 *
 * @typedef {{ LIVE_LOBBY?: DurableNamespace, LIVE_ROOMS?: DurableNamespace }} LiveEnv
 */

/**
 * Makes a game room: for the waiting room after a pairing, and for a room
 * after a rematch. Throws unless the room took it.
 * @param {LiveEnv} env
 * @param {import('./lobby.mjs').GameSpec} spec
 */
async function createGame(env, spec) {
  const rooms = env.LIVE_ROOMS;
  if (!rooms) throw new Error('No LIVE_ROOMS binding.');
  const response = await rooms.get(rooms.idFromName(spec.id)).fetch(`${INTERNAL}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  if (!response.ok) throw new Error(`The game room answered ${response.status}.`);
}

/** Lets the runtime answer `ping` with `pong`, when it can, so a ping never wakes the object. */
function answerPings(/** @type {DurableState} */ state) {
  const { WebSocketRequestResponsePair } = /** @type {any} */ (globalThis);
  if (typeof WebSocketRequestResponsePair === 'function') {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
}

/** Whether a request asks for a WebSocket. */
const isUpgrade = (/** @type {Request} */ request) =>
  request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

/**
 * A new WebSocket pair: the end to hand back in the 101 response, and the
 * object's own end.
 * @returns {[unknown, DurableSocket]}
 */
function socketPair() {
  const { WebSocketPair } = /** @type {any} */ (globalThis);
  const pair = new WebSocketPair();
  return [pair[0], pair[1]];
}

/** The 101 response that hands the client its end of the socket. */
const switching = (/** @type {unknown} */ client) =>
  new Response(null, /** @type {ResponseInit} */ ({ status: 101, webSocket: client }));

/**
 * The sockets of one object as a core sees them. A socket's data comes from
 * its attachment, read once per instance (so every view of a socket shares
 * one object, as on the Node server) and written back by `save()`. A socket
 * that has been closed, by either side, no longer counts: `getWebSockets()`
 * may go on listing it for a while.
 * @param {DurableState} state
 */
function socketsOf(state) {
  /** @type {WeakMap<DurableSocket, any>} */
  const data = new WeakMap();
  /** @type {WeakSet<DurableSocket>} */
  const closed = new WeakSet();
  /** Sockets whose end the core has heard of. */
  /** @type {WeakSet<DurableSocket>} */
  const ended = new WeakSet();

  /** @param {DurableSocket} ws */
  function conn(ws) {
    if (!data.has(ws)) data.set(ws, ws.deserializeAttachment());
    const own = data.get(ws);
    return {
      data: own,
      send(/** @type {string} */ text) {
        if (closed.has(ws)) return;
        try {
          ws.send(text);
        } catch {
          // Closing: its close event tidies up.
        }
      },
      close(/** @type {number} */ code, /** @type {string} */ reason) {
        if (closed.has(ws)) return;
        closed.add(ws);
        try {
          ws.close(code, reason);
        } catch {
          // Closed already.
        }
      },
      save: () => ws.serializeAttachment(own),
    };
  }

  return {
    conn,
    /** Whether the socket has been closed. */
    isClosed: (/** @type {DurableSocket} */ ws) => closed.has(ws),
    /**
     * Takes a new socket, with its first data.
     * @param {DurableSocket} ws
     * @param {object} first
     */
    accept(ws, first) {
      state.acceptWebSocket(ws);
      ws.serializeAttachment(first);
      data.set(ws, first);
      return conn(ws);
    },
    /** The open sockets. */
    open: () =>
      state
        .getWebSockets()
        .filter((ws) => ws.readyState === OPEN && !closed.has(ws))
        .map(conn),
    /**
     * A socket has closed or failed: true the first time, when the core is to
     * hear of it. A close the runtime has not answered yet is answered with
     * the peer's own code (1000 when a server may not send that one).
     * @param {DurableSocket} ws
     * @param {number} [code] the code in the peer's close frame
     */
    end(ws, code = 1000) {
      if (!closed.has(ws)) {
        closed.add(ws);
        try {
          ws.close(code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000, '');
        } catch {
          // Closed already.
        }
      }
      if (ended.has(ws)) return false;
      ended.add(ws);
      return true;
    },
  };
}

/** The waiting room: one object for every socket of `GET /v1/lobby`. */
export class LiveLobby {
  /**
   * @param {DurableState} state
   * @param {LiveEnv} env
   */
  constructor(state, env) {
    this.sockets = socketsOf(state);
    this.lobby = createLobby({
      connections: () => this.sockets.open(),
      createGame: (spec) => createGame(env, spec),
      now: () => Date.now(),
    });
    answerPings(state);
  }

  /** A socket for the waiting room (the Worker has checked its origin). */
  fetch(/** @type {Request} */ request) {
    if (!isUpgrade(request)) return new Response('Connect with a WebSocket.', { status: 426 });
    const [client, server] = socketPair();
    this.accept(server, request.headers.get('CF-Connecting-IP') ?? '');
    return switching(client);
  }

  /**
   * Takes the object's end of a new socket into the waiting room: what `fetch`
   * does, apart from making the socket and the 101 response.
   * @param {DurableSocket} ws
   * @param {string} [address] the client's address, for the limit per address
   */
  accept(ws, address = '') {
    this.lobby.open(this.sockets.accept(ws, lobbyData(address)));
  }

  /**
   * @param {DurableSocket} ws
   * @param {string | ArrayBuffer} message
   */
  async webSocketMessage(ws, message) {
    if (this.sockets.isClosed(ws)) return;
    const conn = this.sockets.conn(ws);
    if (typeof message !== 'string') return conn.close(1003, 'Only text messages are taken.');
    await this.lobby.message(conn, message);
  }

  /** @param {DurableSocket} ws @param {number} [code] */
  webSocketClose(ws, code) {
    if (this.sockets.end(ws, code)) this.lobby.close(this.sockets.conn(ws));
  }

  /** @param {DurableSocket} ws */
  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}

/** One game: an object per game, named by its id. */
export class LiveRoom {
  /**
   * @param {DurableState} state
   * @param {LiveEnv} env
   */
  constructor(state, env) {
    const storage = state.storage;
    this.storage = storage;
    this.sockets = socketsOf(state);
    // Made once per instance: it reads the game from storage when first needed.
    this.room = createRoom({
      connections: () => this.sockets.open(),
      load: async () => (await storage.get('game')) ?? null,
      store: (game) => storage.put('game', game),
      remove: async () => {
        await storage.deleteAlarm();
        await storage.deleteAll();
      },
      schedule: (at) => (at === null ? storage.deleteAlarm() : storage.setAlarm(at)),
      createGame: (spec) => createGame(env, spec),
      now: () => Date.now(),
    });
    answerPings(state);
  }

  /**
   * POST https://live.internal/create with a game's spec makes the game (201;
   * 409 when it exists already). Anything else must be a socket for the room.
   * @param {Request} request
   */
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.origin === INTERNAL && url.pathname === '/create') {
      return this.create(request);
    }
    if (!isUpgrade(request)) return new Response('Connect with a WebSocket.', { status: 426 });
    const [client, server] = socketPair();
    await this.accept(server);
    return switching(client);
  }

  /** @param {Request} request */
  async create(request) {
    /** @type {import('./lobby.mjs').GameSpec} */
    let spec;
    try {
      spec = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    try {
      await this.room.create(spec);
      return new Response(null, { status: 201 });
    } catch {
      const exists = (await this.storage.get('game')) != null;
      return new Response(null, { status: exists ? 409 : 400 });
    }
  }

  /**
   * Takes the object's end of a new socket into the room: what `fetch` does,
   * apart from making the socket and the 101 response. The socket then has a
   * while to say which seat it is.
   * @param {DurableSocket} ws
   */
  async accept(ws) {
    await this.room.open(this.sockets.accept(ws, roomData(Date.now())));
  }

  /**
   * @param {DurableSocket} ws
   * @param {string | ArrayBuffer} message
   */
  async webSocketMessage(ws, message) {
    if (this.sockets.isClosed(ws)) return;
    const conn = this.sockets.conn(ws);
    if (typeof message !== 'string') return conn.close(1003, 'Only text messages are taken.');
    await this.room.message(conn, message);
  }

  /** @param {DurableSocket} ws @param {number} [code] */
  async webSocketClose(ws, code) {
    if (this.sockets.end(ws, code)) await this.room.close(this.sockets.conn(ws));
  }

  /** @param {DurableSocket} ws */
  webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  /** Something is due: a flag, a first move, a hello, or the room's end. */
  alarm() {
    return this.room.timer();
  }
}
