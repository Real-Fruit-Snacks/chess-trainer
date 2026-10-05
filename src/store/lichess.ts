import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  keepCorruptBlob,
  rehydrateOnStorageChange,
  safeLocalStorage,
  warnNewerSave,
} from '@/lib/persistStorage';
import type { LichessPerf, LichessRatings } from '@/lib/lichess/auth';
import {
  array,
  boolean,
  gameRecord,
  literal,
  nullable,
  number,
  parse,
  record,
  type Schema,
  slice,
  string,
  struct,
} from './backupSchema';
import type { GameRecord } from './progress';
import { storageKeyFor } from './profiles';

/**
 * The Lichess connection of this profile on this device: the account and its
 * token, what to keep in step, and the sync's own bookkeeping — results and
 * games waiting to go up (the outbox, which is what makes offline play sync
 * later), how far the history has been read, and which study chapter holds
 * which repertoire or analysis. Never part of a backup: the token is a secret,
 * and the bookkeeping belongs to this device.
 */
export const LICHESS_STORAGE_KEY = 'chess-trainer:lichess';
export const LICHESS_VERSION = 1;

/** Results waiting to go up are capped: the oldest go first past this. */
export const MAX_PENDING_PUZZLES = 2000;
export const MAX_PENDING_GAMES = 200;
/** Puzzle ids sent from here, remembered to recognise them in the Lichess history. */
export const MAX_SENT = 5000;

/** Lichess puzzle ids: five letters and digits (own-game puzzles and drill positions are not). */
export function isLichessPuzzleId(id: string): boolean {
  return /^[A-Za-z0-9]{5}$/.test(id);
}

export interface LichessAccount {
  id: string;
  username: string;
  token: string;
  connectedAt: number;
  expiresAt: number | null;
}

/** What is kept in step with Lichess (all on by default). */
export interface LichessSyncOptions {
  /** Puzzle results go up; the Lichess puzzle history comes down. */
  puzzles: boolean;
  /** The app's puzzle rating follows the Lichess one. */
  rating: boolean;
  /** Games played here go up as imported games, and come back on other devices. */
  games: boolean;
  /** Custom repertoires and saved analyses live in private studies too. */
  studies: boolean;
}

export interface PendingPuzzleResult {
  id: string;
  /** Solved without help: what Lichess counts as a win. */
  win: boolean;
  /** Counts toward the Lichess puzzle rating. */
  rated: boolean;
  at: number;
}

export interface PendingGame {
  /** The game as the game log records it (its PGN is written for Lichess when it is sent). */
  record: GameRecord;
  at: number;
}

/** Which study chapter holds a repertoire (`rep:<id>`) or an analysis (`ana:<id>`). */
export interface StudyLink {
  studyId: string;
  chapterId: string;
  /** The item's content when the two last agreed, as each side had it. */
  localHash: string;
  remoteHash: string;
  name: string;
  /** The repertoire list, or the analysis's collection. */
  group: string;
  /** A repertoire's side. */
  color: 'white' | 'black' | null;
}

export interface LichessCursors {
  /** The newest puzzle round already brought in (Lichess time, ms). */
  activity: number | null;
  /** When the imported games were last read. */
  games: number | null;
  /** When the studies were last reconciled. */
  studies: number | null;
}

/** Results and games recorded before the account was connected: offered once. */
export type BacklogState = 'unasked' | 'done';

export const DEFAULT_LICHESS_OPTIONS: LichessSyncOptions = {
  puzzles: true,
  rating: true,
  games: true,
  studies: true,
};

const emptyCursors = (): LichessCursors => ({ activity: null, games: null, studies: null });

const initialState = {
  account: null as LichessAccount | null,
  /** The Lichess user the bookkeeping belongs to (kept after Disconnect, so a reconnect resumes). */
  syncedUser: null as string | null,
  /** Lichess refused the token: the account needs connecting again. */
  needsReconnect: false,
  options: { ...DEFAULT_LICHESS_OPTIONS },
  outbox: { puzzles: [] as PendingPuzzleResult[], games: [] as PendingGame[] },
  sent: {} as Record<string, number>,
  cursors: emptyCursors(),
  links: {} as Record<string, StudyLink>,
  /** Each of the app's studies as last read (its `updatedAt` on Lichess), to skip unchanged ones. */
  studyStamps: {} as Record<string, number>,
  /** Items Lichess would not take as a chapter (key → the content refused): tried again once changed. */
  refused: {} as Record<string, string>,
  /**
   * Linked items the learner deleted here (keys): their chapters go too. A
   * linked item that is missing without one was lost (a damaged save, say),
   * and comes back from Lichess instead.
   */
  deleted: [] as string[],
  ratings: null as LichessRatings | null,
  lastSyncAt: null as number | null,
  backlog: 'unasked' as BacklogState,
};

