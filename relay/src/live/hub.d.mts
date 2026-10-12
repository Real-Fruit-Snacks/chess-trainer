/** Types for hub.mjs, for TypeScript callers: the relay's tests and the end-to-end tests. */
import type { RoomPlatform } from './room.mjs';

export interface Socket {
  send(text: string): void;
  close(code: number, reason: string): void;
}

export interface SocketEvents {
  message(text: string): Promise<void>;
  close(): Promise<void>;
}

export interface Timers {
  set(at: number, run: () => void): unknown;
  clear(handle: unknown): void;
}

export interface LiveHub {
  openLobby(socket: Socket, address?: string): SocketEvents;
  openRoom(id: string, socket: Socket): SocketEvents;
  /** A socket for a group room (a puzzle race for up to eight). */
  openGroup(id: string, socket: Socket): SocketEvents;
  games(): number;
  /** How many group rooms are kept. */
  groups(): number;
  closeAll(): void;
}

export function createLiveHub(options?: {
  now?: () => number;
  timers?: Timers;
  /** Pushes correspondence players who are away (none: nobody is pushed). */
  notify?: RoomPlatform['notify'];
  /** Draws every new Chess960 game's start position (none: one of the 960 at random). */
  chess960Position?: () => number;
}): LiveHub;
