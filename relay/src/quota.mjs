/**
 * The relay's daily allowances: how many new vaults (or reminders) one address
 * may make in a UTC day, and how many the whole relay takes. They are counted
 * in the relay's own database (D1, SQLite or memory: see `QuotaStore`), so
 * they hold across isolates, locations and restarts, where a count kept in
 * memory would not.
 *
 * No address is stored. A count per address is kept under the SHA-256 of the
 * day's salt and the address (`addressKey`: an IPv4 address, or an IPv6
 * address's /64). The salt is random, made by whichever request needs it
 * first that day, and kept beside the counts. The daily cron deletes the
 * counts and salts of the days before yesterday (`expireQuotas`).
 *
 * Whoever holds the database while a salt is kept could still try every IPv4
 * address against it. With a secret (the Worker's `QUOTA_SECRET`, never
 * stored with the counts: `withSecret`), the key is an HMAC-SHA-256 under the
 * secret instead, which nobody without the secret can work back.
 */
import { addressKey } from './address.mjs';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** The key of a count across the whole relay (a hash is never this). */
export const EVERYONE = '*';

/**
 * The quota tables, the same in D1 and SQLite, made on first use beside the
 * vaults. WITHOUT ROWID keeps each row in its primary key, so a new count is
 * one row written rather than two (a row and its key's index).
 */
