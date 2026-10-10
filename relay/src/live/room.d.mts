/** Types for room.mjs, for the relay's tests. */
import type { GameSpec } from './lobby.mjs';

export type Color = 'white' | 'black';

export interface Seat {
  name: string;
  rating: number | null;
  seatHash: string;
}

export interface GameState {
  v: 1;
  id: string;
  createdAt: number;
  tc: { id: string; initialMs: number; incrementMs: number };
  white: Seat;
  black: Seat;
  moves: string[];
  clock: { white: number; black: number; running: Color | null; since: number };
  firstMoveBy: number | null;
  status: 'playing' | 'over';
  result: '1-0' | '0-1' | '1/2-1/2' | '*' | null;
  reason: string | null;
  endedAt: number | null;
  offers: { draw: Color | null; takeback: Color | null; rematch: Color | null };
  goneSince: { white: number | null; black: number | null };
  chat: { by: Color; phrase: string }[];
  lastPhraseAt: { white: number; black: number };
  next: { id: string; seats: { white: string; black: string } } | null;
}

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
  load(): Promise<GameState | null>;
  store(state: GameState): Promise<void>;
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
