/**
 * Live games in one process: the waiting room and every game room, in memory.
 * The Node server runs it behind its WebSocket server; the tests run it behind
 * stand-in sockets (and the end-to-end tests behind the browsers' own, through
 * Playwright). On Cloudflare each part is a Durable Object instead
 * (cloudflare.mjs); the rules are the same code either way.
 *
 * A transport hands over each socket as `{ send(text), close(code, reason) }`
 * and passes on what arrives: `message(text)` and `close()`.
 */
import { createLobby, lobbyData } from './lobby.mjs';
import { createRoom, roomData } from './room.mjs';
import { CLOSE } from './shared.mjs';

/**
 * @typedef {{ send(text: string): void, close(code: number, reason: string): void }} Socket
 * @typedef {{ message(text: string): Promise<void>, close(): Promise<void> }} SocketEvents
 * @typedef {{ set(at: number, run: () => void): unknown, clear(handle: unknown): void }} Timers
 */

/** Timers on the event loop: `at` is a time on `now`'s clock. */
function loopTimers(/** @type {() => number} */ now) {
  return /** @type {Timers} */ ({
    set: (at, run) => {
      const handle = setTimeout(run, Math.max(0, at - now()));
      // A Node server's timers must not keep the process alive by themselves.
      if (typeof handle === 'object' && handle !== null && 'unref' in handle) handle.unref();
      return handle;
    },
    clear: (handle) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (handle)),
  });
}

/**
 * @param {{ now?: () => number, timers?: Timers }} [options]
 */
export function createLiveHub(options = {}) {
  const now = options.now ?? Date.now;
  const timers = options.timers ?? loopTimers(now);

  /**
   * @typedef {{ data: import('./lobby.mjs').LobbyData, socket: Socket, open: boolean }} LobbyEntry
   * @typedef {{ data: import('./room.mjs').RoomData, socket: Socket, open: boolean }} RoomSocket
   * @typedef {{
   *   room: ReturnType<typeof createRoom>,
   *   sockets: Set<RoomSocket>,
   *   state: import('./room.mjs').GameState | null,
   *   timer: unknown,
   * }} RoomEntry
   */

  /** @type {Set<LobbyEntry>} */
  const lobbySockets = new Set();
  /** @type {Map<string, RoomEntry>} */
  const rooms = new Map();

  /** @param {{ socket: Socket, open: boolean }} entry */
  const conn = (entry) => ({
    data: /** @type {never} */ (/** @type {{ data: unknown }} */ (entry).data),
    send: (/** @type {string} */ text) => {
      if (entry.open) entry.socket.send(text);
    },
    close: (/** @type {number} */ code, /** @type {string} */ reason) => {
      if (!entry.open) return;
      entry.open = false;
      entry.socket.close(code, reason);
    },
    save: () => undefined,
  });

  /** @param {import('./lobby.mjs').GameSpec} spec */
  async function createGame(spec) {
    await roomEntry(spec.id).room.create(spec);
  }

  const lobby = createLobby({
    connections: () => [...lobbySockets].filter((e) => e.open).map(conn),
    createGame,
    now,
  });

  /** The room for `id`, made on first use (a room without a game says so and closes). */
  function roomEntry(/** @type {string} */ id) {
    const known = rooms.get(id);
    if (known) return known;
    /** @type {RoomEntry} */
    const entry = {
      room: /** @type {never} */ (null),
      sockets: new Set(),
      state: null,
      timer: null,
    };
    entry.room = createRoom({
      connections: () => [...entry.sockets].filter((s) => s.open).map(conn),
      load: async () => (entry.state ? structuredClone(entry.state) : null),
      store: async (state) => {
        entry.state = structuredClone(state);
      },
      remove: async () => {
        entry.state = null;
        forget(id, entry);
      },
      schedule: (at) => {
        if (entry.timer !== null) timers.clear(entry.timer);
        entry.timer = null;
        if (at !== null) {
          entry.timer = timers.set(at, () => {
            entry.timer = null;
            void entry.room.timer().catch(() => undefined);
          });
        }
      },
      createGame,
      now,
    });
    rooms.set(id, entry);
    return entry;
  }

  /** Drops a room that holds no game and no sockets. */
  function forget(/** @type {string} */ id, /** @type {RoomEntry} */ entry) {
    if (entry.state !== null || [...entry.sockets].some((s) => s.open)) return;
    if (entry.timer !== null) timers.clear(entry.timer);
    entry.timer = null;
    if (rooms.get(id) === entry) rooms.delete(id);
  }

  return {
    /**
     * A socket for the waiting room.
     * @param {Socket} socket
     * @param {string} [address] the client's address, for the per-address limit
     * @returns {SocketEvents}
     */
    openLobby(socket, address = '') {
      /** @type {LobbyEntry} */
      const entry = { data: lobbyData(address), socket, open: true };
      lobbySockets.add(entry);
      lobby.open(conn(entry));
      return {
        message: (text) => (entry.open ? lobby.message(conn(entry), text) : Promise.resolve()),
        close: async () => {
          if (!lobbySockets.delete(entry)) return;
          entry.open = false;
          lobby.close(conn(entry));
        },
      };
    },

    /**
     * A socket for the room of game `id`.
     * @param {string} id
     * @param {Socket} socket
     * @returns {SocketEvents}
     */
    openRoom(id, socket) {
      const room = roomEntry(id);
      /** @type {RoomSocket} */
      const entry = { data: roomData(now()), socket, open: true };
      room.sockets.add(entry);
      void room.room.open(conn(entry)).catch(() => undefined);
      return {
        message: (text) => (entry.open ? room.room.message(conn(entry), text) : Promise.resolve()),
        close: async () => {
          if (!room.sockets.delete(entry)) return;
          const wasOpen = entry.open;
          entry.open = false;
          if (wasOpen || entry.data.seat) await room.room.close(conn(entry));
          forget(id, room);
        },
      };
    },

    /** How many games are kept, for the tests and the health check. */
    games: () => [...rooms.values()].filter((e) => e.state !== null).length,

    /** Closes every socket (the server is stopping). */
    closeAll() {
      for (const entry of lobbySockets) conn(entry).close(CLOSE.closed, 'The relay is stopping.');
      for (const room of rooms.values()) {
        for (const entry of room.sockets) conn(entry).close(CLOSE.closed, 'The relay is stopping.');
        if (room.timer !== null) timers.clear(room.timer);
      }
    },
  };
}
