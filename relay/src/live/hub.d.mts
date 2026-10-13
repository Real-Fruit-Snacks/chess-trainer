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
  /** A socket for a game's room (`address`, the client's, for the room's limit per address). */
  openRoom(id: string, socket: Socket, address?: string): SocketEvents;
  /** A socket for a group room (a puzzle race for up to eight, an analysis). */
  openGroup(id: string, socket: Socket, address?: string): SocketEvents;
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
  /** Hears of each write a room makes to its storage, and each timer it sets or clears. */
  counted?: (room: string, what: 'store' | 'schedule' | 'remove') => void;
}): LiveHub;
