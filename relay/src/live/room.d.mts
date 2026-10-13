/** Types for room.mjs, for the relay's tests. */
import type { Army } from './army.mjs';
import type { DuelState } from './duel.mjs';
import type { GroupSpec } from './group.mjs';
import type { GameSpec } from './lobby.mjs';
import type { PushMessage, Subscription } from '../push/webpush.mjs';

export type Color = 'white' | 'black';

/** A game's spec as a room takes it: the waiting room's, and for a rematch how many led to it. */
export type RoomSpec = GameSpec & {
  /** How many rematches in a row led to this game (none: 0). */
  rematches?: number;
};

/**
 * What every `game` snapshot says of rematches (a game of chess or a variant, a duel; a player's
 * and a watcher's alike): how many more in a row its players may play, `ABUSE_LIMITS.rematches`
 * less the rematches that led to it, never below 0. At 0 the app offers a new game from Play
 * instead, and a rematch asked for is refused (`error` `limit`).
 */
export interface SnapshotRematches {
  rematchesLeft: number;
}

export interface Seat {
  name: string;
  rating: number | null;
  seatHash: string;
  /**
   * The hash the waiting room counts the player's address under (none: a rematch's, a
   * correspondence game's), handed back should they never make their first move.
   */
  key?: string;
}

export interface GameState {
  v: 1 | 2;
  id: string;
  createdAt: number;
  /** Chess when there is none (a game stored before the variants existed). */
  game?: 'chess' | 'blindfold' | 'army' | 'chess960';
  opts?: Record<string, string | number>;
  /** The time control; `perMoveMs` for correspondence (days for every move). */
  tc: {
    id: string;
    kind?: string;
    initialMs: number;
    incrementMs: number;
    perMoveMs?: number | null;
  };
  white: Seat;
  black: Seat;
  /** A correspondence invitation's seat nobody holds yet (its Seat has an empty name and hash). */
  open?: Color | null;
  /** When the invitation expires, while a seat is open. */
  openUntil?: number | null;
  /** Correspondence: where to push each player while they are away (none once it is over). */
  push?: { white: Subscription | null; black: Subscription | null } | null;
  /** The position an Army Draft game starts from (once both armies are in), or a Chess960 game. */
  startFen?: string | null;
  /** A Chess960 game's start position, by number (0–959); null in any other game. */
  position?: number | null;
  draft?: {
    budget: number;
    by: number;
    armies: { white: Army | null; black: Army | null };
  } | null;
  peeks?: { white: number; black: number } | null;
  moves: string[];
  /** The mover's time left after each move, in milliseconds (none in correspondence). */
  clocks?: number[];
  clock: { white: number; black: number; running: Color | null; since: number };
  firstMoveBy: number | null;
  status: 'draft' | 'playing' | 'over';
  result: '1-0' | '0-1' | '1/2-1/2' | '*' | null;
  reason: string | null;
  endedAt: number | null;
  offers: { draw: Color | null; takeback: Color | null; rematch: Color | null };
  goneSince: { white: number | null; black: number | null };
  chat: { by: Color; phrase: string }[];
  lastPhraseAt: { white: number; black: number };
  next: { id: string; seats: { white: string; black: string } } | null;
  /** How many rematches in a row led to this game (none: 0). */
  rematches?: number;
}

export type RoomState = GameState | DuelState;

export interface RoomData {
  id: string;
  seat: Color | null;
  /** The socket watches the game (it holds no seat). */
  watch: boolean;
  openedAt: number;
  rateStart: number;
  rateCount: number;
  /** The client's address as the limits count it (`addressKey`); '' when not known. */
  address: string;
  /** The socket's refused messages lately (`refusedTooOften`). */
  refused?: { start: number; count: number };
}

export interface RoomConn {
  data: RoomData;
  send(text: string): void;
  close(code: number, reason: string): void;
  save(): void;
}

export interface RoomPlatform {
  connections(): RoomConn[];
  load(): Promise<RoomState | null>;
  store(state: RoomState): Promise<void>;
  remove(): Promise<void>;
  schedule(at: number | null): void | Promise<void>;
  /**
   * When the timer is set for (null: not set), read when a room wakes so that it sets the timer
   * only when it must (none: the room's first save sets it).
   */
  alarm?: () => Promise<number | null>;
  /**
   * A timer in memory, besides the stored one, for what may slip if the room is evicted (a
   * socket's time to say hello, the light changes' write); none: those wait for its next event.
   */
  timers?: { set(at: number, run: () => void): unknown; clear(handle: unknown): void };
  createGame(spec: RoomSpec): Promise<void>;
  /** Makes a group room, or finds it made: a game's analysis room (none: games are not analysed together). */
  createGroup?: (spec: GroupSpec) => Promise<'created' | 'exists'>;
  now(): number;
  /** Pushes a message to a player away from a correspondence game (none: nobody is pushed). */
  notify?: (
    subscription: Subscription,
    message: PushMessage,
  ) => Promise<'sent' | 'gone' | 'failed'>;
  /** Draws a new Chess960 game's start position (none: one of the 960 at random). */
  chess960Position?: () => number;
  /**
   * Tells the waiting room that the player whose seat has `key` never made their first move (the
   * game was aborted for it), once that is stored (none: nobody is told).
   */
  noShow?: (key: string) => Promise<unknown>;
}

export function roomData(now?: number, address?: string): RoomData;
export function newGame(spec: RoomSpec, now: number, draw?: () => number): GameState;
export function createRoom(platform: RoomPlatform): {
  create(spec: RoomSpec): Promise<void>;
  open(conn: RoomConn): Promise<void>;
  message(conn: RoomConn, text: string): Promise<void>;
  close(conn: RoomConn): Promise<void>;
  timer(): Promise<void>;
};
