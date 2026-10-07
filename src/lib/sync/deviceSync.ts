import { create } from 'zustand';
import { siteConfig } from '@/site.config';
import { useAnalyses } from '@/store/analyses';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { useGames } from '@/store/games';
import { ACTIVE_PROFILE_ID } from '@/store/profiles';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { baseEpoch, clearBase, loadBase, saveBase } from './base';
import { same } from './canonical';
import { mergeSnapshots, sameData, type SyncSnapshot, withDeviceFields } from './merge';
import { newSecret, phraseToSecret, secretToPhrase } from './phrase';
import { deleteVault, readVault, RelayError, writeVault } from './relayClient';
import { applySnapshot, readSnapshotJson, snapshotJson, takeSnapshot } from './snapshot';
import {
  deriveVaultKeys,
  fromBase64Url,
  openSnapshot,
  SealError,
  sealSnapshot,
  toBase64Url,
  type VaultKeys,
} from './vaultCrypto';

/**
 * Device sync: keeps a profile in step across devices through the relay, end
 * to end encrypted (see vaultCrypto.ts) and merged three ways (merge.ts).
 *
 * One run reads the vault (only "unchanged" when nothing moved), merges it
 * with this device's data over the base, puts the result into the stores and,
 * if the relay's copy lacks anything, writes it back under the version it read
 * — another device's write in between means read, merge and write again.
 * Runs start shortly after the app opens, a few seconds after something
 * changes here, when the device comes back online or the app back into view,
 * and every few minutes while it is on screen. Runs never overlap, in this tab
 * or across tabs.
 */

export type DeviceSyncPhase =
  | 'off'
  | 'idle'
  | 'syncing'
  | 'done'
  /** No connection: the next run waits for one. */
  | 'offline'
  /** The data outgrew what the relay keeps. */
  | 'too-large'
  /** Another device synced with a newer version of the app. */
  | 'newer'
  | 'failed';

export interface DeviceSyncStatus {
  phase: DeviceSyncPhase;
  error: string | null;
  /** What the last finished run did: brought changes in, sent them out. */
  last: { at: number; pulled: boolean; pushed: boolean } | null;
}

export const useDeviceSync = create<DeviceSyncStatus>()(() => ({
  phase: useDeviceSyncStore.getState().secret ? 'idle' : 'off',
  error: null,
  last: null,
}));

const setStatus = (patch: Partial<DeviceSyncStatus>) => useDeviceSync.setState(patch);

/** The relay this build syncs through. */
export const relayUrl = () => siteConfig.syncRelay;

/** Runs that met another device's write keep trying this many times before waiting for the next. */
const MAX_ROUNDS = 5;
/** After a change here, how soon it goes (more changes join it meanwhile). */
export const CHANGE_DELAY_MS = 8_000;
const START_DELAY_MS = 1_500;
const PERIODIC_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 1000;
const NETWORK_RETRY_MS = 2 * 60 * 1000;
const SERVER_RETRY_MS = 5 * 60 * 1000;

let cachedKeys: { secret: string; keys: Promise<VaultKeys> } | null = null;

/** The vault's keys for the stored secret (derived once). */
function keysFor(secret: string): Promise<VaultKeys> {
  if (cachedKeys?.secret !== secret) {
    cachedKeys = { secret, keys: deriveVaultKeys(fromBase64Url(secret)) };
  }
  return cachedKeys.keys;
}

/** While the stores take a merge, their changes are not changes to sync. */
let applying = false;

function apply(next: SyncSnapshot, current: SyncSnapshot): boolean {
  if (same(next, current)) return false;
  applying = true;
  try {
    applySnapshot(next, current);
  } finally {
    applying = false;
  }
  return true;
}

interface RemoteCopy {
  snapshot: SyncSnapshot;
  etag: string;
  generation: number;
}

/**
 * Reads the vault into a snapshot; null when it is gone. With the base and the
 * version it came from, an unchanged vault is not sent again. Throws what stops
 * the run.
 */
