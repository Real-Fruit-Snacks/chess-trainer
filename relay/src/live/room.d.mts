/** Types for room.mjs, for the relay's tests. */
import type { Army } from './army.mjs';
import type { DuelState } from './duel.mjs';
import type { GameSpec } from './lobby.mjs';

export type Color = 'white' | 'black';

export interface Seat {
  name: string;
  rating: number | null;
  seatHash: string;
}

export interface GameState {
  v: 1 | 2;
  id: string;
  createdAt: number;
  /** Chess when there is none (a game stored before the variants existed). */
  game?: 'chess' | 'blindfold' | 'army';
  opts?: Record<string, string | number>;
  tc: { id: string; initialMs: number; incrementMs: number };
  white: Seat;
  black: Seat;
  /** The position an Army Draft game starts from, once both armies are in. */
  startFen?: string | null;
  draft?: {
    budget: number;
    by: number;
    armies: { white: Army | null; black: Army | null };
  } | null;
  peeks?: { white: number; black: number } | null;
  moves: string[];
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
}

export type RoomState = GameState | DuelState;

export interface RoomData {
  id: string;
  seat: Color | null;
  openedAt: number;
  rateStart: number;
  rateCount: number;
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
  createGame(spec: GameSpec): Promise<void>;
  now(): number;
}

export function roomData(now?: number): RoomData;
export function newGame(spec: GameSpec, now: number): GameState;
export function createRoom(platform: RoomPlatform): {
  create(spec: GameSpec): Promise<void>;
  open(conn: RoomConn): Promise<void>;
  message(conn: RoomConn, text: string): Promise<void>;
  close(conn: RoomConn): Promise<void>;
  timer(): Promise<void>;
};
