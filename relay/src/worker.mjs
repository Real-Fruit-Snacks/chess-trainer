/**
 * The relay as a Cloudflare Worker, its vaults in a D1 database (the `DB`
 * binding, see ../wrangler.jsonc). A daily cron deletes vaults unused for a
 * year. Settings, from the Worker's variables:
 *
 *   ALLOWED_ORIGINS  the app's origins, comma-separated ("*" for any)
 *   MAX_BYTES        the largest vault accepted, in bytes
 *
 * With a rate-limiting binding named NEW_VAULTS (optional, see ../README.md),
 * each address may create only so many vaults a minute.
 */
import { d1Store } from './d1Store.mjs';
import { createRelay, DEFAULT_MAX_BYTES, expireVaults } from './handler.mjs';

/**
 * One handler per set of bindings: the table check runs once per isolate, not per request.
 * @type {WeakMap<object, (request: Request) => Promise<Response>>}
 */
const relays = new WeakMap();

/** @param {Record<string, unknown>} env */
function relayFor(env) {
  const known = relays.get(env);
  if (known) return known;
  const relay = makeRelay(env);
  relays.set(env, relay);
  return relay;
}

/** @typedef {{ limit(options: { key: string }): Promise<{ success: boolean }> }} RateLimit */

/** @param {Record<string, unknown>} env */
function makeRelay(env) {
  const newVaults = /** @type {RateLimit | undefined} */ (env.NEW_VAULTS);
  const origins = String(env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const maxBytes = Number(env.MAX_BYTES ?? DEFAULT_MAX_BYTES);
  return createRelay({
    store: d1Store(env.DB),
    allowedOrigins: origins.length > 0 ? origins : ['*'],
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    allowCreate: newVaults
      ? async (request) => {
          const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
          return (await newVaults.limit({ key })).success;
        }
      : undefined,
  });
}

export default {
  /** @param {Request} request @param {Record<string, unknown>} env */
  fetch(request, env) {
    return relayFor(env)(request);
  },
  /** @param {unknown} _controller @param {Record<string, unknown>} env @param {{ waitUntil(p: Promise<unknown>): void }} ctx */
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(expireVaults(d1Store(env.DB)));
  },
};
