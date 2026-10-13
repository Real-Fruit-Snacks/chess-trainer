/**
 * Live games in one process: the waiting room and every game room, in memory.
 * The Node server runs it behind its WebSocket server; the tests run it behind
 * stand-in sockets (and the end-to-end tests behind the browsers' own, through
 * Playwright). On Cloudflare each part is a Durable Object instead
 * (cloudflare.mjs); the rules are the same code either way.
 *
 * A transport hands over each socket as `{ send(text), close(code, reason) }`
 * and passes on what arrives: `message(text)` and `close()`.
 *
 * Everything lives in memory: a restart loses the games under way, the
 * correspondence games among them (a relay that must keep those runs on
 * Cloudflare, where each room keeps its game in its Durable Object's storage).
 * `notify`, when given, pushes correspondence players who are away;
 * `chess960Position`, when given, draws the start of every new Chess960 game
 * (the end-to-end tests fix it).
 *
 * Group rooms (group.mjs: a puzzle race for up to eight, a game analysed
 * together) live here too, one per room id, made by the waiting room (or a
 * game's analysis room by the game's room) and opened with `openGroup`. A
 * game's room that aborts a game for a first move that never came tells the
 * waiting room directly (`noShow`).
 *
 * `counted`, when given, hears of each write a game's or a group's room makes
 * to its storage and each timer it sets or clears (on Cloudflare, each a row
 * written): the tests count them.
 */
import { createGroup, groupData } from './group.mjs';
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
 * @param {{
 *   now?: () => number,
 *   timers?: Timers,
 *   notify?: import('./room.mjs').RoomPlatform['notify'],
 *   chess960Position?: () => number,
 *   counted?: (room: string, what: 'store' | 'schedule' | 'remove') => void,
 *   secret?: string,
 * }} [options]
 */
