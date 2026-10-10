import type { Chess } from 'chess.js';
import { playUci, replay } from '../../../relay/src/live/rules.mjs';
import {
  CLOSE,
  ID_PATTERN,
  isPhrase,
  LIMITS,
  PHRASES,
  SEAT_PATTERN,
} from '../../../relay/src/live/shared.mjs';
import { recordLiveGame } from './record';
import { liveSocketUrl } from './relayUrls';
import { liveGamePath, rememberSeat } from './seats';
import { LiveSocket } from './socket';
import type {
  LiveClock,
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
 *
 * The room sends durations (time left, time until), never its own clock, so
 * each is turned into a moment on this device's `performance.now()` clock as
 * it arrives.
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

/** The game a rematch leads to: its seat is kept at once, and its page is where to go. */
function nextOf(value: unknown): LiveGameView['next'] {
  if (typeof value !== 'object' || value === null) return null;
  const { game, seat, color } = value as Record<string, unknown>;
  if (typeof game !== 'string' || !ID_PATTERN.test(game)) return null;
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat) || !isSide(color)) return null;
  rememberSeat(game, seat, color);
  return { path: liveGamePath('relay', game) };
}

function blankView(id: string, you: Side): LiveGameView {
  return {
    source: 'relay',
    id,
    connection: 'connecting',
    missing: false,
    you,
    white: { name: '', rating: null },
    black: { name: '', rating: null },
    tc: '',
    rated: false,
    moves: [],
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: NO_OFFERS,
    opponentPresent: false,
    claimAt: null,
    chat: [],
    next: null,
    error: null,
    url: null,
    capabilities: CAPABILITIES,
  };
}

const DOWN_MESSAGE = 'The connection is down: try again in a moment.';

/**
 * The connection to a game on the relay, with this device's seat token
 * (`color`, the side the seat plays, is known from the pairing; the room's
 * first snapshot says it again).
 */
export function createRelayGame(id: string, seat: string, color: Side = 'white'): LiveGameSession {
  let view = blankView(id, color);
  const listeners = new Set<() => void>();
  /** The position after `view.moves`, to check this board's own moves. */
  let chess = replay([]) as Chess;
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

  const socket = new LiveSocket(() => liveSocketUrl(`/v1/games/${id}`), {
    open: () => {
      socket.send({ t: 'hello', seat });
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
    if (recorded || view.status !== 'over') return;
    recorded = true;
    recordLiveGame(view);
  }

  /** Stay connected while the game is on, or while someone is looking at it. */
  const wanted = () => !closed && !gone && (view.status === 'playing' || listeners.size > 0);

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
    socket.send({ t: 'hello', seat });
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
        const next = nextOf(message);
        if (next) emit({ next, offers: { ...view.offers, rematch: null }, error: null });
        return;
      }
      case 'error':
        // The snapshot that follows puts the board right; a move refused is not sent again.
        unsent = null;
        return emit({
          error: typeof message.message === 'string' ? message.message : 'That was refused.',
        });
      default:
        return;
    }
  }

  function onSnapshot(message: Record<string, unknown>): void {
    const moves = movesOf(message.moves);
    const position = moves ? replay(moves) : null;
    if (!moves || !position || !isSide(message.you)) return;
    const now = performance.now();
    const you = message.you;
    const opponent = other(you);
    const status = message.status === 'over' ? 'over' : 'playing';
    const present = (
      typeof message.present === 'object' && message.present !== null ? message.present : {}
    ) as Record<string, unknown>;
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
      white: playerOf(message.white),
      black: playerOf(message.black),
      tc: typeof message.tc === 'string' ? message.tc : view.tc,
      moves,
      clock: clockOf(message.clock, now),
      firstMove: status === 'playing' ? firstMoveOf(message.firstMove, now) : null,
      status,
      result: resultOf(message.result),
      reason: reasonOf(message.reason),
      offers: offersOf(message.offers),
      opponentPresent: present[opponent] === true,
      chat: chatOf(message.chat),
      next: nextOf(message.next),
    });
    sendAgain();
    record();
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
      emit({ clock, firstMove });
      return;
    }
    if (ply !== view.moves.length || !playUci(chess, uci)) {
      catchUp();
      return;
    }
    emit({
      moves: [...view.moves, uci],
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
    const position = replay(moves);
    if (!position) return catchUp();
    chess = position;
    if (unsent && unsent.ply >= moves.length) unsent = null;
    emit({
      moves,
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
    emit({ opponentPresent: message[opponent] === true });
  }

  function onSay(message: Record<string, unknown>): void {
    const { by, phrase } = message;
    if (!isSide(by) || !isPhrase(phrase)) return;
    emit({ chat: [...view.chat, { by, text: PHRASES[phrase] }].slice(-LIMITS.phrasesKept) });
  }

  function move(uci: string): void {
    if (closed || gone || view.missing || view.status !== 'playing') return;
    if (!loaded) {
      emit({ error: 'The game is still loading.' });
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
    emit({
      moves: [...view.moves, normal],
      clock: clockAfterMove(view.clock, ply, view.you, now),
      firstMove: ply === 0 ? { color: 'black', deadline: now + LIMITS.firstMoveMs } : null,
      offers: { ...view.offers, draw: null, takeback: null },
      error: null,
    });
    unsent = { uci: normal, ply };
    // Not connected: it goes once the room's next snapshot shows it still fits.
    socket.send({ t: 'move', uci: normal, ply });
  }

  /** Sends anything else; it needs the connection (only a move waits for one). */
  function act(message: Record<string, unknown>): void {
    if (closed || gone || view.missing) return;
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
    close() {
      if (closed) return;
      closed = true;
      unsent = null;
      socket.dispose();
      emit({ connection: 'closed' });
    },
  };
}
