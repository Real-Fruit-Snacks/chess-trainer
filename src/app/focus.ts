import { create } from 'zustand';

/**
 * Focus mode: while a game against the engine is on and the setting is
 * enabled, the Play page asks the shell to hide its header and navigation.
 * Not persisted — it is on only while the page that asked for it is showing.
 */
export const useFocus = create<{ active: boolean; set: (active: boolean) => void }>((set) => ({
  active: false,
  set: (active) => set({ active }),
}));
