/**
 * The device-sync relay's HTTP API, free of any platform: a function from a
 * Fetch API `Request` to a `Response`, over a store of vaults
 * (`./memoryStore.mjs`, `./d1Store.mjs`, `./sqliteStore.mjs`).
 *
 * A vault is one encrypted file under a random name. The app encrypts it on
 * the device with a key from the learner's recovery phrase, so the relay keeps
 * bytes it cannot read, and names nobody: no account, no email, no device. It
 * stores, per vault, the bytes, a version number, when it was last written
 * and read, and a hash of the vault's write token. Nothing is logged.
 *
 *   GET    /v1/health            → 200 { ok, maxBytes }
 *   GET    /v1/vaults/:id        → 200 the bytes, ETag "<version>"; 204 (no body) when
 *                                  X-Known-Version names the current version; 404
 *   PUT    /v1/vaults/:id        → 201 created (If-None-Match: *), 200 updated (If-Match: "<version>");
 *                                  412 when the version moved on (ETag: the current one); 413 too big
 *   DELETE /v1/vaults/:id        → 204
 *
 * Every vault request carries `Authorization: Bearer <token>`: the token comes
 * from the same phrase, and only its SHA-256 is stored. A vault id is 32
 * random-looking bytes and a token another 32, both base64url. An unchanged
 * vault is answered with 204 rather than HTTP's 304, which some browsers do not
 * hand to a page as it is.
 */

/** Vault ids and tokens: 32 bytes in base64url, unpadded. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VAULT_PATH = /^\/v1\/vaults\/([^/]+)$/;

/** The largest vault accepted, in bytes (the D1 store keeps it as base64 in a 2 MB row). */
export const DEFAULT_MAX_BYTES = 1_400_000;
/** A vault may be written this often at most. */
export const DEFAULT_MIN_WRITE_INTERVAL_MS = 1_000;
/** Vaults neither written nor read for this long are deleted (see `expireVaults`). */
export const KEEP_UNUSED_MS = 365 * 24 * 60 * 60 * 1000;
/** A read counts as use when the last one is older than this (so reads seldom write). */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {{
 *   version: number,
 *   authHash: string,
 *   data: Uint8Array,
 *   updatedAt: number,
 *   touchedAt: number,
 * }} Vault
 *
 * @typedef {{
 *   get(id: string): Promise<Vault | null>,
 *   create(id: string, authHash: string, data: Uint8Array, now: number): Promise<boolean>,
 *   update(id: string, expected: number, data: Uint8Array, now: number):
 *     Promise<{ ok: true, version: number } | { ok: false, current: number | null }>,
 *   touch(id: string, now: number): Promise<void>,
 *   delete(id: string): Promise<boolean>,
 *   expire(before: number): Promise<number>,
 * }} VaultStore
 *
 * @typedef {{
 *   store: VaultStore,
 *   maxBytes?: number,
 *   allowedOrigins?: readonly string[],
 *   minWriteIntervalMs?: number,
 *   now?: () => number,
 * }} RelayOptions
 */

/** The SHA-256 of a token, as lowercase hex. */
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
 * The CORS headers for a request from `origin`. With `*` allowed, every page
 * may call the relay (it carries no cookies, so that gives nothing away);
 * otherwise only the listed origins get an answer they can read.
 */
function corsHeaders(origin, allowed) {
  const any = allowed.includes('*');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, If-Match, If-None-Match, X-Known-Version',
    'Access-Control-Expose-Headers': 'ETag, Retry-After',
    'Access-Control-Max-Age': '86400',
  };
  if (any) return { ...headers, 'Access-Control-Allow-Origin': '*' };
  if (origin && allowed.includes(origin)) {
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
    maxBytes = DEFAULT_MAX_BYTES,
    allowedOrigins = ['*'],
    minWriteIntervalMs = DEFAULT_MIN_WRITE_INTERVAL_MS,
    now = Date.now,
  } = options;

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
      if (pathname === '/v1/health' && request.method === 'GET') {
        return json(200, { ok: true, maxBytes });
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
        const declared = Number(request.headers.get('Content-Length') ?? '0');
        if (declared > maxBytes) return fail(413, `A vault holds at most ${maxBytes} bytes.`);
        const data = new Uint8Array(await request.arrayBuffer());
        if (data.byteLength > maxBytes)
          return fail(413, `A vault holds at most ${maxBytes} bytes.`);
        if (data.byteLength === 0) return fail(400, 'An empty vault is not kept.');
        const at = now();
        if (request.headers.get('If-None-Match')?.trim() === '*') {
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
        const result = await store.update(id, expected, data, at);
        if (result.ok) return empty(200, { ETag: etag(result.version) });
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

/** Deletes the vaults nobody has written or read for `KEEP_UNUSED_MS`. */
export function expireVaults(store, now = Date.now()) {
  return store.expire(now - KEEP_UNUSED_MS);
}
