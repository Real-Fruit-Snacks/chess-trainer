/**
 * The waiting room of live games, free of any platform (the Worker's Durable
 * Object and the Node server run it the same way). Each socket may hold one
 * open game, a "seek": the game (chess, a variant of it, or a duel) with its
 * options, a time control and a colour for the games of chess, the poster's
 * name and rating. A seek lives as long as its socket. Posting a public seek
 * that matches one already waiting pairs the two at once; any seek can also be
 * joined by its id (a private one only that way, from the link its poster
 * shared).
 *
 * Every seek comes with a secret its poster made (32 random bytes), and its id
 * is derived from it: the first 16 bytes of the secret's SHA-256 (`seekIdOf`).
 * Only whoever holds the secret can post under the id, so the poster posts the
 * game again under the same id after a reconnection (a link shared before
 * still finds it), and nobody else can take the id, however it was seen. A
 * post under an id that another socket holds is the poster's own, from a new
 * socket: the seek is handed over. The lobby keeps nothing of the secret, so
 * this holds through a restart (a deploy drops every socket at once) too.
 *
 * Pairing makes a game room (`platform.createGame`) with the hashes of two new
 * seat tokens, and sends each player their own token: only the two of them
 * can take a seat in the room. In a duel the poster (whose device sends the
 * rounds) takes the white seat.
 *
 * A correspondence game (days a move: chess or Chess960) is never a seek:
 * `create` makes its room at once, with the poster's seat and an open one that
 * whoever has the link takes in the room itself (room.mjs). The poster goes
 * straight to the board to send that link.
 *
 * A group room (group.mjs: a puzzle race for up to eight, a game analysed
 * together) is made here too: `create-room` makes it at once
 * (`platform.createGroup`) with its maker as host, and hands them the room's
 * id and their member token; the others come by its link. An analysis room
 * comes with its game, so `create-room` may be as large as
 * `LIMITS.contentBytes`.
 *
 * Limits, so that nobody can use up the free plan's allowances for everyone:
 *
 * - Making things: one address may make `GROUP_LIMITS.rooms` group rooms,
 *   `LIMITS.invites` invitations and be paired into `ABUSE_LIMITS.pairings`
 *   games an hour. The counts are kept in the platform's storage (a new socket
 *   starts where the last one left off), each address only as a salted hash
 *   (see `addressCounts`).
 * - Waiting: `ABUSE_LIMITS.seeksPerAddress` seeks from one address at once,
 *   public and private together; `LIMITS.seeks` public ones in all, and
 *   `LIMITS.privateSeeks` private ones apart from those.
 * - Messages: `LIMITS.rateMessages` a socket in `LIMITS.rateWindowMs`, and
 *   `ABUSE_LIMITS.refusals` refused ones in `refusalWindowMs`: past either,
 *   the socket is closed.
 * - The list goes to everyone at most once in `BROADCAST_MS`, and only when
 *   it has changed.
 *
 * A socket without an address (the Node server's own, with no proxy in front)
 * is counted on its own: it holds no more than one seek, and its counts are
 * its own.
 */
import { hashToken } from '../handler.mjs';
import {
  ABUSE_LIMITS,
  CLOSE,
  COLOR_CHOICES,
  CORRESPONDENCE_GAMES,
  DAY_MS,
  gameOptions,
  GROUP_LIMITS,
  groupOptions,
  ID_PATTERN,
  isCorrespondence,
  isDuel,
  isGame,
  isGroupKind,
  isPlayerName,
  isRating,
  LIMITS,
  parseTimeControl,
  randomId,
  refusedTooOften,
  sameOptions,
  SEAT_PATTERN,
  seekIdOf,
} from './shared.mjs';

/** The list of games goes to everyone at most this often: changes in between wait for the next. */
export const BROADCAST_MS = 500;

/** Where the lobby keeps its counts in the platform's storage. */
const SALT_KEY = 'salt';
const COUNTS_KEY = 'counts:';
/** The addresses' counts are spread over this many keys, each keeping this many addresses. */
const SHARDS = 64;
const PER_SHARD = 16;

