import { Chess, type Square } from 'chess.js';
import { LICHESS_ORIGIN, LichessError } from '@/lib/lichess/api';
import { useLichess } from '@/store/lichess';
import { recordLiveGame } from './record';
import {
  backoff,
  lichessTiming,
  noteSignInRefused,
  pause,
  postToLichess,
  readLichessStream,
} from './lichessStream';
import type {
  LiveClock,
  LiveEndReason,
  LiveGameSession,
  LiveGameView,
  LivePlayer,
  OfferOp,
  Side,
} from './types';

/**
 * One Lichess game of the signed-in account, played through the Board API.
 * The game's stream (`gameFull` first, then `gameState` after each change,
 * and `opponentGone`) becomes the view the game page shows, and the page's
 * actions go to Lichess as Board API requests. A move shows at once, before
 * Lichess has it; if Lichess refuses it, the board goes back to Lichess's
 * last state. The stream is opened again whenever it ends or drops while the
 * game is on: Lichess starts each one with `gameFull`, which replaces what
 * was known, so nothing is counted twice.
 */

const SIDES = ['white', 'black'] as const;
const opposite = (side: Side): Side => (side === 'white' ? 'black' : 'white');
/** The side to move after `plies` moves: Lichess's games from seeks start from the usual position. */
const turnAt = (plies: number): Side => (plies % 2 === 0 ? 'white' : 'black');

const UNKNOWN: LivePlayer = { name: '', rating: null, title: null };
const NO_OFFERS: LiveGameView['offers'] = { draw: null, takeback: null, rematch: null };
const CAPABILITIES: LiveGameView['capabilities'] = {
  phrases: false,
  rematch: false,
  takeback: true,
};
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type OfferKindHere = 'draw' | 'takeback';

/** A state of the game as Lichess sent it. */
interface LichessState {
  /** Never changed once read: a new state brings a new list. */
  moves: string[];
  times: Record<Side, number>;
  /** Lichess's status name (`GameStatusName`). */
  status: string;
  winner: Side | null;
  draw: Record<Side, boolean>;
  takeback: Record<Side, boolean>;
  /** Until both sides have moved: how long the side to move has waited, and may wait. */
  expiration: { idleMillis: number; millisToMove: number } | null;
  /** performance.now() when it arrived. */
  at: number;
}

interface GameInfo {
  you: Side;
  white: LivePlayer;
  black: LivePlayer;
  tc: string;
  rated: boolean;
  incrementMs: number;
}

