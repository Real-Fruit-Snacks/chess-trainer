/**
 * Types for handler.mjs, for TypeScript callers: the relay's tests and the
 * app's device-sync tests, which run the real relay behind a stand-in fetch.
 */

/** One vault as a store keeps it. */
export interface Vault {
  version: number;
  /** SHA-256 of the vault's write token, lowercase hex. */
  authHash: string;
  data: Uint8Array;
  updatedAt: number;
  touchedAt: number;
}

export interface VaultStore {
  get(id: string): Promise<Vault | null>;
  /** False when a vault by that id exists already. */
  create(id: string, authHash: string, data: Uint8Array, now: number): Promise<boolean>;
  update(
    id: string,
    expected: number,
    data: Uint8Array,
    now: number,
  ): Promise<{ ok: true; version: number } | { ok: false; current: number | null }>;
  touch(id: string, now: number): Promise<void>;
  delete(id: string): Promise<boolean>;
  /** Deletes the vaults neither written nor read since `before`; returns how many. */
  expire(before: number): Promise<number>;
}

export interface RelayOptions {
  store: VaultStore;
  maxBytes?: number;
  allowedOrigins?: readonly string[];
  minWriteIntervalMs?: number;
  /** Asked before a vault is created: false refuses it with 429 (a limit per address, say). */
  allowCreate?: (request: Request) => boolean | Promise<boolean>;
  now?: () => number;
}

export const DEFAULT_MAX_BYTES: number;
export const DEFAULT_MIN_WRITE_INTERVAL_MS: number;
export const KEEP_UNUSED_MS: number;

export function hashToken(token: string): Promise<string>;
export function createRelay(options: RelayOptions): (request: Request) => Promise<Response>;
export function expireVaults(store: VaultStore, now?: number): Promise<number>;
