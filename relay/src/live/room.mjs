/**
 * One live game, free of any platform (the Worker's Durable Object and the
 * Node server run it the same way). The room is the referee: it takes a seat
 * only from the token the waiting room gave that player, accepts only legal
 * moves on the player's own turn, and keeps both clocks itself, so neither side
 * can cheat on time. It ends the game by the rules (mate, stalemate, a dead
 * position, repetition, fifty moves, the flag), by resignation, agreement or
 * abort, or when a player who left is claimed against; and it deletes itself
 * a while after the end.
 *
 * Two variants are played by the same rules. In a blindfold game the room
 * counts each player's peeks (the pieces are hidden on their devices). In Army
 * Draft each player first sends an army bought from the budget, which the room
 * keeps from the other until both are in (or the draft time is up, when it
 * drafts for whoever has not); the game then starts from the two armies. A duel
 * (a puzzle race, Arbiter, Who Stands Better?) is a room of rounds instead:
 * duel.mjs runs it, and this file only seats its players, passes their phrases
 * and makes its rematch.
 *
 * Times sent to the players are durations (milliseconds left, milliseconds
 * until), never the relay's clock: each side counts down from when a message
 * arrives, whatever its own clock says.
 */
import { hashToken } from '../handler.mjs';
import { armyProblem, draftFen, parseArmy, randomArmy } from './army.mjs';
import {
  duelDeadline,
  duelMaybeStart,
  duelMessage,
  duelTimer,
  duelView,
  newDuel,
} from './duel.mjs';
import { cannotMate, endOf, playUci, replay } from './rules.mjs';
import {
  BLINDFOLD_PEEKS,
  CLOSE,
  isDuel,
  isPhrase,
  LIMITS,
  parseTimeControl,
  randomId,
  SEAT_PATTERN,
} from './shared.mjs';

/**
 * @typedef {'white' | 'black'} Color
 * @typedef {import('./lobby.mjs').GameSpec} GameSpec
 * @typedef {import('./army.mjs').Army} Army
 * @typedef {import('./duel.mjs').DuelState} DuelState
 * @typedef {{ name: string, rating: number | null, seatHash: string }} Seat
 *
 * @typedef {{
 *   v: 1 | 2,
 *   id: string,
 *   createdAt: number,
 *   game?: 'chess' | 'blindfold' | 'army',
 *   opts?: Record<string, string | number>,
 *   tc: { id: string, initialMs: number, incrementMs: number },
 *   white: Seat,
 *   black: Seat,
 *   startFen?: string | null,
 *   draft?: { budget: number, by: number, armies: { white: Army | null, black: Army | null } } | null,
 *   peeks?: { white: number, black: number } | null,
 *   moves: string[],
 *   clock: { white: number, black: number, running: Color | null, since: number },
 *   firstMoveBy: number | null,
 *   status: 'draft' | 'playing' | 'over',
 *   result: '1-0' | '0-1' | '1/2-1/2' | '*' | null,
 *   reason: string | null,
 *   endedAt: number | null,
 *   offers: { draw: Color | null, takeback: Color | null, rematch: Color | null },
 *   goneSince: { white: number | null, black: number | null },
 *   chat: { by: Color, phrase: string }[],
 *   lastPhraseAt: { white: number, black: number },
 *   next: { id: string, seats: { white: string, black: string } } | null,
 * }} GameState
 *
 * @typedef {GameState | DuelState} RoomState
 *
 * @typedef {{
 *   id: string,
 *   seat: Color | null,
 *   openedAt: number,
 *   rateStart: number,
 *   rateCount: number,
 * }} RoomData
 *
 * @typedef {{
 *   data: RoomData,
 *   send(text: string): void,
 *   close(code: number, reason: string): void,
 *   save(): void,
 * }} RoomConn
 *
 * @typedef {{
 *   connections(): RoomConn[],
 *   load(): Promise<RoomState | null>,
 *   store(state: RoomState): Promise<void>,
 *   remove(): Promise<void>,
 *   schedule(at: number | null): void | Promise<void>,
 *   createGame(spec: GameSpec): Promise<void>,
 *   now(): number,
 * }} RoomPlatform
 */

