/**
 * A group room, free of any platform (the Worker's Durable Object and the
 * Node server run it the same way): up to `GROUP_LIMITS.members` people who
 * came by its link, doing one thing together. That thing is the room's kind,
 * whose own module (groupKinds.mjs) keeps the kind's state and takes its
 * messages: a puzzle race for up to eight (raceRoom.mjs), or a game analysed
 * together (analysisRoom.mjs). This file knows the members, their presence,
 * the host and the phrases, and nothing of the kind.
 *
 * A room is made through the waiting room (`create-room`), which gives its
 * maker the first member token: the maker is the host. A game's analysis room
 * is made by the game's own room instead, with no members: the first to join
 * is its host. Anyone with the link
 * opens the room's socket and says `hello` within `LIMITS.helloMs`: with a
 * member token as that member (a reconnection keeps their place), without
 * one as a visitor, who sees the room and may `join` under their name and
 * get a token of their own. The room keeps only each token's hash. A member
 * is here while one of their sockets is open. A host gone
 * `GROUP_LIMITS.hostGoneMs` hands the room to the member who has been here
 * longest. A member may `leave` for good; in a full room, a member gone
 * `GROUP_LIMITS.awayMs` gives their place to whoever joins. Members can send
 * the set phrases.
 *
 * The room is deleted `GROUP_LIMITS.emptyKeepMs` after its last member left,
 * and `GROUP_LIMITS.ageMs` after it was made at most. Messages, their size and
 * rate, are limited as a game's (LIMITS); only the messages a kind calls big
 * (`big`) may be larger, up to `LIMITS.contentBytes`.
 *
 * Who hears what: `tell(make)` gives each socket its own message (`make` gets
 * the member's id, or null for a visitor), `announce(message)` gives everyone
 * the same one, which must hold nothing private.
 *
 * Against abuse, as in a game's room (room.mjs): the room writes its state
 * only when it has changed since it was last written, and sets its timer only
 * when the deadline has moved, so a refusal or a message that changes nothing
 * costs nothing. Light changes (a phrase, who is here, and what its kind calls
 * light: an analysis's steps and drawings) are written together, at most every
 * `ABUSE_LIMITS.lightWriteMs`; a socket's time to say hello is kept by an
 * in-memory timer and checked at every event, never by the stored alarm, so
 * connecting writes nothing. It takes `ABUSE_LIMITS.roomSocketsPerAddress`
 * sockets from one address and `socketsPerSeat` on one member's token (one
 * more is refused), and keeps few sockets yet to say hello, by address
 * (`unsaid`, `unsaidPerAddress`: see admission.mjs), so that a member whose
 * address has none waiting always gets in; a socket refused too often is
 * closed; and a socket for a room that is not there is closed at once, with
 * nothing written for it.
 */
