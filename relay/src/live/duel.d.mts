/** Types for duel.mjs, for the relay's tests. */
import type { DuelResult } from './duelRules.mjs';
import type { GameSpec } from './lobby.mjs';

export type Seat = 'white' | 'black';

export interface SeatSpec {
  name: string;
  rating: number | null;
  seatHash: string;
}

export interface Progress {
  index: number;
  solved: number;
  strikes: number;
  done: boolean;
}

export interface RoundRecord {
  round: number;
  results: { white: DuelResult | null; black: DuelResult | null };
  winner: Seat | 'shared' | null;
  points: { white: number; black: number };
}

export interface DuelState {
  v: 2;
  id: string;
  createdAt: number;
  game: 'race' | 'arbiter' | 'judge';
  opts: Record<string, string | number>;
  tc: null;
  white: SeatSpec;
  black: SeatSpec;
  status: 'setup' | 'playing' | 'over';
  setupBy: number | null;
  items: unknown[] | null;
  round: number;
  phase: 'countdown' | 'live' | 'reveal' | null;
  phaseEndsAt: number | null;
  liveSince: number | null;
  results: { white: DuelResult | null; black: DuelResult | null };
  rounds: RoundRecord[];
  score: { white: number; black: number };
  progress: { white: Progress; black: Progress } | null;
  result: '1-0' | '0-1' | '1/2-1/2' | '*' | null;
  reason: string | null;
  endedAt: number | null;
  offers: { draw: null; takeback: null; rematch: Seat | null };
  goneSince: { white: number | null; black: number | null };
  chat: { by: Seat; phrase: string }[];
  lastPhraseAt: { white: number; black: number };
  next: { id: string; seats: { white: string; black: string } } | null;
  /** How many rematches in a row led to this duel (none: 0). */
  rematches?: number;
}

export interface DuelContext {
  tell(make: (seat: Seat) => unknown): void;
  refuse(conn: unknown, seat: Seat, code: string, message: string): void;
  present(): { white: boolean; black: boolean };
}

export function isTimed(s: DuelState): boolean;
export function newDuel(spec: GameSpec, now: number): DuelState;
export function duelView(s: DuelState, you: Seat, now: number): Record<string, unknown>;
export function duelDeadline(s: DuelState): number | null;
export function endDuel(
  ctx: DuelContext,
  s: DuelState,
  result: DuelState['result'],
  reason: string,
  now: number,
): void;
export function duelMaybeStart(ctx: DuelContext, s: DuelState, now: number): boolean;
export function duelMessage(
  ctx: DuelContext,
  conn: unknown,
  s: DuelState,
  seat: Seat,
  msg: Record<string, unknown>,
  now: number,
): boolean;
export function duelTimer(ctx: DuelContext, s: DuelState, now: number): void;
