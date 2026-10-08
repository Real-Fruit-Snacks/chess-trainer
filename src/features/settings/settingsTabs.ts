import type { TabItem } from '@/components/ui';

/** The Settings page's tabs, in order. The first opens when a link names no other. */
export const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'play', label: 'Play', icon: 'play' },
  { id: 'engine', label: 'Engine', icon: 'chip' },
  { id: 'data', label: 'Sync & data', icon: 'sync' },
  { id: 'app', label: 'App', icon: 'device' },
] as const satisfies readonly TabItem<string>[];

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'appearance';

/**
 * The cards that links point at (`/settings#lichess`), each with the tab it is
 * on. A card's id is its link; a join link (`#sync=…`) is the sync card's.
 */
const CARD_TABS: Record<string, SettingsTab> = {
  display: 'appearance',
  sound: 'appearance',
  board: 'appearance',
  rating: 'play',
  'human-opponent': 'play',
  sync: 'data',
  lichess: 'data',
  backups: 'data',
  profiles: 'data',
  storage: 'data',
};

const isTab = (name: string): name is SettingsTab => SETTINGS_TABS.some((tab) => tab.id === name);

/** What a link's `#…` names: the card's id (`#sync=…` is the sync card's), or the bare name. */
const nameOf = (hash: string) => hash.replace(/^#/, '').split('=')[0] ?? '';

/** The tab a link opens (`#engine`, or the tab of the card `#lichess`); null for none. */
export function tabForHash(hash: string): SettingsTab | null {
  const name = nameOf(hash);
  if (isTab(name)) return name;
  return CARD_TABS[name] ?? null;
}

/** The card a link points at, to scroll to once its tab shows; null for a tab or nothing. */
export function cardForHash(hash: string): string | null {
  const name = nameOf(hash);
  return name in CARD_TABS ? name : null;
}

/** The link to a tab: none for the first, so `/settings` stays as it was. */
export const hashForTab = (tab: SettingsTab): string =>
  tab === DEFAULT_SETTINGS_TAB ? '' : `#${tab}`;