export type PersistedLichess = typeof initialState;

export interface LichessState extends PersistedLichess {
  /** Stores a freshly connected account; a different Lichess user starts the bookkeeping afresh. */
  connect: (
    account: Omit<LichessAccount, 'connectedAt'>,
    ratings: LichessRatings,
    now?: number,
  ) => void;
  /** Forgets the token. The bookkeeping stays, for the same account connecting again. */
  disconnect: () => void;
  setNeedsReconnect: (value: boolean) => void;
  setOption: <K extends keyof LichessSyncOptions>(key: K, value: LichessSyncOptions[K]) => void;
  /** Queues a puzzle result (when connected and puzzles are synced). */
  notePuzzle: (
    result: { id: string; solved: boolean; clean: boolean; rated: boolean },
    now?: number,
  ) => void;
  /** Queues a finished game (when connected and games are synced). */
  noteGame: (record: GameRecord, now?: number) => void;
  /** Queues earlier results and games at once (the backlog), without duplicates. */
  queueBacklog: (puzzles: PendingPuzzleResult[], games: PendingGame[]) => void;
  /** Removes results that reached Lichess and remembers their ids. */
  puzzlesSent: (results: readonly PendingPuzzleResult[], now?: number) => void;
  /** Removes a game from the outbox (sent, or refused for good). */
  gameDone: (recordId: string) => void;
  setCursor: (key: keyof LichessCursors, value: number | null) => void;
  /** Saves the studies' bookkeeping (each part given replaces what was there). */
  setStudySync: (patch: {
    links?: Record<string, StudyLink>;
    studyStamps?: Record<string, number>;
    refused?: Record<string, string>;
    deleted?: string[];
  }) => void;
  /** Notes that the learner deleted a repertoire or analysis (`rep:<id>`, `ana:<id>`). */
  noteDeleted: (key: string) => void;
  setRatings: (ratings: LichessRatings) => void;
  /** Updates the puzzle rating alone (from a batch of solves). */
  setPuzzlePerf: (perf: LichessPerf, now?: number) => void;
  markSynced: (now?: number) => void;
  finishBacklog: () => void;
  /**
   * Starts the matching over after this device's data was replaced (a backup
   * import): study links and history cursors go, the account and outbox stay.
   */
  restartSync: () => void;
  /** Everything back to the start, token included (Reset everything). */
  forget: () => void;
}

/* ------------------------------------------------------------------ */
/* Telling the sync that something is waiting                         */
/* ------------------------------------------------------------------ */

const queueListeners = new Set<() => void>();

