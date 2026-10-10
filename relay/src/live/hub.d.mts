/** Types for hub.mjs, for TypeScript callers: the relay's tests and the end-to-end tests. */

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
  games(): number;
  closeAll(): void;
}

export function createLiveHub(options?: { now?: () => number; timers?: Timers }): LiveHub;