async function readRemote(
  keys: VaultKeys,
  agreed: { base: SyncSnapshot; etag: string; generation: number } | null,
): Promise<RemoteCopy | null> {
  const read = await readVault(relayUrl(), keys, agreed?.etag ?? null);
  if (read.status === 'missing') return null;
  if (read.status === 'unchanged') {
    return agreed
      ? { snapshot: agreed.base, etag: agreed.etag, generation: agreed.generation }
      : readRemote(keys, null);
  }
  const parsed = readSnapshotJson(await openSnapshot(keys, read.data));
  if (!parsed.ok) throw new SyncStop(parsed.newer ? 'newer' : 'failed', parsed.reason);
  return { snapshot: parsed.snapshot, etag: read.etag, generation: parsed.generation };
}

/** Ends a run with a phase of its own. */
class SyncStop extends Error {
  constructor(
    readonly phase: DeviceSyncPhase,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Merges with the vault and writes back what it lacks, from the version this
 * device last agreed with (none yet: no base either). Returns whether the
 * stores changed and whether the vault was written. Sync turned off meanwhile
 * (here, or in another tab) ends the run before it changes anything more.
 */
async function reconcile(
  keys: VaultKeys,
  secret: string,
): Promise<{ pulled: boolean; pushed: boolean }> {
  const store = useDeviceSyncStore;
  const on = () => store.getState().secret === secret;
  let pulled = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { etag, generation } = store.getState();
    const epoch = baseEpoch();
    const base = etag ? await loadBase() : null;
    const remote = await readRemote(keys, base && etag ? { base, etag, generation } : null);
    if (!on()) return { pulled, pushed: false };
    // The base was forgotten meanwhile (an import replaced the data): merge again without it.
    if (baseEpoch() !== epoch) continue;
    if (!remote) {
      // Deleted from another device (or unused for a year): sync ends here, the data stays.
      await stopSync('deleted');
      throw new SyncStop('off', 'The synced copy was deleted.');
    }
    if (remote.generation < generation) {
      // Merging an older copy would take what it lacks as deleted.
      throw new SyncStop('failed', OLDER_COPY);
    }
    const local = takeSnapshot();
    const merged = mergeSnapshots(base, local, remote.snapshot);
    pulled = apply(merged, local) || pulled;
    // This device now holds everything the vault had: that version is the base from here.
    await saveBase(remote.snapshot);
    if (!on()) return { pulled, pushed: false };
    store.getState().agreed(remote.etag, remote.generation);
    if (sameData(merged, remote.snapshot)) return { pulled, pushed: false };
    const next = remote.generation + 1;
    const sealed = await sealSnapshot(keys, snapshotJson(merged, next));
    const write = await writeVault(relayUrl(), keys, sealed, remote.etag);
    if (!on()) return { pulled, pushed: write.ok };
    if (write.ok) {
      if (baseEpoch() === epoch) await saveBase(merged);
      store.getState().agreed(write.etag, next);
      return { pulled, pushed: true };
    }
    // Another device wrote in between: read it and merge again.
  }
  throw new RelayError('busy', 'Other devices kept syncing at the same time.', 10_000);
}

const OLDER_COPY =
  'The sync service sent an older copy of the synced data than this device has seen, so nothing was merged. If this keeps happening, turn sync off on each device and turn it on again.';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Busy answers in a row: each waits twice as long as the last, up to the server retry. */
let busyStreak = 0;

function failed(err: unknown): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  // Turned off while the run was under way: nothing to report or retry.
  if (!useDeviceSyncStore.getState().secret) {
    setStatus({ phase: 'off', error: null });
    return;
  }
  const retry = (ms: number) => {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void syncNow();
    }, ms);
  };
  if (err instanceof SyncStop) {
    setStatus({ phase: err.phase, error: err.phase === 'off' ? null : err.message });
    return;
  }
  if (err instanceof RelayError) {
    if (err.kind === 'network') {
      setStatus({ phase: 'offline', error: null });
      retry(NETWORK_RETRY_MS);
    } else if (err.kind === 'too-large') {
      setStatus({ phase: 'too-large', error: err.message });
    } else if (err.kind === 'busy') {
      busyStreak++;
      setStatus({ phase: 'idle', error: null });
      retry(Math.min(SERVER_RETRY_MS, Math.max(err.retryAfterMs ?? 0, 1000 * 2 ** busyStreak)));
    } else {
      setStatus({ phase: 'failed', error: err.message });
      retry(SERVER_RETRY_MS);
    }
    return;
  }
  if (err instanceof SealError) {
    setStatus({ phase: 'failed', error: err.message });
    return;
  }
  setStatus({ phase: 'failed', error: err instanceof Error ? err.message : String(err) });
  retry(SERVER_RETRY_MS);
}