/** Called whenever a result or a game joins the outbox (the sync flushes it soon after). */
export function onLichessQueue(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

function announceQueued(): void {
  for (const listener of queueListeners) {
    try {
      listener();
    } catch {
      // A listener's failure must not stop a puzzle from being recorded.
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reading a stored blob                                              */
/* ------------------------------------------------------------------ */

const lichessId: Schema<string> = (value, path, ctx) => {
  const parsed = string(value, path, ctx);
  return parsed.ok && !isLichessPuzzleId(parsed.value)
    ? { ok: false, reason: `${path} is not a Lichess puzzle id` }
    : parsed;
};
const perf = nullable(struct({ rating: number }, { rd: number, games: number, prov: boolean }));

const lichessSlice = slice({
  account: struct(
    { id: string, username: string, token: string },
    { connectedAt: number, expiresAt: nullable(number) },
  ),
  syncedUser: nullable(string),
  needsReconnect: boolean,
  options: slice({ puzzles: boolean, rating: boolean, games: boolean, studies: boolean }),
  outbox: slice({
    puzzles: array(struct({ id: lichessId, win: boolean, rated: boolean, at: number })),
    games: array(struct({ record: gameRecord, at: number })),
  }),
  sent: record(number),
  cursors: slice({
    activity: nullable(number),
    games: nullable(number),
    studies: nullable(number),
  }),
  links: record(
    struct(
      {
        studyId: string,
        chapterId: string,
        localHash: string,
        remoteHash: string,
        name: string,
        group: string,
      },
      { color: nullable(literal('white', 'black')) },
    ),
  ),
  studyStamps: record(number),
  refused: record(string),
  deleted: array(string),
  ratings: slice({
    puzzle: perf,
    bullet: perf,
    blitz: perf,
    rapid: perf,
    classical: perf,
    at: number,
  }),
  lastSyncAt: nullable(number),
  backlog: literal('unasked', 'done'),
});

const perfOf = (
  p: { rating: number; rd?: number; games?: number; prov?: boolean } | null | undefined,
) => (p ? { rating: p.rating, rd: p.rd ?? 350, games: p.games ?? 0, prov: p.prov === true } : null);

/** A stored blob checked field by field: what does not fit falls back to its default. */
export function repairLichess(stored: unknown): PersistedLichess {
  const parsed = parse(lichessSlice, stored, 'repair', 'lichess');
  const s = parsed.ok ? parsed.value : {};
  const account = s.account;
  const ratings = s.ratings;
  return {
    account:
      account?.id && account.username && account.token
        ? {
            id: account.id,
            username: account.username,
            token: account.token,
            connectedAt: account.connectedAt ?? 0,
            expiresAt: account.expiresAt ?? null,
          }
        : null,
    syncedUser: s.syncedUser ?? null,
    needsReconnect: s.needsReconnect === true,
    options: { ...DEFAULT_LICHESS_OPTIONS, ...s.options },
    outbox: {
      puzzles: (s.outbox?.puzzles ?? []).slice(-MAX_PENDING_PUZZLES),
      games: (s.outbox?.games ?? [])
        .filter((g): g is PendingGame => g.record.id !== undefined && g.record.source !== undefined)
        .slice(-MAX_PENDING_GAMES),
    },
    sent: Object.fromEntries(Object.entries(s.sent ?? {}).filter(([id]) => isLichessPuzzleId(id))),
    cursors: { ...emptyCursors(), ...s.cursors },
    links: Object.fromEntries(
      Object.entries(s.links ?? {}).map(([key, link]) => [
        key,
        { ...link, color: link.color ?? null },
      ]),
    ),
    studyStamps: s.studyStamps ?? {},
    refused: s.refused ?? {},
    deleted: s.deleted ?? [],
    ratings: ratings
      ? {
          puzzle: perfOf(ratings.puzzle),
          bullet: perfOf(ratings.bullet),
          blitz: perfOf(ratings.blitz),
          rapid: perfOf(ratings.rapid),
          classical: perfOf(ratings.classical),
          at: ratings.at ?? 0,
        }
      : null,
    lastSyncAt: s.lastSyncAt ?? null,
    backlog: s.backlog ?? 'unasked',
  };
}

/** Keeps the newest `MAX_SENT` ids. */
function capSent(sent: Record<string, number>): Record<string, number> {
  const entries = Object.entries(sent);
  if (entries.length <= MAX_SENT) return sent;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_SENT));
}

export const useLichess = create<LichessState>()(
  persist<LichessState, [], [], PersistedLichess>(
    (set, get) => ({
      ...initialState,
      options: { ...DEFAULT_LICHESS_OPTIONS },

      connect: (account, ratings, now = Date.now()) => {
        const sameUser = get().syncedUser?.toLowerCase() === account.username.toLowerCase();
        set({
          ...(sameUser
            ? {}
            : {
                outbox: { puzzles: [], games: [] },
                sent: {},
                cursors: emptyCursors(),
                links: {},
                studyStamps: {},
                refused: {},
                deleted: [],
                lastSyncAt: null,
                backlog: 'unasked' as BacklogState,
              }),
          account: { ...account, connectedAt: now },
          syncedUser: account.username,
          needsReconnect: false,
          ratings,
          // What was recorded here meanwhile is offered (again) after every connection.
          backlog: 'unasked' as BacklogState,
        });
      },

      disconnect: () => set({ account: null, needsReconnect: false }),

      setNeedsReconnect: (value) => set({ needsReconnect: value }),

      setOption: (key, value) =>
        set({
          options: { ...get().options, [key]: value },
          // What was recorded while a part was off is offered when it comes back on.
          ...((key === 'puzzles' || key === 'games') && value
            ? { backlog: 'unasked' as const }
            : {}),
        }),

      notePuzzle: ({ id, solved, clean, rated }, now = Date.now()) => {
        const state = get();
        if (!state.account || !state.options.puzzles || !isLichessPuzzleId(id)) return;
        const entry: PendingPuzzleResult = { id, win: solved && clean, rated, at: now };
        set({
          outbox: {
            ...state.outbox,
            puzzles: [...state.outbox.puzzles, entry].slice(-MAX_PENDING_PUZZLES),
          },
        });
        announceQueued();
      },

      noteGame: (record, now = Date.now()) => {
        const state = get();
        if (!state.account || !state.options.games) return;
        if (state.outbox.games.some((g) => g.record.id === record.id)) return;
        set({
          outbox: {
            ...state.outbox,
            games: [...state.outbox.games, { record, at: now }].slice(-MAX_PENDING_GAMES),
          },
        });
        announceQueued();
      },

      queueBacklog: (puzzles, games) => {
        const state = get();
        const queuedGames = new Set(state.outbox.games.map((g) => g.record.id));
        const freshGames = games.filter((g) => !queuedGames.has(g.record.id));
        // Older results first: Lichess rates them in the order it receives them.
        const merged = [...puzzles, ...state.outbox.puzzles].sort((a, b) => a.at - b.at);
        set({
          outbox: {
            puzzles: merged.slice(-MAX_PENDING_PUZZLES),
            games: [...freshGames, ...state.outbox.games]
              .sort((a, b) => a.at - b.at)
              .slice(-MAX_PENDING_GAMES),
          },
          backlog: 'done',
        });
        announceQueued();
      },

      puzzlesSent: (results, now = Date.now()) => {
        const state = get();
        const done = new Set(results.map((r) => `${r.id}@${r.at}`));
        const sent = { ...state.sent };
        for (const r of results) sent[r.id] = now;
        set({
          outbox: {
            ...state.outbox,
            puzzles: state.outbox.puzzles.filter((p) => !done.has(`${p.id}@${p.at}`)),
          },
          sent: capSent(sent),
        });
      },

      gameDone: (recordId) => {
        const state = get();
        set({
          outbox: {
            ...state.outbox,
            games: state.outbox.games.filter((g) => g.record.id !== recordId),
          },
        });
      },

      setCursor: (key, value) => set({ cursors: { ...get().cursors, [key]: value } }),

      setStudySync: (patch) => {
        const next: Partial<PersistedLichess> = {};
        if (patch.links) next.links = patch.links;
        if (patch.studyStamps) next.studyStamps = patch.studyStamps;
        if (patch.refused) next.refused = patch.refused;
        if (patch.deleted) next.deleted = patch.deleted;
        set(next);
      },

      noteDeleted: (key) => {
        const { links, deleted } = get();
        // Only an item with a chapter on Lichess needs remembering.
        if (links[key] && !deleted.includes(key)) set({ deleted: [...deleted, key] });
      },

      setRatings: (ratings) => set({ ratings }),

      setPuzzlePerf: (perf, now = Date.now()) => {
        const current = get().ratings;
        set({
          ratings: {
            puzzle: perf,
            bullet: current?.bullet ?? null,
            blitz: current?.blitz ?? null,
            rapid: current?.rapid ?? null,
            classical: current?.classical ?? null,
            at: now,
          },
        });
      },

      markSynced: (now = Date.now()) => set({ lastSyncAt: now }),

      finishBacklog: () => set({ backlog: 'done' }),

      restartSync: () =>
        set({
          links: {},
          studyStamps: {},
          refused: {},
          deleted: [],
          cursors: emptyCursors(),
          lastSyncAt: null,
        }),

      forget: () => set({ ...initialState, options: { ...DEFAULT_LICHESS_OPTIONS } }),
    }),
    {
      name: storageKeyFor(LICHESS_STORAGE_KEY),
      version: LICHESS_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => {
        const out = {} as Record<string, unknown>;
        for (const [key, value] of Object.entries(state)) {
          if (typeof value !== 'function') out[key] = value;
        }
        return out as PersistedLichess;
      },
      migrate: (stored, version): PersistedLichess => {
        if (version > LICHESS_VERSION) {
          warnNewerSave(LICHESS_STORAGE_KEY, version, LICHESS_VERSION);
        }
        return repairLichess(stored);
      },
      merge: (persistedState, current): LichessState => ({
        ...current,
        ...repairLichess(persistedState),
      }),
      onRehydrateStorage: keepCorruptBlob(storageKeyFor(LICHESS_STORAGE_KEY)),
    },
  ),
);

rehydrateOnStorageChange(useLichess, storageKeyFor(LICHESS_STORAGE_KEY));
