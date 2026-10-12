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
 * Pairing makes a game room (`platform.createGame`) with the hashes of two new
 * seat tokens, and sends each player their own token: only the two of them
 * can take a seat in the room. In a duel the poster (whose device sends the
 * rounds) takes the white seat.
 *
 * A correspondence game (days a move: chess or Chess960) is never a seek:
 * `create` makes its room at once, with the poster's seat and an open one that
 * whoever has the link takes in the room itself (room.mjs). The poster goes
 * straight to the board to send that link. A socket may make `LIMITS.invites`
 * of them an hour.
 *
 * A group room (group.mjs: a puzzle race for up to eight, a game analysed
 * together) is made here too: `create-room` makes it at once
 * (`platform.createGroup`) with its maker as host, and hands them the room's
 * id and their member token; the others come by its link. The sockets of one
 * address may make `GROUP_LIMITS.rooms` an hour. An analysis room comes with
 * its game, so `create-room` may be as large as `LIMITS.contentBytes`.
 */
import { hashToken } from '../handler.mjs';
import {
  CLOSE,
  COLOR_CHOICES,
  CORRESPONDENCE_GAMES,
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
  sameOptions,
} from './shared.mjs';

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
 *   invites?: number[],
 *   rooms?: number[],
 * }} LobbyData
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
 *   connections(): LobbyConn[],
 *   createGame(spec: GameSpec): Promise<void>,
 *   createGroup?: (spec: import('./group.mjs').GroupSpec) => Promise<'created' | 'exists'>,
 *   now(): number,
 * }} LobbyPlatform
 *   `createGroup`: makes a group room, or finds it made already (none: rooms
 *   are not made here); it throws when the room cannot be made.
 */

