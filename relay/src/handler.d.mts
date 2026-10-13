/**
 * Types for handler.mjs, for TypeScript callers: the relay's tests and the
 * app's device-sync tests, which run the real relay behind a stand-in fetch.
 */
import type { QuotaStore } from './quota.mjs';

/** One vault as a store keeps it. */
export interface Vault {
  version: number;
  /** SHA-256 of the vault's write token, lowercase hex. */
  authHash: string;
  data: Uint8Array;
  updatedAt: number;
  touchedAt: number;
  /** The UTC day ("YYYY-MM-DD") `writes` counts; null for a vault an earlier relay last wrote. */
  writesDay: string | null;
  /** How many times the vault was written on `writesDay`. */
  writes: number;
}

export interface VaultStore {
  get(id: string): Promise<Vault | null>;
  /** False when a vault by that id exists already. The making counts as the day's first write. */
  create(id: string, authHash: string, data: Uint8Array, now: number): Promise<boolean>;
  /**
   * Replaces version `expected`. Refused with `capped` when the vault has been
   * written `writesPerDay` times that UTC day already (no limit when left out).
   */
  update(
    id: string,
    expected: number,
    data: Uint8Array,
    now: number,
    writesPerDay?: number,
  ): Promise<{ ok: true; version: number } | { ok: false; current: number | null; capped?: true }>;
  touch(id: string, now: number): Promise<void>;
  delete(id: string): Promise<boolean>;
  /**
   * Deletes the vaults neither written nor read since `before`, and those never
   * written after they were made (version 1) neither written nor read since
   * `abandonedBefore`; returns how many.
   */
  expire(before: number, abandonedBefore?: number): Promise<number>;
  /** How many vaults there are. */
  count(): Promise<number>;
}

/** The limits on vaults (see `DEFAULT_LIMITS`). Days are UTC days. */
export interface VaultLimits {
  /** New vaults one address (an IPv6 address: its /64) may make a day. */
  newVaultsPerAddress: number;
  /** New vaults the relay makes a day, from everyone. */
  newVaultsPerDay: number;
  /** No new vaults once the database is this big, in bytes. */
  maxDbBytes: number;
  /** No new vaults once there are this many, where the store cannot say how big the database is. */
  maxVaults: number;
  /** Writes one vault takes a day, its making included. */
  vaultWritesPerDay: number;
}

export interface RelayOptions {
  store: VaultStore;
  /** Where the daily counts are kept (the store's `quotas`); without them new vaults are not limited. */
  quotas?: QuotaStore;
  /** Any limit other than the default. */
  limits?: Partial<VaultLimits>;
  maxBytes?: number;
  allowedOrigins?: readonly string[];
  minWriteIntervalMs?: number;
  /** Asked before a vault is created: false refuses it with 429 (a limit per address, say). */
  allowCreate?: (request: Request) => boolean | Promise<boolean>;
  /** Whether live games are on: the health check says so when this is given. */
  live?: boolean;
  /** The push endpoints (push/reminders.mjs `createPushApi`): every path under /v1/push/ goes there. */
  push?: (
    request: Request,
    respond: {
      json(status: number, body: unknown, extra?: Record<string, string>): Response;
      empty(status: number, extra?: Record<string, string>): Response;
      fail(status: number, error: string, extra?: Record<string, string>): Response;
    },
  ) => Promise<Response>;
  now?: () => number;
}

export const DEFAULT_MAX_BYTES: number;
export const DEFAULT_MIN_WRITE_INTERVAL_MS: number;
export const KEEP_UNUSED_MS: number;
export const KEEP_ABANDONED_MS: number;
export const DEFAULT_LIMITS: Readonly<VaultLimits>;

export function hashToken(token: string): Promise<string>;
/** The body, read up to `maxBytes`; null when there is more. */
export function readBody(request: Request, maxBytes: number): Promise<Uint8Array | null>;
/** Whether a page on `origin` may use the relay (`*` allows any; otherwise it must be listed). */
export function originAllowed(
  allowed: readonly string[],
  origin: string | null | undefined,
): boolean;
/** The app's origins from a comma-separated setting; `['*']` when it names none. */
export function originList(value: unknown): string[];
export function createRelay(options: RelayOptions): (request: Request) => Promise<Response>;
/** Deletes the vaults unused for a year, and those never written after they were made unused for 30 days. */
export function expireVaults(store: VaultStore, now?: number): Promise<number>;
