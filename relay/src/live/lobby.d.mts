/** Types for lobby.mjs, for the relay's tests. */
import type { GroupSpec } from './group.mjs';

/** The list of games goes to everyone at most this often: changes in between wait for the next. */
export const BROADCAST_MS: number;

export interface SeatSpec {
  name: string;
  rating: number | null;
  /** SHA-256 of the seat token, lowercase hex. */
  seatHash: string;
}

export interface GameSpec {
  id: string;
  /** The game: 'chess' when there is none (a room made before the others existed). */
  game?: string;
  opts?: Record<string, string | number>;
  /** The time control of a game of chess; null for a duel. */
  tc: string | null;
  white: SeatSpec;
  black: SeatSpec;
  /** A correspondence invitation's seat nobody holds yet (its SeatSpec has an empty name and hash). */
  open?: 'white' | 'black' | null;
  /** A Chess960 game's start position (a rematch's); none, and the room draws one. */
  position?: number | null;
}

export interface Seek {
  id: string;
  game: string;
  opts: Record<string, string | number>;
  tc: string | null;
  color: 'random' | 'white' | 'black';
  name: string;
  rating: number | null;
  private: boolean;
  at: number;
}

export interface LobbyData {
  id: string;
  /** The address the socket counts under (an IPv6 address's /64); empty when not known. */
  address: string;
  seek: Seek | null;
  rateStart: number;
  rateCount: number;
  /** The socket's refused messages lately (`refusedTooOften`). */
  refused?: { start: number; count: number };
  /** The socket was refused as it came (the waiting room, or its address, was full). */
  turnedAway?: boolean;
}

export interface LobbyConn {
  data: LobbyData;
  send(text: string): void;
  close(code: number, reason: string): void;
  save(): void;
}

/** The lobby's own storage: its counts per address (as salted hashes). */
export interface LobbyStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

export interface LobbyPlatform {
  connections(): LobbyConn[];
  createGame(spec: GameSpec): Promise<void>;
  /** Makes a group room, or finds it made already (none: rooms are not made here); throws when it cannot. */
  createGroup?: (spec: GroupSpec) => Promise<'created' | 'exists'>;
  storage: LobbyStorage;
  /** Runs `run` at `at`, a time on `now`'s clock. */
  timers: { set(at: number, run: () => void): unknown };
  now(): number;
}

export function lobbyData(address?: string): LobbyData;
export function createLobby(platform: LobbyPlatform): {
  open(conn: LobbyConn): void;
  message(conn: LobbyConn, text: string): Promise<void>;
  close(conn: LobbyConn): void;
};
