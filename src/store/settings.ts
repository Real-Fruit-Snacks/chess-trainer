import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistStorage';

export type ColorScheme = 'system' | 'light' | 'dark' | 'black';
export type BoardTheme =
  'brown' | 'green' | 'blue' | 'grey' | 'purple' | 'olive' | 'ice' | 'walnut' | 'contrast';
export type PlayColor = 'white' | 'black' | 'random';
export type ReviewDepth = 'fast' | 'balanced' | 'thorough';
export type PieceSet = 'classic' | 'letters' | 'pixel' | 'modern';
export type SoundTheme = 'standard' | 'soft' | 'retro';
/** How moves are written: "Nf3" or with a piece figurine. */
export type Notation = 'figurine' | 'letters';
/** How a piece is moved on the board. */
export type MoveMethod = 'either' | 'tap' | 'drag';
/** The mark under a dragged piece. */
export type DragTarget = 'circle' | 'square' | 'none';
/** Captured material beside the player bars. */
export type MaterialDisplay = 'difference' | 'count' | 'off';
/** The player's colour across a simul: the same on every board, or alternating. */
export type SimulColor = 'white' | 'black' | 'alternate';

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
  /** Hide the header and navigation while a game against the engine is on. */
  playFocus: boolean;
  simul: SimulPrefs;
  sounds: boolean;
  /**
   * Which set of cues plays: the standard set, the same cues quieter and
   * rounder ('soft'), or the 8-bit set ('retro').
   */
  soundTheme: SoundTheme;
  /** Master volume for the sound effects, 0–1. */
  soundVolume: number;
  /** Short vibrations on moves, solves and mistakes (phones with a vibration motor). */
  haptics: boolean;
  /** Show the number of due reviews on the installed app's icon (Badging API). */
  appBadge: boolean;
  /** When the progress was last exported or shared, for the backup reminder. */
  lastBackupAt: number | null;
  /** Rated puzzle attempts at the time of the last backup. */
  lastBackupAttempts: number;
  /** Promote to a queen without asking. */
  autoQueen: boolean;
  /** Target depth for the analysis board. */
  analysisDepth: number;
  /** Number of engine lines (MultiPV) on the analysis board. */
  analysisLines: number;
  /** How deeply the game review searches each position. */
  reviewDepth: ReviewDepth;
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
  explorerDatabase: 'masters' | 'lichess';
  /**
   * Experimental: run the multi-threaded engine build. Needs cross-origin
   * isolation, which the service worker switches on at the next reload.
   */
  engineThreads: boolean;
  /** Last usernames used to import games (kept so the field is prefilled). */
  lichessUsername: string;
  chesscomUsername: string;
  /** The first-run welcome card on the Home page has been dismissed. */
  tourDismissed: boolean;
  /** Automatically load the next puzzle after a solve. */
  puzzleAutoNext: boolean;
  /** Optional theme filter for puzzle practice; empty = all themes. */
  puzzleThemes: string[];

  update: (patch: Partial<Omit<SettingsState, 'update' | 'reset'>>) => void;
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
  lastBackupAt: null as number | null,
  lastBackupAttempts: 0,
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
  explorerDatabase: 'masters' as 'masters' | 'lichess',
  engineThreads: false,
  lichessUsername: '',
  chesscomUsername: '',
  tourDismissed: false,
  puzzleAutoNext: false,
  puzzleThemes: [] as string[],
};

export const SETTINGS_STORAGE_KEY = 'chess-trainer:settings';

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted) => ({ ...DEFAULT_SETTINGS, ...(persisted as Partial<SettingsState>) }),
      partialize: (state) => {
        const { update: _u, reset: _r, ...rest } = state;
        return rest;
      },
    },
  ),
);
