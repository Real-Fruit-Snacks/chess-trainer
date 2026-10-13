/** Types for quota.mjs: the relay's daily allowances, counted in its database. */

/** The counts and salts behind the daily allowances, in D1, SQLite or memory. */
export interface QuotaStore {
  /**
   * Counts one more of `kind` for `key` on `day` ("YYYY-MM-DD", UTC), unless
   * `limit` are counted already; whether it did. Two requests never both take
   * the last one.
   */
  take(kind: string, key: string, day: string, limit: number): Promise<boolean>;
  /** The day's salt: `fresh` when none is kept yet, else the one kept. */
  salt(day: string, fresh: string): Promise<string>;
  /** Deletes the counts and salts of the days before `before`; how many rows went. */
  expire(before: string): Promise<number>;
  /** How big the database is, in bytes, as far as the store can tell; null when it cannot. */
  bytes(): Promise<number | null>;
}

export const DAY_MS: number;
export const EVERYONE: string;
export const QUOTA_SCHEMA: readonly string[];
export const QUOTA_SQL: Readonly<Record<string, string>>;
export function saltName(day: string): string;
export function utcDay(now: number): string;
/** Whole seconds to the next UTC midnight (at least 1). */
export function secondsToMidnight(now: number): number;
/** The address a request came from, as the limits count it (`addressKey` of CF-Connecting-IP). */
export function addressOf(request: Request): string;
/** The key an address is counted under on `day`: SHA-256 of the day's salt and the address, hex. */
export function quotaKey(quotas: QuotaStore, address: string, day: string): Promise<string>;
export function takeForAddress(
  quotas: QuotaStore,
  kind: string,
  request: Request,
  limit: number,
  now: number,
): Promise<boolean>;
export function takeForEveryone(
  quotas: QuotaStore,
  kind: string,
  limit: number,
  now: number,
): Promise<boolean>;
/** Deletes the counts and salts of the days before yesterday (UTC). */
export function expireQuotas(quotas: QuotaStore, now?: number): Promise<number>;
/** A whole number of at least `min` from a setting; `fallback` otherwise. */
export function wholeSetting(value: unknown, fallback: number, min?: number): number;
