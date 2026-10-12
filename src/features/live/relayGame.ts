import type { Chess } from 'chess.js';
import {
  correspondencePush,
  onCorrespondencePush,
} from '@/features/notifications/pushSubscription';
import { type Army, parseArmy } from '../../../relay/src/live/army.mjs';
import { playUci, replay, type RulesGame } from '../../../relay/src/live/rules.mjs';
import {
  analysisRoomId,
  CLOSE,
  gameOptions,
  ID_PATTERN,
  isCorrespondence,
  isPhrase,
  LIMITS,
  parseTimeControl,
  PHRASES,
  SEAT_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import { shownRating, useLivePrefs } from './prefs';
import { recordLiveGame } from './record';
import { liveSocketUrl } from './relayUrls';
import { liveGamePath, rememberSeat, seatOf, watchGamePath } from './seats';
import { LiveSocket } from './socket';
import type {
  ChessKind,
  LiveClock,
  LiveDraft,
  LiveEndReason,
  LiveGameSession,
  LiveGameView,
  LivePlayer,
  OfferKind,
  OfferOp,
  Side,
} from './types';

/**
 * A game on the relay (relay/src/live/room.mjs), from this device's seat. The
 * room is the referee and keeps the clocks; this side shows the game as the
 * room tells it, plays its own moves on the board at once (the room's echo
 * then brings the clocks), and catches up from the room's snapshot whenever
 * it has missed something: after a refusal, and after every reconnection.
 * Blindfold and Army Draft are games of chess too: the room counts the peeks,
 * and keeps each army from the other player until both are in. So is Chess960,
 * from the start position the room drew: its moves are checked here by the
 * room's own rules (relay/src/live/chess960.mjs), castling as the king taking
 * its rook.
 *
 * Without a seat the same connection watches: the room sends the game as
 * anyone may see it, and nothing can be played from here — but a watcher of a
 * correspondence invitation may take its open seat (`join`), which this device
 * then keeps.
 *
 * The room sends durations (time left, time until), never its own clock, so
 * each is turned into a moment on this device's `performance.now()` clock as
 * it arrives.
 *
 * A correspondence seat tells its room where to push this device while it is
 * away (`push` in its hello, null while correspondence notifications are off),
 * and tells it again at once when that changes.
 *
 * Once the game is over, a player or a watcher may ask for its analysis room
 * (`analyse`): the room makes it, under an id derived from the game's, and
 * tells everyone in the game where it is. A game whose room has gone (a while
 * after its end) is still found under that id, should its analysis room be there.
 */

const CAPABILITIES: LiveGameView['capabilities'] = Object.freeze({
  phrases: true,
  rematch: true,
  takeback: true,
});

const NO_OFFERS: Record<OfferKind, Side | null> = Object.freeze({
  draw: null,
  takeback: null,
  rematch: null,
});

/** The relay's endings, which are the view's own words. */
const REASONS: readonly LiveEndReason[] = [
  'checkmate',
  'resign',
  'time',
  'stalemate',
  'insufficient',
  'repetition',
  'fifty-moves',
  'agreement',
  'abandoned',
  'aborted',
  'no-start',
  'expired',
];

const OPS: readonly OfferOp[] = ['offer', 'accept', 'decline'];

const other = (side: Side): Side => (side === 'white' ? 'black' : 'white');
const isSide = (value: unknown): value is Side => value === 'white' || value === 'black';
/** Whose move it is after `plies` moves. */
const turnOf = (plies: number): Side => (plies % 2 === 0 ? 'white' : 'black');
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function playerOf(value: unknown): LivePlayer {
  const player = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    name: typeof player.name === 'string' ? player.name : '',
    rating: finite(player.rating),
  };
}

