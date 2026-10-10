/**
 * Types for shared.mjs, for TypeScript callers: the app (its live games) and
 * the relay's tests.
 */

export interface TimeControlSpec {
  /** "5+3": minutes + seconds a move. */
  id: string;
  initialMs: number;
  incrementMs: number;
}

export type LichessSpeed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical';
export type ColorChoice = 'random' | 'white' | 'black';
export type PhraseId = 'hello' | 'luck' | 'fun' | 'played' | 'game' | 'thanks' | 'oops';

export const QUICK_TIME_CONTROLS: readonly string[];
export const MAX_MINUTES: number;
export const MAX_INCREMENT_SECONDS: number;
export function parseTimeControl(id: unknown): TimeControlSpec | null;
export function speedOf(tc: { initialMs: number; incrementMs: number }): LichessSpeed;

export const NAME_ADJECTIVES: readonly string[];
export const NAME_NOUNS: readonly string[];
export function isPlayerName(name: unknown): boolean;

export const PHRASES: Readonly<Record<PhraseId, string>>;
export function isPhrase(id: unknown): id is PhraseId;

export const MIN_RATING: number;
export const MAX_RATING: number;
export function isRating(rating: unknown): rating is number | null;

export const COLOR_CHOICES: readonly ColorChoice[];

export const LIMITS: Readonly<{
  messageBytes: number;
  rateMessages: number;
  rateWindowMs: number;
  seeks: number;
  lobbySockets: number;
  socketsPerAddress: number;
  listed: number;
  firstMoveMs: number;
  goneClaimMs: number;
  keepAfterEndMs: number;
  roomAgeMs: number;
  helloMs: number;
  phraseMs: number;
  phrasesKept: number;
}>;

export const CLOSE: Readonly<{
  policy: number;
  tooBig: number;
  noGame: number;
  noHello: number;
  full: number;
  closed: number;
}>;

export function randomId(bytes: number): string;
export const ID_PATTERN: RegExp;
export const SEAT_PATTERN: RegExp;
