import { create } from 'zustand';
import { toast } from '@/components/ui/toastStore';
import { quietly, repersistAll, storageRefusals, storageUsage } from '@/lib/persistStorage';
import { siteConfig } from '@/site.config';
import { useAnalyses } from '@/store/analyses';
import type { BackupShape } from '@/store/backupSchema';
import { type DeviceSyncState, useDeviceSyncStore } from '@/store/deviceSync';
import { useGames } from '@/store/games';
import { ACTIVE_PROFILE_ID } from '@/store/profiles';
import { emptyProgress, useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import {
  DEFAULT_SETTINGS,
  LEARNER_SETTING_KEYS,
  learnerSettingsOf,
  useSettings,
} from '@/store/settings';
import {
  baseMark,
  dropCopies,
  forgetBase,
  loadCopy,
  saveCopy,
  type SyncCopy,
  type SyncWrites,
} from './base';
import { same } from './canonical';
import {
  addChanges,
  changesOrNull,
  type SyncChanges,
  syncChanges,
  type SyncCounts,
  syncTotals,
} from './counts';
import {
  baseOf,
  mergeParts,
  mergeSnapshots,
  sameData,
  type SyncBase,
  type SyncSnapshot,
  withDeviceFields,
} from './merge';
import { SYNC_PARTS, type SyncPart } from './parts';
import { newSecret, phraseToSecret, secretToPhrase } from './phrase';
import { randomId } from './randomId';
import { deleteVault, readVault, RelayError, writeVault } from './relayClient';
import {
  applySnapshot,
  backupSnapshot,
  emptySyncSnapshot,
  localSnapshot,
  noteRemoved,
  readSnapshotJson,
  shareHistory,
  snapshotJson,
  takeSnapshot,
  unsavedData,
  withWrite,
} from './snapshot';
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
 *
 * The base must be exactly the version both sides grew from, or a counter's
 * increments are added twice and data looks deleted. So:
 * - the copy of the vault is saved before the stores change, and the
 *   agreement on that copy and the stores then change together, the agreement
 *   first, with nothing waited for in between (a closed page leaves both
 *   before or both after);
 * - a write whose answer never arrived (a dropped connection, a closed app)
 *   stays noted as pending; the vault records each device's latest write, so
 *   the next run learns whether it went through, and if it did, measures
 *   against what it wrote;
 * - a merge, agreement or note that storage refuses (a full disk) is taken
 *   back, nothing is agreed on top of data that is only in memory, and the
 *   sync waits for room instead of trying again after every change;
 * - when storage fails in a way that leaves it holding neither side, the base
 *   is forgotten, in every tab (base.ts): the next merge joins both sides.
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
  /**
   * What the last finished run did: what it brought in from the other devices
   * and what it sent them (null for nothing).
   */
  last: SyncExchange | null;
}