/** The clocks a message carries, as they stand at `at` (this device's clock). */
function clockOf(value: unknown, at: number): LiveClock | null {
  if (typeof value !== 'object' || value === null) return null;
  const clock = value as Record<string, unknown>;
  const white = finite(clock.white);
  const black = finite(clock.black);
  if (white === null || black === null) return null;
  return {
    white: Math.max(0, white),
    black: Math.max(0, black),
    running: isSide(clock.running) ? clock.running : null,
    at,
  };
}

/** The clock readings a snapshot carries: the mover's time after each move, one a move at most. */
function readingsOf(value: unknown, plies: number): number[] {
  if (!Array.isArray(value)) return [];
  const readings: number[] = [];
  for (const item of value.slice(0, plies)) {
    const ms = finite(item);
    if (ms === null) return [];
    readings.push(Math.max(0, ms));
  }
  return readings;
}

/** `readings` with move `ply`'s in its place (after the last, or instead of a guess); as they were when that cannot be. */
function withReading(readings: number[], ply: number, ms: number | null): number[] {
  if (ms === null || ply > readings.length) return readings;
  return [...readings.slice(0, ply), ms];
}

/** The clocks stopped at `at`: the running side's time as it stands then. */
function stopped(clock: LiveClock | null, at: number): LiveClock | null {
  if (!clock) return null;
  const left = (side: Side) =>
    clock.running === side ? Math.max(0, clock[side] - (at - clock.at)) : clock[side];
  return { white: left('white'), black: left('black'), running: null, at };
}

/**
 * The clocks just after `mover` played move number `ply` on this board, until
 * the room's echo brings its own: the first two moves start them (White's
 * from Black's first move), every later one stops the mover's at the time it
 * shows and starts the other's.
 */
function clockAfterMove(
  clock: LiveClock | null,
  ply: number,
  mover: Side,
  at: number,
): LiveClock | null {
  if (!clock || ply === 0) return clock;
  if (ply === 1) return { white: clock.white, black: clock.black, running: 'white', at };
  const spent = clock.running === mover ? at - clock.at : 0;
  const left = Math.max(0, clock[mover] - spent);
  return mover === 'white'
    ? { white: left, black: clock.black, running: 'black', at }
    : { white: clock.white, black: left, running: 'white', at };
}

function firstMoveOf(value: unknown, at: number): LiveGameView['firstMove'] {
  if (typeof value !== 'object' || value === null) return null;
  const first = value as Record<string, unknown>;
  const inMs = finite(first.inMs);
  if (!isSide(first.color) || inMs === null) return null;
  return { color: first.color, deadline: at + Math.max(0, inMs) };
}

function offersOf(value: unknown): Record<OfferKind, Side | null> {
  const offers = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    draw: isSide(offers.draw) ? offers.draw : null,
    takeback: isSide(offers.takeback) ? offers.takeback : null,
    rematch: isSide(offers.rematch) ? offers.rematch : null,
  };
}

function resultOf(value: unknown): LiveGameView['result'] {
  return value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*' ? value : null;
}

function reasonOf(value: unknown): LiveEndReason | null {
  if (typeof value !== 'string') return null;
  return (REASONS as readonly string[]).includes(value) ? (value as LiveEndReason) : 'other';
}

function chatOf(value: unknown): LiveGameView['chat'] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((line: unknown) => {
      if (typeof line !== 'object' || line === null) return [];
      const { by, phrase } = line as Record<string, unknown>;
      return isSide(by) && isPhrase(phrase) ? [{ by, text: PHRASES[phrase] }] : [];
    })
    .slice(-LIMITS.phrasesKept);
}

function movesOf(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((move) => typeof move === 'string') ? value : null;
}

const CHESS_KINDS: readonly ChessKind[] = ['chess', 'blindfold', 'army', 'chess960'];

function chessKindOf(value: unknown): ChessKind {
  return CHESS_KINDS.find((kind) => kind === value) ?? 'chess';
}

