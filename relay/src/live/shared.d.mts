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

export type GameKind = 'chess' | 'blindfold' | 'army' | 'race' | 'arbiter' | 'judge';
export type DuelKind = 'race' | 'arbiter' | 'judge';
export type RaceFormat = 'best3' | 'window' | 'timed';
export type ArbiterPace = 'normal' | 'slow';
export type ArbiterKind =
  | 'knight-shape'
  | 'bishop-straight'
  | 'rook-diagonal'
  | 'pawn-backwards'
  | 'pawn-straight-capture'
  | 'pawn-diagonal-step'
  | 'king-two-squares'
  | 'own-capture'
  | 'jumps-over'
  | 'pawn-late-double'
  | 'pawn-blocked-double'
  | 'no-promotion'
  | 'pinned-piece'
  | 'king-into-check'
  | 'ignores-check'
  | 'castle-through-check'
  | 'late-en-passant'
  | 'moves-twice';

/** A game's options: Army Draft's budget, a race's format and level, Arbiter's pace. */
export interface GameOptions {
  budget?: number;
  format?: RaceFormat;
  level?: number;
  pace?: ArbiterPace;
}

export const GAMES: readonly GameKind[];
export const DUELS: readonly DuelKind[];
export function isGame(game: unknown): game is GameKind;
export function isDuel(game: unknown): game is DuelKind;
export const ARMY_BUDGETS: readonly number[];
export const BLINDFOLD_PEEKS: number;
export const RACE_FORMATS: readonly RaceFormat[];
export const RACE_LEVELS: readonly number[];
export const ARBITER_PACES: readonly ArbiterPace[];
export const ARBITER_KINDS: readonly ArbiterKind[];
export function gameOptions(game: unknown, opts: unknown): GameOptions | null;
export function sameOptions(a: object, b: object): boolean;

export const DUEL_RULES: Readonly<{
  countdownMs: number;
  revealMs: number;
  setupMs: number;
  race: Readonly<{
    target: number;
    rounds: number;
    roundMs: number;
    graceMs: number;
    windowMs: number;
    timedMs: number;
    strikes: number;
    timedMin: number;
    timedMax: number;
  }>;
  arbiter: Readonly<{ target: number; rounds: number; roundMs: number; graceMs: number }>;
  judge: Readonly<{ rounds: number; roundMs: number }>;
}>;

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
  contentBytes: number;
  draftMs: number;
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