/** A new socket's data (kept with the socket: a Durable Object keeps it across hibernation). */
export function roomData(now = Date.now()) {
  return /** @type {RoomData} */ ({
    id: randomId(16),
    seat: null,
    openedAt: now,
    rateStart: 0,
    rateCount: 0,
  });
}

/** @param {Color} color */
const other = (color) => (color === 'white' ? 'black' : 'white');

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

/** @param {RoomConn} conn @param {unknown} message */
function send(conn, message) {
  try {
    conn.send(JSON.stringify(message));
  } catch {
    // A socket that is closing takes nothing more; its close event tidies up.
  }
}

/**
 * The state of a new game of chess (or of a variant of it).
 * @param {GameSpec} spec
 * @param {number} now
 * @returns {GameState}
 */
export function newGame(spec, now) {
  const tc = parseTimeControl(spec.tc);
  if (!tc) throw new Error(`Not a time control: ${spec.tc}`);
  const game = spec.game ?? 'chess';
  if (game !== 'chess' && game !== 'blindfold' && game !== 'army') {
    throw new Error(`Not a game of chess: ${game}`);
  }
  const opts = spec.opts ?? {};
  const army = game === 'army';
  return {
    v: 2,
    id: spec.id,
    createdAt: now,
    game,
    opts,
    tc,
    white: spec.white,
    black: spec.black,
    startFen: null,
    draft: army
      ? {
          budget: Number(opts.budget) || 30,
          by: now + LIMITS.draftMs,
          armies: { white: null, black: null },
        }
      : null,
    peeks: game === 'blindfold' ? { white: 0, black: 0 } : null,
    moves: [],
    clock: { white: tc.initialMs, black: tc.initialMs, running: null, since: 0 },
    // An army game's first move is due once both armies are in.
    firstMoveBy: army ? null : now + LIMITS.firstMoveMs,
    status: army ? 'draft' : 'playing',
    result: null,
    reason: null,
    endedAt: null,
    offers: { draw: null, takeback: null, rematch: null },
    goneSince: { white: null, black: null },
    chat: [],
    lastPhraseAt: { white: 0, black: 0 },
    next: null,
  };
}

/**
 * @param {RoomPlatform} platform
 */
