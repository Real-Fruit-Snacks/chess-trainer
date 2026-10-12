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
export function expireVaults(store: VaultStore, now?: number): Promise<number>;