import { addressKey } from '../address.mjs';
import { hashToken } from '../handler.mjs';
import { makeWay } from './admission.mjs';
import { groupKind } from './groupKinds.mjs';
import {
  ABUSE_LIMITS,
  CLOSE,
  GROUP_LIMITS,
  isPhrase,
  isPlayerName,
  isRating,
  LIMITS,
  randomId,
  refusedTooOften,
  SEAT_PATTERN,
} from './shared.mjs';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   rating: number | null,
 *   tokenHash: string,
 *   joinedAt: number,
 *   hereSince: number | null,
 *   goneSince: number | null,
 *   lastPhraseAt: number,
 * }} Member
 *   One of `hereSince` (while a socket of theirs is open) and `goneSince` is set.
 *
 * @typedef {{
 *   v: 1,
 *   id: string,
 *   kind: string,
 *   createdAt: number,
 *   members: Member[],
 *   host: string,
 *   emptySince: number | null,
 *   chat: { by: string, phrase: string }[],
 *   state: unknown,
 * }} GroupState
 *   `host` is a member's id ('' while the room has no members); `state` is the kind's own.
 *
 * @typedef {{ name: string, rating: number | null, tokenHash: string }} HostSpec
 * @typedef {{ id: string, kind: string, opts: unknown, host: HostSpec | null }} GroupSpec
 *   `host` null: a room made with no members yet (a game's analysis room).
 *
 * @typedef {{
 *   id: string,
 *   member: string | null,
 *   visitor: boolean,
 *   openedAt: number,
 *   rateStart: number,
 *   rateCount: number,
 *   address: string,
 *   refused?: { start: number, count: number },
 * }} GroupData
 *   `address`: the client's, as the limits count it (`addressKey`), or '' when
 *   not known; `refused`: the socket's refused messages lately (`refusedTooOften`).
 *
 * @typedef {{
 *   data: GroupData,
 *   send(text: string): void,
 *   close(code: number, reason: string): void,
 *   save(): void,
 * }} GroupConn
 *
 * @typedef {{
 *   connections(): GroupConn[],
 *   load(): Promise<GroupState | null>,
 *   store(state: GroupState): Promise<void>,
 *   remove(): Promise<void>,
 *   schedule(at: number | null): void | Promise<void>,
 *   alarm?: () => Promise<number | null>,
 *   timers?: { set(at: number, run: () => void): unknown, clear(handle: unknown): void },
 *   now(): number,
 * }} GroupPlatform
 *   `alarm`: when the timer is set for (null: not set), read when a room
 *   wakes, so that it sets the timer only when it must (none: the room's first
 *   save sets it). `timers`: a timer in memory, besides the stored one, for
 *   what may slip if the room is evicted (a socket's time to say hello, the
 *   light changes' write); none: those wait for the room's next event.
 *
 * @typedef {{ id: string, name: string, rating: number | null }} PublicMember
 * @typedef {PublicMember & { host: boolean }} Sender
 *
 * @typedef {{
 *   announce(message: unknown): void,
 *   tell(make: (member: string | null) => unknown): void,
 *   refuse(conn: unknown, code: string, message: string): void,
 *   members(): PublicMember[],
 *   here(): string[],
 *   host(): string,
 * }} GroupContext
 *   What a kind's module has of the room: `members()` in the order they joined,
 *   `here()` the ids of those here, `refuse` an error to one socket followed by
 *   the room as it stands (so its page catches up).
 */

/**
 * What a kind of group room gives the room (group.mjs runs it; raceRoom.mjs
 * is one). Its state is plain data, kept with the room's; the functions
 * change it in place, and the room saves it after each.
 *
 * @template S
 * @typedef {{
 *   options(opts: unknown): Record<string, string | number> | null,
 *   create(opts: Record<string, string | number>, now: number): S,
 *   view(state: S, member: string | null, now: number): unknown,
 *   deadline(state: S): number | null,
 *   big?(msg: Record<string, unknown>, sender: Sender): boolean,
 *   light?(msg: Record<string, unknown>): boolean,
 *   message(ctx: GroupContext, conn: unknown, state: S, sender: Sender, msg: Record<string, unknown>, now: number): boolean,
 *   timer(ctx: GroupContext, state: S, now: number): void,
 *   presence?(ctx: GroupContext, state: S, now: number): void,
 * }} GroupKindModule
 *   `options`: the room's options checked (null: not valid); `create`: the
 *   state of a new room; `view`: what a member (or a visitor, null) is shown,
 *   in the snapshot; `deadline`: when the kind next needs `timer`; `big`:
 *   whether a message may be larger than an ordinary one; `light`: whether
 *   what a message changes may wait to be written with the room's other light
 *   changes (none: everything is written at once); `message`: a member's
 *   message (false when it is not the kind's: the room refuses it);
 *   `presence`: someone came, went, joined or left.
 */

/**
 * A new socket's data (kept with the socket: a Durable Object keeps it across
 * hibernation), with the client's address, if known, as the limits count it:
 * an IP address, or the key `addressKey` made of one already (an IPv6
 * address's /64, kept as it is).
 */
export function groupData(now = Date.now(), address = '') {
  return /** @type {GroupData} */ ({
    id: randomId(16),
    member: null,
    visitor: false,
    openedAt: now,
    rateStart: 0,
    rateCount: 0,
    address: !address || address.includes('/') ? address : addressKey(address),
  });
}

/** Compares two strings without stopping at the first difference. */
function sameText(/** @type {string} */ a, /** @type {string} */ b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

/** @param {GroupConn} conn @param {unknown} message */
function send(conn, message) {
  try {
    conn.send(JSON.stringify(message));
  } catch {
    // A socket that is closing takes nothing more; its close event tidies up.
  }
}

/** The module of a room's kind (a room is only ever made of a known kind). @param {GroupState} s */
function kindOf(s) {
  const module = groupKind(s.kind);
  if (!module) throw new Error(`Not a kind of room: ${s.kind}`);
  return module;
}

/**
 * A new room, with its maker as its first member and host (not here until
 * their socket says hello). A room made without a maker (`host` null: a
 * game's analysis room, which the game's own room makes) starts with no
 * members, and whoever joins first is its host.
 * @param {GroupSpec} spec
 * @param {number} now
 * @returns {GroupState}
 */
export function newGroup(spec, now) {
  const module = groupKind(spec.kind);
  if (!module) throw new Error(`Not a kind of room: ${spec.kind}`);
  const opts = module.options(spec.opts);
  if (!opts) throw new Error('Not options of that kind of room.');
  const host = spec.host;
  /** @type {Member[]} */
  const members = [];
  if (host !== null) {
    if (!isPlayerName(host?.name) || !isRating(host.rating ?? null)) {
      throw new Error('Not a name and a rating.');
    }
    if (typeof host.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(host.tokenHash)) {
      throw new Error('Not a token hash.');
    }
    members.push({
      id: randomId(6),
      name: host.name,
      rating: host.rating ?? null,
      tokenHash: host.tokenHash,
      joinedAt: now,
      hereSince: null,
      goneSince: now,
      lastPhraseAt: 0,
    });
  }
  return {
    v: 1,
    id: spec.id,
    kind: spec.kind,
    createdAt: now,
    members,
    host: members[0]?.id ?? '',
    emptySince: now,
    chat: [],
    state: module.create(opts, now),
  };
}

/**
 * @param {GroupPlatform} platform
 */
export function createGroup(platform) {
  /** @type {GroupState | null} */
  let state = null;
  let loaded = false;
  /** The state as it was last written (or loaded), as JSON: saving the same again writes nothing. */
  /** @type {string | null} */
  let written = null;
  /**
   * The deadline the platform's timer is set for (null: none); undefined while
   * that is not known (a room just woken, or a timer that could not be set).
   */
  /** @type {number | null | undefined} */
  let scheduled;
  /** When the light changes not written yet are to be written (null: there are none). */
  /** @type {number | null} */
  let flushAt = null;
  /** The in-memory timer: the next socket's time to say hello, or the light changes' write. */
  /** @type {{ at: number, handle: unknown } | null} */
  let soon = null;
  /** Events run one at a time, in order. */
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** The socket whose close is being handled: no longer here, whatever the platform lists. */
  /** @type {string | null} */
  let closing = null;

  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  function serial(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  /**
   * One of the room's events, run in turn; then the in-memory timer is set
   * for whatever comes next.
   * @template T @param {() => Promise<T>} task @returns {Promise<T>}
   */
  function event(task) {
    return serial(async () => {
      try {
        return await task();
      } finally {
        arm();
      }
    });
  }

  async function ensure() {
    if (loaded) return state;
    state = await platform.load();
    written = state ? JSON.stringify(state) : null;
    loaded = true;
    return state;
  }

  /** The open sockets (the one closing left out). */
  const sockets = () => platform.connections().filter((conn) => conn.data.id !== closing);

  /** A socket that has said hello neither as a member nor as a visitor. */
  const unsaid = (/** @type {GroupConn} */ conn) => !conn.data.member && !conn.data.visitor;

  /**
   * Closes the sockets whose time to say hello is up: at every event, rather
   * than by the stored alarm, so that a socket connecting costs no row. The
   * ids of those closed.
   * @param {number} now
   */
  function sweep(now) {
    /** @type {Set<string>} */
    const closed = new Set();
    for (const conn of sockets()) {
      if (unsaid(conn) && now >= conn.data.openedAt + LIMITS.helloMs) {
        conn.close(CLOSE.noHello, 'Say hello first.');
        closed.add(conn.data.id);
      }
    }
    return closed;
  }

  /**
   * Sets the in-memory timer for the next socket's time to say hello, or the
   * light changes' write, whichever comes first (a room that is evicted first
   * does both at its next event).
   */
  function arm() {
    const timers = platform.timers;
    if (!timers) return;
    /** @type {number[]} */
    const times = [];
    for (const conn of sockets()) {
      if (unsaid(conn)) times.push(conn.data.openedAt + LIMITS.helloMs);
    }
    if (flushAt !== null) times.push(flushAt);
    const at = times.length > 0 ? Math.min(...times) : null;
    if (soon?.at === at) return;
    if (soon) timers.clear(soon.handle);
    soon = null;
    if (at === null) return;
    /** @type {{ at: number, handle: unknown }} */
    const next = { at, handle: null };
    next.handle = timers.set(at, () => {
      if (soon === next) soon = null;
      void tick().catch(() => undefined);
    });
    soon = next;
  }

  /** The in-memory timer is due: the sockets whose time is up go, and the light changes are written. */
  function tick() {
    return event(async () => {
      const now = platform.now();
      sweep(now);
      if (flushAt === null || now < flushAt) return;
      // Not written (the day's allowance used up, say): not tried again by this timer, which
      // would keep the room awake, but by the next event or the alarm (the change is in memory).
      if (!(await save(now))) flushAt = null;
    });
  }

  /** The ids of the members with a socket open. */
  function hereIds() {
    /** @type {Set<string>} */
    const here = new Set();
    for (const conn of sockets()) if (conn.data.member) here.add(conn.data.member);
    return here;
  }

  const visitors = () => sockets().filter((conn) => conn.data.visitor && !conn.data.member);

  /** @param {Member} m @returns {PublicMember} */
  const publicMember = (m) => ({ id: m.id, name: m.name, rating: m.rating });

  /** The members as everyone sees them, in the order they joined. */
  function memberList(/** @type {GroupState} */ s) {
    const here = hereIds();
    return s.members.map((m) => ({ ...publicMember(m), here: here.has(m.id) }));
  }

  const membersMessage = (/** @type {GroupState} */ s) => ({
    t: 'members',
    host: s.host,
    members: memberList(s),
  });

  /** Everything a socket needs to draw the room: a member's (`you`), or a visitor's. */
  function snapshot(
    /** @type {GroupState} */ s,
    /** @type {string | null} */ you,
    /** @type {number} */ now,
  ) {
    return {
      t: 'room',
      id: s.id,
      kind: s.kind,
      you,
      host: s.host,
      members: memberList(s),
      max: GROUP_LIMITS.members,
      chat: you ? s.chat : [],
      state: kindOf(s).view(s.state, you, now),
    };
  }

  /** Sends `make(member)` to every socket that has said hello (nothing where it gives null). */
  function tell(/** @type {(member: string | null) => unknown} */ make) {
    for (const conn of sockets()) {
      if (!conn.data.member && !conn.data.visitor) continue;
      const message = make(conn.data.member);
      if (message !== null) send(conn, message);
    }
  }

  /** Sends one message to everyone: it must hold nothing private. */
  function announce(/** @type {unknown} */ message) {
    tell(() => message);
  }

  /**
   * An error to one socket, counted against it: a socket refused more than
   * `ABUSE_LIMITS.refusals` times in `refusalWindowMs` is closed instead (the
   * count is kept in its data, saved so that it outlives hibernation). Whether
   * the socket is still open.
   * @param {GroupConn} conn
   * @param {string} code
   * @param {string} message
   */
  function refuseTo(conn, code, message) {
    const tooOften = refusedTooOften(conn.data, platform.now());
    conn.save();
    if (tooOften) {
      send(conn, {
        t: 'error',
        code: 'rate',
        message: 'Too many refused messages: wait a moment.',
      });
      conn.close(CLOSE.policy, 'Too many refused messages.');
      return false;
    }
    send(conn, { t: 'error', code, message });
    return true;
  }

  /** A refusal, followed by the room as it stands so the page catches up. */
  function refuse(
    /** @type {GroupConn} */ conn,
    /** @type {string} */ code,
    /** @type {string} */ message,
  ) {
    if (!refuseTo(conn, code, message)) return;
    if (state) send(conn, snapshot(state, conn.data.member, platform.now()));
  }

  /** What a kind's module has of the room. */
  /** @type {GroupContext} */
  const ctx = {
    announce,
    tell,
    refuse: (conn, code, message) => refuse(/** @type {GroupConn} */ (conn), code, message),
    members: () => (state ? state.members.map(publicMember) : []),
    here: () => [...hereIds()],
    host: () => state?.host ?? '',
  };

  /**
   * Who takes the room over: the member here longest (then the first to have
   * joined); with nobody here, the first to have joined, unless `hereOnly`.
   */
  function successor(/** @type {GroupState} */ s, hereOnly = false) {
    const here = hereIds();
    const present = s.members
      .filter((m) => here.has(m.id))
      .sort((a, b) => (a.hereSince ?? 0) - (b.hereSince ?? 0) || a.joinedAt - b.joinedAt);
    if (present[0]) return present[0];
    return hereOnly ? null : (s.members[0] ?? null);
  }

  /**
   * Brings the members' presence into line with the sockets, and hands the
   * room over from a host gone too long (or no longer a member). Whether
   * anything changed.
   * @param {GroupState} s
   * @param {number} now
   */
  function reconcile(s, now) {
    const here = hereIds();
    let changed = false;
    for (const m of s.members) {
      if (here.has(m.id)) {
        if (m.hereSince === null) {
          m.hereSince = now;
          m.goneSince = null;
          changed = true;
        }
      } else if (m.goneSince === null) {
        m.goneSince = now;
        m.hereSince = null;
        changed = true;
      }
    }
    const emptySince = s.members.some((m) => here.has(m.id)) ? null : (s.emptySince ?? now);
    if (emptySince !== s.emptySince) {
      s.emptySince = emptySince;
      changed = true;
    }
    const host = s.members.find((m) => m.id === s.host);
    const due =
      !host || (host.goneSince !== null && now >= host.goneSince + GROUP_LIMITS.hostGoneMs);
    if (due) {
      const next = successor(s, Boolean(host));
      const id = next?.id ?? (host ? s.host : '');
      if (id !== s.host) {
        s.host = id;
        changed = true;
      }
    }
    return changed;
  }

  /**
   * The earliest moment something must happen: a host's hand-over, the
   * room's end, or whatever its kind waits for. (A socket's time to say hello
   * is the in-memory timer's: see `sweep`.)
   */
  function nextDeadline(/** @type {number} */ now) {
    /** @type {number[]} */
    const times = [];
    const s = state;
    if (s) {
      times.push(s.createdAt + GROUP_LIMITS.ageMs);
      if (s.emptySince !== null) times.push(s.emptySince + GROUP_LIMITS.emptyKeepMs);
      const host = s.members.find((m) => m.id === s.host);
      // A host gone is handed over only to someone here: with nobody, there is nothing to wait for.
      if (host && host.goneSince !== null && hereIds().size > 0) {
        times.push(Math.max(now, host.goneSince + GROUP_LIMITS.hostGoneMs));
      }
      const due = kindOf(s).deadline(s.state);
      if (due !== null) times.push(due);
    }
    return times.length > 0 ? Math.min(...times) : null;
  }

  /** Writes the state (light changes and all), unless it is what was last written. */
  async function write() {
    const text = state ? JSON.stringify(state) : null;
    if (state && text !== written) {
      await platform.store(state);
      written = text;
    }
    flushAt = null;
  }

  /** Learns when the platform's timer is set for, when that is not known and it can say. */
  async function knowSchedule() {
    if (scheduled !== undefined || !platform.alarm) return;
    try {
      scheduled = await platform.alarm();
    } catch {
      // Not known: the timer is set all the same when next it matters.
    }
  }

  /** Sets the timer for `at` (null: none), unless it is set for that already. */
  async function schedule(/** @type {number | null} */ at) {
    await knowSchedule();
    if (at === scheduled) return;
    scheduled = undefined;
    await platform.schedule(at);
    scheduled = at;
  }

  /**
   * Saves a light change: a phrase, who is here, a step through an analysis,
   * a drawing. It is written with the next save, or `lightWriteMs` after it at
   * the latest (the in-memory timer), so that a run of them writes one row; a
   * room evicted before then loses those few seconds of light changes. A
   * change that moves the next deadline (the room left empty, its host gone,
   * a race's round over) is saved at once, as anything a deadline depends on is.
   * @param {number} now
   */
  async function saveLight(now) {
    await knowSchedule();
    if (nextDeadline(now) !== scheduled) return save(now);
    if (!state || JSON.stringify(state) === written) {
      flushAt = null;
    } else {
      flushAt ??= now + ABUSE_LIMITS.lightWriteMs;
    }
    return true;
  }

  /**
   * Stores the state and sets the timer on the next deadline, each only when
   * it changed. A write or a timer the platform refuses (its allowance for the
   * day used up) leaves the room going on as it is in memory: the next save
   * tries again. Whether everything was stored.
   */
  async function save(/** @type {number} */ now) {
    let stored = true;
    try {
      await write();
    } catch {
      stored = false;
    }
    try {
      await schedule(nextDeadline(now));
    } catch {
      stored = false;
    }
    return stored;
  }

  /** Counts a message against the socket's allowance; false when it is used up (then closed). */
  function allowed(/** @type {GroupConn} */ conn, /** @type {number} */ now) {
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

  /** Presence or membership changed: everyone hears who is in, and the kind is told. */
  function changedMembers(/** @type {GroupState} */ s, /** @type {number} */ now) {
    announce(membersMessage(s));
    kindOf(s).presence?.(ctx, s.state, now);
  }

  /**
   * Takes a member out of the room for good: their sockets stay, as
   * visitors'; the host's role goes to the member here longest. The sockets
   * that were theirs.
   * @param {GroupState} s
   * @param {string} id
   */
  function removeMember(s, id) {
    s.members = s.members.filter((m) => m.id !== id);
    if (s.host === id) s.host = successor(s)?.id ?? '';
    const theirs = sockets().filter((conn) => conn.data.member === id);
    for (const conn of theirs) {
      conn.data.member = null;
      conn.data.visitor = true;
      conn.save();
    }
    return theirs;
  }

  /**
   * A socket's first word: a member's token, or none (a visitor). A token the
   * room does not know (a place given up) is answered as a visitor's hello.
   * @param {GroupConn} conn
   * @param {GroupState} s
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function hello(conn, s, msg, now) {
    if (typeof msg.token === 'string') {
      const hash = SEAT_PATTERN.test(msg.token) ? await hashToken(msg.token) : '';
      const member = hash ? s.members.find((m) => sameText(m.tokenHash, hash)) : undefined;
      if (member) {
        if (memberFull(conn, member.id)) return;
        conn.data.member = member.id;
        conn.data.visitor = false;
        conn.save();
        const changed = reconcile(s, now);
        send(conn, snapshot(s, member.id, now));
        if (changed) changedMembers(s, now);
        // Who is here is a light change (at once should a deadline move with it, the room's
        // end say); another tab of a member here changes nothing.
        await saveLight(now);
        return;
      }
      send(conn, {
        t: 'error',
        code: 'not-member',
        message: 'You are no longer a member of this room.',
      });
    }
    if (visitors().length >= GROUP_LIMITS.visitors) {
      send(conn, { t: 'error', code: 'full', message: 'This room has all the visitors it takes.' });
      conn.close(CLOSE.full, 'Too many visitors.');
      return;
    }
    // Nothing to write: the room is as it was, and the in-memory timer forgets the socket.
    conn.data.visitor = true;
    conn.save();
    send(conn, snapshot(s, null, now));
  }

  /**
   * Whether the room takes a new socket. One address has
   * `ABUSE_LIMITS.roomSocketsPerAddress` here at most: one more is closed (and
   * costs the room nothing more). Of the sockets yet to say hello, the room
   * keeps few, by address (`makeWay`, admission.mjs): the one that makes way
   * goes as if its time to say hello were up, and a member whose address has
   * none waiting always gets in. Only the sockets that came before it count,
   * so that of many arriving at once the last are the ones refused.
   * @param {GroupConn} conn
   */
  function admit(conn) {
    const listed = sockets();
    const at = listed.findIndex((c) => c.data.id === conn.data.id);
    const before = at < 0 ? listed : listed.slice(0, at + 1);
    const address = conn.data.address;
    const fromThere = address ? before.filter((c) => c.data.address === address).length : 0;
    if (fromThere > ABUSE_LIMITS.roomSocketsPerAddress) {
      conn.close(CLOSE.full, 'Too many connections to this room from one address.');
      return false;
    }
    const waiting = before
      .filter((c) => unsaid(c) && c.data.id !== conn.data.id)
      .sort((a, b) => a.data.openedAt - b.data.openedAt);
    const way = makeWay(waiting, address);
    way.evict?.close(CLOSE.noHello, 'Say hello first.');
    if (way.admit) return true;
    conn.close(CLOSE.full, 'Too many connections at once: try again in a moment.');
    return false;
  }

  /**
   * Whether a member has all the sockets one takes (`ABUSE_LIMITS.socketsPerSeat`)
   * without `conn`: then `conn` is closed, as one past a full room is, and its
   * app tries again a while later.
   * @param {GroupConn} conn
   * @param {string} member
   */
  function memberFull(conn, member) {
    const others = sockets().filter((c) => c.data.member === member && c.data.id !== conn.data.id);
    if (others.length < ABUSE_LIMITS.socketsPerSeat) return false;
    conn.close(CLOSE.full, 'This room is open in too many tabs or windows.');
    return true;
  }

  /**
   * A visitor joins under their name: a new member, with a token of their own
   * that only they get. In a full room a member long gone gives up their place.
   * @param {GroupConn} conn
   * @param {GroupState} s
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function join(conn, s, msg, now) {
    if (!isPlayerName(msg.name) || !isRating(msg.rating ?? null)) {
      refuseTo(conn, 'bad-request', 'That name or rating is not one.');
      return;
    }
    if (s.members.length >= GROUP_LIMITS.members) {
      const here = hereIds();
      const away = s.members
        .filter(
          (m) =>
            !here.has(m.id) && m.goneSince !== null && now - m.goneSince >= GROUP_LIMITS.awayMs,
        )
        .sort((a, b) => (a.goneSince ?? 0) - (b.goneSince ?? 0))[0];
      if (!away) {
        refuseTo(conn, 'full', 'This room is full.');
        return;
      }
      removeMember(s, away.id);
    }
    const token = randomId(32);
    let id = randomId(6);
    while (s.members.some((m) => m.id === id)) id = randomId(6);
    s.members = [
      ...s.members,
      {
        id,
        name: /** @type {string} */ (msg.name),
        rating: /** @type {number | null} */ (msg.rating ?? null),
        tokenHash: await hashToken(token),
        joinedAt: now,
        hereSince: null,
        goneSince: now,
        lastPhraseAt: 0,
      },
    ];
    conn.data.member = id;
    conn.data.visitor = false;
    conn.save();
    reconcile(s, now);
    send(conn, { t: 'joined', room: s.id, member: id, token });
    send(conn, snapshot(s, id, now));
    changedMembers(s, now);
    await save(now);
  }

  /**
   * A member's message: a phrase, leaving the room, or their kind's.
   * @param {GroupConn} conn
   * @param {GroupState} s
   * @param {Member} member
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function memberMessage(conn, s, member, msg, now) {
    if (msg.t === 'say') {
      if (!isPhrase(msg.phrase) || now - member.lastPhraseAt < LIMITS.phraseMs) return;
      const phrase = /** @type {string} */ (msg.phrase);
      member.lastPhraseAt = now;
      s.chat = [...s.chat, { by: member.id, phrase }].slice(-LIMITS.phrasesKept);
      tell((viewer) => (viewer ? { t: 'say', by: member.id, phrase } : null));
      await saveLight(now);
      return;
    }
    if (msg.t === 'leave') {
      const theirs = removeMember(s, member.id);
      reconcile(s, now);
      // Every socket that was theirs (another tab too) hears it, and sees the room as a visitor.
      for (const other of theirs) {
        send(other, { t: 'left', room: s.id });
        send(other, snapshot(s, null, now));
      }
      changedMembers(s, now);
      await save(now);
      return;
    }
    const sender = { ...publicMember(member), host: member.id === s.host };
    const kind = kindOf(s);
    if (kind.message(ctx, conn, s.state, sender, msg, now)) {
      // What the kind calls light waits for the room's other light changes.
      if (kind.light?.(msg)) await saveLight(now);
      else await save(now);
      return;
    }
    refuse(conn, 'bad-request', 'Unknown message.');
  }

  return {
    /**
     * Makes the room (called by the waiting room). Throws when it exists (the
     * error's `exists` true), the spec is not a room's, or it could not be
     * stored with its alarm: then it is undone, as a room no alarm will ever
     * come to delete must not be kept, and it may be made again.
     * @param {GroupSpec} spec
     */
    create(spec) {
      return serial(async () => {
        if (await ensure()) {
          throw Object.assign(new Error('This room exists already.'), { exists: true });
        }
        const now = platform.now();
        state = newGroup(spec, now);
        try {
          await write();
          await schedule(nextDeadline(now));
        } catch (err) {
          try {
            if (written !== null) await platform.remove();
          } catch {
            // Left in storage, with no alarm: the next socket for it sets one (`open`).
          }
          state = null;
          written = null;
          scheduled = undefined;
          // Read again when next needed: storage says whether it is there.
          loaded = false;
          throw err;
        }
      });
    },

    /**
     * A socket has opened: it has `LIMITS.helloMs` to say hello (the in-memory
     * timer, and every event, see to it). A socket for a room that is not there
     * (any more) is closed at once, as one past the room's limits is; neither
     * costs the room a write. The room's alarm is checked (a read): one
     * missing is set again.
     * @param {GroupConn} conn
     */
    open(conn) {
      return event(async () => {
        const s = await ensure();
        if (!s) {
          conn.close(CLOSE.noGame, 'No such room.');
          return;
        }
        const now = platform.now();
        sweep(now);
        if (!admit(conn)) return;
        await save(now);
      });
    },

    /**
     * @param {GroupConn} conn
     * @param {string} text
     */
    message(conn, text) {
      return event(async () => {
        if (text === 'ping') {
          conn.send('pong');
          return;
        }
        // A socket closed while its message waited its turn (refused as it opened, say) is no
        // longer the room's: what it says is not heard.
        if (!sockets().some((c) => c.data.id === conn.data.id)) return;
        const s = await ensure();
        const now = platform.now();
        // Its time to say hello was up (this socket's too, should it be saying it only now).
        if (sweep(now).has(conn.data.id)) return;
        if (text.length > LIMITS.contentBytes) {
          conn.close(CLOSE.tooBig, 'Message too big.');
          return;
        }
        if (!allowed(conn, now)) return;
        conn.save();
        if (!s) {
          conn.close(CLOSE.noGame, 'No such room.');
          return;
        }
        const msg = parse(text);
        let member = conn.data.member ? s.members.find((m) => m.id === conn.data.member) : null;
        if (conn.data.member && !member) {
          // No longer a member (gone for good from another socket): a visitor now.
          conn.data.member = null;
          conn.data.visitor = true;
          conn.save();
          member = null;
        }
        const big =
          msg !== null &&
          member &&
          kindOf(s).big?.(msg, { ...publicMember(member), host: member.id === s.host });
        if (text.length > LIMITS.messageBytes && !big) {
          conn.close(CLOSE.tooBig, 'Message too big.');
          return;
        }
        if (!msg) {
          refuseTo(conn, 'bad-request', 'That is not a message.');
          return;
        }
        if (!conn.data.member && !conn.data.visitor) {
          if (msg.t !== 'hello') {
            conn.close(CLOSE.noGame, 'Say hello first.');
            return;
          }
          await hello(conn, s, msg, now);
          return;
        }
        if (msg.t === 'hello') {
          send(conn, snapshot(s, conn.data.member, now));
          return;
        }
        if (!member) {
          if (msg.t === 'join') await join(conn, s, msg, now);
          else refuseTo(conn, 'not-member', 'Join the room first.');
          return;
        }
        await memberMessage(conn, s, member, msg, now);
      });
    },

    /**
     * A socket has closed. A member whose last socket goes is gone: a host
     * gone long enough hands the room over, and an empty room goes after a while.
     * @param {GroupConn} conn
     */
    close(conn) {
      return event(async () => {
        const s = await ensure();
        sweep(platform.now());
        const member = conn.data.member;
        conn.data.member = null;
        conn.data.visitor = false;
        if (!s || !member) return;
        const now = platform.now();
        closing = conn.data.id;
        try {
          if (!reconcile(s, now)) return;
          changedMembers(s, now);
          // Who is here is a light change, unless a deadline moves with it (the room left empty).
          await saveLight(now);
        } finally {
          closing = null;
        }
      });
    },

    /**
     * Something is due: a hand-over, the kind's next step, or the room's end.
     * Throws when what it did could not be stored (or the room deleted): the
     * platform then runs the timer again later (Cloudflare retries an alarm
     * that fails, a few times). Light changes not written yet are written with
     * what it does, or go with the room.
     */
    timer() {
      return event(async () => {
        // The timer that is running is spent.
        scheduled = null;
        const s = await ensure();
        const now = platform.now();
        sweep(now);
        // No room (any more): nothing to wait for, and no timer is set.
        if (!s) return;
        const expired =
          now >= s.createdAt + GROUP_LIMITS.ageMs ||
          (s.emptySince !== null && now >= s.emptySince + GROUP_LIMITS.emptyKeepMs);
        if (expired) {
          for (const conn of sockets()) conn.close(CLOSE.closed, 'The room is closed.');
          // Forgotten here only once it is gone from storage: should that fail, the timer comes again.
          await platform.remove();
          state = null;
          written = null;
          // Nothing light is written after it: that would bring the room back.
          flushAt = null;
          return;
        }
        if (reconcile(s, now)) changedMembers(s, now);
        kindOf(s).timer(ctx, s.state, now);
        if (!(await save(now))) throw new Error('The room could not be stored.');
      });
    },
  };
}
