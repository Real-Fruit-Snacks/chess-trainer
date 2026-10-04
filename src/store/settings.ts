import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import { writeIsolationFlag } from '@/sw/isolation';

export const COLOR_SCHEMES = ['system', 'light', 'dark', 'black'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export const BOARD_THEMES = [
  'brown',
  'green',
  'blue',
  'grey',
  'purple',
  'olive',
  'ice',
  'walnut',
  'contrast',
] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];
export const PLAY_COLORS = ['white', 'black', 'random'] as const;
export type PlayColor = (typeof PLAY_COLORS)[number];
export const REVIEW_DEPTH_IDS = ['fast', 'balanced', 'thorough'] as const;
export type ReviewDepth = (typeof REVIEW_DEPTH_IDS)[number];
export const PIECE_SET_IDS = ['classic', 'letters', 'pixel', 'modern'] as const;
export type PieceSet = (typeof PIECE_SET_IDS)[number];
export const SOUND_THEMES = ['standard', 'soft', 'retro'] as const;
export type SoundTheme = (typeof SOUND_THEMES)[number];
/** How moves are written: "Nf3" or with a piece figurine. */
export const NOTATIONS = ['figurine', 'letters'] as const;
export type Notation = (typeof NOTATIONS)[number];
/** How a piece is moved on the board. */
export const MOVE_METHODS = ['either', 'tap', 'drag'] as const;
export type MoveMethod = (typeof MOVE_METHODS)[number];
/** The mark under a dragged piece. */
export const DRAG_TARGETS = ['circle', 'square', 'none'] as const;
export type DragTarget = (typeof DRAG_TARGETS)[number];
/** Captured material beside the player bars. */
export const MATERIAL_DISPLAYS = ['difference', 'count', 'off'] as const;
export type MaterialDisplay = (typeof MATERIAL_DISPLAYS)[number];
/** The player's colour across a simul: the same on every board, or alternating. */
export const SIMUL_COLORS = ['white', 'black', 'alternate'] as const;
export type SimulColor = (typeof SIMUL_COLORS)[number];
export const EXPLORER_DATABASES = ['masters', 'lichess'] as const;
export type ExplorerDatabase = (typeof EXPLORER_DATABASES)[number];

/** The last simul set up, offered again next time. */
export interface SimulPrefs {
  boards: number;
  levelId: number;
  /** Each board one level stronger than the one before. */
  rising: boolean;
  color: SimulColor;
  /** A time control id from lib/clock.ts; 'none' plays without clocks. */
  timeControlId: string;
  /** After a move, bring up the next board waiting for one. */
  autoAdvance: boolean;
}

/** Search depth per review setting. */
export const REVIEW_DEPTHS: Record<ReviewDepth, number> = { fast: 10, balanced: 13, thorough: 16 };

/**
 * Device-wide preferences, shared by every profile. Anything about one
 * learner — backup reminders, remembered usernames, the first-run tour — lives
 * in the progress store instead (moved there in version 4).
 */
export interface SettingsState {
  colorScheme: ColorScheme;
  boardTheme: BoardTheme;
  /** Piece graphics: the classic figurines, the "Letters" tiles, the 8-bit set or the flat set. */
  pieceSet: PieceSet;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  /** Mark the last move and a king in check on the board. */
  boardHighlights: boolean;
  animations: boolean;
  /** Moves written with piece figurines ("♘f3") or letters ("Nf3"). */
  notation: Notation;
  /** Enlarge the piece under the finger or pointer while it is dragged. */
  magnifyDrag: boolean;
  /** The mark on the square a dragged piece would land on. */
  dragTarget: DragTarget;
  /** Move by tapping two squares, by dragging, or either. */
  moveMethod: MoveMethod;
  /** Captured pieces beside the player bars: the imbalance, every capture, or nothing. */
  materialDisplay: MaterialDisplay;
  /** Hide the header and navigation while a game or simul against the engine is on. */
  playFocus: boolean;
  simul: SimulPrefs;
  sounds: boolean;
  /**
   * Which set of cues plays: the standard set, the same cues quieter and
   * rounder ('soft'), or the 8-bit set ('retro'). Also picks the vibration patterns.
   */
  soundTheme: SoundTheme;
  /** Master volume for the sound effects, 0–1. */
  soundVolume: number;
  /** Short vibrations on moves, solves and mistakes (phones with a vibration motor). */
  haptics: boolean;
  /** Show the number of due reviews on the installed app's icon (Badging API). */
  appBadge: boolean;
  /** Promote to a queen without asking. */
  autoQueen: boolean;
  /** Target depth for the analysis board. */
  analysisDepth: number;
  /** Number of engine lines (MultiPV) on the analysis board. */
  analysisLines: number;
  /** How deeply the game review searches each position. */
  reviewDepth: ReviewDepth;
  /** Engine strength offered for the next game (every game played updates it). */
  playLevel: number;
  playColor: PlayColor;
  /** Time control id for games against the engine (see lib/clock.ts); 'none' = no clock. */
  playTimeControl: string;
  /** Show the coordinates-style keyboard move input under boards. */
  moveInput: boolean;
  /** Hide the pieces while playing (blindfold training). */
  playBlindfold: boolean;
  /** Coach mode in untimed engine games: pause after a mistake and offer a take-back. */
  playCoach: boolean;
  /** Query the Lichess tablebase API for positions with 7 or fewer pieces (network). */
  tablebase: boolean;
  /** Query the Lichess opening explorer for move statistics (network). */
  explorer: boolean;
  explorerDatabase: ExplorerDatabase;
  /**
   * Experimental: run the multi-threaded engine build. Needs cross-origin
   * isolation, which the service worker switches on at the next reload.
   */
  engineThreads: boolean;
  /** Automatically load the next puzzle after a solve. */
  puzzleAutoNext: boolean;
  /** When the install banner was last dismissed (it stays away for a while), or never. */
  installDismissedAt: number | null;
  /** Single-key page shortcuts (H for a hint, arrows through moves…). */
  keyboardShortcuts: boolean;

