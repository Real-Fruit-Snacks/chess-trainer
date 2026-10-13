/**
 * The parts of a profile that sync between devices, each of which a device
 * can keep to itself (Settings → Sync between devices → What syncs on this
 * device). Kept apart from the merge code so the device-sync store can check
 * a saved list without loading it.
 */
export const SYNC_PARTS = ['progress', 'repertoire', 'analyses', 'games', 'settings'] as const;
export type SyncPart = (typeof SYNC_PARTS)[number];

export const isSyncPart = (value: unknown): value is SyncPart =>
  typeof value === 'string' && (SYNC_PARTS as readonly string[]).includes(value);