/** What one address may make, and in how long. */
const MAKES = Object.freeze({
  rooms: { limit: GROUP_LIMITS.rooms, windowMs: GROUP_LIMITS.roomsWindowMs },
  invites: { limit: LIMITS.invites, windowMs: LIMITS.invitesWindowMs },
  pairings: { limit: ABUSE_LIMITS.pairings, windowMs: ABUSE_LIMITS.pairingsWindowMs },
});
const KINDS = /** @type {(keyof typeof MAKES)[]} */ (Object.keys(MAKES));

/**
 * @typedef {'random' | 'white' | 'black'} ColorChoice
 *
 * @typedef {{
 *   id: string,
 *   game: string,
 *   opts: Record<string, string | number>,
 *   tc: string | null,
 *   color: ColorChoice,
 *   name: string,
 *   rating: number | null,
 *   private: boolean,
 *   at: number,
 * }} Seek
 *
 * @typedef {{
 *   id: string,
 *   address: string,
 *   seek: Seek | null,
 *   rateStart: number,
 *   rateCount: number,
 *   refused?: { start: number, count: number },
 *   turnedAway?: boolean,
 * }} LobbyData
 *   `refused`: the socket's refused messages lately (`refusedTooOften`);
 *   `turnedAway`: the socket was refused as it came (the room was full).
 *
 * @typedef {{
 *   data: LobbyData,
 *   send(text: string): void,
 *   close(code: number, reason: string): void,
 *   save(): void,
 * }} LobbyConn
 *
 * @typedef {{ name: string, rating: number | null, seatHash: string }} SeatSpec
 * @typedef {{
 *   id: string,
 *   game?: string,
 *   opts?: Record<string, string | number>,
 *   tc: string | null,
 *   white: SeatSpec,
 *   black: SeatSpec,
 *   open?: 'white' | 'black' | null,
 *   position?: number | null,
 * }} GameSpec
 *
 * A seat nobody holds yet (a correspondence invitation's): `open` names it,
 * and its SeatSpec has an empty name and hash. `position`: a Chess960 game's
 * start position (a rematch's; none, and the room draws one).
 *
 * @typedef {{
 *   get(key: string): Promise<unknown>,
 *   put(key: string, value: unknown): Promise<void>,
 * }} LobbyStorage
 *
 * @typedef {{
 *   connections(): LobbyConn[],
 *   createGame(spec: GameSpec): Promise<void>,
 *   createGroup?: (spec: import('./group.mjs').GroupSpec) => Promise<'created' | 'exists'>,
 *   storage: LobbyStorage,
 *   timers: { set(at: number, run: () => void): unknown },
 *   now(): number,
 * }} LobbyPlatform
 *   `createGroup`: makes a group room, or finds it made already (none: rooms
 *   are not made here); it throws when the room cannot be made. `storage`:
 *   the lobby's own (its counts per address), kept across restarts where the
 *   platform can. `timers`:
 *   runs `run` at `at` (on `now`'s clock); on Cloudflare a timer pending keeps
 *   the object awake, so the lobby sets none longer than `BROADCAST_MS`.
 *
 * @typedef {'rooms' | 'invites' | 'pairings'} Make
 * @typedef {{ key: string, at: number, rooms?: number[], invites?: number[], pairings?: number[] }} Counted
 * @typedef {{ day: number, entries: Counted[] }} Shard
 * @typedef {{ hash: string, index: number, shard: Shard }} CountKey
 */

/** A new socket's data (kept with the socket: a Durable Object keeps it across hibernation). */
export function lobbyData(address = '') {
  return /** @type {LobbyData} */ ({
    id: randomId(16),
    address,
    seek: null,
    rateStart: 0,
    rateCount: 0,
  });
}

/** @param {LobbyConn} conn @param {unknown} message */
function send(conn, message) {
  try {
    conn.send(JSON.stringify(message));
  } catch {
    // A socket that is closing takes nothing more; its close event tidies up.
  }
}