/** What one run moved: changes brought in here, and changes sent to the other devices. */
export interface SyncExchange {
  at: number;
  brought: SyncChanges | null;
  sent: SyncChanges | null;
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
/** Once scheduling starts (the app opening, sync turned on or joined), how soon the first run goes. */
export const START_DELAY_MS = 1_500;
const PERIODIC_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 1000;
/**
 * What a sync moved stays reported over the syncs that move nothing for this
 * long (the one that follows turning sync on, say), while "Synced just now"
 * still covers both.
 */
const REPORT_KEPT_MS = 60 * 1000;
const NETWORK_RETRY_MS = 2 * 60 * 1000;
const SERVER_RETRY_MS = 5 * 60 * 1000;

export const STORAGE_FULL =
  'This device’s storage is full. Remove old analyses or games here, and syncing carries on.';

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

/** Puts `next` into the stores (`current` is what they hold); false when that changes nothing. */
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

/**
 * Puts `next` into the stores, all of it or nothing: if storage refuses any of
 * it (a full disk), the stores go back to `current` — what storage still holds.
 * Quietly: storage holds just what it held, and the sync says itself why it
 * waits. 'lost': even taking it back was refused, so the stores keep this
 * device's data in memory, and storage reports that as for any change (it is
 * saved as soon as there is room).
 */
function applySaved(
  next: SyncSnapshot,
  current: SyncSnapshot,
): 'same' | 'changed' | 'no-room' | 'lost' {
  const refused = storageRefusals();
  if (!quietly(() => apply(next, current))) return 'same';
  if (storageRefusals() === refused) {
    noteRemoved(next, current);
    return 'changed';
  }
  const before = storageRefusals();
  quietly(() => apply(current, next));
  if (storageRefusals() === before) return 'no-room';
  repersistAll();
  return 'lost';
}

/**
 * A merge that did not fit here: the vault version it came from, and how much
 * storage the app used then. Syncing waits — rather than trying the same
 * merge again after every change — until the learner makes room (less is
 * used), the vault changes (another device may have made room), or the
 * learner asks (_Sync now_).
 */
let noRoom: { etag: string; bytes: number } | null = null;

/**
 * Notes that a merge of vault version `etag` did not fit, says so when
 * `announce` (the first time, or when the learner asked), and returns what
 * ends the run.
 */
function noRoomHere(etag: string, announce: boolean): SyncStop {
  if (announce) toast(STORAGE_FULL, { tone: 'warning', duration: 12_000 });
  noRoom = { etag, bytes: storageUsage().bytes };
  return storageFull();
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

interface RemoteCopy {
  snapshot: SyncSnapshot;
  writes: SyncWrites;
  etag: string;
  generation: number;
  /** The id of the copy kept of it (base.ts); null until one is saved. */
  copy: string | null;
}

interface Agreed extends SyncCopy {
  etag: string;
  generation: number;
  copy: string;
}

/**
 * Reads the vault; null when it is gone. With the version agreed last (and
 * its copy), an unchanged vault is not sent again. With `known`, another
 * version (one whose merge did not fit), 'unchanged' says the vault is still
 * at it. Throws what stops the run.
 */
async function readRemote(
  keys: VaultKeys,
  agreed: Agreed | null,
  known = agreed?.etag ?? null,
): Promise<RemoteCopy | 'unchanged' | null> {
  const read = await readVault(relayUrl(), keys, known);
  if (read.status === 'missing') return null;
  if (read.status === 'unchanged') {
    if (known === null) throw new RelayError('server', 'The sync service sent no data.');
    return agreed?.etag === known ? { ...agreed } : 'unchanged';
  }
  const parsed = readSnapshotJson(await openSnapshot(keys, read.data));
  if (!parsed.ok) throw new SyncStop(parsed.newer ? 'newer' : 'failed', parsed.reason);
  return {
    snapshot: parsed.snapshot,
    writes: parsed.writes,
    etag: read.etag,
    generation: parsed.generation,
    copy: null,
  };
}

/** The agreed version and its copy, unless the base was forgotten since (or the copy is gone). */
async function agreedCopy(state: DeviceSyncState, mark: string): Promise<Agreed | null> {
  if (state.mark !== mark || !state.etag || !state.base) return null;
  const copy = await loadCopy(state.base);
  if (!copy) return null;
  return { ...copy, etag: state.etag, generation: state.generation, copy: state.base };
}

const storageFull = () => new SyncStop('failed', STORAGE_FULL);

/** The store's agreement as it stands, to put back if what follows it does not fit. */
function agreementOf(state: DeviceSyncState) {
  const { etag, generation, base, mark, pending, lastSyncAt } = state;
  return { etag, generation, base, mark, pending, lastSyncAt };
}

/** Notes settings the learner changed here, until they reach the vault (see `changedSettings`). */
function noteSettings(changed: Record<string, unknown>): void {
  const store = useDeviceSyncStore;
  quietly(() =>
    store.setState({ changedSettings: { ...store.getState().changedSettings, ...changed } }),
  );
}

/**
 * After an agreement: the settings changes noted here that `vault` holds, or
 * that a merge has replaced since, are no longer news.
 */
function settleSettings(vault: SyncSnapshot): void {
  const store = useDeviceSyncStore;
  const noted = store.getState().changedSettings;
  const now = useSettings.getState() as unknown as Record<string, unknown>;
  const sent = vault.settings as Record<string, unknown>;
  const left = Object.fromEntries(
    Object.entries(noted).filter(
      ([key, value]) => same(value, now[key]) && !same(value, sent[key]),
    ),
  );
  if (Object.keys(left).length < Object.keys(noted).length) {
    quietly(() => store.setState({ changedSettings: left }));
  }
}

/** `merged`, with the parts in `off` as `kept` has them. */
function keepParts(
  merged: SyncSnapshot,
  kept: SyncSnapshot,
  off: ReadonlySet<SyncPart>,
): SyncSnapshot {
  const out = { ...merged };
  for (const part of off) (out as Record<SyncPart, unknown>)[part] = kept[part];
  return out;
}

/**
 * For the copy agreed next: what each part this device keeps to itself last
 * shared with the vault — what the copy had parked already, or, for a part
 * kept here since, the copy's own version of it (null when there is no copy).
 */
function parkedFor(off: ReadonlySet<SyncPart>, copy: SyncCopy | null): Partial<SyncBase> {
  const parked: Partial<SyncBase> = {};
  for (const part of off) {
    const was = copy?.parked && part in copy.parked ? copy.parked[part] : copy?.snapshot[part];
    (parked as Record<SyncPart, unknown>)[part] = was ?? null;
  }
  return parked;
}

/**
 * The base of a merge, part by part: for a part this device syncs, what it
 * and the vault last shared — the copy's version, or, for a part this device
 * kept to itself until now, the version they shared before it did. A part
 * with no version in common merges as a device joining does (see joinSync):
 * progress that shares history with the vault's joins with no base, progress
 * that shares none adds up from nothing.
 */
function baseFor(
  copy: SyncCopy | null,
  off: ReadonlySet<SyncPart>,
  local: SyncSnapshot,
  remote: SyncSnapshot,
): { base: SyncBase; independent: boolean } {
  const base = baseOf(null);
  let independent = false;
  if (!copy) return { base, independent };
  for (const part of SYNC_PARTS) {
    if (off.has(part)) continue;
    const parked = copy.parked && part in copy.parked ? copy.parked[part] : undefined;
    if (parked === undefined) {
      (base as Record<SyncPart, unknown>)[part] = copy.snapshot[part];
    } else if (parked !== null) {
      (base as Record<SyncPart, unknown>)[part] = parked;
    } else if (part === 'progress' && !shareHistory(local, remote)) {
      base.progress = emptyProgress();
      independent = true;
    }
  }
  return { base, independent };
}

/**
 * Merges with the vault and writes back what it lacks. Returns what the
 * stores took in and what the vault was sent. Sync turned off meanwhile (here,
 * or in another tab) ends the run before it changes anything more.
 */
async function reconcile(
  keys: VaultKeys,
  secret: string,
  asked: boolean,
): Promise<Omit<SyncExchange, 'at'>> {
  const store = useDeviceSyncStore;
  const on = () => store.getState().secret === secret;
  let brought: SyncChanges | null = null;
  // A merge that did not fit waits until there is more room, the vault changes, or the learner
  // asks: until then the run only asks whether the vault is still at that version.
  const paused = noRoom && !asked && storageUsage().bytes >= noRoom.bytes ? noRoom.etag : null;
  // Said once a pause (it may begin at any step of a run), and again whenever asked.
  const announce = asked || noRoom === null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const start = store.getState();
    const device = start.device ?? '';
    const mark = baseMark();
    // The parts this device keeps to itself: the vault keeps its own of them, and so does it.
    const off = new Set(start.off);
    // Nothing else moved the agreement, and the base was not forgotten, since `start`.
    const unmoved = () => {
      const now = store.getState();
      return (
        on() &&
        baseMark() === mark &&
        now.etag === start.etag &&
        now.base === start.base &&
        now.pending?.copy === start.pending?.copy
      );
    };
    const agreed = await agreedCopy(start, mark);
    let remote: Awaited<ReturnType<typeof readRemote>>;
    try {
      remote = await readRemote(keys, agreed, round === 0 && paused ? paused : agreed?.etag);
    } catch (err) {
      // Paused for room, a failed look at the vault changes nothing: room is still the reason.
      if (round === 0 && paused && err instanceof RelayError && err.kind === 'network') {
        throw storageFull();
      }
      throw err;
    }
    if (remote === 'unchanged') throw storageFull();
    if (!on()) return { brought, sent: null };
    if (!remote) {
      // Deleted from another device (or unused for a year): sync ends here, the data stays.
      await stopSync('deleted');
      throw new SyncStop('off', 'The synced copy was deleted.');
    }
    if (remote.generation < start.generation) {
      // Merging an older copy would take what it lacks as deleted.
      throw new SyncStop('failed', OLDER_COPY);
    }

    let shared: SyncCopy | null = agreed;
    const pending = start.mark === mark ? start.pending : null;
    if (pending && (remote.writes[device] ?? 0) >= pending.generation) {
      // A write whose answer never came went through: the vault and this device both hold
      // what it wrote, so that is what both grew from.
      shared = await loadCopy(pending.copy);
    }
    // The copy of the vault as read is kept before anything here changes, with what the parts
    // kept here last shared. The agreed copy serves again while the vault and those are the same.
    const parked = parkedFor(off, shared);
    let remoteCopy = remote.copy;
    if (remoteCopy === null || !same(agreed?.parked ?? {}, parked)) {
      remoteCopy = randomId();
      await saveCopy(remoteCopy, { snapshot: remote.snapshot, writes: remote.writes, parked });
    }

    // From here to the agreement nothing is waited for: the stores and the base move together.
    if (!on()) return { brought, sent: null };
    if (!unmoved()) continue;
    if (unsavedData()) throw storageFull();
    const local = localSnapshot();
    const { base, independent } = baseFor(shared, off, local, remote.snapshot);
    const merged = mergeParts(base, local, remote.snapshot, {
      independent,
      // Read with `local`: a change made while the vault was read is in both.
      changedHere: store.getState().changedSettings,
    });
    // The parts kept here stay as each side has them.
    const toVault = keepParts(merged, remote.snapshot, off);
    const toStores = keepParts(merged, local, off);
    // The agreement first: if it does not fit, nothing else has changed.
    const previous = agreementOf(store.getState());
    let applied: ReturnType<typeof applySaved>;
    try {
      const refused = storageRefusals();
      quietly(() =>
        store.getState().agreed({
          etag: remote.etag,
          generation: remote.generation,
          base: remoteCopy,
          mark,
        }),
      );
      if (storageRefusals() !== refused) {
        quietly(() => store.setState(previous));
        throw noRoomHere(remote.etag, announce);
      }
      applied = applySaved(toStores, local);
    } catch (err) {
      if (err instanceof SyncStop) throw err;
      // Storage failed some other way part-way through: what it holds may be neither side now.
      // The agreement goes back first (a small write), then the stores, and the next merge
      // has no base either way.
      try {
        quietly(() => store.setState(previous));
      } catch {
        // The base is forgotten below.
      }
      try {
        quietly(() => apply(local, takeSnapshot()));
      } catch {
        // The base is forgotten below.
      }
      try {
        forgetBase();
      } catch {
        // Its copies go even so (see `forgetBase`).
      }
      throw err;
    }
    if (applied === 'no-room' || applied === 'lost') {
      const before = storageRefusals();
      quietly(() => store.setState(previous));
      // What storage holds no longer fits any base (or its agreement could not be put back).
      if (applied === 'lost' || storageRefusals() !== before) forgetBase();
      throw noRoomHere(remote.etag, announce);
    }
    noRoom = null;
    if (applied === 'changed') {
      brought = addChanges(brought, changesOrNull(syncChanges(local, toStores)));
    }
    void dropCopies(ACTIVE_PROFILE_ID, [remoteCopy]);
    if (sameData(toVault, remote.snapshot)) {
      settleSettings(toVault);
      return { brought, sent: null };
    }

    const next = remote.generation + 1;
    const writes = withWrite(remote.writes, device, next);
    const mergedCopy = randomId();
    await saveCopy(mergedCopy, { snapshot: toVault, writes, parked });
    const sealed = await sealSnapshot(keys, snapshotJson(toVault, next, writes));
    if (!on()) return { brought, sent: null };
    if (baseMark() !== mark || store.getState().base !== remoteCopy) continue;
    // A write is sent only once the note of it is stored: its answer may never come.
    const unsent = storageRefusals();
    quietly(() => store.getState().sending({ generation: next, copy: mergedCopy }));
    if (storageRefusals() !== unsent) {
      quietly(() => store.getState().sending(null));
      throw noRoomHere(remote.etag, announce);
    }
    const write = await writeVault(relayUrl(), keys, sealed, remote.etag);
    const sent = () => changesOrNull(syncChanges(remote.snapshot, toVault));
    if (!on()) return { brought, sent: write.ok ? sent() : null };
    const noted = store.getState().pending?.copy === mergedCopy;
    if (write.ok) {
      // Forgotten meanwhile (an import): the next run measures against nothing instead.
      if (noted && baseMark() === mark) {
        store.getState().agreed({ etag: write.etag, generation: next, base: mergedCopy, mark });
        void dropCopies(ACTIVE_PROFILE_ID, [mergedCopy]);
      }
      settleSettings(toVault);
      return { brought, sent: sent() };
    }
    // Another device wrote first, so this write did not happen: read it, merge and write again.
    if (noted) store.getState().sending(null);
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
      // Offline waits for the connection; online, the relay itself could not be reached.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus(
        offline ? { phase: 'offline', error: null } : { phase: 'failed', error: err.message },
      );
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

/** What runs moved: changes brought in, changes sent. */
type Moved = Omit<SyncExchange, 'at'>;
const NOTHING_MOVED: Moved = { brought: null, sent: null };

/**
 * One run. `earlier`: what the runs before it in the same sync moved (a run
 * asked for during a run follows it), reported with its own. Returns the two
 * together.
 */
async function runOnce(asked: boolean, earlier: Moved = NOTHING_MOVED): Promise<Moved> {
  const secret = useDeviceSyncStore.getState().secret;
  if (!secret || !relayUrl()) return earlier;
  // Data only in memory is not agreed on: syncing waits until it is saved.
  if (unsavedData()) throw storageFull();

  setStatus({ phase: 'syncing', error: null });
  const keys = await keysFor(secret);
  const result = await reconcile(keys, secret, asked);
  busyStreak = 0;
  if (useDeviceSyncStore.getState().secret !== secret) return earlier;
  const moved = {
    brought: addChanges(earlier.brought, result.brought),
    sent: addChanges(earlier.sent, result.sent),
  };
  const now = Date.now();
  const previous = useDeviceSync.getState().last;
  const keep =
    !moved.brought &&
    !moved.sent &&
    previous !== null &&
    (previous.brought !== null || previous.sent !== null) &&
    now - previous.at < REPORT_KEPT_MS;
  setStatus({ phase: 'done', error: null, last: keep ? previous : { at: now, ...moved } });
  return moved;
}

/**
 * Runs `task` unless another tab of this profile is syncing (that tab's run
 * serves) — or, with `wait`, once no other run is under way, here or there.
 */
async function exclusively(task: () => Promise<void>, wait = false): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    await task();
    return;
  }
  await locks.request(
    `chess-trainer:device-sync:${ACTIVE_PROFILE_ID}`,
    { ifAvailable: !wait },
    async (lock) => {
      if (lock) await task();
    },
  );
}

