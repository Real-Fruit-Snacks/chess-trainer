/**
 * The device-sync relay's HTTP API, free of any platform: a function from a
 * Fetch API `Request` to a `Response`, over a store of vaults
 * (`./memoryStore.mjs`, `./d1Store.mjs`, `./sqliteStore.mjs`).
 *
 * A vault is one encrypted file under a random name. The app encrypts it on
 * the device with a key from the learner's recovery phrase, so the relay keeps
 * bytes it cannot read, and names nobody: no account, no email, no device. It
 * stores, per vault, the bytes, a version number, when it was last written
 * and read, how often it was written that day, and a hash of the vault's write
 * token. Nothing is logged.
 *
 *   GET    /v1/health            → 200 { ok, maxBytes, live? } (live: whether live games are on)
 *   GET    /v1/vaults/:id        → 200 the bytes, ETag "<version>"; 204 (no body) when
 *                                  X-Known-Version names the current version; 404
 *   PUT    /v1/vaults/:id        → 201 created (If-None-Match: *), 200 updated (If-Match: "<version>");
 *                                  412 when the version moved on (ETag: the current one); 413 too big;
 *                                  429 too soon, or a daily limit reached (Retry-After: until
 *                                  midnight, UTC); 503 the relay's new vaults for the day are all
 *                                  made; 507 the relay is full and makes no new vaults
 *   DELETE /v1/vaults/:id        → 204
 *   /v1/push/…                   → the push endpoints (push/reminders.mjs), when given
 *
 * Every vault request carries `Authorization: Bearer <token>`: the token comes
 * from the same phrase, and only its SHA-256 is stored. A vault id is 32
 * random-looking bytes and a token another 32, both base64url. An unchanged
 * vault is answered with 204 rather than HTTP's 304, which some browsers do not
 * hand to a page as it is.
 *
 * Anyone can make a vault, so the relay limits them (`VaultLimits`): so many
 * new vaults a day from one address, and from everyone; none once the database
 * is nearly full; and so many writes a day to each vault. The counts are kept
 * in the database (`quotas`, see quota.mjs), never the addresses.
 */
import { secondsToMidnight, takeForAddress, takeForEveryone, utcDay } from './quota.mjs';

/** Vault ids and tokens: 32 bytes in base64url, unpadded. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VAULT_PATH = /^\/v1\/vaults\/([^/]+)$/;

/** The largest vault accepted, in bytes (the D1 store keeps it as base64 in a 2 MB row). */
export const DEFAULT_MAX_BYTES = 1_400_000;
/** A vault may be written this often at most. */
export const DEFAULT_MIN_WRITE_INTERVAL_MS = 1_000;
/** Vaults neither written nor read for this long are deleted (see `expireVaults`). */
export const KEEP_UNUSED_MS = 365 * 24 * 60 * 60 * 1000;
/**
 * Vaults never written after they were made (a device turned sync on, and no
 * change ever followed) are deleted once neither written nor read for this
 * long: what a script making vaults leaves behind goes in a month, not a year.
 */