/** The JSON object a message carries, or null. */
function parse(/** @type {string} */ text) {
  try {
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  } catch {
    return null;
  }
}

/** Whether two colour choices can meet (not both white, not both black). */
function compatible(/** @type {ColorChoice} */ a, /** @type {ColorChoice} */ b) {
  return !(a !== 'random' && a === b);
}

/**
 * Who plays white when `owner` (the seek that waited) meets `joiner`.
 * @param {ColorChoice} owner @param {ColorChoice} joiner
 * @returns {'owner' | 'joiner'}
 */
function whiteOf(owner, joiner) {
  if (owner === 'white' || joiner === 'black') return 'owner';
  if (owner === 'black' || joiner === 'white') return 'joiner';
  return crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'owner' : 'joiner';
}

/** @param {Seek} seek */
const listed = (seek) => ({
  id: seek.id,
  game: seek.game,
  opts: seek.opts,
  tc: seek.tc,
  color: seek.color,
  name: seek.name,
  rating: seek.rating,
});

/**
 * Whether a seek posted now (`game`, `opts`, `tc`, `color`) matches one waiting:
 * the same game with the same options, and for chess the same time control and
 * colours that can meet.
 * @param {Seek} waiting
 * @param {{ game: string, opts: Record<string, string | number>, tc: string | null, color: ColorChoice }} wants
 */
function matches(waiting, wants) {
  if (waiting.private || waiting.game !== wants.game) return false;
  if (!sameOptions(waiting.opts, wants.opts)) return false;
  if (isDuel(wants.game)) return true;
  return waiting.tc === wants.tc && compatible(waiting.color, wants.color);
}

/** Whether `value` is a list of numbers (times, as stored). */
const isTimes = (/** @type {unknown} */ value) =>
  Array.isArray(value) && value.every((at) => typeof at === 'number');

/**
 * What each address has made lately (group rooms, invitations, games paired),
 * kept in the platform's storage so that reconnecting starts nothing over.
 * An address is kept only as a salted hash: the first 16 bytes of the SHA-256
 * of a random salt and the address. The salt is replaced on the first count of
 * each UTC day, and every count with it (the hashes kept before then match
 * nothing any more). The hashes are spread over `SHARDS` keys of `PER_SHARD`
 * addresses each, the one counted longest ago dropped for a new one; a count
 * writes its one key, times outside their window dropped as it goes. A key
 * written on an earlier day is not deleted (a delete costs a row written, as
 * a write does): it stays under its retired salt, matching nothing and read
 * as empty, until the day's first count in it overwrites it.
 * @param {LobbyStorage} storage
 */