/** A move shown before Lichess has confirmed it. */
interface PendingMove {
  uci: string;
  /** The moves before it. */
  ply: number;
  clock: LiveClock | null;
  at: number;
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Castling written as the king taking its own rook, which Lichess may use. */
const KING_TAKES_ROOK: Partial<Record<string, Square>> = {
  e1h1: 'g1',
  e1a1: 'c1',
  e8h8: 'g8',
  e8a8: 'c8',
};

/** Plays a UCI move on `chess`: the move as the app writes it, or null when it is not legal. */
function playUci(chess: Chess, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = uci.slice(0, 2) as Square;
  let to = uci.slice(2, 4) as Square;
  const promotion = uci.slice(4) || undefined;
  const piece = chess.get(from);
  const target = chess.get(to);
  const castle = KING_TAKES_ROOK[uci.slice(0, 4)];
  if (castle && piece?.type === 'k' && target?.type === 'r' && target.color === piece.color) {
    to = castle;
  }
  try {
    const move = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return `${move.from}${move.to}${move.promotion ?? ''}`;
  } catch {
    return null;
  }
}

/** The moves played from the start: the position and the moves as the app writes them. */
function replay(moves: readonly string[]): { chess: Chess; moves: string[] } | null {
  const chess = new Chess();
  const written: string[] = [];
  for (const uci of moves) {
    const played = playUci(chess, uci);
    if (!played) return null;
    written.push(played);
  }
  return { chess, moves: written };
}

function readState(value: unknown, at: number): LichessState | null {
  if (typeof value !== 'object' || value === null) return null;
  const state = value as Record<string, unknown>;
  if (typeof state.moves !== 'string' || typeof state.status !== 'string') return null;
  const expiration = state.expiration as { idleMillis?: unknown; millisToMove?: unknown } | null;
  return {
    moves: state.moves.split(' ').filter(Boolean),
    times: { white: num(state.wtime), black: num(state.btime) },
    status: state.status,
    winner: state.winner === 'white' || state.winner === 'black' ? state.winner : null,
    draw: { white: state.wdraw === true, black: state.bdraw === true },
    takeback: { white: state.wtakeback === true, black: state.btakeback === true },
    expiration:
      expiration && typeof expiration.millisToMove === 'number'
        ? { idleMillis: num(expiration.idleMillis), millisToMove: expiration.millisToMove }
        : null,
    at,
  };
}

function readPlayer(value: unknown): { id: string | null; player: LivePlayer } {
  const player = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const ai = typeof player.aiLevel === 'number' ? player.aiLevel : null;
  const name =
    typeof player.name === 'string' && player.name
      ? player.name
      : ai !== null
        ? `Stockfish level ${ai}`
        : 'Anonymous';
  return {
    id: typeof player.id === 'string' ? player.id : null,
    player: {
      name,
      rating: typeof player.rating === 'number' ? Math.round(player.rating) : null,
      title: typeof player.title === 'string' ? player.title : null,
    },
  };
}

const isPlaying = (state: LichessState) => state.status === 'created' || state.status === 'started';

function resultOf(winner: Side | null, drawn: boolean): LiveGameView['result'] {
  if (winner === 'white') return '1-0';
  if (winner === 'black') return '0-1';
  return drawn ? '1/2-1/2' : '*';
}

/**
 * Lichess calls every drawn finish "draw"; its own pages tell them apart from
 * the final position and the offers, in this order (lila's `drawReason`).
 */
function drawReason(chess: Chess | null, agreed: boolean): LiveEndReason {
  if (chess?.isInsufficientMaterial()) return 'insufficient';
  if (chess?.isDrawByFiftyMoves()) return 'fifty-moves';
  if (chess?.isThreefoldRepetition()) return 'repetition';
  return agreed ? 'agreement' : 'draw';
}

/** How the game stands, from Lichess's status. */
function endOf(
  state: LichessState,
  chess: Chess | null,
  agreed: boolean,
): Pick<LiveGameView, 'status' | 'result' | 'reason'> {
  const over = (result: LiveGameView['result'], reason: LiveEndReason) => ({
    status: 'over' as const,
    result,
    reason,
  });
  const { winner } = state;
  switch (state.status) {
    case 'created':
    case 'started':
      return { status: 'playing', result: null, reason: null };
    case 'aborted':
      return over('*', 'aborted');
    case 'noStart':
      return over(resultOf(winner, false), 'no-start');
    case 'mate':
      return over(resultOf(winner, false), 'checkmate');
    case 'resign':
      return over(resultOf(winner, false), 'resign');
    case 'stalemate':
      return over('1/2-1/2', 'stalemate');
    // The opponent left and the game was claimed: a win, or a draw (no winner).
    case 'timeout':
      return over(resultOf(winner, true), 'abandoned');
    // Out of time: a draw when the side with time left could not mate.
    case 'outoftime':
      return over(resultOf(winner, true), 'time');
    case 'draw':
      return over('1/2-1/2', drawReason(chess, agreed));
    // A resignation or a draw offer when the other side could not mate.
    case 'insufficientMaterialClaim':
      return over('1/2-1/2', 'insufficient');
    // A cheat detected, an unknown finish, anything new.
    default:
      return over(resultOf(winner, false), 'other');
  }
}

/** The clocks just after `mover` plays the move that leaves `pliesAfter` moves on the board. */
function clockAfterMove(
  clock: LiveClock | null,
  mover: Side,
  pliesAfter: number,
  now: number,
  incrementMs: number,
): LiveClock | null {
  if (!clock) return null;
  const times = { white: clock.white, black: clock.black };
  if (clock.running) {
    const spent = Math.max(0, now - clock.at);
    times[clock.running] = Math.max(0, times[clock.running] - spent);
    // Lichess adds the increment only once the clocks run.
    if (clock.running === mover) times[mover] += incrementMs;
  }
  // The clocks start with Black's first move.
  return { ...times, running: pliesAfter >= 2 ? opposite(mover) : null, at: now };
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** What to tell the player about a refused or lost request. */
function messageOf(err: unknown): string {
  if (!(err instanceof LichessError)) return 'Lichess could not be reached.';
  if (err.kind === 'invalid' || err.kind === 'not-found') {
    return sentence(`Lichess refused: ${err.message}`);
  }
  return sentence(err.message);
}

/** The connection to a Lichess game of the signed-in account. */
export function createLichessGame(gameId: string): LiveGameSession {
  const url = `${LICHESS_ORIGIN}/${gameId}`;
  const listeners = new Set<() => void>();
  /** Ends the stream and every pause: the session is closed, or there is nothing to play. */
  const stop = new AbortController();
  let info: GameInfo | null = null;
  let lichess: LichessState | null = null;
  /** The position of Lichess's state (null when its moves could not be replayed). */
  let position: Chess | null = null;
  let pending: PendingMove | null = null;
  let connection: LiveGameView['connection'] = 'connecting';
  let missing = false;
  let error: string | null = null;
  let present = true;
  let claimAt: number | null = null;
  /** Each standing offer's move count when it was first seen. */
  const offerSeen: Record<OfferKindHere, Record<Side, number | null>> = {
    draw: { white: null, black: null },
    takeback: { white: null, black: null },
  };
  /** Offers this device declined, hidden until Lichess's state lets them go. */
  const declined: Record<OfferKindHere, Record<Side, boolean>> = {
    draw: { white: false, black: false },
    takeback: { white: false, black: false },
  };
  /** Whether a draw was agreed: this device accepted, or an offer stood just before the end. */
  let acceptedDraw = false;
  let offerStood = false;
  let recorded = false;
  let closed = false;
  /** This game's requests, one after another (a move, then the draw offered after it). */
  let requests: Promise<unknown> = Promise.resolve();

  const playing = () => lichess !== null && isPlaying(lichess) && !missing;

  /** The side whose offer of `kind` stands, as far as can be told. */
  function standing(kind: OfferKindHere, moves: readonly string[]): Side | null {
    if (!lichess) return null;
    for (const side of SIDES) {
      if (!lichess[kind][side] || declined[kind][side]) continue;
      // An offer stands until the other side moves: Lichess then declines it, and says
      // nothing on the stream for a declined draw.
      const since = offerSeen[kind][side] ?? moves.length;
      let answered = false;
      for (let ply = since; ply < moves.length; ply++) {
        if (turnAt(ply) !== side) answered = true;
      }
      if (!answered) return side;
    }
    return null;
  }

  function render(): LiveGameView {
    const base = {
      source: 'lichess' as const,
      id: gameId,
      connection,
      missing,
      chat: [],
      next: null,
      error,
      url,
      capabilities: CAPABILITIES,
    };
    if (!info || !lichess) {
      return {
        ...base,
        you: info?.you ?? 'white',
        white: info?.white ?? UNKNOWN,
        black: info?.black ?? UNKNOWN,
        tc: info?.tc ?? '',
        rated: info?.rated ?? false,
        moves: [],
        clock: null,
        firstMove: null,
        status: 'playing',
        result: null,
        reason: null,
        offers: NO_OFFERS,
        opponentPresent: true,
        claimAt: null,
      };
    }
    const end = endOf(
      lichess,
      position,
      acceptedDraw || offerStood || lichess.draw.white || lichess.draw.black,
    );
    const on = end.status === 'playing';
    const moves = pending ? [...lichess.moves, pending.uci] : lichess.moves;
    let clock: LiveClock | null = pending
      ? pending.clock
      : {
          white: lichess.times.white,
          black: lichess.times.black,
          running: on && moves.length >= 2 ? turnAt(moves.length) : null,
          at: lichess.at,
        };
    if (clock && !on) clock = { ...clock, running: null };
    let firstMove: LiveGameView['firstMove'] = null;
    if (on && lichess.expiration && moves.length < 2) {
      const { idleMillis, millisToMove } = lichess.expiration;
      firstMove = pending
        ? { color: turnAt(moves.length), deadline: pending.at + millisToMove }
        : {
            color: turnAt(moves.length),
            deadline: lichess.at + Math.max(0, millisToMove - idleMillis),
          };
    }
    return {
      ...base,
      you: info.you,
      white: info.white,
      black: info.black,
      tc: info.tc,
      rated: info.rated,
      moves,
      clock,
      firstMove,
      ...end,
      offers: on
        ? { draw: standing('draw', moves), takeback: standing('takeback', moves), rematch: null }
        : NO_OFFERS,
      opponentPresent: on ? present : true,
      claimAt: on && !present ? claimAt : null,
    };
  }

  let view = render();

  function update(): void {
    view = render();
    if (view.status === 'playing') offerStood = view.offers.draw !== null;
    if (view.status === 'over' && info && !recorded) {
      recorded = true;
      try {
        recordLiveGame(view);
      } catch (err) {
        console.warn('The finished Lichess game could not be kept.', err);
      }
    }
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** Nothing more can be done here: no such game, not the account's, or a sign-in refused. */
  function giveUp(message: string, notFound: boolean): void {
    missing = missing || notFound;
    error = message;
    connection = 'closed';
    stop.abort();
    update();
  }

  function applyState(state: LichessState): void {
    const replayed = replay(state.moves);
    const next: LichessState = replayed ? { ...state, moves: replayed.moves } : state;
    // A new move by the opponent shows they are there.
    if (
      lichess &&
      next.moves.length > lichess.moves.length &&
      turnAt(next.moves.length - 1) !== info?.you
    ) {
      present = true;
      claimAt = null;
    }
    if (pending) {
      // Lichess's state may come from before the move reached it: the move stays on top.
      const before =
        next.moves.length === pending.ply && isPlaying(next) && turnAt(pending.ply) === info?.you;
      if (!before) pending = null;
    }
    for (const kind of ['draw', 'takeback'] as const) {
      for (const side of SIDES) {
        if (next[kind][side]) {
          offerSeen[kind][side] ??= next.moves.length;
        } else {
          offerSeen[kind][side] = null;
          declined[kind][side] = false;
        }
      }
    }
    lichess = next;
    position = replayed?.chess ?? null;
    error = null;
    update();
  }

  function onFull(full: Record<string, unknown>, accountId: string): void {
    const white = readPlayer(full.white);
    const black = readPlayer(full.black);
    const me = accountId.toLowerCase();
    const you: Side | null =
      white.id?.toLowerCase() === me ? 'white' : black.id?.toLowerCase() === me ? 'black' : null;
    if (!you) {
      giveUp('This game is not one of yours on Lichess.', true);
      return;
    }
    const variant = (full.variant as { key?: unknown } | undefined)?.key;
    const initialFen = full.initialFen;
    if (
      (variant !== undefined && variant !== 'standard') ||
      (initialFen !== undefined && initialFen !== 'startpos' && initialFen !== START_FEN)
    ) {
      giveUp('This Lichess game is not standard chess from the usual start.', true);
      return;
    }
    const clock = full.clock as { initial?: unknown; increment?: unknown } | undefined;
    const initial = num(clock?.initial);
    const increment = num(clock?.increment);
    info = {
      you,
      white: white.player,
      black: black.player,
      tc: clock ? `${initial / 60_000}+${increment / 1000}` : '',
      rated: full.rated === true,
      incrementMs: increment,
    };
    const state = readState(full.state, performance.now());
    if (!state) return;
    // A new connection: Lichess says again whether the opponent is away.
    present = true;
    claimAt = null;
    connection = 'open';
    applyState(state);
  }

  function onLine(value: unknown, accountId: string): void {
    if (typeof value !== 'object' || value === null) return;
    const line = value as Record<string, unknown>;
    switch (line.type) {
      case 'gameFull':
        onFull(line, accountId);
        break;
      case 'gameState': {
        const state = info ? readState(line, performance.now()) : null;
        if (state) applyState(state);
        break;
      }
      case 'opponentGone':
        if (!info) break;
        present = line.gone !== true;
        claimAt =
          !present && typeof line.claimWinInSeconds === 'number'
            ? performance.now() + Math.max(0, line.claimWinInSeconds) * 1000
            : null;
        error = null;
        update();
        break;
      default:
        // `chatLine`: the app shows no chat from strangers.
        break;
    }
  }

  async function run(): Promise<void> {
    let failures = 0;
    while (!stop.signal.aborted) {
      const account = useLichess.getState().account;
      if (!account) {
        giveUp('Not signed in to Lichess any more.', false);
        return;
      }
      let heard = false;
      let wait: number | null = null;
      try {
        await readLichessStream(`/api/board/game/stream/${encodeURIComponent(gameId)}`, {
          token: account.token,
          signal: stop.signal,
          onLine: (value) => {
            heard = true;
            onLine(value, account.id);
          },
        });
        failures = heard ? 0 : failures + 1;
      } catch (err) {
        if (stop.signal.aborted) return;
        if (err instanceof LichessError) {
          switch (err.kind) {
            case 'not-found':
              giveUp('Lichess has no such game for this account.', true);
              return;
            case 'invalid':
              giveUp(sentence(err.message), true);
              return;
            case 'auth':
              noteSignInRefused(err);
              giveUp(sentence(err.message), false);
              return;
            case 'forbidden':
              giveUp('This Lichess sign-in may not play games: connect Lichess again.', false);
              return;
            case 'refused':
              giveUp(sentence(err.message), false);
              return;
            case 'rate-limited':
              wait = (err.retryAfterSec ?? 60) * 1000;
              break;
            default:
              // No answer, or Lichess's own trouble: try again.
              break;
          }
        }
        failures += 1;
      }
      if (stop.signal.aborted) return;
      if (lichess && !isPlaying(lichess)) {
        // Lichess ends the stream once the game is over.
        connection = 'closed';
        update();
        return;
      }
      if (failures > 0 && connection !== 'reconnecting') {
        connection = 'reconnecting';
        update();
      }
      wait ??= failures
        ? backoff(failures, lichessTiming.retryMs, lichessTiming.retryMaxMs)
        : lichessTiming.resumeMs;
      try {
        await pause(wait, stop.signal);
      } catch {
        return;
      }
    }
  }

  /** Sends a Board API command for this game, after the ones before it. */
  function send(command: string, onRefused?: () => void): void {
    const task = requests.then(() => {
      const account = useLichess.getState().account;
      if (!account) throw new LichessError('Not signed in to Lichess any more.', 'auth');
      return postToLichess(
        `/api/board/game/${encodeURIComponent(gameId)}/${command}`,
        account.token,
      );
    });
    requests = task.catch(() => undefined);
    task.catch((err: unknown) => {
      if (closed) return;
      noteSignInRefused(err);
      onRefused?.();
      error = messageOf(err);
      update();
    });
  }

  function refuse(message: string): void {
    error = message;
    update();
  }

  const session: LiveGameSession = {
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    move: (uci) => {
      if (closed || !info || !lichess || !playing()) return;
      const ply = lichess.moves.length;
      if (pending || turnAt(ply) !== info.you) {
        refuse('It is not your turn.');
        return;
      }
      const replayed = replay(lichess.moves);
      // A position the app could not follow is left to Lichess to judge.
      const played = replayed
        ? playUci(replayed.chess, uci)
        : /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
          ? uci
          : null;
      if (!played) {
        refuse('That move is not legal.');
        return;
      }
      const now = performance.now();
      pending = {
        uci: played,
        ply,
        clock: clockAfterMove(view.clock, info.you, ply + 1, now, info.incrementMs),
        at: now,
      };
      error = null;
      update();
      send(`move/${played}`, () => {
        // Back to Lichess's last state.
        if (pending?.ply === ply && pending.uci === played) pending = null;
      });
    },
    resign: () => {
      if (!closed && playing()) send('resign');
    },
    abort: () => {
      if (!closed && playing()) send('abort');
    },
    draw: (op: OfferOp) => {
      if (closed || !info || !playing()) return;
      if (op === 'decline') {
        // Lichess says nothing on the stream when a draw is declined: hide it here.
        declined.draw[opposite(info.you)] = true;
        update();
        send('draw/no');
        return;
      }
      // Offering and accepting are the same request ("yes").
      if (op === 'accept') acceptedDraw = true;
      send('draw/yes', () => {
        if (op === 'accept') acceptedDraw = false;
      });
    },
    takeback: (op: OfferOp) => {
      if (closed || !info || !playing()) return;
      if (op === 'decline') {
        declined.takeback[opposite(info.you)] = true;
        update();
        send('takeback/no');
        return;
      }
      send('takeback/yes');
    },
    claim: (op) => {
      if (!closed && playing()) send(op === 'win' ? 'claim-victory' : 'claim-draw');
    },
    // Rematches and phrases are the relay's only.
    rematch: () => undefined,
    say: () => undefined,
    close: () => {
      if (closed) return;
      closed = true;
      stop.abort();
      connection = 'closed';
      update();
    },
  };

  run().catch((err: unknown) => {
    console.error(err);
    giveUp('The connection to Lichess failed.', false);
  });
  return session;
}