  update: (patch: Partial<PersistedSettings>) => void;
  /** Back to the defaults; also switches the service worker's isolation flag off. */
  reset: () => void;
}

export const DEFAULT_SETTINGS = {
  colorScheme: 'system' as ColorScheme,
  boardTheme: 'brown' as BoardTheme,
  pieceSet: 'classic' as PieceSet,
  showCoordinates: true,
  showLegalMoves: true,
  boardHighlights: true,
  animations: true,
  notation: 'figurine' as Notation,
  magnifyDrag: true,
  dragTarget: 'circle' as DragTarget,
  moveMethod: 'either' as MoveMethod,
  materialDisplay: 'difference' as MaterialDisplay,
  playFocus: false,
  simul: {
    boards: 3,
    levelId: 2,
    rising: false,
    color: 'white',
    timeControlId: '15+10',
    autoAdvance: true,
  } as SimulPrefs,
  sounds: true,
  soundTheme: 'standard' as SoundTheme,
  soundVolume: 1,
  haptics: true,
  appBadge: true,
  autoQueen: false,
  analysisDepth: 18,
  analysisLines: 3,
  reviewDepth: 'balanced' as ReviewDepth,
  playLevel: 3,
  playColor: 'white' as PlayColor,
  playTimeControl: 'none',
  moveInput: false,
  playBlindfold: false,
  playCoach: true,
  tablebase: false,
  explorer: false,
  explorerDatabase: 'masters' as ExplorerDatabase,
  engineThreads: false,
  puzzleAutoNext: false,
  installDismissedAt: null as number | null,
  keyboardShortcuts: true,
};

export type PersistedSettings = typeof DEFAULT_SETTINGS;

export const SETTINGS_STORAGE_KEY = 'chess-trainer:settings';
export const SETTINGS_VERSION = 4;

/* ------------------------------------------------------------------ */
/* Validation on load                                                 */
/* ------------------------------------------------------------------ */

type Check<T> = (value: unknown) => value is T;

const isBoolean: Check<boolean> = (value) => typeof value === 'boolean';
const isString: Check<string> = (value) => typeof value === 'string';
const oneOf =
  <const T extends readonly string[]>(values: T): Check<T[number]> =>
  (value): value is T[number] =>
    typeof value === 'string' && (values as readonly string[]).includes(value);
const numberIn =
  (min: number, max: number, integer = false): Check<number> =>
  (value): value is number =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value));

/** One check per flat setting; `simul` and the nullable numbers are handled apart. */
const CHECKS: {
  [K in Exclude<keyof PersistedSettings, 'simul' | 'installDismissedAt'>]: Check<
    PersistedSettings[K]
  >;
} = {
  colorScheme: oneOf(COLOR_SCHEMES),
  boardTheme: oneOf(BOARD_THEMES),
  pieceSet: oneOf(PIECE_SET_IDS),
  showCoordinates: isBoolean,
  showLegalMoves: isBoolean,
  boardHighlights: isBoolean,
  animations: isBoolean,
  notation: oneOf(NOTATIONS),
  magnifyDrag: isBoolean,
  dragTarget: oneOf(DRAG_TARGETS),
  moveMethod: oneOf(MOVE_METHODS),
  materialDisplay: oneOf(MATERIAL_DISPLAYS),
  playFocus: isBoolean,
  sounds: isBoolean,
  soundTheme: oneOf(SOUND_THEMES),
  soundVolume: numberIn(0, 1),
  haptics: isBoolean,
  appBadge: isBoolean,
  autoQueen: isBoolean,
  analysisDepth: numberIn(1, 99, true),
  analysisLines: numberIn(1, 10, true),
  reviewDepth: oneOf(REVIEW_DEPTH_IDS),
  playLevel: numberIn(1, 99, true),
  playColor: oneOf(PLAY_COLORS),
  playTimeControl: isString,
  moveInput: isBoolean,
  playBlindfold: isBoolean,
  playCoach: isBoolean,
  tablebase: isBoolean,
  explorer: isBoolean,
  explorerDatabase: oneOf(EXPLORER_DATABASES),
  engineThreads: isBoolean,
  puzzleAutoNext: isBoolean,
  keyboardShortcuts: isBoolean,
};

