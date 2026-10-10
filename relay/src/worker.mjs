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
 *
 * Live games are two Durable Objects (live/cloudflare.mjs): the bindings
 * LIVE_LOBBY and LIVE_ROOMS. WebSocket upgrades of `/v1/lobby` and
 * `/v1/games/:id`, from the allowed origins, go to them; nothing else does.
 */
import { d1Store } from './d1Store.mjs';
import { createRelay, DEFAULT_MAX_BYTES, expireVaults, originAllowed } from './handler.mjs';
import { LiveLobby, LiveRoom } from './live/cloudflare.mjs';
import { ID_PATTERN } from './live/shared.mjs';

// The runtime finds the Durable Object classes among the main module's exports.
export { LiveLobby, LiveRoom };

const GAME_PATH = /^\/v1\/games\/([^/]+)$/;

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
/** @typedef {import('./live/cloudflare.mjs').DurableNamespace} DurableNamespace */

/**
 * The app's origins, from ALLOWED_ORIGINS ("*" when there are none).
 * @param {Record<string, unknown>} env
 */
function originsOf(env) {
  const origins = String(env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ['*'];
}

/** Whether live games are set up: both Durable Object bindings are there. */
const liveIn = (/** @type {Record<string, unknown>} */ env) =>
  Boolean(env.LIVE_LOBBY && env.LIVE_ROOMS);

/** @param {Record<string, unknown>} env */
function makeRelay(env) {
  const newVaults = /** @type {RateLimit | undefined} */ (env.NEW_VAULTS);
  const maxBytes = Number(env.MAX_BYTES ?? DEFAULT_MAX_BYTES);
  return createRelay({
    store: d1Store(env.DB),
    allowedOrigins: originsOf(env),
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    allowCreate: newVaults
      ? async (request) => {
          const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
          return (await newVaults.limit({ key })).success;
        }
      : undefined,
    live: liveIn(env),
  });
}

/** @param {number} status @param {string} error */
const refusal = (status, error) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * A request for live games, passed to its Durable Object: the waiting room's
 * socket (`/v1/lobby`) or a game's (`/v1/games/:id`). Null for any other path,
 * which the vault API answers. Only WebSocket upgrades are passed on, as they
 * came: the objects' own `/create` can never be reached from outside.
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @returns {Response | Promise<Response> | null}
 */
function live(request, env) {
  const { pathname } = new URL(request.url);
  const game = GAME_PATH.exec(pathname)?.[1];
  const lobby = pathname === '/v1/lobby';
  if (!lobby && !(game !== undefined && ID_PATTERN.test(game))) return null;
  if (!originAllowed(originsOf(env), request.headers.get('Origin'))) {
    return refusal(403, 'Pages on this origin cannot play here.');
  }
  if (!liveIn(env)) return refusal(404, 'Live games are not set up on this relay.');
  if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return refusal(426, 'Connect with a WebSocket.');
  }
  const objects = /** @type {DurableNamespace} */ (lobby ? env.LIVE_LOBBY : env.LIVE_ROOMS);
  return objects.get(objects.idFromName(lobby ? 'lobby' : (game ?? ''))).fetch(request);
}

export default {
  /** @param {Request} request @param {Record<string, unknown>} env */
  fetch(request, env) {
    return live(request, env) ?? relayFor(env)(request);
  },
  /** @param {unknown} _controller @param {Record<string, unknown>} env @param {{ waitUntil(p: Promise<unknown>): void }} ctx */
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(expireVaults(d1Store(env.DB)));
  },
};