/** A FEN to start from, when the room gives one that the game's rules take. */
function startFenOf(value: unknown, game: ChessKind): string | null {
  return typeof value === 'string' && replay([], value, game) !== null ? value : null;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

function peeksOf(value: unknown): LiveGameView['peeks'] {
  if (typeof value !== 'object' || value === null) return null;
  const peeks = value as Record<string, unknown>;
  return { white: count(peeks.white), black: count(peeks.black) };
}

function readyOf(value: unknown): LiveDraft['ready'] {
  const ready = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return { white: ready.white === true, black: ready.black === true };
}

/** Army Draft's draft as the room tells it (the time left made a moment on this device's clock). */
function draftOf(value: unknown, at: number): LiveDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const draft = value as Record<string, unknown>;
  const budget = finite(draft.budget);
  if (budget === null) return null;
  const inMs = finite(draft.inMs);
  const armies = (
    typeof draft.armies === 'object' && draft.armies !== null ? draft.armies : {}
  ) as Record<string, unknown>;
  return {
    budget,
    deadline: inMs !== null ? at + Math.max(0, inMs) : null,
    ready: readyOf(draft.ready),
    armies: { white: parseArmy(armies.white), black: parseArmy(armies.black) },
  };
}

/**
 * The game a rematch leads to (the same game as this one): its seat is kept at
 * once, and its page is where to go. A watcher follows the players there, to
 * watch again.
 */
function nextOf(
  value: unknown,
  kind: ChessKind,
  watching: boolean,
  correspondence: boolean,
): LiveGameView['next'] {
  if (typeof value !== 'object' || value === null) return null;
  const { game, seat, color } = value as Record<string, unknown>;
  if (typeof game !== 'string' || !ID_PATTERN.test(game)) return null;
  if (watching) return { path: watchGamePath(game) };
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat) || !isSide(color)) return null;
  rememberSeat(game, seat, color, kind, Date.now(), correspondence);
  return { path: liveGamePath('relay', game, kind) };
}

const sideOrNull = (value: unknown): Side | null => (isSide(value) ? value : null);

function presentOf(value: unknown): LiveGameView['present'] {
  const present = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return { white: present.white === true, black: present.black === true };
}

function blankView(id: string, you: Side, watching: boolean): LiveGameView {
  return {
    source: 'relay',
    id,
    game: 'chess',
    opts: {},
    startFen: null,
    draft: null,
    peeks: null,
    connection: 'connecting',
    missing: false,
    watching,
    you,
    white: { name: '', rating: null },
    black: { name: '', rating: null },
    tc: '',
    rated: false,
    moves: [],
    clocks: [],
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: NO_OFFERS,
    opponentPresent: false,
    present: { white: false, black: false },
    watchers: 0,
    open: null,
    joined: null,
    claimAt: null,
    chat: [],
    next: null,
    analysis: null,
    error: null,
    url: null,
    capabilities: CAPABILITIES,
  };
}

const DOWN_MESSAGE = 'The connection is down: try again in a moment.';
/** How long the room may take to make the game's analysis room before this side gives up. */
const ANALYSIS_TIMEOUT_MS = 15_000;

/**
 * The connection to a game on the relay, with this device's seat token
 * (`color`, the side the seat plays, is known from the pairing; the room's
 * first snapshot says it again), or without one (`seat` null) to watch it.
 */
