/**
 * Types for shared.mjs, for TypeScript callers: the app (its live games) and
 * the relay's tests.
 */

export interface TimeControlSpec {
  /** "5+3": minutes + seconds a move; "3d": three days for every move (correspondence). */
  id: string;
  kind: 'realtime' | 'correspondence';
  /** A clock's start; for correspondence, the days of one move. */
  initialMs: number;
  incrementMs: number;
  /** Correspondence: the time each move may take (each side's, for every move); null otherwise. */
  perMoveMs: number | null;
}

export type LichessSpeed =
  'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';
export type ColorChoice = 'random' | 'white' | 'black';
export type PhraseId = 'hello' | 'luck' | 'fun' | 'played' | 'game' | 'thanks' | 'oops';

export const QUICK_TIME_CONTROLS: readonly string[];
export const MAX_MINUTES: number;
export const MAX_INCREMENT_SECONDS: number;
export const CORRESPONDENCE_DAYS: readonly number[];
export const DAY_MS: number;
export function parseTimeControl(id: unknown): TimeControlSpec | null;
export function isCorrespondence(id: unknown): boolean;
export function speedOf(tc: {
  initialMs: number;
  incrementMs: number;
  perMoveMs?: number | null;
}): LichessSpeed;

export const NAME_ADJECTIVES: readonly string[];
export const NAME_NOUNS: readonly string[];
export function isPlayerName(name: unknown): boolean;

export const PHRASES: Readonly<Record<PhraseId, string>>;
export function isPhrase(id: unknown): id is PhraseId;

export const MIN_RATING: number;
export const MAX_RATING: number;
export function isRating(rating: unknown): rating is number | null;

export const COLOR_CHOICES: readonly ColorChoice[];

export type GameKind = 'chess' | 'blindfold' | 'army' | 'race' | 'arbiter' | 'judge' | 'chess960';
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
/** The games that may be played over days (correspondence, by invitation). */
export const CORRESPONDENCE_GAMES: readonly GameKind[];
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
  watchers: number;
  inviteMs: number;
  invites: number;
  invitesWindowMs: number;
  correspondenceKeepMs: number;
  correspondenceAgeMs: number;
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

/** The kinds of group room (rooms for up to eight, by link). */
export type GroupKind = 'race' | 'analysis';
/** A race room's formats: five rounds scored by the order of the clean solves, or three minutes. */
export type RaceRoomFormat = 'rounds' | 'timed';
/** An analysis room's rules: standard chess, or Chess960. */
export type AnalysisVariant = 'standard' | 'chess960';
/**
 * A group room's options: a race room's format and puzzle rating; an analysis room's variant,
 * start position, moves (UCI, variations in brackets), result and players' names.
 */
export interface GroupOptions {
  format?: RaceRoomFormat;
  level?: number;
  variant?: AnalysisVariant;
  fen?: string;
  moves?: string;
  result?: string;
  white?: string;
  black?: string;
}

export const GROUP_KINDS: readonly GroupKind[];
export function isGroupKind(kind: unknown): kind is GroupKind;
export const GROUP_LIMITS: Readonly<{
  members: number;
  visitors: number;
  hostGoneMs: number;
  awayMs: number;
  emptyKeepMs: number;
  ageMs: number;
  rooms: number;
  roomsWindowMs: number;
}>;
export const MEMBER_PATTERN: RegExp;
export const RACE_ROOM: Readonly<{
  formats: readonly RaceRoomFormat[];
  rounds: number;
  points: readonly number[];
  others: number;
  minRacers: number;
}>;
export const ANALYSIS_ROOM: Readonly<{
  variants: readonly AnalysisVariant[];
  nodes: number;
  depth: number;
  shapes: number;
  allShapes: number;
  brushes: readonly string[];
  movesChars: number;
  results: readonly string[];
}>;
export function groupOptions(kind: unknown, opts: unknown): GroupOptions | null;
export function analysisRoomId(game: string): Promise<string>;