async function runOnce(): Promise<void> {
  const secret = useDeviceSyncStore.getState().secret;
  if (!secret || !relayUrl()) return;
  setStatus({ phase: 'syncing', error: null });
  const keys = await keysFor(secret);
  const result = await reconcile(keys, secret);
  busyStreak = 0;
  if (useDeviceSyncStore.getState().secret !== secret) return;
  setStatus({ phase: 'done', error: null, last: { at: Date.now(), ...result } });
}

/** Runs `task` unless another tab of this profile is syncing (that tab's run serves). */
async function exclusively(task: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    await task();
    return;
  }
  await locks.request(
    `chess-trainer:device-sync:${ACTIVE_PROFILE_ID}`,
    { ifAvailable: true },
    async (lock) => {
      if (lock) await task();
    },
  );
}

let running: Promise<void> | null = null;
let again = false;

/** Syncs now; a call during a run makes one more run follow it. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await exclusively(runOnce);
      } while (again);
    } catch (err) {
      failed(err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                         */
/* ------------------------------------------------------------------ */

let stopScheduling: (() => void) | null = null;

/**
 * Starts syncing on its own (and returns a function that stops it). Does
 * nothing while sync is off; calling it again while running changes nothing.
 */
export function startDeviceSync(): () => void {
  if (stopScheduling) return stopScheduling;
  if (!useDeviceSyncStore.getState().secret || !relayUrl()) return () => undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, task: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      task();
    }, ms);
    timers.add(timer);
    return timer;
  };
  const stale = () => {
    const last = useDeviceSyncStore.getState().lastSyncAt;
    return last === null || Date.now() - last > STALE_MS;
  };
  let pending: ReturnType<typeof setTimeout> | null = null;
  const onChange = () => {
    if (applying) return;
    if (pending) clearTimeout(pending);
    pending = later(CHANGE_DELAY_MS, () => {
      pending = null;
      void syncNow();
    });
  };
  const unsubscribe = [
    useProgress.subscribe(onChange),
    useRepertoire.subscribe(onChange),
    useAnalyses.subscribe(onChange),
    useGames.subscribe(onChange),
    // Turned off in another tab: this one stops too.
    useDeviceSyncStore.subscribe((state) => {
      if (!state.secret) {
        stopScheduling?.();
        setStatus({ phase: 'off', error: null, last: null });
      }
    }),
  ];
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === 'visible' && stale()) void syncNow();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const periodic = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, PERIODIC_MS);
  later(START_DELAY_MS, () => void syncNow());

  stopScheduling = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    clearInterval(periodic);
    for (const stop of unsubscribe) stop();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    stopScheduling = null;
  };
  return stopScheduling;
}

/* ------------------------------------------------------------------ */
/* Turning it on, joining, turning it off                             */
/* ------------------------------------------------------------------ */

export type SyncActionResult<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

function reasonOf(err: unknown): string {
  if (err instanceof RelayError || err instanceof SealError || err instanceof SyncStop) {
    return err.message;
  }
  return 'Something went wrong. Try again.';
}

