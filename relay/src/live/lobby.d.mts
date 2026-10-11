/** Types for lobby.mjs, for the relay's tests. */

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
  address: string;
  seek: Seek | null;
  rateStart: number;
  rateCount: number;
}

export interface LobbyConn {
  data: LobbyData;
  send(text: string): void;
  close(code: number, reason: string): void;
  save(): void;
}

export interface LobbyPlatform {
  connections(): LobbyConn[];
  createGame(spec: GameSpec): Promise<void>;
  now(): number;
}

export function lobbyData(address?: string): LobbyData;
export function createLobby(platform: LobbyPlatform): {
  open(conn: LobbyConn): void;
  message(conn: LobbyConn, text: string): Promise<void>;
  close(conn: LobbyConn): void;
};