export const QUOTA_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS quotas (
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (kind, key, day)
  ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS relay_meta (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID`,
];

export const QUOTA_SQL = {
  /**
   * One more on the day's count, unless it has reached the limit: a row comes
   * back only when one was taken. A count at its limit is left as it is, so a
   * refusal writes nothing.
   */
  take: `INSERT INTO quotas (kind, key, day, count) VALUES (?, ?, ?, 1)
    ON CONFLICT (kind, key, day) DO UPDATE SET count = quotas.count + 1 WHERE quotas.count < ?
    RETURNING count`,
  salt: 'SELECT value FROM relay_meta WHERE name = ?',
  keepSalt: 'INSERT OR IGNORE INTO relay_meta (name, value) VALUES (?, ?)',
  expireCounts: 'DELETE FROM quotas WHERE day < ?',
  expireSalts: "DELETE FROM relay_meta WHERE name LIKE 'salt:%' AND name < ?",
};

/** The name of a day's salt in `relay_meta`. @param {string} day */
export const saltName = (day) => `salt:${day}`;

/**
 * @typedef {{
 *   take(kind: string, key: string, day: string, limit: number): Promise<boolean>,
 *   salt(day: string, fresh: string): Promise<string>,
 *   expire(before: string): Promise<number>,
 *   bytes(): Promise<number | null>,
 *   secret?: string,
 * }} QuotaStore
 *   `take`: counts one more of `kind` for `key` on `day` ("YYYY-MM-DD", UTC)
 *   unless `limit` are counted already, at once (two requests never both take
 *   the last one); whether it did. `salt`: the day's salt, `fresh` when none
 *   is kept yet (whoever asks first sets it). `expire`: deletes the counts and
 *   salts of the days before `before`; how many rows went. `bytes`: how big
 *   the database is, as far as the store can tell; null when it cannot.
 *   `secret`: the key the counts' hashes are made with, when there is one.
 */

/** The UTC day of `now`, "YYYY-MM-DD". @param {number} now */
export const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

/** Whole seconds from `now` to the next midnight, UTC (at least 1). @param {number} now */
export function secondsToMidnight(now) {
  const next = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
  return Math.max(1, Math.ceil((next - now) / 1000));
}

/**
 * The address a request came from, as the limits count it (see address.mjs).
 * Cloudflare names it in CF-Connecting-IP; the Node server puts the client's
 * address there too, whatever the client sent.
 * @param {Request} request
 */
export const addressOf = (request) => addressKey(request.headers.get('CF-Connecting-IP'));

/** Bytes as lowercase hex. @param {ArrayBuffer | Uint8Array} bytes */
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Each store's salt for the day, read once a day per isolate (or process).
 * @type {WeakMap<QuotaStore, { day: string, salt: Promise<string> }>}
 */
const salts = new WeakMap();

/** The day's salt, from the store (made there by the day's first request). */
function saltFor(/** @type {QuotaStore} */ quotas, /** @type {string} */ day) {
  const known = salts.get(quotas);
  if (known?.day === day) return known.salt;
  const salt = quotas.salt(day, hex(crypto.getRandomValues(new Uint8Array(32))));
  salts.set(quotas, { day, salt });
  // A read that failed is not kept: the next request asks again.
  salt.catch(() => {
    if (salts.get(quotas)?.salt === salt) salts.delete(quotas);
  });
  return salt;
}

/** HMAC keys made from secrets, one per secret. @type {Map<string, Promise<CryptoKey>>} */
const hmacKeys = new Map();

/**
 * `text`'s SHA-256 in hex; with a `secret`, its HMAC-SHA-256 under the secret
 * instead, which cannot be worked back to the text without the secret.
 * @param {string} text
 * @param {string} [secret]
 */
export async function keyedHash(text, secret) {
  const data = new TextEncoder().encode(text);
  if (!secret) return hex(await crypto.subtle.digest('SHA-256', data));
  let key = hmacKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    hmacKeys.set(secret, key);
  }
  return hex(await crypto.subtle.sign('HMAC', await key, data));
}

/**
 * The quota store with its counts' hashes made under `secret`; the store as it
 * is when there is none.
 * @template {QuotaStore} T
 * @param {T} quotas
 * @param {unknown} secret
 * @returns {T}
 */
export function withSecret(quotas, secret) {
  return typeof secret === 'string' && secret !== '' ? { ...quotas, secret } : quotas;
}

/**
 * The key an address is counted under on `day`: the SHA-256 (or, with the
 * store's secret, the HMAC) of the day's salt and the address, in hex. The
 * same address has another key the next day.
 * @param {QuotaStore} quotas
 * @param {string} address an `addressKey`
 * @param {string} day
 */
export async function quotaKey(quotas, address, day) {
  const salt = await saltFor(quotas, day);
  return keyedHash(`${salt}|${address}`, quotas.secret);
}

/**
 * Takes one of `kind` for the address `request` came from, on the day of
 * `now`: false when that address has had `limit` already.
 * @param {QuotaStore} quotas
 * @param {string} kind
 * @param {Request} request
 * @param {number} limit
 * @param {number} now
 */
export async function takeForAddress(quotas, kind, request, limit, now) {
  if (limit <= 0) return false;
  const address = addressOf(request);
  // No address known (the Node server's own machine, with no proxy saying whose request it
  // is): not counted, as the live games' limits do, rather than one allowance for everyone.
  if (address === 'unknown') return true;
  const day = utcDay(now);
  return quotas.take(kind, await quotaKey(quotas, address, day), day, limit);
}

/**
 * Takes one of `kind` across the relay, on the day of `now`: false when it has
 * taken `limit` already.
 * @param {QuotaStore} quotas
 * @param {string} kind
 * @param {number} limit
 * @param {number} now
 */
export function takeForEveryone(quotas, kind, limit, now) {
  return limit <= 0 ? Promise.resolve(false) : quotas.take(kind, EVERYONE, utcDay(now), limit);
}

/**
 * The daily cron's part: deletes the counts and salts of the days before
 * yesterday (UTC). Yesterday's stay a day more, so a request made just before
 * midnight still finds its salt.
 * @param {QuotaStore} quotas
 */
export function expireQuotas(quotas, now = Date.now()) {
  return quotas.expire(utcDay(now - DAY_MS));
}

/**
 * A whole-number setting (a Worker variable, a server option): `fallback` when
 * it is unset, or not a whole number of at least `min`. A typo never lifts a
 * limit: it leaves the default.
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} [min]
 */
export function wholeSetting(value, fallback, min = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min ? number : fallback;
}