let running: Promise<void> | null = null;
let again = false;
let askedAgain = false;

/**
 * Syncs now; a call during a run makes one more run follow it. `asked`: the
 * learner asked (_Sync now_), so a merge that did not fit is tried again even
 * though no room was made.
 */
export function syncNow({ asked = false }: { asked?: boolean } = {}): Promise<void> {
  if (running) {
    again = true;
    askedAgain ||= asked;
    return running;
  }
  // A retry waiting after a failure is this run.
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  running = (async () => {
    let ask = asked;
    let moved = NOTHING_MOVED;
    try {
      do {
        again = false;
        const thisRun = ask;
        await exclusively(async () => {
          moved = await runOnce(thisRun, moved);
        });
        ask = askedAgain;
        askedAgain = false;
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
    // The learner's settings: the device's own (the engine build, the install prompt) stay here.
    useSettings.subscribe((state, previous) => {
      const changed = LEARNER_SETTING_KEYS.filter((key) => !same(state[key], previous[key]));
      if (changed.length === 0 || applying) return;
      noteSettings(Object.fromEntries(changed.map((key) => [key, state[key]])));
      onChange();
    }),
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
/* Turning it on, joining, importing, turning it off                  */
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
  if (unsavedData()) return { ok: false, reason: STORAGE_FULL };
  noRoom = null;
  // The synced profile names its history, so a device or backup sharing it is known as such.
  if (useProgress.getState().lineage.length === 0) useProgress.setState({ lineage: [randomId()] });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const secret = newSecret();
      const keys = await deriveVaultKeys(secret);
      const device = randomId();
      // This device's data, but for the parts it keeps to itself: those start the vault empty.
      const off = new Set(useDeviceSyncStore.getState().off);
      const shared = keepParts(localSnapshot(), emptySyncSnapshot(), off);
      const writes = withWrite({}, device, 1);
      const write = await writeVault(
        relayUrl(),
        keys,
        await sealSnapshot(keys, snapshotJson(shared, 1, writes)),
        null,
      );
      // A vault by that name already (never seen in practice): another secret.
      if (!write.ok) continue;
      const copy = randomId();
      await saveCopy(copy, { snapshot: shared, writes, parked: parkedFor(off, null) });
      useDeviceSyncStore.getState().turnOn({
        secret: toBase64Url(secret),
        device,
        etag: write.etag,
        generation: 1,
        base: copy,
        mark: baseMark(),
      });
      void dropCopies(ACTIVE_PROFILE_ID, [copy]);
      // Settings as they come out of the box are no news: those changed from them are counted.
      const fresh = { ...emptySyncSnapshot(), settings: learnerSettingsOf(DEFAULT_SETTINGS) };
      setStatus({
        phase: 'done',
        error: null,
        last: { at: Date.now(), brought: null, sent: changesOrNull(syncChanges(fresh, shared)) },
      });
      startDeviceSync();
      return { ok: true, words: await secretToPhrase(secret) };
    }
    return { ok: false, reason: 'The sync service could not make a new vault. Try again.' };
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
}

const NO_ROOM =
  'This device does not have room for the synced data. Remove old analyses or games here, then try again.';

/** What joining brought: the changes to this device's data, and what it now holds. */
export interface JoinResult {
  brought: SyncChanges | null;
  totals: SyncCounts;
}

/**
 * Joins the sync another device turned on, from its recovery phrase.
 * `keep`: what happens to this device's own data — 'merge' joins it with the
 * synced data, 'replace' sets it aside for the synced data.
 */
export async function joinSync(
  phrase: string,
  keep: 'merge' | 'replace',
): Promise<SyncActionResult<JoinResult>> {
  const check = await phraseToSecret(phrase);
  if (!check.ok) return { ok: false, reason: check.reason };
  if (unsavedData()) return { ok: false, reason: STORAGE_FULL };
  try {
    const keys = await deriveVaultKeys(check.secret);
    const remote = await readRemote(keys, null);
    // Without a version to compare with, "unchanged" is no answer (readVault refuses it).
    if (remote === 'unchanged') throw new RelayError('server', 'The sync service sent no data.');
    if (!remote) {
      return {
        ok: false,
        reason:
          'Nothing is synced under this phrase. Check the words, or turn sync on from the other device first.',
      };
    }
    // The parts this device keeps to itself have shared nothing with the vault yet.
    const off = new Set(useDeviceSyncStore.getState().off);
    const copy = randomId();
    await saveCopy(copy, {
      snapshot: remote.snapshot,
      writes: remote.writes,
      parked: parkedFor(off, null),
    });
    // Turned on meanwhile, in another tab.
    if (useDeviceSyncStore.getState().secret) {
      return { ok: false, reason: 'This device syncs already.' };
    }
    if (unsavedData()) return { ok: false, reason: STORAGE_FULL };
    const local = localSnapshot();
    const merged = keepParts(
      keep === 'replace'
        ? withDeviceFields(remote.snapshot, local)
        : shareHistory(local, remote.snapshot)
          ? mergeSnapshots(null, local, remote.snapshot)
          : mergeSnapshots(emptySyncSnapshot(), local, remote.snapshot, { independent: true }),
      local,
      off,
    );
    const applied = applySaved(merged, local);
    if (applied === 'no-room' || applied === 'lost') {
      // Sync is not on yet: no base to forget, and what storage holds is this device's own.
      return { ok: false, reason: NO_ROOM };
    }
    noRoom = null;
    useDeviceSyncStore.getState().turnOn({
      secret: toBase64Url(check.secret),
      device: randomId(),
      etag: remote.etag,
      generation: remote.generation,
      base: copy,
      mark: baseMark(),
    });
    void dropCopies(ACTIVE_PROFILE_ID, [copy]);
    const brought = changesOrNull(syncChanges(local, merged));
    setStatus({ phase: 'done', error: null, last: { at: Date.now(), brought, sent: null } });
    startDeviceSync();
    // What this device adds goes up with the first run.
    if (!sameData(keepParts(merged, remote.snapshot, off), remote.snapshot)) void syncNow();
    return { ok: true, brought, totals: syncTotals(merged, off) };
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
}

const IMPORT_NEEDS_SYNC =
  'With sync between devices on, this device syncs before it adds a backup, and that did not work:';

/**
 * With sync on, a backup joins this device's data instead of replacing it —
 * nothing done here since the last sync is lost — as joining a device does:
 * a backup of this profile (it shares history) adds what it holds beyond it,
 * a backup from elsewhere adds up with this device's counts. This device's
 * version of an item both changed stays, the backup's is kept as "…
 * (backup)". The device syncs first, holding the other tabs off, so the
 * backup is measured against what the vault holds now: what it shares with
 * the vault is not added again. It is then a change made here like any other,
 * and the next sync takes it to every device.
 */
export async function importIntoSync(
  shape: BackupShape,
): Promise<SyncActionResult<{ added: SyncChanges | null }>> {
  const secret = useDeviceSyncStore.getState().secret;
  if (!secret) return { ok: false, reason: 'Sync between devices is off.' };
  if (unsavedData()) return { ok: false, reason: STORAGE_FULL };
  // Set by the task below, once it runs.
  let result = {
    ok: false,
    reason: `${IMPORT_NEEDS_SYNC} another tab is syncing. Try again in a moment.`,
  } as SyncActionResult<{ added: SyncChanges | null }>;
  await exclusively(async () => {
    try {
      await runOnce(true);
    } catch (err) {
      failed(err);
      result = { ok: false, reason: `${IMPORT_NEEDS_SYNC} ${reasonOf(err)}` };
      return;
    }
    if (useDeviceSyncStore.getState().secret !== secret) {
      result = { ok: false, reason: 'Sync between devices was turned off meanwhile.' };
      return;
    }
    result = joinBackup(backupSnapshot(shape));
  }, true);
  if (result.ok && result.added) void syncNow();
  return result;
}

/** Joins a backup's data into this device's (see `importIntoSync`); returns what it added. */
function joinBackup(backup: SyncSnapshot): SyncActionResult<{ added: SyncChanges | null }> {
  const local = localSnapshot();
  const merged = shareHistory(local, backup)
    ? mergeSnapshots(null, local, backup, { incoming: 'backup' })
    : mergeSnapshots(emptySyncSnapshot(), local, backup, { independent: true, incoming: 'backup' });
  const applied = applySaved(merged, local);
  if (applied === 'no-room' || applied === 'lost') {
    if (applied === 'lost') forgetBase();
    return {
      ok: false,
      reason:
        'This device does not have room for the backup. Remove old analyses or games here, then try again.',
    };
  }
  return {
    ok: true,
    added: applied === 'changed' ? changesOrNull(syncChanges(local, merged)) : null,
  };
}

/** Stops syncing on this device: the phrase is forgotten here, the data and the vault stay. */
export async function stopSync(because?: 'deleted'): Promise<void> {
  stopScheduling?.();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  busyStreak = 0;
  noRoom = null;
  cachedKeys = null;
  useDeviceSyncStore.getState().turnOff(because);
  await dropCopies();
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
 * After this device's data was replaced from outside the sync (an import made
 * while sync was off, undone or finished after it was turned on), the next
 * sync joins it with the synced data: nothing the data lacks is taken for
 * deleted, and nothing is counted twice.
 */
export function forgetSyncBase(): void {
  if (!useDeviceSyncStore.getState().secret) return;
  forgetBase();
  void syncNow();
}

/**
 * Syncs a part of the profile on this device, or keeps it to this device
 * (Settings → What syncs on this device). A part kept here keeps the version
 * it last shared with the vault, so syncing it again later merges what
 * changed on both sides meanwhile; turned on, it syncs straight away.
 */
export function setSyncPart(part: SyncPart, on: boolean): void {
  const store = useDeviceSyncStore.getState();
  if (store.off.includes(part) !== on) return;
  store.setPart(part, on);
  if (on && store.secret) void syncNow({ asked: true });
}
