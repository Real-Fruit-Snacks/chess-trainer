import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ColorScheme = 'system' | 'light' | 'dark';
export type BoardTheme = 'brown' | 'green' | 'blue' | 'grey';
export type PlayColor = 'white' | 'black' | 'random';

export interface SettingsState {
  colorScheme: ColorScheme;
  boardTheme: BoardTheme;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  animations: boolean;
  sounds: boolean;
  /** Promote to a queen without asking. */
  autoQueen: boolean;
  /** Target depth for the analysis board. */
  analysisDepth: number;
  /** Number of engine lines (MultiPV) on the analysis board. */
  analysisLines: number;
  playLevel: number;
  playColor: PlayColor;
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
  showCoordinates: true,
  showLegalMoves: true,
  animations: true,
  sounds: true,
  autoQueen: false,
  analysisDepth: 18,
  analysisLines: 3,
  playLevel: 3,
  playColor: 'white' as PlayColor,
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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { update: _u, reset: _r, ...rest } = state;
        return rest;
      },
    },
  ),
);