export function createRelayGame(
  id: string,
  seat: string | null,
  color: Side = 'white',
): LiveGameSession {
  const watching = seat === null;
  let view = blankView(id, watching ? 'white' : color, watching);
  /** A correspondence seat: its room may push this device while it is away. */
  const pushed = () => !watching && (isCorrespondence(view.tc) || seatOf(id)?.corr === true);
  const hello = () =>
    seat === null
      ? { t: 'hello', watch: true }
      : pushed()
        ? { t: 'hello', seat, push: correspondencePush() }
        : { t: 'hello', seat };
  const listeners = new Set<() => void>();
  /** The position after `view.moves`, to check this board's own moves. */
  let chess: RulesGame = replay([]) as Chess;
  /** A snapshot has come since the first connection: the view is the room's. */
  let loaded = false;
  /** The room said there is no such game (any more): nothing to reconnect to. */
  let gone = false;
  let closed = false;
  let recorded = false;
  /** This board's last move until the room has it (sent again after a reconnection if lost). */
  let unsent: { uci: string; ply: number } | null = null;
  /** When the opponent will have been gone long enough to claim against (the room's word), or null. */
  let awayUntil: number | null = null;
  /** Watching an invitation: its open seat has been asked for. */
  let joinSent = false;
  /** The analysis room asked for, until the room answers. */
  let analysing: {
    promise: Promise<string>;
    settle: (room: string | null, error?: string) => void;
  } | null = null;

  /** The clock readings with move `ply`'s, from the clocks just after it (correspondence keeps none). */
  const readingAt = (ply: number, clock: LiveClock | null): number[] =>
    parseTimeControl(view.tc)?.perMoveMs
      ? view.clocks
      : withReading(view.clocks, ply, clock ? clock[turnOf(ply)] : null);

  const socket = new LiveSocket(() => liveSocketUrl(`/v1/games/${id}`), {
    open: () => {
      socket.send(hello());
    },
    message: onMessage,
    down: onDown,
  });

  function emit(patch: Partial<LiveGameView>): void {
    const next = { ...view, ...patch };
    // The room takes a claim only while the game is on and once both sides have moved.
    next.claimAt = next.status === 'playing' && next.moves.length >= 2 ? awayUntil : null;
    const changed = (Object.keys(next) as (keyof LiveGameView)[]).some(
      (key) => next[key] !== view[key],
    );
    if (!changed) return;
    view = next;
    for (const listener of [...listeners]) listener();
  }

  function record(): void {
    // A game watched is somebody else's: it is not kept in My games.
    if (recorded || watching || view.status !== 'over') return;
    recorded = true;
    recordLiveGame(view);
  }

  /** Stay connected while the game is on (or its armies are being chosen), or while someone is looking at it. */
  const wanted = () => !closed && !gone && (view.status !== 'over' || listeners.size > 0);

  function start(): void {
    if (!wanted() || socket.state !== 'idle') return;
    if (!socket.connect()) {
      // This build has no relay: there is no game to reach.
      gone = true;
      emit({ missing: true, connection: 'closed' });
      return;
    }
    emit({ connection: loaded ? 'reconnecting' : 'connecting' });
  }

  function onDown({ code }: { code: number; opened: boolean }): void {
    if (closed) return;
    analysing?.settle(null, DOWN_MESSAGE);
    if (code === CLOSE.noGame) {
      gone = true;
      unsent = null;
      emit({ missing: true, connection: 'closed' });
      return;
    }
    if (code === CLOSE.closed) {
      // Deleted a while after its end: a finished game stays on the board as it ended.
      gone = true;
      unsent = null;
      emit(
        view.status === 'over' ? { connection: 'closed' } : { missing: true, connection: 'closed' },
      );
      return;
    }
    if (!wanted()) {
      emit({ connection: 'closed' });
      return;
    }
    socket.retry();
    emit({ connection: loaded ? 'reconnecting' : 'connecting' });
  }

  /** Asks the room for the whole game again (it answers a second hello with a snapshot). */
  function catchUp(): void {
    socket.send(hello());
  }

  function onMessage(message: Record<string, unknown>): void {
    switch (message.t) {
      case 'game':
        return onSnapshot(message);
      case 'move':
        return onMove(message);
      case 'undo':
        return onUndo(message);
      case 'offers':
        return emit({ offers: offersOf(message), error: null });
      case 'end':
        return onEnd(message);
      case 'present':
        return onPresent(message);
      case 'say':
        return onSay(message);
      case 'rematch': {
        const next = nextOf(message, view.game, watching, isCorrespondence(view.tc));
        if (next) emit({ next, offers: { ...view.offers, rematch: null }, error: null });
        return;
      }
      case 'watchers':
        return emit({ watchers: count(message.n) });
      case 'analysis': {
        const room = message.room;
        if (typeof room !== 'string' || !ID_PATTERN.test(room)) return;
        emit({ analysis: { room, by: sideOrNull(message.by) } });
        analysing?.settle(room);
        return;
      }
      case 'seat':
        return onSeat(message);
      case 'draft':
        // An army is in (the other's stays hidden until both are, when a snapshot comes).
        if (view.draft) emit({ draft: { ...view.draft, ready: readyOf(message.ready) } });
        return;
      case 'peeks':
        return emit({ peeks: peeksOf(message) });
      case 'error':
        // The snapshot that follows puts the board right; a move refused is not sent again.
        unsent = null;
        joinSent = false;
        if (analysing) {
          analysing.settle(null, typeof message.message === 'string' ? message.message : undefined);
          return;
        }
        return emit({
          error: typeof message.message === 'string' ? message.message : 'That was refused.',
        });
      default:
        return;
    }
  }

  function onSnapshot(message: Record<string, unknown>): void {
    const moves = movesOf(message.moves);
    const game = chessKindOf(message.game);
    const startFen = startFenOf(message.startFen, game);
    // A Chess960 game always has its start position: without one, nothing is shown.
    const position = moves ? replay(moves, startFen, game) : null;
    // A watcher's snapshot names no seat: the board is seen from White's side.
    const you = watching ? 'white' : isSide(message.you) ? message.you : null;
    if (!moves || !position || !you) return;
    const now = performance.now();
    const opponent = other(you);
    const status =
      message.status === 'over' ? 'over' : message.status === 'draft' ? 'draft' : 'playing';
    const present = presentOf(message.present);
    const away = (
      typeof message.gone === 'object' && message.gone !== null ? message.gone : {}
    ) as Record<string, unknown>;
    const claimIn = status === 'playing' && away.color === opponent ? finite(away.claimInMs) : null;
    awayUntil = claimIn !== null ? now + Math.max(0, claimIn) : null;
    chess = position;
    loaded = true;
    socket.settled();
    // The error a refusal brought stays: this snapshot is what it put right.
    emit({
      connection: 'open',
      missing: false,
      you,
      game,
      opts: gameOptions(game, message.opts) ?? {},
      startFen,
      draft: draftOf(message.draft, now),
      peeks: peeksOf(message.peeks),
      white: playerOf(message.white),
      black: playerOf(message.black),
      tc: typeof message.tc === 'string' ? message.tc : view.tc,
      moves,
      clocks: readingsOf(message.clocks, moves.length),
      clock: clockOf(message.clock, now),
      firstMove: status === 'playing' ? firstMoveOf(message.firstMove, now) : null,
      status,
      result: resultOf(message.result),
      reason: reasonOf(message.reason),
      offers: offersOf(message.offers),
      opponentPresent: present[opponent],
      present,
      watchers: count(message.watchers),
      open: sideOrNull(message.open),
      chat: chatOf(message.chat),
      next: nextOf(message.next, game, watching, isCorrespondence(message.tc)),
    });
    sendAgain();
    record();
  }

  /**
   * The open seat this watcher asked for is this device's: its token is kept
   * (as a correspondence game's, until the game ends), and the page goes on to
   * the player's board.
   */
  function onSeat(message: Record<string, unknown>): void {
    const { seat: token, color } = message;
    if (!watching || typeof token !== 'string' || !SEAT_PATTERN.test(token) || !isSide(color)) {
      return;
    }
    joinSent = false;
    rememberSeat(id, token, color, view.game, Date.now(), true);
    emit({ joined: color, error: null });
  }

  /** A move this board played that the room never had: played again if it still fits. */
  function sendAgain(): void {
    const pending = unsent;
    if (!pending) return;
    unsent = null;
    if (view.moves[pending.ply] === pending.uci) return;
    if (view.status !== 'playing' || view.moves.length !== pending.ply) return;
    if (turnOf(pending.ply) !== view.you) return;
    move(pending.uci);
  }

  function onMove(message: Record<string, unknown>): void {
    const { uci, ply } = message;
    if (typeof uci !== 'string' || typeof ply !== 'number') return;
    const now = performance.now();
    const clock = clockOf(message.clock, now) ?? view.clock;
    const firstMove = firstMoveOf(message.firstMove, now);
    if (ply === view.moves.length - 1 && view.moves[ply] === uci) {
      // The echo of this board's own move: the room's clocks replace the guess.
      if (unsent?.ply === ply) unsent = null;
      emit({ clock, firstMove, clocks: readingAt(ply, clockOf(message.clock, now)) });
      return;
    }
    if (ply !== view.moves.length || !playUci(chess, uci)) {
      catchUp();
      return;
    }
    emit({
      moves: [...view.moves, uci],
      clocks: readingAt(ply, clockOf(message.clock, now)),
      clock,
      firstMove,
      // A move ends the standing draw and takeback offers (the room does the same).
      offers: { ...view.offers, draw: null, takeback: null },
      error: null,
    });
  }

  function onUndo(message: Record<string, unknown>): void {
    const plies = message.plies;
    if (typeof plies !== 'number' || !Number.isInteger(plies) || plies < 1) return catchUp();
    if (plies > view.moves.length) return catchUp();
    const moves = view.moves.slice(0, view.moves.length - plies);
    const position = replay(moves, view.startFen, view.game);
    if (!position) return catchUp();
    chess = position;
    if (unsent && unsent.ply >= moves.length) unsent = null;
    emit({
      moves,
      clocks: view.clocks.slice(0, moves.length),
      clock: clockOf(message.clock, performance.now()) ?? view.clock,
      offers: { ...view.offers, draw: null, takeback: null },
      error: null,
    });
  }

  function onEnd(message: Record<string, unknown>): void {
    const now = performance.now();
    const clock = clockOf(message.clock, now);
    unsent = null;
    awayUntil = null;
    emit({
      status: 'over',
      result: resultOf(message.result),
      reason: reasonOf(message.reason),
      clock: clock ? { ...clock, running: null } : stopped(view.clock, now),
      firstMove: null,
      offers: NO_OFFERS,
      error: null,
    });
    record();
  }

  function onPresent(message: Record<string, unknown>): void {
    const opponent = other(view.you);
    const away = (
      typeof message.gone === 'object' && message.gone !== null ? message.gone : {}
    ) as Record<string, unknown>;
    const claimIn =
      view.status === 'playing' && away.color === opponent ? finite(away.claimInMs) : null;
    awayUntil = claimIn !== null ? performance.now() + Math.max(0, claimIn) : null;
    const present = presentOf(message);
    emit({ opponentPresent: present[opponent], present });
  }

  function onSay(message: Record<string, unknown>): void {
    const { by, phrase } = message;
    if (!isSide(by) || !isPhrase(phrase)) return;
    emit({ chat: [...view.chat, { by, text: PHRASES[phrase] }].slice(-LIMITS.phrasesKept) });
  }

  function move(uci: string): void {
    if (watching || closed || gone || view.missing || view.status === 'over') return;
    if (!loaded) {
      emit({ error: 'The game is still loading.' });
      return;
    }
    if (view.status === 'draft') {
      emit({ error: 'The armies are still being chosen.' });
      return;
    }
    if (view.open) {
      emit({ error: 'Your opponent has not joined yet.' });
      return;
    }
    const ply = view.moves.length;
    if (turnOf(ply) !== view.you) {
      emit({ error: 'It is not your move.' });
      return;
    }
    const normal = uci.trim().toLowerCase();
    if (!playUci(chess, normal)) {
      emit({ error: 'That move is not legal.' });
      return;
    }
    const now = performance.now();
    // Correspondence: the mover's days are whole again, the other's run; no first-move rule.
    const perMoveMs = parseTimeControl(view.tc)?.perMoveMs ?? null;
    const clock = perMoveMs
      ? { white: perMoveMs, black: perMoveMs, running: other(view.you), at: now }
      : clockAfterMove(view.clock, ply, view.you, now);
    emit({
      moves: [...view.moves, normal],
      // A guess until the room's echo brings the reading (its increment in).
      clocks: readingAt(ply, clock),
      clock,
      firstMove:
        ply === 0 && !perMoveMs ? { color: 'black', deadline: now + LIMITS.firstMoveMs } : null,
      offers: { ...view.offers, draw: null, takeback: null },
      error: null,
    });
    unsent = { uci: normal, ply };
    // Not connected: it goes once the room's next snapshot shows it still fits.
    socket.send({ t: 'move', uci: normal, ply });
  }

  /** Sends anything else; it needs the connection (only a move waits for one). */
  function act(message: Record<string, unknown>): void {
    if (watching || closed || gone || view.missing) return;
    if (!socket.send(message)) {
      emit({ error: DOWN_MESSAGE });
      return;
    }
    emit({ error: null });
  }

  const offer =
    (t: OfferKind) =>
    (op: OfferOp): void => {
      if (OPS.includes(op)) act({ t, op });
    };

  // Correspondence notifications switched on or off on this device: the room hears at once.
  const stopPush = watching
    ? () => undefined
    : onCorrespondencePush((push) => {
        if (loaded && pushed() && view.status !== 'over') socket.send({ t: 'push', sub: push });
      });

  start();

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
    move,
    resign: () => act({ t: 'resign' }),
    abort: () => act({ t: 'abort' }),
    draw: offer('draw'),
    takeback: offer('takeback'),
    rematch: offer('rematch'),
    claim: (op) => {
      if (op === 'win' || op === 'draw') act({ t: 'claim', op });
    },
    say: (phrase) => {
      if (isPhrase(phrase)) act({ t: 'say', phrase });
    },
    army: (army: Army) => {
      if (view.status === 'draft') act({ t: 'army', army });
    },
    peek: () => {
      if (view.peeks && view.status === 'playing') act({ t: 'peek' });
    },
    join: () => {
      if (!watching || closed || gone || !view.open || joinSent) return;
      if (!socket.send({ t: 'join', name: useLivePrefs.getState().name, rating: shownRating() })) {
        emit({ error: DOWN_MESSAGE });
        return;
      }
      joinSent = true;
      emit({ error: null });
    },
    analyse() {
      if (analysing) return analysing.promise;
      if (view.status !== 'over') return Promise.reject(new Error('The game is still on.'));
      // The game's room has gone: its analysis room, if it is still there, has the same id.
      if (gone) return analysisRoomId(id);
      if (closed || !socket.send({ t: 'analyse' })) return Promise.reject(new Error(DOWN_MESSAGE));
      let settle: (room: string | null, error?: string) => void = () => undefined;
      const promise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => settle(null, 'The relay did not answer: try again in a moment.'),
          ANALYSIS_TIMEOUT_MS,
        );
        settle = (room, error) => {
          clearTimeout(timer);
          analysing = null;
          if (room) resolve(room);
          else reject(new Error(error ?? 'The analysis room could not be made.'));
        };
      });
      analysing = { promise, settle: (room, error) => settle(room, error) };
      return promise;
    },
    close() {
      if (closed) return;
      closed = true;
      analysing?.settle(null, DOWN_MESSAGE);
      unsent = null;
      stopPush();
      socket.dispose();
      emit({ connection: 'closed' });
    },
  };
}