export const KEEP_ABANDONED_MS = 30 * 24 * 60 * 60 * 1000;
/** A read counts as use when the last one is older than this (so reads seldom write). */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The limits on vaults, by default. Days are UTC days.
 * - `newVaultsPerAddress`: new vaults one address may make a day (an IPv6
 *   address counts with its whole /64);
 * - `newVaultsPerDay`: new vaults the relay makes a day, from everyone (with
 *   `vaultWritesPerDay`, a bound on what a day's new vaults can write: half of
 *   D1's free daily rows written);
 * - `maxDbBytes`: no new vaults once the database is this big, leaving room
 *   for the vaults kept to grow (D1's free plan holds 500 MB);
 * - `maxVaults`: no new vaults once there are this many, where the store
 *   cannot say how big the database is (250 full vaults fit in 500 MB);
 * - `vaultWritesPerDay`: writes one vault takes a day (its making counts).
 */
export const DEFAULT_LIMITS = Object.freeze({
  newVaultsPerAddress: 5,
  newVaultsPerDay: 50,
  maxDbBytes: 400_000_000,
  maxVaults: 250,
  vaultWritesPerDay: 1_000,
});

/**
 * @typedef {{
 *   version: number,
 *   authHash: string,
 *   data: Uint8Array,
 *   updatedAt: number,
 *   touchedAt: number,
 *   writesDay: string | null,
 *   writes: number,
 * }} Vault `writes`: how many times it was written on `writesDay` (a UTC day)
 *
 * @typedef {{
 *   get(id: string): Promise<Vault | null>,
 *   create(id: string, authHash: string, data: Uint8Array, now: number): Promise<boolean>,
 *   update(id: string, expected: number, data: Uint8Array, now: number, writesPerDay?: number):
 *     Promise<{ ok: true, version: number } | { ok: false, current: number | null, capped?: true }>,
 *   touch(id: string, now: number): Promise<void>,
 *   delete(id: string): Promise<boolean>,
 *   expire(before: number, abandonedBefore?: number): Promise<number>,
 *   count(): Promise<number>,
 * }} VaultStore
 *   `update` refuses with `capped` when the vault has been written
 *   `writesPerDay` times that day already
 *
 * @typedef {typeof DEFAULT_LIMITS} VaultLimits
 *
 * @typedef {{
 *   store: VaultStore,
 *   quotas?: import('./quota.mjs').QuotaStore,
 *   limits?: Partial<VaultLimits>,
 *   maxBytes?: number,
 *   allowedOrigins?: readonly string[],
 *   minWriteIntervalMs?: number,
 *   allowCreate?: (request: Request) => boolean | Promise<boolean>,
 *   live?: boolean,
 *   push?: (request: Request, respond: import('./push/reminders.mjs').Respond) => Promise<Response>,
 *   now?: () => number,
 * }} RelayOptions
 *   `quotas`: where the daily counts are kept; without them, new vaults are
 *   not limited (the tests' relays)
 */

/** The SHA-256 of a token, as lowercase hex. */
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The request's body, read up to `maxBytes`; null when there is more (the rest
 * is not read, so a body that never ends cannot fill the memory).
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {Promise<Uint8Array | null>}
 */
export async function readBody(request, maxBytes) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

/** Compares two strings without stopping at the first difference. */
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `"12"` or `W/"12"` → 12; anything else → null. */
function versionOf(tag) {
  const match = /^(?:W\/)?"(\d+)"$/.exec((tag ?? '').trim());
  return match ? Number(match[1]) : null;
}

const etag = (version) => `"${version}"`;

/**
 * Whether a page on `origin` may use the relay: any page when `*` is allowed,
 * otherwise only the listed origins (a request that names none is refused).
 * The vault API answers such pages without CORS headers; live games' sockets
 * are refused outright.
 * @param {readonly string[]} allowed
 * @param {string | null | undefined} origin
 */
export function originAllowed(allowed, origin) {
  return allowed.includes('*') || (!!origin && allowed.includes(origin));
}

/**
 * The app's origins from a comma-separated setting; any origin (`*`) when it
 * names none.
 * @param {unknown} value
 * @returns {string[]}
 */
export function originList(value) {
  const origins = String(value ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ['*'];
}

/**
 * The CORS headers for a request from `origin`. With `*` allowed, every page
 * may call the relay (it carries no cookies, so that gives nothing away);
 * otherwise only the listed origins get an answer they can read.
 */
function corsHeaders(origin, allowed) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, If-Match, If-None-Match, X-Known-Version',
    'Access-Control-Expose-Headers': 'ETag, Retry-After',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed.includes('*')) return { ...headers, 'Access-Control-Allow-Origin': '*' };
  if (originAllowed(allowed, origin)) {
    return { ...headers, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return { Vary: 'Origin' };
}

/**
 * Creates the request handler.
 * @param {RelayOptions} options
 * @returns {(request: Request) => Promise<Response>}
 */
export function createRelay(options) {
  const {
    store,
    quotas,
    maxBytes = DEFAULT_MAX_BYTES,
    allowedOrigins = ['*'],
    minWriteIntervalMs = DEFAULT_MIN_WRITE_INTERVAL_MS,
    allowCreate,
    live,
    push,
    now = Date.now,
  } = options;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  /** The health check's answer: whether live games are on, when the caller says; whether push is. */
  const health = {
    ok: true,
    maxBytes,
    ...(live === undefined ? {} : { live }),
    ...(push ? { push: true } : {}),
  };

  /**
   * Whether the database has no room for another vault: by its size where the
   * store can tell it (D1 says with each query's answer), by how many vaults it
   * holds otherwise.
   * @param {import('./quota.mjs').QuotaStore} counts
   */
  const full = async (counts) => {
    const bytes = await counts.bytes();
    if (bytes !== null) return bytes >= limits.maxDbBytes;
    return (await store.count()) >= limits.maxVaults;
  };

  return async function handle(request) {
    const cors = corsHeaders(request.headers.get('Origin'), allowedOrigins);
    /** @param {number} status @param {unknown} body @param {Record<string, string>} [extra] */
    const json = (status, body, extra = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          ...cors,
          ...extra,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    const empty = (status, extra = {}) =>
      new Response(null, { status, headers: { ...cors, ...extra, 'Cache-Control': 'no-store' } });
    const fail = (status, error, extra) => json(status, { error }, extra);

    try {
      const { pathname } = new URL(request.url);
      if (request.method === 'OPTIONS') return empty(204);
      if (pathname === '/v1/health' && request.method === 'GET') return json(200, health);
      if (pathname.startsWith('/v1/push/')) {
        return push ? await push(request, { json, empty, fail }) : fail(404, 'Not found.');
      }
      const match = VAULT_PATH.exec(pathname);
      if (!match) return fail(404, 'Not found.');
      const id = match[1] ?? '';
      if (!KEY_PATTERN.test(id)) return fail(400, 'That is not a vault id.');
      const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (!token || !KEY_PATTERN.test(token)) return fail(401, 'A vault token is needed.');
      const authHash = await hashToken(token);

      if (request.method === 'GET') {
        const vault = await store.get(id);
        if (!vault) return fail(404, 'No such vault.');
        if (!sameText(vault.authHash, authHash))
          return fail(403, 'That token does not open this vault.');
        const at = now();
        if (at - vault.touchedAt > TOUCH_INTERVAL_MS) await store.touch(id, at);
        if (versionOf(request.headers.get('X-Known-Version')) === vault.version) {
          return empty(204, { ETag: etag(vault.version) });
        }
        return new Response(vault.data, {
          status: 200,
          headers: {
            ...cors,
            ETag: etag(vault.version),
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
          },
        });
      }

      if (request.method === 'PUT') {
        const tooBig = () => fail(413, `A vault holds at most ${maxBytes} bytes.`);
        const declared = Number(request.headers.get('Content-Length') ?? '0');
        if (declared > maxBytes) return tooBig();
        const data = await readBody(request, maxBytes);
        if (data === null) return tooBig();
        if (data.byteLength === 0) return fail(400, 'An empty vault is not kept.');
        const at = now();
        const untilMidnight = { 'Retry-After': String(secondsToMidnight(at)) };
        if (request.headers.get('If-None-Match')?.trim() === '*') {
          // The cheapest refusals first: the platform's own limit (no database), then the room
          // left (a query that reads no rows, before any count is taken: a full relay spends
          // nobody's allowance), the address's count (a count at its limit writes nothing) and
          // everyone's.
          if (allowCreate && !(await allowCreate(request))) {
            return fail(429, 'Too many new vaults from here: try again in a minute.', {
              'Retry-After': '60',
            });
          }
          if (quotas) {
            if (await full(quotas)) {
              return fail(507, 'The relay is full: it makes no new vaults for now.');
            }
            if (!(await takeForAddress(quotas, 'vault', request, limits.newVaultsPerAddress, at))) {
              return fail(
                429,
                'Too many new vaults from here today: try again tomorrow.',
                untilMidnight,
              );
            }
            if (!(await takeForEveryone(quotas, 'vault', limits.newVaultsPerDay, at))) {
              return fail(
                503,
                'The relay has made all the new vaults it makes today: try again tomorrow.',
                untilMidnight,
              );
            }
          }
          const created = await store.create(id, authHash, data, at);
          if (created) return empty(201, { ETag: etag(1) });
          const existing = await store.get(id);
          return fail(
            412,
            'The vault exists already.',
            existing ? { ETag: etag(existing.version) } : {},
          );
        }
        const expected = versionOf(request.headers.get('If-Match'));
        if (expected === null) return fail(428, 'Say which version is being replaced (If-Match).');
        const vault = await store.get(id);
        if (!vault) return fail(404, 'No such vault.');
        if (!sameText(vault.authHash, authHash))
          return fail(403, 'That token does not open this vault.');
        if (vault.version !== expected) {
          return fail(412, 'The vault has changed since.', { ETag: etag(vault.version) });
        }
        if (at - vault.updatedAt < minWriteIntervalMs) {
          return fail(429, 'Too soon after the last change.', { 'Retry-After': '1' });
        }
        const writtenOut = () =>
          fail(
            429,
            'This vault has taken all the writes it takes today: try again tomorrow.',
            untilMidnight,
          );
        // Spent already: refused without sending the data to the database at all.
        if (vault.writesDay === utcDay(at) && vault.writes >= limits.vaultWritesPerDay) {
          return writtenOut();
        }
        const result = await store.update(id, expected, data, at, limits.vaultWritesPerDay);
        if (result.ok) return empty(200, { ETag: etag(result.version) });
        if (result.capped) return writtenOut();
        return result.current === null
          ? fail(404, 'No such vault.')
          : fail(412, 'The vault has changed since.', { ETag: etag(result.current) });
      }

      if (request.method === 'DELETE') {
        const vault = await store.get(id);
        if (!vault) return empty(204);
        if (!sameText(vault.authHash, authHash))
          return fail(403, 'That token does not open this vault.');
        await store.delete(id);
        return empty(204);
      }

      return fail(405, 'Method not allowed.', { Allow: 'GET, PUT, DELETE, OPTIONS' });
    } catch {
      return fail(500, 'The relay could not answer.');
    }
  };
}

/**
 * Deletes the vaults nobody has written or read for `KEEP_UNUSED_MS`, and
 * those never written after they were made that nobody has written or read for
 * `KEEP_ABANDONED_MS`.
 * @param {VaultStore} store
 */
export function expireVaults(store, now = Date.now()) {
  return store.expire(now - KEEP_UNUSED_MS, now - KEEP_ABANDONED_MS);
}