/**
 * Turns sync on for this profile with a new recovery phrase: this device's
 * data goes to a new vault. Returns the phrase to show.
 */
export async function turnOnSync(): Promise<SyncActionResult<{ words: string[] }>> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const secret = newSecret();
      const keys = await deriveVaultKeys(secret);
      const local = takeSnapshot();
      const write = await writeVault(
        relayUrl(),
        keys,
        await sealSnapshot(keys, snapshotJson(local, 1)),
        null,
      );
      // A vault by that name already (never seen in practice): another secret.
      if (!write.ok) continue;
      await saveBase(local);
      useDeviceSyncStore.getState().turnOn(toBase64Url(secret), write.etag, 1);
      setStatus({
        phase: 'done',
        error: null,
        last: { at: Date.now(), pulled: false, pushed: true },
      });
      startDeviceSync();
      return { ok: true, words: await secretToPhrase(secret) };
    }
    return { ok: false, reason: 'The sync service could not make a new vault. Try again.' };
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
}

/**
 * Joins the sync another device turned on, from its recovery phrase.
 * `keep`: what happens to this device's own data — 'merge' joins it with the
 * synced data, 'replace' sets it aside for the synced data.
 */
export async function joinSync(
  phrase: string,
  keep: 'merge' | 'replace',
): Promise<SyncActionResult> {
  const check = await phraseToSecret(phrase);
  if (!check.ok) return { ok: false, reason: check.reason };
  try {
    const keys = await deriveVaultKeys(check.secret);
    const remote = await readRemote(keys, null);
    if (!remote) {
      return {
        ok: false,
        reason:
          'Nothing is synced under this phrase. Check the words, or turn sync on from the other device first.',
      };
    }
    const local = takeSnapshot();
    const merged =
      keep === 'replace'
        ? withDeviceFields(remote.snapshot, local)
        : mergeSnapshots(null, local, remote.snapshot);
    apply(merged, local);
    await saveBase(remote.snapshot);
    useDeviceSyncStore.getState().turnOn(toBase64Url(check.secret), remote.etag, remote.generation);
    setStatus({
      phase: 'done',
      error: null,
      last: { at: Date.now(), pulled: true, pushed: false },
    });
    startDeviceSync();
    // What this device adds goes up with the first run.
    if (!sameData(merged, remote.snapshot)) void syncNow();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
}

/** Stops syncing on this device: the phrase is forgotten here, the data and the vault stay. */
export async function stopSync(because?: 'deleted'): Promise<void> {
  stopScheduling?.();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  busyStreak = 0;
  cachedKeys = null;
  useDeviceSyncStore.getState().turnOff(because);
  await clearBase();
  setStatus({ phase: 'off', error: null, last: null });
}

/** Deletes the synced copy from the relay and stops syncing here; other devices stop at their next sync. */
export async function deleteSyncedCopy(): Promise<SyncActionResult> {
  const secret = useDeviceSyncStore.getState().secret;
  if (!secret) return { ok: true };
  try {
    await deleteVault(relayUrl(), await keysFor(secret));
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
  await stopSync();
  return { ok: true };
}

/** The recovery phrase of the sync this device is in, to show again. */
export async function currentPhrase(): Promise<string[] | null> {
  const secret = useDeviceSyncStore.getState().secret;
  return secret ? secretToPhrase(fromBase64Url(secret)) : null;
}

/** The link that joins another device: opened there, Settings offers to join with the phrase. */
export function joinLink(words: readonly string[]): string {
  return `${siteConfig.siteUrl}settings#sync=${words.join('-')}`;
}

/**
 * After an import replaced this device's data, the next sync joins it with the
 * synced data rather than taking what the import left out as deletions.
 */
export async function forgetSyncBase(): Promise<void> {
  if (!useDeviceSyncStore.getState().secret) return;
  await clearBase();
  void syncNow();
}