/** A new socket's data (kept with the socket: a Durable Object keeps it across hibernation). */
export function lobbyData(address = '') {
  return /** @type {LobbyData} */ ({
    id: randomId(16),
    address,
    seek: null,
    rateStart: 0,
    rateCount: 0,
    invites: [],
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

/**
 * @param {LobbyPlatform} platform
 */
export function createLobby(platform) {
  /** The open seeks, oldest first, leaving out the socket being closed. */
  function seeks(/** @type {string | null} */ leaving = null) {
    return platform
      .connections()
      .filter((c) => c.data.id !== leaving && c.data.seek !== null)
      .map((c) => ({ conn: c, seek: /** @type {Seek} */ (c.data.seek) }))
      .sort((a, b) => a.seek.at - b.seek.at);
  }

  /** Sends the public list and the head count to every socket. */
  function broadcast(/** @type {string | null} */ leaving = null) {
    const everyone = platform.connections().filter((c) => c.data.id !== leaving);
    const text = JSON.stringify({
      t: 'lobby',
      seeks: seeks(leaving)
        .filter(({ seek }) => !seek.private)
        .slice(0, LIMITS.listed)
        .map(({ seek }) => listed(seek)),
      players: everyone.length,
    });
    for (const conn of everyone) {
      try {
        conn.send(text);
      } catch {
        // Closing: see send().
      }
    }
  }

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
   * seeks go, the room is made, and each player gets their seat.
   * @param {LobbyConn} joiner
   * @param {{ name: string, rating: number | null, color: ColorChoice }} wants
   * @param {LobbyConn} owner
   */
  async function pair(joiner, wants, owner) {
    const seek = /** @type {Seek} */ (owner.data.seek);
    owner.data.seek = null;
    owner.save();
    joiner.data.seek = null;
    joiner.save();
    broadcast();

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

  /** The poster's name and rating, checked; null (after an error) when they are not valid. */
  function who(/** @type {LobbyConn} */ conn, /** @type {Record<string, unknown>} */ msg) {
    if (!isPlayerName(msg.name) || !isRating(msg.rating ?? null)) {
      send(conn, { t: 'error', code: 'bad-request', message: 'That name or rating is not one.' });
      return null;
    }
    return {
      name: /** @type {string} */ (msg.name),
      rating: /** @type {number | null} */ (msg.rating ?? null),
    };
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
      send(conn, { t: 'error', code: 'bad-request', message: 'That game cannot be made.' });
      return;
    }
    const player = who(conn, msg);
    if (!player) return;
    const now = platform.now();
    const recent = (conn.data.invites ?? []).filter((at) => now - at < LIMITS.invitesWindowMs);
    if (recent.length >= LIMITS.invites) {
      send(conn, { t: 'error', code: 'busy', message: 'That is enough invitations for now.' });
      return;
    }
    conn.data.invites = [...recent, now];
    conn.save();
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
   * A group room (a puzzle race for up to eight): made at once, its maker the
   * host, who gets the room's id and their member token. The sockets of one
   * address may make `GROUP_LIMITS.rooms` in `GROUP_LIMITS.roomsWindowMs`.
   * @param {LobbyConn} conn
   * @param {Record<string, unknown>} msg
   */
  async function makeRoom(conn, msg) {
    const kind = msg.kind;
    const opts = isGroupKind(kind) ? groupOptions(kind, msg.opts) : null;
    if (!opts || !platform.createGroup) {
      send(conn, { t: 'error', code: 'bad-request', message: 'That room cannot be made.' });
      return;
    }
    const player = who(conn, msg);
    if (!player) return;
    const now = platform.now();
    const madeLately = (/** @type {LobbyData} */ data) =>
      (data.rooms ?? []).filter((at) => now - at < GROUP_LIMITS.roomsWindowMs);
    const recent = madeLately(conn.data);
    const others = conn.data.address
      ? platform
          .connections()
          .filter((c) => c.data.id !== conn.data.id && c.data.address === conn.data.address)
          .reduce((sum, c) => sum + madeLately(c.data).length, 0)
      : 0;
    if (recent.length + others >= GROUP_LIMITS.rooms) {
      send(conn, { t: 'error', code: 'busy', message: 'That is enough rooms for now.' });
      return;
    }
    conn.data.rooms = [...recent, now];
    conn.save();
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
        send(conn, { t: 'error', code: 'busy', message: 'The waiting room is full right now.' });
        conn.close(CLOSE.full, 'Full.');
        return;
      }
      broadcast();
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
        send(conn, { t: 'error', code: 'bad-request', message: 'That is not a message.' });
        return;
      }

      if (msg.t === 'seek') {
        // A seek without a game is a game of chess (as the app posted them before the others).
        const game = msg.game ?? 'chess';
        const duel = isDuel(game);
        const opts = isGame(game) ? gameOptions(game, msg.opts) : null;
        const tc = duel ? null : parseTimeControl(msg.tc);
        const color = /** @type {ColorChoice} */ (duel ? 'random' : msg.color);
        if (
          !opts ||
          (!duel && !tc) ||
          !COLOR_CHOICES.includes(color) ||
          typeof msg.private !== 'boolean'
        ) {
          send(conn, { t: 'error', code: 'bad-request', message: 'That game cannot be posted.' });
          return;
        }
        if (tc?.kind === 'correspondence') {
          send(conn, {
            t: 'error',
            code: 'bad-request',
            message: 'A correspondence game is played by invitation: send its link.',
          });
          return;
        }
        const wants = { game: /** @type {string} */ (game), opts, tc: tc?.id ?? null, color };
        const player = who(conn, msg);
        if (!player) return;
        // A seek may bring its own id: the app posts its game again under the same
        // id after a reconnection, so a link shared before still finds it. An id
        // that another socket holds is refused; one that is not an id is replaced.
        const own = typeof msg.id === 'string' && ID_PATTERN.test(msg.id) ? msg.id : null;
        const held =
          own !== null &&
          seeks().some(
            ({ conn: other, seek }) => other.data.id !== conn.data.id && seek.id === own,
          );
        if (held) {
          send(conn, { t: 'error', code: 'bad-request', message: 'That game is posted already.' });
          return;
        }
        if (!msg.private) {
          const match = seeks().find(
            ({ conn: other, seek }) => other.data.id !== conn.data.id && matches(seek, wants),
          );
          if (match) {
            await pair(conn, { ...player, color }, match.conn);
            return;
          }
        }
        if (!conn.data.seek && seeks().length >= LIMITS.seeks) {
          send(conn, { t: 'error', code: 'busy', message: 'Too many games are waiting.' });
          return;
        }
        /** @type {Seek} */
        const seek = {
          id: own ?? randomId(16),
          ...wants,
          ...player,
          private: msg.private,
          at: platform.now(),
        };
        conn.data.seek = seek;
        conn.save();
        send(conn, { t: 'posted', seek: { ...listed(seek), private: seek.private } });
        broadcast();
        return;
      }

      if (msg.t === 'cancel') {
        const had = conn.data.seek !== null;
        conn.data.seek = null;
        conn.save();
        send(conn, { t: 'cancelled' });
        if (had) broadcast();
        return;
      }

      if (msg.t === 'create') {
        await invite(conn, msg);
        return;
      }

      if (msg.t === 'create-room') {
        await makeRoom(conn, msg);
        return;
      }

      if (msg.t === 'join') {
        if (typeof msg.seek !== 'string' || !ID_PATTERN.test(msg.seek)) {
          send(conn, { t: 'error', code: 'bad-request', message: 'That is not a game.' });
          return;
        }
        const player = who(conn, msg);
        if (!player) return;
        const target = seeks().find(
          ({ conn: other, seek }) => seek.id === msg.seek && other.data.id !== conn.data.id,
        );
        if (!target) {
          send(conn, { t: 'gone', seek: msg.seek });
          return;
        }
        await pair(conn, { ...player, color: 'random' }, target.conn);
        return;
      }

      send(conn, { t: 'error', code: 'bad-request', message: 'Unknown message.' });
    },

    /**
     * A socket has closed: its seek goes with it.
     * @param {LobbyConn} conn
     */
    close(conn) {
      conn.data.seek = null;
      broadcast(conn.data.id);
    },
  };
}