export function createLiveHub(options = {}) {
  const now = options.now ?? Date.now;
  const timers = options.timers ?? loopTimers(now);
  const notify = options.notify;
  const chess960Position = options.chess960Position;
  const counted = options.counted ?? (() => undefined);

  /**
   * @typedef {{ data: import('./lobby.mjs').LobbyData, socket: Socket, open: boolean }} LobbyEntry
   * @typedef {{ data: import('./room.mjs').RoomData, socket: Socket, open: boolean }} RoomSocket
   * @typedef {{
   *   room: ReturnType<typeof createRoom>,
   *   sockets: Set<RoomSocket>,
   *   state: import('./room.mjs').GameState | null,
   *   timer: unknown,
   * }} RoomEntry
   * @typedef {{ data: import('./group.mjs').GroupData, socket: Socket, open: boolean }} GroupSocket
   * @typedef {{
   *   group: ReturnType<typeof createGroup>,
   *   sockets: Set<GroupSocket>,
   *   state: import('./group.mjs').GroupState | null,
   *   timer: unknown,
   * }} GroupEntry
   */

  /** @type {Set<LobbyEntry>} */
  const lobbySockets = new Set();
  /** @type {Map<string, RoomEntry>} */
  const rooms = new Map();
  /** @type {Map<string, GroupEntry>} */
  const groups = new Map();

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

  /**
   * Makes a group room (for the waiting room, and for a game's analysis), or
   * finds it made already. Throws when it cannot be made.
   * @param {import('./group.mjs').GroupSpec} spec
   * @returns {Promise<'created' | 'exists'>}
   */
  async function makeGroup(spec) {
    const entry = groupEntry(spec.id);
    try {
      await entry.group.create(spec);
      return 'created';
    } catch (err) {
      if (entry.state !== null) return 'exists';
      forgetGroup(spec.id, entry);
      throw err;
    }
  }

  /** The waiting room's own storage (its counts per address, kept as hashes), in memory. */
  const lobbyStore = new Map();
  const lobby = createLobby({
    connections: () => [...lobbySockets].filter((e) => e.open).map(conn),
    createGame,
    createGroup: makeGroup,
    storage: {
      get: async (key) => structuredClone(lobbyStore.get(key)),
      put: async (key, value) => {
        lobbyStore.set(key, structuredClone(value));
      },
    },
    timers,
    now,
    secret: options.secret,
  });

  /** The group room for `id`, made on first use (a room without a state says so and closes). */
  function groupEntry(/** @type {string} */ id) {
    const known = groups.get(id);
    if (known) return known;
    /** @type {GroupEntry} */
    const entry = {
      group: /** @type {never} */ (null),
      sockets: new Set(),
      state: null,
      timer: null,
    };
    entry.group = createGroup({
      connections: () => [...entry.sockets].filter((s) => s.open).map(conn),
      load: async () => (entry.state ? structuredClone(entry.state) : null),
      store: async (state) => {
        counted(id, 'store');
        entry.state = structuredClone(state);
      },
      remove: async () => {
        counted(id, 'remove');
        entry.state = null;
        forgetGroup(id, entry);
      },
      schedule: (at) => {
        counted(id, 'schedule');
        if (entry.timer !== null) timers.clear(entry.timer);
        entry.timer = null;
        if (at !== null) {
          entry.timer = timers.set(at, () => {
            entry.timer = null;
            void entry.group.timer().catch(() => undefined);
          });
        }
      },
      // Its timer in memory (a socket's time to say hello, its light changes' write).
      timers,
      now,
    });
    groups.set(id, entry);
    return entry;
  }

  /** Drops a group room that holds no state and no sockets. */
  function forgetGroup(/** @type {string} */ id, /** @type {GroupEntry} */ entry) {
    if (entry.state !== null || [...entry.sockets].some((s) => s.open)) return;
    if (entry.timer !== null) timers.clear(entry.timer);
    entry.timer = null;
    if (groups.get(id) === entry) groups.delete(id);
  }

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
        counted(id, 'store');
        entry.state = structuredClone(state);
      },
      remove: async () => {
        counted(id, 'remove');
        entry.state = null;
        forget(id, entry);
      },
      schedule: (at) => {
        counted(id, 'schedule');
        if (entry.timer !== null) timers.clear(entry.timer);
        entry.timer = null;
        if (at !== null) {
          entry.timer = timers.set(at, () => {
            entry.timer = null;
            void entry.room.timer().catch(() => undefined);
          });
        }
      },
      // Its timer in memory (a socket's time to say hello, its light changes' write).
      timers,
      createGame,
      createGroup: makeGroup,
      now,
      notify,
      chess960Position,
      // A player who never made their first move: the waiting room counts it, in this process.
      noShow: (key) => lobby.noShow(key),
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
     * @param {string} [address] the address the client counts under, for the limits per
     *   address (an IPv6 address's /64, as `addressKey` gives it)
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
     * @param {string} [address] the client's address, for the room's limit per address
     * @returns {SocketEvents}
     */
    openRoom(id, socket, address = '') {
      const room = roomEntry(id);
      /** @type {RoomSocket} */
      const entry = { data: roomData(now(), address), socket, open: true };
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

    /**
     * A socket for the group room `id`.
     * @param {string} id
     * @param {Socket} socket
     * @param {string} [address] the client's address, for the room's limit per address
     * @returns {SocketEvents}
     */
    openGroup(id, socket, address = '') {
      const group = groupEntry(id);
      /** @type {GroupSocket} */
      const entry = { data: groupData(now(), address), socket, open: true };
      group.sockets.add(entry);
      void group.group.open(conn(entry)).catch(() => undefined);
      return {
        message: (text) =>
          entry.open ? group.group.message(conn(entry), text) : Promise.resolve(),
        close: async () => {
          if (!group.sockets.delete(entry)) return;
          const wasOpen = entry.open;
          entry.open = false;
          if (wasOpen || entry.data.member) await group.group.close(conn(entry));
          forgetGroup(id, group);
        },
      };
    },

    /** How many games are kept, for the tests and the health check. */
    games: () => [...rooms.values()].filter((e) => e.state !== null).length,

    /** How many group rooms are kept, for the tests. */
    groups: () => [...groups.values()].filter((e) => e.state !== null).length,

    /** Closes every socket (the server is stopping). */
    closeAll() {
      for (const entry of lobbySockets) conn(entry).close(CLOSE.closed, 'The relay is stopping.');
      for (const room of rooms.values()) {
        for (const entry of room.sockets) conn(entry).close(CLOSE.closed, 'The relay is stopping.');
        if (room.timer !== null) timers.clear(room.timer);
      }
      for (const group of groups.values()) {
        const stopping = 'The relay is stopping.';
        for (const entry of group.sockets) conn(entry).close(CLOSE.closed, stopping);
        if (group.timer !== null) timers.clear(group.timer);
      }
    },
  };
}