const SIMUL_CHECKS: { [K in keyof SimulPrefs]: Check<SimulPrefs[K]> } = {
  boards: numberIn(1, 16, true),
  levelId: numberIn(1, 99, true),
  rising: isBoolean,
  color: oneOf(SIMUL_COLORS),
  timeControlId: isString,
  autoAdvance: isBoolean,
};

const nullableNumber = (min: number): Check<number | null> => {
  const inRange = numberIn(min, Number.MAX_SAFE_INTEGER);
  return (value): value is number | null => value === null || inRange(value);
};

/**
 * Keeps only the stored values that make sense: an unknown board theme or
 * piece set (from a hand-edited file or a future version) would otherwise
 * crash every board. Nested defaults are merged field by field, so a save
 * with half a `simul` block keeps the other half's defaults. Unknown keys are
 * passed through so a save from a newer version loses nothing.
 */
export function sanitizeSettings(
  stored: unknown,
): Partial<PersistedSettings> & Record<string, unknown> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const input = stored as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key in CHECKS) {
      const check = CHECKS[key as keyof typeof CHECKS] as Check<unknown>;
      if (check(value)) out[key] = value;
    } else if (key === 'simul') {
      if (typeof value !== 'object' || value === null) continue;
      const simul = { ...DEFAULT_SETTINGS.simul };
      for (const [field, check] of Object.entries(SIMUL_CHECKS) as [
        keyof SimulPrefs,
        Check<unknown>,
      ][]) {
        const candidate = (value as Record<string, unknown>)[field];
        if (candidate !== undefined && check(candidate)) {
          (simul as Record<string, unknown>)[field] = candidate;
        }
      }
      out.simul = simul;
    } else if (key === 'installDismissedAt') {
      if (nullableNumber(0)(value)) out[key] = value;
    } else if (!(key in DEFAULT_SETTINGS)) {
      out[key] = value;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fields that moved to the progress store in version 4               */
/* ------------------------------------------------------------------ */

/** Learner-scoped values that lived here until 0.11 (settings version 3). */
export interface LegacyLearnerFields {
  lastBackupAt?: number | null;
  lastBackupAttempts?: number;
  tourDismissed?: boolean;
  lichessUsername?: string;
  chesscomUsername?: string;
}

const LEGACY_LEARNER_KEYS = [
  'lastBackupAt',
  'lastBackupAttempts',
  'tourDismissed',
  'lichessUsername',
  'chesscomUsername',
] as const;
/** Persisted once, read by nothing: dropped in version 4 (the lab's limit now lives under its own key). */
const DROPPED_KEYS = ['puzzleThemes', 'storageLimitBytes'] as const;

let legacyLearnerFields: LegacyLearnerFields | null = null;

/**
 * The learner fields found in a version-3 settings save, for the progress
 * store's migration (which runs after this module has loaded, since it
 * imports this one). Null when the settings were already version 4.
 */
export function takeLegacyLearnerFields(): LegacyLearnerFields | null {
  return legacyLearnerFields;
}

function pickLegacyLearnerFields(stored: Record<string, unknown>): LegacyLearnerFields {
  const picked: Record<string, unknown> = {};
  const check: Record<(typeof LEGACY_LEARNER_KEYS)[number], Check<unknown>> = {
    lastBackupAt: nullableNumber(0),
    lastBackupAttempts: numberIn(0, Number.MAX_SAFE_INTEGER),
    tourDismissed: isBoolean,
    lichessUsername: isString,
    chesscomUsername: isString,
  };
  for (const key of LEGACY_LEARNER_KEYS) {
    if (stored[key] !== undefined && check[key](stored[key])) picked[key] = stored[key];
  }
  return picked;
}

export const useSettings = create<SettingsState>()(
  persist<SettingsState, [], [], PersistedSettings>(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => {
        set({ ...DEFAULT_SETTINGS });
        void writeIsolationFlag(false);
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (stored, version): PersistedSettings => {
        const input =
          typeof stored === 'object' && stored !== null
            ? { ...(stored as Record<string, unknown>) }
            : {};
        if (version > SETTINGS_VERSION) {
          warnNewerSave(SETTINGS_STORAGE_KEY, version, SETTINGS_VERSION);
          return { ...DEFAULT_SETTINGS, ...sanitizeSettings(input) };
        }
        if (version < 4) {
          legacyLearnerFields = pickLegacyLearnerFields(input);
          for (const key of [...LEGACY_LEARNER_KEYS, ...DROPPED_KEYS]) delete input[key];
        }
        return { ...DEFAULT_SETTINGS, ...sanitizeSettings(input) };
      },
      merge: (persisted, current): SettingsState => ({
        ...current,
        ...sanitizeSettings(persisted),
      }),
      partialize: (state) => {
        const { update: _u, reset: _r, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: keepCorruptBlob(SETTINGS_STORAGE_KEY),
    },
  ),
);

rehydrateOnStorageChange(useSettings, SETTINGS_STORAGE_KEY);
