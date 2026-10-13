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
 * Three variants are played by the same rules. In a blindfold game the room
 * counts each player's peeks (the pieces are hidden on their devices). In Army
 * Draft each player first sends an army bought from the budget, which the room
 * keeps from the other until both are in (or the draft time is up, when it
 * drafts for whoever has not); the game then starts from the two armies. A
 * Chess960 game starts from one of the 960 start positions, which the room
 * draws when it makes the game (a rematch keeps it, the colours swapped), and
 * is refereed on chessops (chess960.mjs): castling is the king taking its own
 * rook ("e1h1"). A duel (a puzzle race, Arbiter, Who Stands Better?) is a room
 * of rounds instead: duel.mjs runs it, and this file only seats its players,
 * passes their phrases and makes its rematch.
 *
 * A game of chess may be watched: a socket that says `{t:'hello', watch:true}`
 * instead of naming a seat gets the game as anyone may see it (no seat tokens,
 * no phrases, no army before both are in) and every public message after it:
 * the moves, the clocks, the offers, the presence and the end. It can send
 * nothing but `hello` (the game again). At most `LIMITS.watchers` watch a game;
 * the players are told how many do. Duels are not watched.
 *
 * A correspondence game ("3d": days for every move) is a game of chess too,
 * played over days: each move resets the mover's days and starts the other's;
 * a deadline that passes loses on time (it aborts the game before both sides
 * have moved). Players come and go, so nobody claims against an absent one.
 * Its room is made by invitation with one seat open (`open`): the first socket
 * that sends `join` while watching takes it, and gets the seat's token; the
 * clocks start then. An invitation nobody takes in `LIMITS.inviteMs` expires.
 * The room lives until `LIMITS.correspondenceKeepMs` after the end (a year at
 * most). A player may leave a push subscription with their seat (`push` in
 * `hello`, or a `push` message): while they are away, the room pushes them
 * their turn, the invitation taken and the end (`notify`, through the
 * platform; a subscription its push service calls gone is forgotten).
 *
 * Once a game of chess is over, a player or a watcher may ask to analyse it
 * together (`analyse`): the room makes the game's analysis room, a group room
 * (analysisRoom.mjs) under an id derived from the game's, with the game's
 * moves, and tells everyone where it is.
 *
 * Who hears what: `tell(make)` reaches the players (each their own message),
 * `show(message)` the watchers, `announce(message)` both: a message for
 * everyone must hold nothing private to a player.
 *
 * Times sent to the players are durations (milliseconds left, milliseconds
 * until), never the relay's clock: each side counts down from when a message
 * arrives, whatever its own clock says. The room also keeps the mover's time
 * after each move (`clocks`, in the snapshot), which a game's record writes
 * beside its moves; a correspondence game keeps none.
 *
 * Against abuse (each write and each alarm set is a row written, which the
 * free plan counts per day for every room together): the room writes its
 * state only when it has changed since it was last written, and sets its
 * timer only when the deadline has moved, so a refusal or a message that
 * changes nothing costs nothing. A room takes `ABUSE_LIMITS.roomSocketsPerAddress`
 * sockets from one address and `socketsPerSeat` on one seat (one more is
 * refused), and keeps `unsaid` sockets yet to say hello (one more sends the
 * oldest of those away, so a player always gets back in); a socket refused
 * too often is closed; and a rematch is refused once `ABUSE_LIMITS.rematches`
 * in a row have led to the game. A socket for a game that is not there is
 * closed at once, and nothing is written for it.
 */
import { addressKey } from '../address.mjs';
import { hashToken } from '../handler.mjs';
import { subscriptionOf } from '../push/webpush.mjs';
import { armyProblem, draftFen, parseArmy, randomArmy } from './army.mjs';
import {
  duelDeadline,
  duelMaybeStart,
  duelMessage,
  duelTimer,
  duelView,
  newDuel,
} from './duel.mjs';
import { chess960StartFen, isChess960Position, randomChess960Position } from './chess960.mjs';
import { cannotMate, endOf, playUci, replay } from './rules.mjs';
import {
  ABUSE_LIMITS,
  ANALYSIS_ROOM,
  analysisRoomId,
  BLINDFOLD_PEEKS,
  CLOSE,
  CORRESPONDENCE_GAMES,
  isDuel,
  isPhrase,
  isPlayerName,
  isRating,
  LIMITS,
  parseTimeControl,
  randomId,
  refusedTooOften,
  SEAT_PATTERN,
} from './shared.mjs';