function addressCounts(storage) {
  /** @type {{ day: number, value: string } | null} */
  let salt = null;
  let saltRead = false;
  /** The keys read (or written) so far, by number. @type {Map<number, Shard>} */
  const shards = new Map();

  /** Today's salt: the stored one, or a new one (which starts the counts over). */
  async function saltOf(/** @type {number} */ now) {
    if (!saltRead) {
      const stored = /** @type {any} */ (await storage.get(SALT_KEY).catch(() => null));
      if (!saltRead) {
        saltRead = true;
        const valid = typeof stored?.day === 'number' && typeof stored?.value === 'string';
        salt = valid ? { day: stored.day, value: stored.value } : null;
      }
    }
    const day = Math.floor(now / DAY_MS);
    if (salt === null || salt.day !== day) {
      salt = { day, value: randomId(32) };
      shards.clear();
      await storage.put(SALT_KEY, salt).catch(() => undefined);
    }
    return salt;
  }

  /** The shard `index` as of `day`, read once. */
  async function shardOf(/** @type {number} */ index, /** @type {number} */ day) {
    const known = shards.get(index);
    if (known?.day === day) return known;
    const stored = /** @type {any} */ (await storage.get(COUNTS_KEY + index).catch(() => null));
    const meanwhile = shards.get(index);
    if (meanwhile?.day === day) return meanwhile;
    const valid = stored?.day === day && Array.isArray(stored.entries);
    /** @type {Counted[]} */
    const entries = valid ? stored.entries : [];
    /** @type {Shard} */
    const shard = {
      day,
      entries: entries.filter((e) => typeof e?.key === 'string' && typeof e.at === 'number'),
    };
    shards.set(index, shard);
    return shard;
  }

  /** The times of `kind` in `entry` that are still within their window. */
  const recent = (
    /** @type {Counted | undefined} */ entry,
    /** @type {Make} */ kind,
    /** @type {number} */ now,
  ) => {
    const times = entry?.[kind];
    return isTimes(times)
      ? /** @type {number[]} */ (times).filter((at) => now - at < MAKES[kind].windowMs)
      : [];
  };

  return {
    /**
     * What `data`'s socket is counted under: its address, or the socket itself.
     * @param {LobbyData} data
     * @param {number} now
     * @returns {Promise<CountKey>}
     */
    async keyOf(data, now) {
      const { day, value } = await saltOf(now);
      const who = data.address ? `address ${data.address}` : `socket ${data.id}`;
      const hash = (await hashToken(`${value} ${who}`)).slice(0, 32);
      const index = parseInt(hash.slice(0, 2), 16) % SHARDS;
      return { hash, index, shard: await shardOf(index, day) };
    },

    /** Whether the key may make one more `kind` now. */
    allows(/** @type {CountKey} */ key, /** @type {Make} */ kind, /** @type {number} */ now) {
      const entry = key.shard.entries.find((e) => e.key === key.hash);
      return recent(entry, kind, now).length < MAKES[kind].limit;
    },

    /** Counts one `kind` made now (in memory: `save` keeps it). */
    record(/** @type {CountKey} */ key, /** @type {Make} */ kind, /** @type {number} */ now) {
      const { shard } = key;
      /** An entry with only its times still within their window; null when none are. */
      const pruned = (/** @type {Counted} */ e) => {
        /** @type {Counted} */
        const kept = { key: e.key, at: e.at };
        let any = false;
        for (const k of KINDS) {
          const times = recent(e, k, now);
          if (times.length === 0) continue;
          kept[k] = times;
          any = true;
        }
        return any ? kept : null;
      };
      const before = shard.entries.find((e) => e.key === key.hash);
      const entry = (before && pruned(before)) ?? { key: key.hash, at: now };
      entry[kind] = [...(entry[kind] ?? []), now];
      entry.at = now;
      const others = shard.entries
        .filter((e) => e.key !== key.hash)
        .flatMap((e) => pruned(e) ?? []);
      // The newest first: past PER_SHARD, the addresses counted longest ago go.
      shard.entries = [entry, ...others.sort((a, b) => b.at - a.at)].slice(0, PER_SHARD);
    },

    /** Writes the keys' shards (one write each; a failed write leaves the count in memory). */
    async save(/** @type {CountKey[]} */ ...keys) {
      const written = new Set();
      for (const { index, shard } of keys) {
        if (written.has(index)) continue;
        written.add(index);
        await storage.put(COUNTS_KEY + index, shard).catch(() => undefined);
      }
    },
  };
}

/**
 * @param {LobbyPlatform} platform
 */
