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
 */
import { hashToken } from '../handler.mjs';
import { groupKind } from './groupKinds.mjs';
import {
  CLOSE,
  GROUP_LIMITS,
  isPhrase,
  isPlayerName,
  isRating,
  LIMITS,
  randomId,
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
 * }} GroupData
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
 *   now(): number,
 * }} GroupPlatform
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
 *   message(ctx: GroupContext, conn: unknown, state: S, sender: Sender, msg: Record<string, unknown>, now: number): boolean,
 *   timer(ctx: GroupContext, state: S, now: number): void,
 *   presence?(ctx: GroupContext, state: S, now: number): void,
 * }} GroupKindModule
 *   `options`: the room's options checked (null: not valid); `create`: the
 *   state of a new room; `view`: what a member (or a visitor, null) is shown,
 *   in the snapshot; `deadline`: when the kind next needs `timer`; `big`:
 *   whether a message may be larger than an ordinary one; `message`: a
 *   member's message (false when it is not the kind's: the room refuses it);
 *   `presence`: someone came, went, joined or left.
 */

/** A new socket's data (kept with the socket: a Durable Object keeps it across hibernation). */
export function groupData(now = Date.now()) {
  return /** @type {GroupData} */ ({
    id: randomId(16),
    member: null,
    visitor: false,
    openedAt: now,
    rateStart: 0,
    rateCount: 0,
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

  async function ensure() {
    if (loaded) return state;
    state = await platform.load();
    loaded = true;
    return state;
  }

  /** The open sockets (the one closing left out). */
  const sockets = () => platform.connections().filter((conn) => conn.data.id !== closing);

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

  /** A refusal, followed by the room as it stands so the page catches up. */
  function refuse(
    /** @type {GroupConn} */ conn,
    /** @type {string} */ code,
    /** @type {string} */ message,
  ) {
    send(conn, { t: 'error', code, message });
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
   * The earliest moment something must happen: a hello, a host's hand-over,
   * the room's end, or whatever its kind waits for.
   */
  function nextDeadline(/** @type {number} */ now) {
    /** @type {number[]} */
    const times = [];
    for (const conn of sockets()) {
      if (!conn.data.member && !conn.data.visitor) times.push(conn.data.openedAt + LIMITS.helloMs);
    }
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

  async function save(/** @type {number} */ now) {
    if (state) await platform.store(state);
    await platform.schedule(nextDeadline(now));
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
        conn.data.member = member.id;
        conn.data.visitor = false;
        conn.save();
        const changed = reconcile(s, now);
        send(conn, snapshot(s, member.id, now));
        if (changed) {
          changedMembers(s, now);
          await save(now);
        } else {
          await platform.schedule(nextDeadline(now));
        }
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
    conn.data.visitor = true;
    conn.save();
    send(conn, snapshot(s, null, now));
    await platform.schedule(nextDeadline(now));
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
      send(conn, { t: 'error', code: 'bad-request', message: 'That name or rating is not one.' });
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
        send(conn, { t: 'error', code: 'full', message: 'This room is full.' });
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
      await save(now);
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
    if (kindOf(s).message(ctx, conn, s.state, sender, msg, now)) {
      await save(now);
      return;
    }
    refuse(conn, 'bad-request', 'Unknown message.');
  }

  return {
    /**
     * Makes the room (called by the waiting room). Throws when it exists, or
     * the spec is not a room's.
     * @param {GroupSpec} spec
     */
    create(spec) {
      return serial(async () => {
        if (await ensure()) throw new Error('This room exists already.');
        const now = platform.now();
        state = newGroup(spec, now);
        await save(now);
      });
    },

    /**
     * A socket has opened: it has `LIMITS.helloMs` to say hello.
     * @param {GroupConn} _conn
     */
    open(_conn) {
      return serial(async () => {
        await ensure();
        await platform.schedule(nextDeadline(platform.now()));
      });
    },

    /**
     * @param {GroupConn} conn
     * @param {string} text
     */
    message(conn, text) {
      return serial(async () => {
        if (text === 'ping') {
          conn.send('pong');
          return;
        }
        const s = await ensure();
        const now = platform.now();
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
          send(conn, { t: 'error', code: 'bad-request', message: 'That is not a message.' });
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
          else send(conn, { t: 'error', code: 'not-member', message: 'Join the room first.' });
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
      return serial(async () => {
        const s = await ensure();
        const member = conn.data.member;
        conn.data.member = null;
        conn.data.visitor = false;
        if (!s || !member) return;
        const now = platform.now();
        closing = conn.data.id;
        try {
          if (!reconcile(s, now)) return;
          changedMembers(s, now);
          await save(now);
        } finally {
          closing = null;
        }
      });
    },

    /** Something is due: a hello, a hand-over, the kind's next step, or the room's end. */
    timer() {
      return serial(async () => {
        const s = await ensure();
        const now = platform.now();
        for (const conn of sockets()) {
          if (
            !conn.data.member &&
            !conn.data.visitor &&
            now >= conn.data.openedAt + LIMITS.helloMs
          ) {
            conn.close(CLOSE.noHello, 'Say hello first.');
          }
        }
        if (!s) {
          await platform.schedule(null);
          return;
        }
        const expired =
          now >= s.createdAt + GROUP_LIMITS.ageMs ||
          (s.emptySince !== null && now >= s.emptySince + GROUP_LIMITS.emptyKeepMs);
        if (expired) {
          for (const conn of sockets()) conn.close(CLOSE.closed, 'The room is closed.');
          state = null;
          await platform.remove();
          await platform.schedule(null);
          return;
        }
        if (reconcile(s, now)) changedMembers(s, now);
        kindOf(s).timer(ctx, s.state, now);
        await save(now);
      });
    },
  };
}