/** The position a game of chess starts from when it has no start of its own. */
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * @typedef {'white' | 'black'} Color
 * @typedef {import('./lobby.mjs').GameSpec} GameSpec
 * @typedef {GameSpec & { rematches?: number }} RoomSpec
 *   A game's spec as a room takes it: the waiting room's, and for a rematch
 *   how many rematches in a row led to it.
 * @typedef {import('./army.mjs').Army} Army
 * @typedef {import('./duel.mjs').DuelState} DuelState
 * @typedef {import('../push/webpush.mjs').Subscription} Subscription
 * @typedef {import('../push/webpush.mjs').PushMessage} PushMessage
 * @typedef {{ name: string, rating: number | null, seatHash: string }} Seat
 *
 * @typedef {{
 *   v: 1 | 2,
 *   id: string,
 *   createdAt: number,
 *   game?: 'chess' | 'blindfold' | 'army' | 'chess960',
 *   opts?: Record<string, string | number>,
 *   tc: { id: string, kind?: string, initialMs: number, incrementMs: number, perMoveMs?: number | null },
 *   white: Seat,
 *   black: Seat,
 *   open?: Color | null,
 *   openUntil?: number | null,
 *   push?: { white: Subscription | null, black: Subscription | null } | null,
 *   startFen?: string | null,
 *   position?: number | null,
 *   draft?: { budget: number, by: number, armies: { white: Army | null, black: Army | null } } | null,
 *   peeks?: { white: number, black: number } | null,
 *   moves: string[],
 *   clocks?: number[],
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
 *   rematches?: number,
 * }} GameState
 *   `rematches`: how many rematches in a row led to this game (none: 0).
 *
 * @typedef {GameState | DuelState} RoomState
 *
 * @typedef {{
 *   id: string,
 *   seat: Color | null,
 *   watch: boolean,
 *   openedAt: number,
 *   rateStart: number,
 *   rateCount: number,
 *   address: string,
 *   refused?: { start: number, count: number },
 * }} RoomData
 *   `address`: the client's, as the limits count it (`addressKey`), or '' when
 *   not known (a socket from the Node server's own machine); `refused`: the
 *   socket's refused messages lately (`refusedTooOften`).
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
 *   alarm?: () => Promise<number | null>,
 *   createGame(spec: RoomSpec): Promise<void>,
 *   createGroup?: (spec: import('./group.mjs').GroupSpec) => Promise<'created' | 'exists'>,
 *   now(): number,
 *   notify?: (subscription: Subscription, message: PushMessage) => Promise<'sent' | 'gone' | 'failed'>,
 *   chess960Position?: () => number,
 * }} RoomPlatform
 *   `alarm`: when the timer is set for (null: not set), read when a room
 *   wakes, so that it sets the timer only when it must (none: the room's first
 *   save sets it)
 *   `createGroup`: makes a group room, or finds it made (the game's analysis
 *   room; none: games are not analysed together)
 *   `notify`: pushes a message to a player away from a correspondence game
 *   (none: nobody is pushed)
 *   `chess960Position`: draws a new Chess960 game's start position (none: one of the
 *   960 at random); the end-to-end tests fix it, to reach castling in a few moves
 */

/**
 * A new socket's data (kept with the socket: a Durable Object keeps it across
 * hibernation), with the client's address, if known, as the limits count it:
 * an IP address, or the key `addressKey` made of one already (an IPv6
 * address's /64, kept as it is).
 */
export function roomData(now = Date.now(), address = '') {
  return /** @type {RoomData} */ ({
    id: randomId(16),
    seat: null,
    watch: false,
    openedAt: now,
    rateStart: 0,
    rateCount: 0,
    address: !address || address.includes('/') ? address : addressKey(address),
  });
}

/** How many rematches in a row led to a spec's game. @param {RoomSpec} spec */
const rematchesOf = (spec) =>
  Number.isSafeInteger(spec.rematches) && Number(spec.rematches) > 0 ? Number(spec.rematches) : 0;

/** @param {Color} color */
const other = (color) => (color === 'white' ? 'black' : 'white');

/** A game played over days: each move has its own days (`tc.perMoveMs`). @param {RoomState} s */
const isCorrespondence = (s) =>
  !isDuel(s.game) && Boolean(/** @type {GameState} */ (s).tc.perMoveMs);

/** How long a room lives at most. @param {RoomState} s */
const roomAgeOf = (s) => (isCorrespondence(s) ? LIMITS.correspondenceAgeMs : LIMITS.roomAgeMs);

/** How long a room is kept after its game's end. @param {RoomState} s */
const keepAfterEndOf = (s) =>
  isCorrespondence(s) ? LIMITS.correspondenceKeepMs : LIMITS.keepAfterEndMs;

/**
 * How a correspondence game ended, for the push message to `color`.
 * @param {GameState['result']} result
 * @param {string} reason
 * @param {Color} color
 * @param {string} opponent
 */
