import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ColorScheme = 'system' | 'light' | 'dark';
export type BoardTheme = 'brown' | 'green' | 'blue' | 'grey' | 'contrast';
export type PlayColor = 'white' | 'black' | 'random';
export type ReviewDepth = 'fast' | 'balanced' | 'thorough';
export type PieceSet = 'classic' | 'letters';
export type SoundTheme = 'standard' | 'soft';

/** Search depth per review setting. */
export const REVIEW_DEPTHS: Record<ReviewDepth, number> = { fast: 10, balanced: 13, thorough: 16 };

export interface SettingsState {
  colorScheme: ColorScheme;
  boardTheme: BoardTheme;
  /** Piece graphics: the classic figurines or the "Letters" tiles. */
  pieceSet: PieceSet;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  animations: boolean;
  sounds: boolean;
  /** 'soft' plays the same cues quieter and rounder. */
  soundTheme: SoundTheme;
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
  /** Query the Lichess tablebase API for positions with 7 or fewer pieces (network). */
  tablebase: boolean;
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
  animations: true,
  sounds: true,
  soundTheme: 'standard' as SoundTheme,
  autoQueen: false,
  analysisDepth: 18,
  analysisLines: 3,
  reviewDepth: 'balanced' as ReviewDepth,
  playLevel: 3,
  playColor: 'white' as PlayColor,
  playTimeControl: 'none',
  moveInput: false,
  playBlindfold: false,
  tablebase: false,
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
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => ({ ...DEFAULT_SETTINGS, ...(persisted as Partial<SettingsState>) }),
      partialize: (state) => {
        const { update: _u, reset: _r, ...rest } = state;
        return rest;
      },
    },
  ),
);
