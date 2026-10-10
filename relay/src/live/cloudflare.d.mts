/**
 * Types for cloudflare.mjs, for the relay's tests: the two Durable Object
 * classes, and as much of the runtime as they use.
 */

/** The object's end of a WebSocket accepted for hibernation. */
export interface DurableSocket {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface DurableStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface DurableState {
  storage: DurableStorage;
  acceptWebSocket(ws: DurableSocket): void;
  getWebSockets(): DurableSocket[];
  setWebSocketAutoResponse(pair?: unknown): void;
}

export interface DurableNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
}

export interface LiveEnv {
  LIVE_LOBBY?: DurableNamespace;
  LIVE_ROOMS?: DurableNamespace;
}

/** The waiting room: one object (named 'lobby') for every socket of `GET /v1/lobby`. */
export class LiveLobby {
  constructor(state: DurableState, env: LiveEnv);
  /** A WebSocket upgrade: 101 with the client's end of a new socket; 426 for anything else. */
  fetch(request: Request): Response;
  /** Takes the object's end of a new socket: what `fetch` does, apart from the 101 response. */
  accept(ws: DurableSocket, address?: string): void;
  webSocketMessage(ws: DurableSocket, message: string | ArrayBuffer): Promise<void>;
  webSocketClose(ws: DurableSocket, code?: number, reason?: string, wasClean?: boolean): void;
  webSocketError(ws: DurableSocket, error?: unknown): void;
}

/** One game: an object per game, named by the game's id. */
export class LiveRoom {
  constructor(state: DurableState, env: LiveEnv);
  /**
   * POST https://live.internal/create with a game's spec: 201 made, 409 when it
   * exists, 400 when it is not one. A WebSocket upgrade: 101. Anything else: 426.
   */
  fetch(request: Request): Promise<Response>;
  /** Takes the object's end of a new socket: what `fetch` does, apart from the 101 response. */
  accept(ws: DurableSocket): Promise<void>;
  webSocketMessage(ws: DurableSocket, message: string | ArrayBuffer): Promise<void>;
  webSocketClose(
    ws: DurableSocket,
    code?: number,
    reason?: string,
    wasClean?: boolean,
  ): Promise<void>;
  webSocketError(ws: DurableSocket, error?: unknown): Promise<void>;
  /** Something is due: a flag, a first move, a hello, or the room's end. */
  alarm(): Promise<void>;
}