function endNote(result, reason, color, opponent) {
  if (reason === 'expired') return 'Nobody took it in time.';
  if (reason === 'aborted' || reason === 'no-start') return 'The game was aborted.';
  const winner = result === '1-0' ? 'white' : result === '0-1' ? 'black' : null;
  if (winner === color) {
    if (reason === 'checkmate') return 'You won by checkmate.';
    if (reason === 'resign') return `You won: ${opponent} resigned.`;
    if (reason === 'time') return 'You won on time.';
    return 'You won.';
  }
  if (winner) {
    if (reason === 'checkmate') return 'You lost by checkmate.';
    if (reason === 'resign') return 'You resigned.';
    if (reason === 'time') return 'You lost on time.';
    return 'You lost.';
  }
  switch (reason) {
    case 'agreement':
      return 'Drawn by agreement.';
    case 'stalemate':
      return 'Drawn by stalemate.';
    case 'repetition':
      return 'Drawn by threefold repetition.';
    case 'fifty-moves':
      return 'Drawn by the fifty-move rule.';
    case 'insufficient':
      return 'Drawn: neither side can mate.';
    case 'time':
      return 'Drawn on time: the side with time left could not have mated.';
    default:
      return 'Drawn.';
  }
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

/** @param {RoomConn} conn @param {unknown} message */
function send(conn, message) {
  try {
    conn.send(JSON.stringify(message));
  } catch {
    // A socket that is closing takes nothing more; its close event tidies up.
  }
}

/**
 * The state of a new game of chess (or of a variant of it). A Chess960 game
 * starts from the position the spec names (a rematch's), or else one `draw` picks.
 * @param {RoomSpec} spec
 * @param {number} now
 * @param {() => number} [draw]
 * @returns {GameState}
 */
export function newGame(spec, now, draw = randomChess960Position) {
  const tc = parseTimeControl(spec.tc);
  if (!tc) throw new Error(`Not a time control: ${spec.tc}`);
  const game = spec.game ?? 'chess';
  if (game !== 'chess' && game !== 'blindfold' && game !== 'army' && game !== 'chess960') {
    throw new Error(`Not a game of chess: ${game}`);
  }
  const opts = spec.opts ?? {};
  const army = game === 'army';
  const perMoveMs = tc.perMoveMs;
  const open = spec.open === 'white' || spec.open === 'black' ? spec.open : null;
  if (perMoveMs !== null && !CORRESPONDENCE_GAMES.includes(game)) {
    throw new Error('Correspondence is chess or Chess960.');
  }
  let position = null;
  if (game === 'chess960') {
    position = isChess960Position(spec.position) ? spec.position : draw();
    if (!isChess960Position(position)) throw new Error(`Not a Chess960 position: ${position}`);
  }
  if (open && perMoveMs === null) throw new Error('Only a correspondence game waits for a player.');
  return {
    v: 2,
    id: spec.id,
    createdAt: now,
    game,
    opts,
    tc,
    white: spec.white,
    black: spec.black,
    open,
    openUntil: open ? now + LIMITS.inviteMs : null,
    startFen: position !== null ? chess960StartFen(position) : null,
    position,
    draft: army
      ? {
          budget: Number(opts.budget) || 30,
          by: now + LIMITS.draftMs,
          armies: { white: null, black: null },
        }
      : null,
    peeks: game === 'blindfold' ? { white: 0, black: 0 } : null,
    moves: [],
    // Correspondence: White's days run as soon as both players are in.
    clock:
      perMoveMs !== null
        ? { white: perMoveMs, black: perMoveMs, running: open ? null : 'white', since: now }
        : { white: tc.initialMs, black: tc.initialMs, running: null, since: 0 },
    // An army game's first move is due once both armies are in; correspondence has none.
    firstMoveBy: army || perMoveMs !== null ? null : now + LIMITS.firstMoveMs,
    status: army ? 'draft' : 'playing',
    result: null,
    reason: null,
    endedAt: null,
    offers: { draw: null, takeback: null, rematch: null },
    goneSince: { white: null, black: null },
    chat: [],
    lastPhraseAt: { white: 0, black: 0 },
    next: null,
    rematches: rematchesOf(spec),
  };
}

/**
 * @param {RoomPlatform} platform
 */
export function createRoom(platform) {
  /** @type {RoomState | null} */
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
  /** The position, rebuilt from the moves when the room wakes. */
  /** @type {import('./rules.mjs').RulesGame | null} */
  let chess = null;
  /** Events run one at a time, in order. */
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** Push messages for players away, delivered once the state they tell of is saved. */
  /** @type {{ color: Color, subscription: Subscription, message: PushMessage }[]} */
  let outbox = [];

  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  function serial(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function ensure() {
    if (loaded) return state;
    state = await platform.load();
    written = state ? JSON.stringify(state) : null;
    chess =
      state && !isDuel(state.game)
        ? replay(state.moves, state.startFen ?? null, state.game ?? 'chess')
        : null;
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

  /** The sockets watching the game (leaving out the socket `except`, which is closing). */
  function watchers(/** @type {string | null} */ except = null) {
    return platform
      .connections()
      .filter((conn) => conn.data.watch && !conn.data.seat && conn.data.id !== except);
  }

  /** The player gone from the game, as `viewer` sees it: who, and when a claim is allowed. */
  function goneView(
    /** @type {GameState} */ s,
    /** @type {Color} */ viewer,
    /** @type {number} */ now,
  ) {
    const away = other(viewer);
    const since = s.goneSince[away];
    if (s.status !== 'playing' || since === null || isCorrespondence(s)) return null;
    return { color: away, claimInMs: Math.max(0, since + LIMITS.goneClaimMs - now) };
  }

  /** The rematch to go to: a player's seat in it, or (for a watcher) only the game to watch. */
  function nextView(/** @type {RoomState} */ s, /** @type {Color | null} */ viewer) {
    if (!s.next) return null;
    return viewer
      ? { game: s.next.id, seat: s.next.seats[viewer], color: other(viewer) }
      : { game: s.next.id };
  }

  /**
   * Army Draft's draft as `you` see it: the budget, the time left, who is
   * ready, and the armies — only your own until both are in (a watcher's,
   * `you` null, none).
   */
  function draftView(
    /** @type {GameState} */ s,
    /** @type {Color | null} */ you,
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

  /**
   * The game of chess from `you`'s seat, or (`you` null) as a watcher sees it:
   * no `gone` to claim against, no phrases, no seat in a rematch.
   */
  function chessSnapshot(
    /** @type {GameState} */ s,
    /** @type {Color | null} */ you,
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
      gone: you ? goneView(s, you, now) : null,
      chat: you ? s.chat : [],
      next: nextView(s, you),
      watchers: watchers().length,
      open: s.open ?? null,
      clocks: s.clocks ?? [],
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

  /** Sends `message` to every watcher (leaving out the socket `except`, which is closing). */
  function show(/** @type {unknown} */ message, /** @type {string | null} */ except = null) {
    for (const conn of watchers(except)) send(conn, message);
  }

  /** Sends one message to the players and the watchers alike: it must hold nothing private. */
  function announce(/** @type {unknown} */ message) {
    tell(() => message);
    show(message);
  }

  /** Tells everyone in the room how many watch (leaving out the socket `except`, which is closing). */
  function countWatchers(/** @type {string | null} */ except = null) {
    const message = { t: 'watchers', n: watchers(except).length };
    for (const conn of platform.connections()) {
      if (conn.data.id !== except && (conn.data.seat || conn.data.watch)) send(conn, message);
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
      if (!conn.data.seat && !conn.data.watch) times.push(conn.data.openedAt + LIMITS.helloMs);
    }
    const s = state;
    if (s) {
      times.push(s.createdAt + roomAgeOf(s));
      if (s.status === 'over') {
        if (s.endedAt !== null) times.push(s.endedAt + keepAfterEndOf(s));
      } else if (isDuel(s.game)) {
        const due = duelDeadline(/** @type {DuelState} */ (s));
        if (due !== null) times.push(due);
      } else {
        const g = /** @type {GameState} */ (s);
        if (g.status === 'draft' && g.draft) times.push(g.draft.by);
        if (g.status === 'playing') {
          if (g.open && typeof g.openUntil === 'number') times.push(g.openUntil);
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
    show(chessSnapshot(s, null, now));
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

  /** Writes the state, unless it is what was last written. */
  async function write() {
    if (!state) return;
    const text = JSON.stringify(state);
    if (text === written) return;
    await platform.store(state);
    written = text;
  }

  /** Sets the timer for `at` (null: none), unless it is set for that already. */
  async function schedule(/** @type {number | null} */ at) {
    if (scheduled === undefined && platform.alarm) {
      try {
        scheduled = await platform.alarm();
      } catch {
        // Not known: the timer is set below all the same.
      }
    }
    if (at === scheduled) return;
    scheduled = undefined;
    await platform.schedule(at);
    scheduled = at;
  }

  /**
   * Stores the state and sets the timer on the next deadline (each only when
   * it changed), then delivers the push messages queued with `nudge`. A write
   * or a timer the platform refuses (its allowance for the day used up) leaves
   * the room going on as it is in memory: the next save tries again, and the
   * push messages wait for it. Whether everything was stored.
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
    if (stored) await deliver();
    return stored;
  }

  /**
   * A push message for `color`, should they be away when the state is saved
   * (correspondence games only: a player of a game at once is on its page).
   * @param {GameState} s
   * @param {Color} color
   * @param {Omit<PushMessage, 'url' | 'tag'>} note
   */
  function nudge(s, color, note) {
    const subscription = isCorrespondence(s) ? s.push?.[color] : null;
    if (!subscription) return;
    outbox.push({
      color,
      subscription,
      message: { ...note, url: `play/online/${s.id}`, tag: s.id },
    });
  }

  /**
   * Pushes the messages waiting to the players still away. A subscription its
   * push service calls gone is forgotten.
   */
  async function deliver() {
    const notes = outbox;
    outbox = [];
    if (notes.length === 0 || !platform.notify) return;
    let forgot = false;
    for (const { color, subscription, message } of notes) {
      if (present()[color]) continue;
      /** @type {'sent' | 'gone' | 'failed'} */
      let sent = 'failed';
      try {
        sent = await platform.notify(subscription, message);
      } catch {
        // Not delivered: the game goes on all the same.
      }
      const g = /** @type {GameState | null} */ (state);
      if (sent === 'gone' && g?.push?.[color]?.endpoint === subscription.endpoint) {
        g.push = { ...g.push, [color]: null };
        forgot = true;
      }
    }
    if (!forgot) return;
    try {
      await write();
    } catch {
      // Forgotten in memory: the next save writes it.
    }
  }

  /**
   * Keeps (or, with null or anything but a subscription, drops) the push
   * subscription a player of a correspondence game under way leaves with their
   * seat. Whether it changed.
   * @param {RoomState} s
   * @param {Color} color
   * @param {unknown} value
   */
  function keepSubscription(s, color, value) {
    if (!isCorrespondence(s) || s.status === 'over') return false;
    const g = /** @type {GameState} */ (s);
    const subscription = value === null ? null : subscriptionOf(value);
    const known = g.push?.[color] ?? null;
    if (JSON.stringify(known) === JSON.stringify(subscription)) return false;
    g.push = { white: null, black: null, ...g.push, [color]: subscription };
    return true;
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
    announce({ t: 'end', result, reason, clock: clockView(s, now) });
    for (const color of /** @type {Color[]} */ (['white', 'black'])) {
      const opponent = s[other(color)].name;
      nudge(s, color, {
        title: opponent ? `Game over against ${opponent}` : 'Your invitation',
        body: endNote(result, reason, color, opponent),
      });
    }
    // Nothing more to push: the subscriptions go with the game.
    s.push = null;
  }

  /**
   * The flag of the side whose clock runs has fallen: a loss, or a draw when the
   * other cannot mate. A correspondence game's deadline before both sides have
   * moved aborts it instead.
   */
  function flag(/** @type {GameState} */ s, /** @type {Color} */ loser, /** @type {number} */ now) {
    if (isCorrespondence(s) && s.moves.length < 2) {
      end(s, '*', 'no-start', now);
      return;
    }
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

  /**
   * Counts a refused message against its socket (in the socket's data, saved
   * so that the count outlives hibernation). A socket refused more than
   * `ABUSE_LIMITS.refusals` times in `refusalWindowMs` is closed: false then,
   * and nothing more is to be sent to it.
   * @param {RoomConn} conn
   * @param {number} now
   */
  function counted(conn, now) {
    const tooOften = refusedTooOften(conn.data, now);
    conn.save();
    if (!tooOften) return true;
    send(conn, { t: 'error', code: 'rate', message: 'Too many refused messages: wait a moment.' });
    conn.close(CLOSE.policy, 'Too many refused messages.');
    return false;
  }

  /**
   * An error to one socket, counted against it (`counted`), and then, if it
   * is still open, what `then` gives (the game as it stands, say).
   * @param {RoomConn} conn
   * @param {string} code
   * @param {string} message
   * @param {number} now
   * @param {(() => unknown) | null} [then]
   */
  function refuseTo(conn, code, message, now, then = null) {
    if (!counted(conn, now)) return;
    send(conn, { t: 'error', code, message });
    if (then) send(conn, then());
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
    refuseTo(conn, code, message, now, () => snapshot(s, seat, now));
  }

  /**
   * Takes back the last `plies` moves; the clocks keep their times (in
   * correspondence, the side to move has its days again) and the side to move runs.
   */
  function undo(
    /** @type {GameState} */ s,
    /** @type {number} */ plies,
    /** @type {number} */ now,
  ) {
    for (const color of /** @type {Color[]} */ (['white', 'black'])) {
      s.clock[color] = s.tc.perMoveMs ? s.tc.perMoveMs : left(s, color, now);
    }
    s.moves.splice(s.moves.length - plies, plies);
    if (s.clocks) s.clocks = s.clocks.slice(0, s.moves.length);
    for (let i = 0; i < plies; i++) chess?.undo();
    s.clock.running = turn(s);
    s.clock.since = now;
    s.offers.draw = null;
    s.offers.takeback = null;
    announce({ t: 'undo', plies, clock: clockView(s, now) });
  }

  /** How many moves a takeback asked by `asker` undoes: theirs, and the reply to it if there is one. */
  const takebackPlies = (/** @type {GameState} */ s, /** @type {Color} */ asker) =>
    turn(s) === asker ? 2 : 1;

  /**
   * What either kind of room takes: a phrase, and the rematch and the analysis
   * together once it is over. Anything else is the game's own (`play`) or the
   * duel's (duel.mjs).
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
    if (msg.t === 'analyse') return analyse(conn, s, seat, now);
    return null;
  }

  /**
   * A player, or a watcher (`seat` null), asks to analyse the game together
   * once it is over. The room makes the game's analysis room, or finds it made
   * (a room of up to eight, analysisRoom.mjs), with the game's start, its
   * moves, its players and its result, under the id derived from the game's
   * (`analysisRoomId`). Only this room puts a game under that id, so nobody
   * can seed another game there; asking again makes it again once it has gone.
   * Everyone in the room hears where it is, and who asked.
   * @param {RoomConn} conn
   * @param {RoomState} s
   * @param {Color | null} seat
   * @param {number} now
   */
  async function analyse(conn, s, seat, now) {
    const no = (/** @type {string} */ code, /** @type {string} */ message) =>
      refuseTo(conn, code, message, now, () =>
        seat ? snapshot(s, seat, now) : chessSnapshot(/** @type {GameState} */ (s), null, now),
      );
    if (isDuel(s.game)) return no('bad-request', 'A duel has no game to analyse.');
    const g = /** @type {GameState} */ (s);
    if (g.status !== 'over') return no('not-now', 'The game is still on.');
    if (!platform.createGroup) return no('failed', 'The analysis room could not be made.');
    const id = await analysisRoomId(g.id);
    /** @type {Record<string, string>} */
    const opts = {
      variant: g.game === 'chess960' ? 'chess960' : 'standard',
      fen: g.startFen ?? INITIAL_FEN,
      moves: g.moves.slice(0, ANALYSIS_ROOM.depth).join(' '),
      result: g.result ?? '*',
    };
    if (isPlayerName(g.white.name)) opts.white = g.white.name;
    if (isPlayerName(g.black.name)) opts.black = g.black.name;
    try {
      await platform.createGroup({ id, kind: 'analysis', opts, host: null });
    } catch {
      return no('failed', 'The analysis room could not be made.');
    }
    announce({ t: 'analysis', room: id, by: seat });
  }

  /**
   * A rematch: offered, accepted or declined. Accepted, it makes the next game
   * — the same game with the same options — with the seats swapped: the colours
   * in a game of chess, the host in a duel. After `ABUSE_LIMITS.rematches` in
   * a row, the players start a new game from Play instead.
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
    const rematches = s.rematches ?? 0;
    if ((msg.op === 'offer' || msg.op === 'accept') && rematches >= ABUSE_LIMITS.rematches) {
      const words = `No more rematches after ${ABUSE_LIMITS.rematches} in a row: start a new game from Play.`;
      return refuse(conn, s, seat, 'limit', words, now);
    }
    const offered = s.offers.rematch;
    if (msg.op === 'accept' || (msg.op === 'offer' && offered === opponent)) {
      if (offered !== opponent) {
        return refuse(conn, s, seat, 'no-offer', 'No rematch was offered.', now);
      }
      const id = randomId(16);
      const seats = { white: randomId(32), black: randomId(32) };
      // Chess960: the same start position again.
      const position = isDuel(s.game) ? null : /** @type {GameState} */ (s).position;
      try {
        await platform.createGame({
          id,
          game: s.game ?? 'chess',
          opts: s.opts ?? {},
          tc: isDuel(s.game) ? null : /** @type {GameState} */ (s).tc.id,
          position: position ?? null,
          rematches: rematches + 1,
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
      show({ t: 'rematch', ...nextView(s, null) });
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
    announce({ t: 'offers', ...s.offers });
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
        if (s.open) {
          return refuse(conn, s, seat, 'not-now', 'Your opponent has not joined yet.', now);
        }
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
        if (s.tc.perMoveMs) {
          // Days for every move: the mover's days are whole again for the next, the other's run.
          s.clock.white = s.tc.perMoveMs;
          s.clock.black = s.tc.perMoveMs;
          s.clock.running = opponent;
          s.clock.since = now;
        } else if (s.moves.length === 1) {
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
        // The mover's time after the move, for the record (`[%clk]`); correspondence keeps none.
        if (!s.tc.perMoveMs) (s.clocks ??= []).push(s.clock[seat]);
        announce({
          t: 'move',
          uci,
          ply: s.moves.length - 1,
          clock: clockView(s, now),
          firstMove: firstMoveView(s, now),
        });
        const over = chess ? endOf(chess) : null;
        if (over) {
          end(s, over.result, over.reason, now);
        } else {
          nudge(s, opponent, {
            title: `Your move against ${s[seat].name}`,
            body: `${s[seat].name} played ${move.san}.`,
          });
        }
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
        else announce({ t: 'draft', ready: { white: seat === 'white', black: seat === 'black' } });
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
        announce({ t: 'peeks', ...s.peeks });
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
        announce({ t: 'offers', ...s.offers });
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
        announce({ t: 'offers', ...s.offers });
        return save(now);
      }

      case 'claim': {
        if (s.status !== 'playing') return notPlaying(conn, s, seat, now);
        if (isCorrespondence(s)) {
          return refuse(
            conn,
            s,
            seat,
            'not-now',
            'A correspondence game waits for its players.',
            now,
          );
        }
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

      case 'push': {
        if (!isCorrespondence(s) || s.status === 'over') {
          refuseTo(conn, 'not-now', 'This game pushes nothing.', now);
          return;
        }
        if (msg.sub !== null && !subscriptionOf(msg.sub)) {
          refuseTo(conn, 'bad-request', 'That is not a subscription.', now);
          return;
        }
        if (keepSubscription(s, seat, msg.sub)) return save(now);
        return;
      }

      default:
        return refuse(conn, s, seat, 'bad-request', 'Unknown message.', now);
    }
  }

  /**
   * A socket asks to watch: refused in a duel and when the room has all the
   * watchers it takes; otherwise it gets the game as anyone may see it, and
   * everyone hears how many watch now.
   * @param {RoomConn} conn
   * @param {RoomState} s
   * @param {number} now
   */
  async function startWatching(conn, s, now) {
    if (isDuel(s.game)) {
      conn.close(CLOSE.noGame, 'A duel cannot be watched.');
      return;
    }
    if (watchers().length >= LIMITS.watchers) {
      send(conn, { t: 'error', code: 'full', message: 'This game has all the watchers it takes.' });
      conn.close(CLOSE.full, 'Too many watchers.');
      return;
    }
    conn.data.watch = true;
    conn.save();
    send(conn, chessSnapshot(/** @type {GameState} */ (s), null, now));
    countWatchers();
    // The socket owes no hello any more: its deadline goes.
    await save(now);
  }

  /**
   * What a watcher may say: `hello`, for the game again, `join` to take a
   * correspondence game's open seat, and `analyse` once the game is over.
   * Anything else is refused.
   * @param {RoomConn} conn
   * @param {RoomState} s
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function watcherMessage(conn, s, msg, now) {
    if (msg.t === 'hello') {
      send(conn, chessSnapshot(/** @type {GameState} */ (s), null, now));
      return;
    }
    if (msg.t === 'join') {
      await join(conn, /** @type {GameState} */ (s), msg, now);
      return;
    }
    if (msg.t === 'analyse') {
      await analyse(conn, s, null, now);
      return;
    }
    refuseTo(conn, 'watching', 'Watchers can only watch.', now);
  }

  /**
   * Someone with the link takes a correspondence game's open seat: the first
   * to ask (the room takes one message at a time) gets the seat's token, which
   * nobody else ever sees; the game is on, and White's days start.
   * @param {RoomConn} conn
   * @param {GameState} s
   * @param {Record<string, unknown>} msg
   * @param {number} now
   */
  async function join(conn, s, msg, now) {
    const color = s.open ?? null;
    if (!color || s.status !== 'playing') {
      refuseTo(conn, 'taken', 'This game has both its players.', now, () =>
        chessSnapshot(s, null, now),
      );
      return;
    }
    if (!isPlayerName(msg.name) || !isRating(msg.rating ?? null)) {
      refuseTo(conn, 'bad-request', 'That name or rating is not one.', now);
      return;
    }
    const seat = randomId(32);
    s[color] = {
      name: /** @type {string} */ (msg.name),
      rating: /** @type {number | null} */ (msg.rating ?? null),
      seatHash: await hashToken(seat),
    };
    s.open = null;
    s.openUntil = null;
    const days = /** @type {number} */ (s.tc.perMoveMs);
    s.clock = { white: days, black: days, running: 'white', since: now };
    const host = other(color);
    nudge(s, host, {
      title: `${s[color].name} took your invitation`,
      body:
        host === 'white'
          ? 'The game is on: your move.'
          : `The game is on: ${s[color].name} moves first.`,
    });
    send(conn, { t: 'seat', game: s.id, seat, color });
    tell((viewer) => chessSnapshot(s, viewer, now));
    show(chessSnapshot(s, null, now));
    await save(now);
  }

  /**
   * Whether the room takes a new socket. One address has
   * `ABUSE_LIMITS.roomSocketsPerAddress` here at most: one more is closed (and
   * costs the room nothing more). Of the sockets yet to say hello the room
   * keeps `ABUSE_LIMITS.unsaid`: one more sends the oldest of them away, as if
   * its time to say hello were up, and never the new one, so that sockets held
   * open without a word cannot keep a player out of their own game. Only the
   * sockets that came before it count, so that of many arriving at once the
   * last are the ones refused.
   * @param {RoomConn} conn
   */
  function admit(conn) {
    const listed = platform.connections();
    const at = listed.findIndex((c) => c.data.id === conn.data.id);
    const before = at < 0 ? listed : listed.slice(0, at + 1);
    const address = conn.data.address;
    const fromThere = address ? before.filter((c) => c.data.address === address).length : 0;
    if (fromThere > ABUSE_LIMITS.roomSocketsPerAddress) {
      conn.close(CLOSE.full, 'Too many connections to this game from one address.');
      return false;
    }
    const unsaid = before
      .filter((c) => !c.data.seat && !c.data.watch && c.data.id !== conn.data.id)
      .sort((a, b) => a.data.openedAt - b.data.openedAt);
    const extra = unsaid.length + 1 - ABUSE_LIMITS.unsaid;
    for (const old of unsaid.slice(0, Math.max(0, extra))) {
      old.close(CLOSE.noHello, 'Say which seat first.');
    }
    return true;
  }

  /**
   * Whether a seat has all the sockets it takes (`ABUSE_LIMITS.socketsPerSeat`)
   * without `conn`: then `conn` is closed, as one past a full room is, and its
   * app tries again a while later.
   * @param {RoomConn} conn
   * @param {Color} color
   */
  function seatFull(conn, color) {
    const others = platform
      .connections()
      .filter((c) => c.data.seat === color && c.data.id !== conn.data.id);
    if (others.length < ABUSE_LIMITS.socketsPerSeat) return false;
    conn.close(CLOSE.full, 'This game is open in too many tabs or windows.');
    return true;
  }

  return {
    /**
     * Makes the game (called by the waiting room, or by the room of a game
     * that ends in a rematch). Throws when it exists, or when it could not be
     * written (then it does not exist: it may be made again).
     * @param {RoomSpec} spec
     */
    create(spec) {
      return serial(async () => {
        if (await ensure()) throw new Error('This game exists already.');
        const now = platform.now();
        if (isDuel(spec.game)) {
          const duel = newDuel(spec, now);
          duel.rematches = rematchesOf(spec);
          state = duel;
          chess = null;
        } else {
          const game = newGame(spec, now, platform.chess960Position);
          state = game;
          chess = replay([], game.startFen ?? null, game.game ?? 'chess');
        }
        try {
          await write();
        } catch (err) {
          state = null;
          chess = null;
          throw err;
        }
        // A timer that could not be set is set by the next save.
        await save(now);
      });
    },

    /**
     * A socket has opened: it has `LIMITS.helloMs` to say which seat it is.
     * A socket for a game that is not there (any more) is closed at once, as
     * one past the room's limits is; neither costs the room a write.
     * @param {RoomConn} conn
     */
    open(conn) {
      return serial(async () => {
        const s = await ensure();
        if (!s) {
          conn.close(CLOSE.noGame, 'No such game.');
          return;
        }
        if (!admit(conn)) return;
        await save(platform.now());
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
          refuseTo(conn, 'bad-request', 'That is not a message.', now);
          return;
        }
        const seat = conn.data.seat;
        if (!seat) {
          if (conn.data.watch) {
            await watcherMessage(conn, s, msg, now);
            return;
          }
          if (msg.t === 'hello' && msg.watch === true) {
            await startWatching(conn, s, now);
            return;
          }
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
          if (seatFull(conn, color)) {
            // Its hello deadline goes with it.
            await save(now);
            return;
          }
          conn.data.seat = color;
          conn.save();
          if ('push' in msg) keepSubscription(s, color, msg.push);
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
          show({ t: 'present', ...present(), gone: null });
          // A duel starts once both players are here (and its rounds are in).
          if (duel) duelMaybeStart(duelContext, /** @type {DuelState} */ (s), now);
          // Written if anything changed (back from gone, a duel started, a subscription); the
          // socket's hello deadline goes either way.
          await save(now);
          return;
        }
        if (msg.t === 'hello') {
          send(conn, snapshot(s, seat, now));
          if ('push' in msg && keepSubscription(s, seat, msg.push)) await save(now);
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
        if (conn.data.watch) {
          // A watcher goes: everyone else hears how many are left.
          conn.data.watch = false;
          if (s) countWatchers(conn.data.id);
          return;
        }
        const seat = conn.data.seat;
        conn.data.seat = null;
        if (!s || !seat || s.status === 'over') return;
        const still = platform
          .connections()
          .some((c) => c.data.id !== conn.data.id && c.data.seat === seat);
        if (still) return;
        const now = platform.now();
        // Correspondence players come and go: nothing is claimed against one who left.
        const corr = isCorrespondence(s);
        if (!corr) s.goneSince[seat] = now;
        const seats = present(conn.data.id);
        const duel = isDuel(s.game);
        for (const other of platform.connections()) {
          if (other.data.id === conn.data.id || !other.data.seat) continue;
          const gone = duel ? null : goneView(/** @type {GameState} */ (s), other.data.seat, now);
          send(other, { t: 'present', ...seats, gone });
        }
        show({ t: 'present', ...seats, gone: null }, conn.data.id);
        if (!corr) await save(now);
      });
    },

    /**
     * Something is due: a flag, a first move, a hello, or the room's end.
     * Throws when what it did could not be stored (or the room deleted): the
     * platform then runs the timer again later (Cloudflare retries an alarm
     * that fails, a few times), with the state as it was last stored.
     */
    timer() {
      return serial(async () => {
        // The timer that is running is spent.
        scheduled = null;
        const s = await ensure();
        const now = platform.now();
        for (const conn of platform.connections()) {
          if (!conn.data.seat && !conn.data.watch && now >= conn.data.openedAt + LIMITS.helloMs) {
            conn.close(CLOSE.noHello, 'Say which seat first.');
          }
        }
        // No game (any more): nothing to wait for, and no timer is set.
        if (!s) return;
        const expired =
          now >= s.createdAt + roomAgeOf(s) ||
          (s.status === 'over' && s.endedAt !== null && now >= s.endedAt + keepAfterEndOf(s));
        if (expired) {
          for (const conn of platform.connections())
            conn.close(CLOSE.closed, 'The game is closed.');
          // Forgotten here only once it is gone from storage: should that fail, the timer comes again.
          await platform.remove();
          state = null;
          chess = null;
          written = null;
          return;
        }
        if (isDuel(s.game)) {
          duelTimer(duelContext, /** @type {DuelState} */ (s), now);
        } else {
          const g = /** @type {GameState} */ (s);
          if (g.status === 'draft' && g.draft && now >= g.draft.by) {
            startDrafted(g, now);
          } else if (g.status === 'playing') {
            if (g.open && typeof g.openUntil === 'number' && now >= g.openUntil) {
              // Nobody took the invitation's seat in time.
              end(g, '*', 'expired', now);
            } else if (g.firstMoveBy !== null && now >= g.firstMoveBy) {
              end(g, '*', 'no-start', now);
            } else if (g.clock.running && left(g, g.clock.running, now) <= 0) {
              flag(g, g.clock.running, now);
            }
          }
        }
        if (!(await save(now))) throw new Error('The game could not be stored.');
      });
    },
  };
}