export function createLobby(platform) {
  const counts = addressCounts(platform.storage);
  /** The list as last sent to everyone, when, and the broadcast waiting to go. */
  let lastList = '';
  let lastSent = -Infinity;
  let pending = false;

  /** The open seeks, oldest first. */
  function seeks() {
    return platform
      .connections()
      .filter((c) => c.data.seek !== null)
      .map((c) => ({ conn: c, seek: /** @type {Seek} */ (c.data.seek) }))
      .sort((a, b) => a.seek.at - b.seek.at);
  }

  /** The public list and the head count, as sent. */
  function listText(/** @type {LobbyConn[]} */ everyone) {
    return JSON.stringify({
      t: 'lobby',
      seeks: seeks()
        .filter(({ seek }) => !seek.private)
        .slice(0, LIMITS.listed)
        .map(({ seek }) => listed(seek)),
      players: everyone.length,
    });
  }

  /** Sends the list to every socket, unless it is the one they last had. Whether it went. */
  function sendList() {
    const everyone = platform.connections();
    const text = listText(everyone);
    if (text === lastList) return false;
    lastList = text;
    lastSent = platform.now();
    for (const conn of everyone) {
      try {
        conn.send(text);
      } catch {
        // Closing: see send().
      }
    }
    return true;
  }

  /**
   * The list has changed (or may have): it goes to everyone now, or, within
   * `BROADCAST_MS` of the last, once that has passed, with whatever else
   * changed meanwhile. Whether it went now.
   */
  function broadcast() {
    if (pending) return false;
    const at = lastSent + BROADCAST_MS;
    if (platform.now() >= at) return sendList();
    pending = true;
    platform.timers.set(at, () => {
      pending = false;
      sendList();
    });
    return false;
  }

  /**
   * Refuses a message: the socket hears why, and the refusal counts against
   * it. A socket refused more than `ABUSE_LIMITS.refusals` times in
   * `refusalWindowMs` is closed instead (the count is in its data, saved so
   * that it outlives hibernation).
   * @param {LobbyConn} conn
   * @param {Record<string, unknown>} message
   */
  function refuse(conn, message) {
    const tooOften = refusedTooOften(conn.data, platform.now());
    conn.save();
    if (tooOften) {
      send(conn, {
        t: 'error',
        code: 'rate',
        message: 'Too many refused messages: wait a moment.',
      });
      conn.close(CLOSE.policy, 'Too many refused messages.');
      return;
    }
    send(conn, message);
  }

  /** Refuses with an error: `code` (bad-request, busy) and what the app shows. */
  const refuseWith = (
    /** @type {LobbyConn} */ conn,
    /** @type {string} */ code,
    /** @type {string} */ message,
  ) => refuse(conn, { t: 'error', code, message });

  /** Counts a message against the socket's allowance; false when it is used up (then closed). */
  function allowed(/** @type {LobbyConn} */ conn) {
    const now = platform.now();
    if (now - conn.data.rateStart >= LIMITS.rateWindowMs) {
      conn.data.rateStart = now;
      conn.data.rateCount = 0;
    }
    conn.data.rateCount += 1;
    if (conn.data.rateCount > LIMITS.rateMessages) {
      send(conn, { t: 'error', code: 'rate', message: 'Too many messages: wait a moment.' });
      conn.close(CLOSE.policy, 'Too many messages.');
      return false;
    }
    return true;
  }

  /**
   * Pairs `joiner` (with what it asked for) with the seek `owner` holds: both
   * seeks go, the game counts for both addresses, the room is made, and each
   * player gets their seat. The joiner's address has been checked (`joinerKey`).
   * @param {LobbyConn} joiner
   * @param {CountKey} joinerKey
   * @param {{ name: string, rating: number | null, color: ColorChoice }} wants
   * @param {LobbyConn} owner
   */
  async function pair(joiner, joinerKey, wants, owner) {
    const seek = /** @type {Seek} */ (owner.data.seek);
    owner.data.seek = null;
    owner.save();
    joiner.data.seek = null;
    joiner.save();
    broadcast();

    const now = platform.now();
    counts.record(joinerKey, 'pairings', now);
    const ownerKey = await counts.keyOf(owner.data, now);
    // One game counts once for an address, whichever sides it played.
    if (ownerKey.hash !== joinerKey.hash) counts.record(ownerKey, 'pairings', now);
    await counts.save(joinerKey, ownerKey);

    const id = randomId(16);
    const seats = { owner: randomId(32), joiner: randomId(32) };
    // In a duel the poster's device sends the rounds: it is the host, in the white seat.
    const ownerIsWhite = isDuel(seek.game) || whiteOf(seek.color, wants.color) === 'owner';
    const ownerSide = {
      name: seek.name,
      rating: seek.rating,
      seatHash: await hashToken(seats.owner),
    };
    const joinerSide = {
      name: wants.name,
      rating: wants.rating,
      seatHash: await hashToken(seats.joiner),
    };
    try {
      await platform.createGame({
        id,
        game: seek.game,
        opts: seek.opts,
        tc: seek.tc,
        white: ownerIsWhite ? ownerSide : joinerSide,
        black: ownerIsWhite ? joinerSide : ownerSide,
      });
    } catch {
      const failed = { t: 'error', code: 'failed', message: 'The game could not be started.' };
      send(owner, failed);
      send(joiner, failed);
      return;
    }
    send(owner, {
      t: 'paired',
      game: id,
      kind: seek.game,
      opts: seek.opts,
      seat: seats.owner,
      color: ownerIsWhite ? 'white' : 'black',
      tc: seek.tc,
      opponent: { name: wants.name, rating: wants.rating },
    });
    send(joiner, {
      t: 'paired',
      game: id,
      kind: seek.game,
      opts: seek.opts,
      seat: seats.joiner,
      color: ownerIsWhite ? 'black' : 'white',
      tc: seek.tc,
      opponent: { name: seek.name, rating: seek.rating },
    });
  }

  /** The poster's name and rating, checked; null (after a refusal) when they are not valid. */
  function who(/** @type {LobbyConn} */ conn, /** @type {Record<string, unknown>} */ msg) {
    if (!isPlayerName(msg.name) || !isRating(msg.rating ?? null)) {
      refuseWith(conn, 'bad-request', 'That name or rating is not one.');
      return null;
    }
    return {
      name: /** @type {string} */ (msg.name),
      rating: /** @type {number | null} */ (msg.rating ?? null),
    };
  }

  /**
   * Posts a seek, or pairs it at once with a public one it matches.
   * @param {LobbyConn} conn
   * @param {Record<string, unknown>} msg
   */
  async function post(conn, msg) {
    // A seek without a game is a game of chess (as the app posted them before the others).
    const game = msg.game ?? 'chess';
    const duel = isDuel(game);
    const opts = isGame(game) ? gameOptions(game, msg.opts) : null;
    const tc = duel ? null : parseTimeControl(msg.tc);
    const color = /** @type {ColorChoice} */ (duel ? 'random' : msg.color);
    const secret = msg.secret;
    if (
      !opts ||
      (!duel && !tc) ||
      !COLOR_CHOICES.includes(color) ||
      typeof msg.private !== 'boolean' ||
      typeof secret !== 'string' ||
      !SEAT_PATTERN.test(secret)
    ) {
      refuseWith(conn, 'bad-request', 'That game cannot be posted.');
      return;
    }
    if (tc?.kind === 'correspondence') {
      refuseWith(
        conn,
        'bad-request',
        'A correspondence game is played by invitation: send its link.',
      );
      return;
    }
    const wants = { game: /** @type {string} */ (game), opts, tc: tc?.id ?? null, color };
    const player = who(conn, msg);
    if (!player) return;
    // The seek's id is its secret's: an id the seek brings must be that one.
    const id = await seekIdOf(secret);
    if ((msg.id ?? id) !== id) {
      refuseWith(conn, 'bad-request', 'That game cannot be posted.');
      return;
    }
    const now = platform.now();
    const key = await counts.keyOf(conn.data, now);

    // From here on nothing waits, so nothing changes under the checks.
    if (!counts.allows(key, 'pairings', now)) {
      refuseWith(conn, 'busy', 'That is enough games for now.');
      return;
    }
    // A seek under this id on another socket is the poster's own, from before
    // a reconnection (only the poster has the secret): it is handed over.
    const holder = seeks().find(({ seek }) => seek.id === id);
    // Every other seek waiting: not this socket's, nor the one it takes over.
    const others = seeks().filter(
      ({ conn: other, seek }) => other.data.id !== conn.data.id && seek.id !== id,
    );
    /** Takes the seek from the socket that held it before (the poster's last). */
    const takeOver = () => {
      if (!holder || holder.conn.data.id === conn.data.id) return;
      holder.conn.data.seek = null;
      holder.conn.save();
    };
    if (!msg.private) {
      const match = others.find(({ seek }) => matches(seek, wants));
      if (match) {
        takeOver();
        await pair(conn, key, { ...player, color }, match.conn);
        return;
      }
    }
    const address = conn.data.address;
    const fromThere = address ? others.filter(({ conn: c }) => c.data.address === address) : [];
    if (fromThere.length >= ABUSE_LIMITS.seeksPerAddress) {
      refuseWith(conn, 'busy', 'That is enough games waiting for now.');
      return;
    }
    const alike = others.filter(({ seek }) => seek.private === msg.private).length;
    if (alike >= (msg.private ? LIMITS.privateSeeks : LIMITS.seeks)) {
      refuseWith(conn, 'busy', 'Too many games are waiting.');
      return;
    }
    takeOver();
    /** @type {Seek} */
    const seek = {
      id,
      ...wants,
      ...player,
      private: msg.private,
      // Posted again, it keeps its place in the list.
      at: holder?.seek.at ?? now,
    };
    conn.data.seek = seek;
    conn.save();
    send(conn, { t: 'posted', seek: { ...listed(seek), private: seek.private } });
    broadcast();
  }

  /**
   * A correspondence game by invitation: its room is made at once with the
   * poster's seat and an open one, and the poster gets the seat and the game.
   * @param {LobbyConn} conn
   * @param {Record<string, unknown>} msg
   */
  async function invite(conn, msg) {
    const game = msg.game ?? 'chess';
    const opts = CORRESPONDENCE_GAMES.includes(game) ? gameOptions(game, msg.opts) : null;
    const color = /** @type {ColorChoice} */ (msg.color);
    if (!opts || !isCorrespondence(msg.tc) || !COLOR_CHOICES.includes(color)) {
      refuseWith(conn, 'bad-request', 'That game cannot be made.');
      return;
    }
    const player = who(conn, msg);
    if (!player) return;
    const now = platform.now();
    const key = await counts.keyOf(conn.data, now);
    if (!counts.allows(key, 'invites', now)) {
      refuseWith(conn, 'busy', 'That is enough invitations for now.');
      return;
    }
    counts.record(key, 'invites', now);
    await counts.save(key);
    const id = randomId(16);
    const seat = randomId(32);
    const posterWhite = whiteOf(color, 'random') === 'owner';
    const poster = { ...player, seatHash: await hashToken(seat) };
    const open = { name: '', rating: null, seatHash: '' };
    const tc = /** @type {string} */ (msg.tc);
    try {
      await platform.createGame({
        id,
        game,
        opts,
        tc,
        white: posterWhite ? poster : open,
        black: posterWhite ? open : poster,
        open: posterWhite ? 'black' : 'white',
      });
    } catch {
      send(conn, { t: 'error', code: 'failed', message: 'The game could not be made.' });
      return;
    }
    send(conn, {
      t: 'created',
      game: id,
      kind: game,
      opts,
      tc,
      seat,
      color: posterWhite ? 'white' : 'black',
    });
  }

  /**
   * A group room (a puzzle race for up to eight, a game analysed together):
   * made at once, its maker the host, who gets the room's id and their member
   * token.
   * @param {LobbyConn} conn
   * @param {Record<string, unknown>} msg
   */
  async function makeRoom(conn, msg) {
    const kind = msg.kind;
    const opts = isGroupKind(kind) ? groupOptions(kind, msg.opts) : null;
    if (!opts || !platform.createGroup) {
      refuseWith(conn, 'bad-request', 'That room cannot be made.');
      return;
    }
    const player = who(conn, msg);
    if (!player) return;
    const now = platform.now();
    const key = await counts.keyOf(conn.data, now);
    if (!counts.allows(key, 'rooms', now)) {
      refuseWith(conn, 'busy', 'That is enough rooms for now.');
      return;
    }
    counts.record(key, 'rooms', now);
    await counts.save(key);
    const id = randomId(16);
    const token = randomId(32);
    let made = 'failed';
    try {
      made = await platform.createGroup({
        id,
        kind: /** @type {string} */ (kind),
        opts,
        host: { ...player, tokenHash: await hashToken(token) },
      });
    } catch {
      // Not made: said below.
    }
    if (made !== 'created') {
      send(conn, { t: 'error', code: 'failed', message: 'The room could not be made.' });
      return;
    }
    send(conn, { t: 'room-created', room: id, kind, opts, token });
  }

  /**
   * Pairs the socket with the seek it names, which waits on another socket.
   * @param {LobbyConn} conn
   * @param {Record<string, unknown>} msg
   */
  async function join(conn, msg) {
    if (typeof msg.seek !== 'string' || !ID_PATTERN.test(msg.seek)) {
      refuseWith(conn, 'bad-request', 'That is not a game.');
      return;
    }
    const player = who(conn, msg);
    if (!player) return;
    const now = platform.now();
    const key = await counts.keyOf(conn.data, now);
    const target = seeks().find(
      ({ conn: other, seek }) => seek.id === msg.seek && other.data.id !== conn.data.id,
    );
    if (!target) {
      refuse(conn, { t: 'gone', seek: msg.seek });
      return;
    }
    if (!counts.allows(key, 'pairings', now)) {
      refuseWith(conn, 'busy', 'That is enough games for now.');
      return;
    }
    await pair(conn, key, { ...player, color: 'random' }, target.conn);
  }

  return {
    /**
     * A socket has joined the waiting room: refused (closed) past the limits,
     * otherwise told what is waiting. Everyone hears the new head count.
     * @param {LobbyConn} conn
     */
    open(conn) {
      const all = platform.connections();
      const fromThere = conn.data.address
        ? all.filter((c) => c.data.address === conn.data.address).length
        : 0;
      if (all.length > LIMITS.lobbySockets || fromThere > LIMITS.socketsPerAddress) {
        // Turned away: nobody else hears of it, now or when it closes.
        conn.data.turnedAway = true;
        conn.save();
        send(conn, { t: 'error', code: 'busy', message: 'The waiting room is full right now.' });
        conn.close(CLOSE.full, 'Full.');
        return;
      }
      // The newcomer gets the list at once, whenever the others hear of them;
      // the broadcast waiting to go then goes whatever it holds, as the
      // newcomer may have had something else.
      if (broadcast()) return;
      lastList = '';
      try {
        conn.send(listText(platform.connections()));
      } catch {
        // Closing: see send().
      }
    },

    /**
     * @param {LobbyConn} conn
     * @param {string} text
     */
    async message(conn, text) {
      if (text === 'ping') {
        conn.send('pong');
        return;
      }
      if (text.length > LIMITS.contentBytes) {
        conn.close(CLOSE.tooBig, 'Message too big.');
        return;
      }
      if (!allowed(conn)) return;
      conn.save();
      const msg = parse(text);
      // Only a room made with what it holds (an analysis room's game) says more than a message holds.
      if (text.length > LIMITS.messageBytes && msg?.t !== 'create-room') {
        conn.close(CLOSE.tooBig, 'Message too big.');
        return;
      }
      if (!msg) {
        refuseWith(conn, 'bad-request', 'That is not a message.');
        return;
      }
      switch (msg.t) {
        case 'seek':
          return post(conn, msg);
        case 'cancel': {
          const had = conn.data.seek !== null;
          conn.data.seek = null;
          conn.save();
          send(conn, { t: 'cancelled' });
          if (had) broadcast();
          return;
        }
        case 'create':
          return invite(conn, msg);
        case 'create-room':
          return makeRoom(conn, msg);
        case 'join':
          return join(conn, msg);
        default:
          refuseWith(conn, 'bad-request', 'Unknown message.');
      }
    },

    /**
     * A socket has closed: its seek goes with it.
     * @param {LobbyConn} conn
     */
    close(conn) {
      conn.data.seek = null;
      if (!conn.data.turnedAway) broadcast();
    },
  };
}