export function createRoom(platform) {
  /** @type {RoomState | null} */
  let state = null;
  let loaded = false;
  /** The position, rebuilt from the moves when the room wakes. */
  /** @type {import('chess.js').Chess | null} */
  let chess = null;
  /** Events run one at a time, in order. */
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();

  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  function serial(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function ensure() {
    if (loaded) return state;
    state = await platform.load();
    chess = state && !isDuel(state.game) ? replay(state.moves, state.startFen ?? null) : null;
    loaded = true;
    return state;
  }

  const turn = (/** @type {GameState} */ s) => (s.moves.length % 2 === 0 ? 'white' : 'black');

  /** Milliseconds `color` has left at `now`. */
  function left(/** @type {GameState} */ s, /** @type {Color} */ color, /** @type {number} */ now) {
    const base = s.clock[color];
    return s.clock.running === color ? Math.max(0, base - (now - s.clock.since)) : base;
  }

  function clockView(/** @type {GameState} */ s, /** @type {number} */ now) {
    return { white: left(s, 'white', now), black: left(s, 'black', now), running: s.clock.running };
  }

  function firstMoveView(/** @type {GameState} */ s, /** @type {number} */ now) {
    return s.status === 'playing' && s.firstMoveBy !== null
      ? { color: turn(s), inMs: Math.max(0, s.firstMoveBy - now) }
      : null;
  }

  /** The seats with a socket in the room (leaving out the socket `except`, which is closing). */
  function present(/** @type {string | null} */ except = null) {
    const seats = { white: false, black: false };
    for (const conn of platform.connections()) {
      if (conn.data.seat && conn.data.id !== except) seats[conn.data.seat] = true;
    }
    return seats;
  }

  /** The player gone from the game, as `viewer` sees it: who, and when a claim is allowed. */
  function goneView(
    /** @type {GameState} */ s,
    /** @type {Color} */ viewer,
    /** @type {number} */ now,
  ) {
    const away = other(viewer);
    const since = s.goneSince[away];
    if (s.status !== 'playing' || since === null) return null;
    return { color: away, claimInMs: Math.max(0, since + LIMITS.goneClaimMs - now) };
  }

  function nextView(/** @type {RoomState} */ s, /** @type {Color} */ viewer) {
    return s.next ? { game: s.next.id, seat: s.next.seats[viewer], color: other(viewer) } : null;
  }

  /**
   * Army Draft's draft as `you` see it: the budget, the time left, who is
   * ready, and the armies — only your own until both are in.
   */
  function draftView(
    /** @type {GameState} */ s,
    /** @type {Color} */ you,
    /** @type {number} */ now,
  ) {
    const draft = s.draft;
    if (!draft) return null;
    const drafting = s.status === 'draft';
    return {
      budget: draft.budget,
      inMs: drafting ? Math.max(0, draft.by - now) : null,
      ready: { white: draft.armies.white !== null, black: draft.armies.black !== null },
      armies: drafting
        ? {
            white: you === 'white' ? draft.armies.white : null,
            black: you === 'black' ? draft.armies.black : null,
          }
        : draft.armies,
    };
  }

  /** Everything a player needs to draw the game, from their side. */
  function snapshot(
    /** @type {RoomState} */ s,
    /** @type {Color} */ you,
    /** @type {number} */ now,
  ) {
    if (isDuel(s.game)) {
      const d = /** @type {DuelState} */ (s);
      return {
        t: 'game',
        id: d.id,
        you,
        white: { name: d.white.name, rating: d.white.rating },
        black: { name: d.black.name, rating: d.black.rating },
        ...duelView(d, you, now),
        result: d.result,
        reason: d.reason,
        offers: d.offers,
        present: present(),
        chat: d.chat,
        next: nextView(d, you),
      };
    }
    const g = /** @type {GameState} */ (s);
    return chessSnapshot(g, you, now);
  }

  function chessSnapshot(
    /** @type {GameState} */ s,
    /** @type {Color} */ you,
    /** @type {number} */ now,
  ) {
    return {
      t: 'game',
      id: s.id,
      game: s.game ?? 'chess',
      opts: s.opts ?? {},
      tc: s.tc.id,
      you,
      white: { name: s.white.name, rating: s.white.rating },
      black: { name: s.black.name, rating: s.black.rating },
      startFen: s.startFen ?? null,
      draft: draftView(s, you, now),
      peeks: s.peeks ?? null,
      moves: s.moves,
      clock: clockView(s, now),
      firstMove: firstMoveView(s, now),
      status: s.status,
      result: s.result,
      reason: s.reason,
      offers: s.offers,
      present: present(),
      gone: goneView(s, you, now),
      chat: s.chat,
      next: nextView(s, you),
    };
  }

  /** Sends `make(seat)` to every seated socket (nothing where it gives null). */
  function tell(/** @type {(seat: Color) => unknown} */ make) {
    for (const conn of platform.connections()) {
      if (!conn.data.seat) continue;
      const message = make(conn.data.seat);
      if (message !== null) send(conn, message);
    }
  }

  /**
   * The earliest moment something must happen: a flag, a first move, the end
   * of a draft or of a duel's round, a hello, the end of the room.
   */
  function nextDeadline(/** @type {number} */ now) {
    /** @type {number[]} */
    const times = [];
    for (const conn of platform.connections()) {
      if (!conn.data.seat) times.push(conn.data.openedAt + LIMITS.helloMs);
    }
    const s = state;
    if (s) {
      times.push(s.createdAt + LIMITS.roomAgeMs);
      if (s.status === 'over') {
        if (s.endedAt !== null) times.push(s.endedAt + LIMITS.keepAfterEndMs);
      } else if (isDuel(s.game)) {
        const due = duelDeadline(/** @type {DuelState} */ (s));
        if (due !== null) times.push(due);
      } else {
        const g = /** @type {GameState} */ (s);
        if (g.status === 'draft' && g.draft) times.push(g.draft.by);
        if (g.status === 'playing') {
          if (g.firstMoveBy !== null) times.push(g.firstMoveBy);
          const running = g.clock.running;
          if (running) times.push(now + left(g, running, now));
        }
      }
    }
    return times.length > 0 ? Math.min(...times) : null;
  }

  /** What a duel needs of the room. */
  const duelContext = {
    tell,
    refuse: (
      /** @type {unknown} */ conn,
      /** @type {Color} */ seat,
      /** @type {string} */ code,
      /** @type {string} */ message,
    ) => {
      if (state) refuse(/** @type {RoomConn} */ (conn), state, seat, code, message, platform.now());
    },
    present: () => present(),
  };

  /**
   * Both armies are in, or the draft's time is up (whoever has not chosen gets a
   * random army): the game starts from them, and each player sees the other's.
   * @param {GameState} s
   * @param {number} now
   */
  function startDrafted(s, now) {
    const draft = /** @type {NonNullable<GameState['draft']>} */ (s.draft);
    const armies = {
      white: draft.armies.white ?? randomArmy(draft.budget),
      black: draft.armies.black ?? randomArmy(draft.budget),
    };
    draft.armies = armies;
    s.startFen = draftFen(armies.white, armies.black);
    chess = replay([], s.startFen);
    s.status = 'playing';
    s.firstMoveBy = now + LIMITS.firstMoveMs;
    tell((viewer) => chessSnapshot(s, viewer, now));
  }

  /** A refusal for anything but a game under way: still drafting, or over. */
  function notPlaying(
    /** @type {RoomConn} */ conn,
    /** @type {GameState} */ s,
    /** @type {Color} */ seat,
    /** @type {number} */ now,
  ) {
    return s.status === 'draft'
      ? refuse(conn, s, seat, 'not-now', 'The armies are still being chosen.', now)
      : refuse(conn, s, seat, 'over', 'The game is over.', now);
  }

  async function save(/** @type {number} */ now) {
    if (state) await platform.store(state);
    await platform.schedule(nextDeadline(now));
  }

  /**
   * Ends the game.
   * @param {GameState} s
   * @param {GameState['result']} result
   * @param {string} reason
   * @param {number} now
   */
  function end(s, result, reason, now) {
    for (const color of /** @type {Color[]} */ (['white', 'black']))
      s.clock[color] = left(s, color, now);
    s.clock.running = null;
    s.clock.since = 0;
    s.status = 'over';
    s.result = result;
    s.reason = reason;
    s.endedAt = now;
    s.firstMoveBy = null;
    s.offers = { draw: null, takeback: null, rematch: null };
    s.goneSince = { white: null, black: null };
    tell(() => ({ t: 'end', result, reason, clock: clockView(s, now) }));
  }

  /** The flag of the side whose clock runs has fallen: a loss, or a draw when the other cannot mate. */
  function flag(/** @type {GameState} */ s, /** @type {Color} */ loser, /** @type {number} */ now) {
    const winner = other(loser);
    const drawn = chess !== null && cannotMate(chess, winner === 'white' ? 'w' : 'b');
    end(s, drawn ? '1/2-1/2' : winner === 'white' ? '1-0' : '0-1', 'time', now);
  }

  /** Counts a message against the socket's allowance; false when it is used up (then closed). */
  function allowed(/** @type {RoomConn} */ conn, /** @type {number} */ now) {
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

  /** A refusal, followed by the game as it stands so the player's board catches up. */
  function refuse(
    /** @type {RoomConn} */ conn,
    /** @type {RoomState} */ s,
    /** @type {Color} */ seat,
    /** @type {string} */ code,
    /** @type {string} */ message,
    /** @type {number} */ now,
  ) {
    send(conn, { t: 'error', code, message });
    send(conn, snapshot(s, seat, now));
  }

  /** Takes back the last `plies` moves; the clocks keep their times and the side to move runs. */
  function undo(
    /** @type {GameState} */ s,
    /** @type {number} */ plies,
    /** @type {number} */ now,
  ) {
    for (const color of /** @type {Color[]} */ (['white', 'black']))
      s.clock[color] = left(s, color, now);
    s.moves.splice(s.moves.length - plies, plies);
    for (let i = 0; i < plies; i++) chess?.undo();
    s.clock.running = turn(s);
    s.clock.since = now;
    s.offers.draw = null;
    s.offers.takeback = null;
    tell(() => ({ t: 'undo', plies, clock: clockView(s, now) }));
  }

  /** How many moves a takeback asked by `asker` undoes: theirs, and the reply to it if there is one. */
  const takebackPlies = (/** @type {GameState} */ s, /** @type {Color} */ asker) =>
    turn(s) === asker ? 2 : 1;

  /**
   * What either kind of room takes: a phrase, and the rematch once it is over.
   * Anything else is the game's own (`play`) or the duel's (duel.mjs).
   * @param {RoomConn} conn
   * @param {RoomState} s
   * @param {Color} seat
   * @param {Record<string, unknown>} msg
   * @param {number} now
   * @returns {Promise<void> | void | null} null when the message is not one of these
   */
  function common(conn, s, seat, msg, now) {
    if (msg.t === 'say') {
      if (!isPhrase(msg.phrase) || now - s.lastPhraseAt[seat] < LIMITS.phraseMs) return;
      const phrase = /** @type {string} */ (msg.phrase);
      s.lastPhraseAt[seat] = now;
      s.chat = [...s.chat, { by: seat, phrase }].slice(-LIMITS.phrasesKept);
      tell(() => ({ t: 'say', by: seat, phrase }));
      return save(now);
    }
    if (msg.t === 'rematch') return rematch(conn, s, seat, msg, now);
    return null;
  }

  /**
   * A rematch: offered, accepted or declined. Accepted, it makes the next game
   * — the same game with the same options — with the seats swapped: the colours
   * in a game of chess, the host in a duel.
   * @param {RoomConn} conn
   * @param {RoomState} s
   * @param {Color} seat
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function rematch(conn, s, seat, msg, now) {
    const opponent = other(seat);
    if (s.status !== 'over') return refuse(conn, s, seat, 'not-now', 'The game is still on.', now);
    if (s.next) return send(conn, { t: 'rematch', ...nextView(s, seat) });
    const offered = s.offers.rematch;
    if (msg.op === 'accept' || (msg.op === 'offer' && offered === opponent)) {
      if (offered !== opponent) {
        return refuse(conn, s, seat, 'no-offer', 'No rematch was offered.', now);
      }
      const id = randomId(16);
      const seats = { white: randomId(32), black: randomId(32) };
      try {
        await platform.createGame({
          id,
          game: s.game ?? 'chess',
          opts: s.opts ?? {},
          tc: isDuel(s.game) ? null : /** @type {GameState} */ (s).tc.id,
          white: {
            name: s.black.name,
            rating: s.black.rating,
            seatHash: await hashToken(seats.black),
          },
          black: {
            name: s.white.name,
            rating: s.white.rating,
            seatHash: await hashToken(seats.white),
          },
        });
      } catch {
        return refuse(conn, s, seat, 'failed', 'The rematch could not be started.', now);
      }
      s.next = { id, seats };
      s.offers.rematch = null;
      tell((viewer) => ({ t: 'rematch', ...nextView(s, viewer) }));
      return save(now);
    }
    if (msg.op === 'offer') {
      s.offers.rematch = seat;
    } else if (msg.op === 'decline') {
      if (offered === null) return;
      s.offers.rematch = null;
    } else {
      return refuse(conn, s, seat, 'bad-request', 'Unknown answer.', now);
    }
    tell(() => ({ t: 'offers', ...s.offers }));
    return save(now);
  }

  /**
   * @param {RoomConn} conn
   * @param {GameState} s
   * @param {Color} seat
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function play(conn, s, seat, msg, now) {
    const opponent = other(seat);
    switch (msg.t) {
      case 'move': {
        if (s.status !== 'playing') return notPlaying(conn, s, seat, now);
        if (turn(s) !== seat || msg.ply !== s.moves.length) {
          return refuse(conn, s, seat, 'not-now', 'It is not your move.', now);
        }
        if (s.clock.running === seat && left(s, seat, now) <= 0) {
          flag(s, seat, now);
          return save(now);
        }
        const move = chess ? playUci(chess, msg.uci) : null;
        if (!move) return refuse(conn, s, seat, 'illegal', 'That move is not legal.', now);
        const uci = /** @type {string} */ (msg.uci);
        s.moves.push(uci);
        s.offers.draw = null;
        s.offers.takeback = null;
        if (s.moves.length === 1) {
          s.firstMoveBy = now + LIMITS.firstMoveMs;
        } else if (s.moves.length === 2) {
          s.firstMoveBy = null;
          s.clock.running = 'white';
          s.clock.since = now;
        } else {
          s.clock[seat] = left(s, seat, now) + s.tc.incrementMs;
          s.clock.running = opponent;
          s.clock.since = now;
        }
        tell(() => ({
          t: 'move',
          uci,
          ply: s.moves.length - 1,
          clock: clockView(s, now),
          firstMove: firstMoveView(s, now),
        }));
        const over = chess ? endOf(chess) : null;
        if (over) end(s, over.result, over.reason, now);
        return save(now);
      }

      case 'resign': {
        if (s.status === 'over') return refuse(conn, s, seat, 'over', 'The game is over.', now);
        if (s.moves.length < 2) end(s, '*', 'aborted', now);
        else end(s, seat === 'white' ? '0-1' : '1-0', 'resign', now);
        return save(now);
      }

      case 'abort': {
        if (s.status === 'over' || s.moves.length >= 2) {
          return refuse(conn, s, seat, 'not-now', 'The game can no longer be aborted.', now);
        }
        end(s, '*', 'aborted', now);
        return save(now);
      }

      case 'army': {
        const draft = s.draft;
        if (s.status !== 'draft' || !draft) {
          return refuse(conn, s, seat, 'not-now', 'The armies are chosen already.', now);
        }
        if (draft.armies[seat]) return refuse(conn, s, seat, 'not-now', 'Your army is in.', now);
        const army = parseArmy(msg.army);
        if (!army || armyProblem(army, draft.budget) !== null) {
          return refuse(conn, s, seat, 'bad-request', 'That army cannot take the field.', now);
        }
        draft.armies = { ...draft.armies, [seat]: army };
        if (draft.armies[opponent]) startDrafted(s, now);
        else
          tell(() => ({ t: 'draft', ready: { white: seat === 'white', black: seat === 'black' } }));
        return save(now);
      }

      case 'peek': {
        if (!s.peeks)
          return refuse(conn, s, seat, 'bad-request', 'This game shows its pieces.', now);
        if (s.status !== 'playing') return notPlaying(conn, s, seat, now);
        if (s.peeks[seat] >= BLINDFOLD_PEEKS) {
          return refuse(conn, s, seat, 'not-now', 'You have no peeks left.', now);
        }
        s.peeks = { ...s.peeks, [seat]: s.peeks[seat] + 1 };
        tell(() => ({ t: 'peeks', ...s.peeks }));
        return save(now);
      }

      case 'draw': {
        if (s.status !== 'playing') return notPlaying(conn, s, seat, now);
        const offered = s.offers.draw;
        if (msg.op === 'accept' || (msg.op === 'offer' && offered === opponent)) {
          if (offered !== opponent)
            return refuse(conn, s, seat, 'no-offer', 'No draw was offered.', now);
          end(s, '1/2-1/2', 'agreement', now);
          return save(now);
        }
        if (msg.op === 'offer') {
          if (s.moves.length < 2)
            return refuse(conn, s, seat, 'not-now', 'Play a move first.', now);
          s.offers.draw = seat;
        } else if (msg.op === 'decline') {
          if (offered === null) return;
          s.offers.draw = null;
        } else {
          return refuse(conn, s, seat, 'bad-request', 'Unknown answer.', now);
        }
        tell(() => ({ t: 'offers', ...s.offers }));
        return save(now);
      }

      case 'takeback': {
        if (s.status !== 'playing') return notPlaying(conn, s, seat, now);
        const offered = s.offers.takeback;
        if (msg.op === 'accept' || (msg.op === 'offer' && offered === opponent)) {
          if (offered !== opponent) {
            return refuse(conn, s, seat, 'no-offer', 'No takeback was asked for.', now);
          }
          const plies = takebackPlies(s, opponent);
          if (s.moves.length - plies < 2) {
            s.offers.takeback = null;
            return refuse(conn, s, seat, 'not-now', 'The first moves cannot be taken back.', now);
          }
          undo(s, plies, now);
          return save(now);
        }
        if (msg.op === 'offer') {
          if (s.moves.length - takebackPlies(s, seat) < 2) {
            return refuse(conn, s, seat, 'not-now', 'The first moves cannot be taken back.', now);
          }
          s.offers.takeback = seat;
        } else if (msg.op === 'decline') {
          if (offered === null) return;
          s.offers.takeback = null;
        } else {
          return refuse(conn, s, seat, 'bad-request', 'Unknown answer.', now);
        }
        tell(() => ({ t: 'offers', ...s.offers }));
        return save(now);
      }

      case 'claim': {
        if (s.status !== 'playing') return notPlaying(conn, s, seat, now);
        const since = s.goneSince[opponent];
        if (
          s.moves.length < 2 ||
          since === null ||
          present()[opponent] ||
          now < since + LIMITS.goneClaimMs
        ) {
          return refuse(conn, s, seat, 'not-now', 'Your opponent can still come back.', now);
        }
        if (msg.op === 'win') end(s, seat === 'white' ? '1-0' : '0-1', 'abandoned', now);
        else if (msg.op === 'draw') end(s, '1/2-1/2', 'abandoned', now);
        else return refuse(conn, s, seat, 'bad-request', 'Unknown claim.', now);
        return save(now);
      }

      default:
        return refuse(conn, s, seat, 'bad-request', 'Unknown message.', now);
    }
  }

  return {
    /**
     * Makes the game (called by the waiting room, or by the room of a game
     * that ends in a rematch).
     * @param {GameSpec} spec
     */
    create(spec) {
      return serial(async () => {
        if (await ensure()) throw new Error('This game exists already.');
        const now = platform.now();
        if (isDuel(spec.game)) {
          state = newDuel(spec, now);
          chess = null;
        } else {
          state = newGame(spec, now);
          chess = replay([]);
        }
        await save(now);
      });
    },

    /**
     * A socket has opened: it has `LIMITS.helloMs` to say which seat it is.
     * @param {RoomConn} _conn
     */
    open(_conn) {
      return serial(async () => {
        await ensure();
        await platform.schedule(nextDeadline(platform.now()));
      });
    },

    /**
     * @param {RoomConn} conn
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
        const msg = parse(text);
        // Only a duel's host sending its rounds may say more than a normal message holds.
        const content =
          msg?.t === 'content' && s !== null && isDuel(s.game) && conn.data.seat === 'white';
        if (text.length > LIMITS.messageBytes && !content) {
          conn.close(CLOSE.tooBig, 'Message too big.');
          return;
        }
        if (!s) {
          conn.close(CLOSE.noGame, 'No such game.');
          return;
        }
        if (!msg) {
          send(conn, { t: 'error', code: 'bad-request', message: 'That is not a message.' });
          return;
        }
        const seat = conn.data.seat;
        if (!seat) {
          if (msg.t !== 'hello' || typeof msg.seat !== 'string' || !SEAT_PATTERN.test(msg.seat)) {
            conn.close(CLOSE.noGame, 'Say which seat first.');
            return;
          }
          const hash = await hashToken(msg.seat);
          /** @type {Color | null} */
          const color = sameText(hash, s.white.seatHash)
            ? 'white'
            : sameText(hash, s.black.seatHash)
              ? 'black'
              : null;
          if (!color) {
            conn.close(CLOSE.noGame, 'Not a seat in this game.');
            return;
          }
          conn.data.seat = color;
          conn.save();
          const wasGone = s.goneSince[color] !== null;
          s.goneSince[color] = null;
          send(conn, snapshot(s, color, now));
          const duel = isDuel(s.game);
          tell((viewer) =>
            viewer === color
              ? null
              : {
                  t: 'present',
                  ...present(),
                  gone: duel ? null : goneView(/** @type {GameState} */ (s), viewer, now),
                },
          );
          // A duel starts once both players are here (and its rounds are in).
          const started = duel && duelMaybeStart(duelContext, /** @type {DuelState} */ (s), now);
          if (wasGone || started) await save(now);
          else await platform.schedule(nextDeadline(now));
          return;
        }
        if (msg.t === 'hello') {
          send(conn, snapshot(s, seat, now));
          return;
        }
        const shared = common(conn, s, seat, msg, now);
        if (shared !== null) {
          await shared;
          return;
        }
        if (isDuel(s.game)) {
          const d = /** @type {DuelState} */ (s);
          if (duelMessage(duelContext, conn, d, seat, msg, now)) await save(now);
          else refuse(conn, s, seat, 'bad-request', 'Unknown message.', now);
          return;
        }
        await play(conn, /** @type {GameState} */ (s), seat, msg, now);
      });
    },

    /**
     * A socket has closed. A player whose last socket goes is gone: after
     * `LIMITS.goneClaimMs` the other may claim a game of chess (a duel's rounds
     * simply go on without them).
     * @param {RoomConn} conn
     */
    close(conn) {
      return serial(async () => {
        const s = await ensure();
        const seat = conn.data.seat;
        conn.data.seat = null;
        if (!s || !seat || s.status === 'over') return;
        const still = platform
          .connections()
          .some((c) => c.data.id !== conn.data.id && c.data.seat === seat);
        if (still) return;
        const now = platform.now();
        s.goneSince[seat] = now;
        const seats = present(conn.data.id);
        const duel = isDuel(s.game);
        for (const other of platform.connections()) {
          if (other.data.id === conn.data.id || !other.data.seat) continue;
          const gone = duel ? null : goneView(/** @type {GameState} */ (s), other.data.seat, now);
          send(other, { t: 'present', ...seats, gone });
        }
        await save(now);
      });
    },

    /** Something is due: a flag, a first move, a hello, or the room's end. */
    timer() {
      return serial(async () => {
        const s = await ensure();
        const now = platform.now();
        for (const conn of platform.connections()) {
          if (!conn.data.seat && now >= conn.data.openedAt + LIMITS.helloMs) {
            conn.close(CLOSE.noHello, 'Say which seat first.');
          }
        }
        if (!s) {
          await platform.schedule(null);
          return;
        }
        const expired =
          now >= s.createdAt + LIMITS.roomAgeMs ||
          (s.status === 'over' && s.endedAt !== null && now >= s.endedAt + LIMITS.keepAfterEndMs);
        if (expired) {
          for (const conn of platform.connections())
            conn.close(CLOSE.closed, 'The game is closed.');
          state = null;
          chess = null;
          await platform.remove();
          await platform.schedule(null);
          return;
        }
        if (isDuel(s.game)) {
          duelTimer(duelContext, /** @type {DuelState} */ (s), now);
        } else {
          const g = /** @type {GameState} */ (s);
          if (g.status === 'draft' && g.draft && now >= g.draft.by) {
            startDrafted(g, now);
          } else if (g.status === 'playing') {
            if (g.firstMoveBy !== null && now >= g.firstMoveBy) {
              end(g, '*', 'no-start', now);
            } else if (g.clock.running && left(g, g.clock.running, now) <= 0) {
              flag(g, g.clock.running, now);
            }
          }
        }
        await save(now);
      });
    },
  };
}
