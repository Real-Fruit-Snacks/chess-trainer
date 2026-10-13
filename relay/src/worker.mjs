/**
 * The relay as a Cloudflare Worker, its vaults in a D1 database (the `DB`
 * binding, see ../wrangler.jsonc), and its push keys, daily reminders and
 * daily counts in tables of their own there (made on first use). Settings,
 * from the Worker's variables:
 *
 *   ALLOWED_ORIGINS            the app's origins, comma-separated ("*" for any)
 *   MAX_BYTES                  the largest vault accepted, in bytes
 *   PUSH_CONTACT               the contact in the relay's push messages, mailto: or
 *                              https: (the first https origin of ALLOWED_ORIGINS when unset)
 *   REMINDERS_PER_RUN          the most reminders one cron run sends (25: the free
 *                              plan's 50 requests a run, with room to spare)
 *   NEW_VAULTS_PER_ADDRESS     new vaults one address may make a UTC day (5)
 *   NEW_VAULTS_PER_DAY         new vaults the relay makes a UTC day, from everyone (50)
 *   MAX_DB_BYTES               no new vaults once the database is this big (400,000,000)
 *   MAX_VAULTS                 no new vaults once there are this many, should D1 not
 *                              say how big the database is (250)
 *   VAULT_WRITES_PER_DAY       writes one vault takes a UTC day (1,000)
 *   NEW_REMINDERS_PER_ADDRESS  new reminders one address may make a UTC day (5)
 *
 * Each is a whole number; one that is not leaves the default (the daily counts
 * of new vaults and reminders may be 0: none at all). An optional secret,
 * QUOTA_SECRET (`wrangler secret put QUOTA_SECRET`), makes the hashes the
 * counts are kept under keyed (HMAC), here and in the waiting room, so that
 * nobody holding the database can try addresses against them. The counts are kept in
 * D1, so they hold across Cloudflare's locations and isolates.
 *
 * With a rate-limiting binding named NEW_VAULTS (optional, see ../README.md),
 * each address may also create only so many vaults a minute; one named
 * NEW_REMINDERS does the same for reminders.
 *
 * Two crons (`controller.cron` tells them apart): DAILY_CRON deletes vaults
 * long unused, reminders unheard of for 60 days, and the daily counts of the
 * days before yesterday; every other one (every 15 minutes) sends the
 * reminders due.
 *
 * Live games are two Durable Objects (live/cloudflare.mjs): the bindings
 * LIVE_LOBBY and LIVE_ROOMS. WebSocket upgrades of `/v1/lobby` and
 * `/v1/games/:id`, from the allowed origins, go to them; nothing else does.
 * Group rooms (up to eight by link) are a third, LIVE_GROUPS: `/v1/rooms/:id`.
 */
import { d1Store } from './d1Store.mjs';
import {
  createRelay,
  DEFAULT_LIMITS,
  DEFAULT_MAX_BYTES,
  expireVaults,
  originAllowed,
  originList,
} from './handler.mjs';
import { LiveGroup, LiveLobby, LiveRoom } from './live/cloudflare.mjs';
import { ID_PATTERN } from './live/shared.mjs';
import { d1PushStore } from './push/d1PushStore.mjs';
import {
  createPushApi,
  expireReminders,
  NEW_REMINDERS_PER_ADDRESS,
  pushContact,
  REMINDERS_PER_RUN,
  sendDueReminders,
} from './push/reminders.mjs';
import { addressOf, expireQuotas, wholeSetting, withSecret } from './quota.mjs';

// The runtime finds the Durable Object classes among the main module's exports.
export { LiveGroup, LiveLobby, LiveRoom };

const GAME_PATH = /^\/v1\/games\/([^/]+)$/;
const ROOM_PATH = /^\/v1\/rooms\/([^/]+)$/;
/** The daily cron, as wrangler.jsonc names it. */
export const DAILY_CRON = '17 3 * * *';

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
const originsOf = (env) => originList(env.ALLOWED_ORIGINS);

/**
 * The vaults' store, with the daily counts, one per set of bindings (its
 * tables are checked once), shared by the requests and the crons.
 * @type {WeakMap<object, ReturnType<typeof d1Store>>}
 */
const vaultStores = new WeakMap();

/** @param {Record<string, unknown>} env */
function vaultStoreFor(env) {
  let store = vaultStores.get(env);
  if (!store) {
    store = d1Store(/** @type {{ prepare(sql: string): any }} */ (env.DB));
    vaultStores.set(env, store);
  }
  return store;
}

/**
 * The push data's store, one per set of bindings (its tables are checked once).
 * @type {WeakMap<object, import('./push/reminders.mjs').PushStore>}
 */
const pushStores = new WeakMap();

/** @param {Record<string, unknown>} env */
function pushStoreFor(env) {
  let store = pushStores.get(env);
  if (!store) {
    store = d1PushStore(/** @type {{ prepare(sql: string): any }} */ (env.DB));
    pushStores.set(env, store);
  }
  return store;
}

/**
 * Asks a rate-limiting binding, when there is one, whether a request's address
 * (an IPv6 address by its /64, see address.mjs) may make one more of something.
 * @param {unknown} binding
 * @returns {((request: Request) => Promise<boolean>) | undefined}
 */
function limitBy(binding) {
  const limiter = /** @type {RateLimit | undefined} */ (binding);
  return limiter
    ? async (request) => (await limiter.limit({ key: addressOf(request) })).success
    : undefined;
}

/**
 * The limits on vaults, from the Worker's variables (see above).
 * @param {Record<string, unknown>} env
 * @returns {import('./handler.mjs').VaultLimits}
 */
const vaultLimits = (env) => ({
  newVaultsPerAddress: wholeSetting(
    env.NEW_VAULTS_PER_ADDRESS,
    DEFAULT_LIMITS.newVaultsPerAddress,
    0,
  ),
  newVaultsPerDay: wholeSetting(env.NEW_VAULTS_PER_DAY, DEFAULT_LIMITS.newVaultsPerDay, 0),
  maxDbBytes: wholeSetting(env.MAX_DB_BYTES, DEFAULT_LIMITS.maxDbBytes),
  maxVaults: wholeSetting(env.MAX_VAULTS, DEFAULT_LIMITS.maxVaults),
  vaultWritesPerDay: wholeSetting(env.VAULT_WRITES_PER_DAY, DEFAULT_LIMITS.vaultWritesPerDay),
});

/** Whether live games are set up: both Durable Object bindings are there. */
const liveIn = (/** @type {Record<string, unknown>} */ env) =>
  Boolean(env.LIVE_LOBBY && env.LIVE_ROOMS);

/** @param {Record<string, unknown>} env */
function makeRelay(env) {
  const maxBytes = Number(env.MAX_BYTES ?? DEFAULT_MAX_BYTES);
  const store = vaultStoreFor(env);
  const quotas = withSecret(store.quotas, env.QUOTA_SECRET);
  return createRelay({
    store,
    quotas,
    limits: vaultLimits(env),
    allowedOrigins: originsOf(env),
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    allowCreate: limitBy(env.NEW_VAULTS),
    live: liveIn(env),
    push: createPushApi({
      store: pushStoreFor(env),
      allowedOrigins: originsOf(env),
      allowReminder: limitBy(env.NEW_REMINDERS),
      quotas,
      newRemindersPerAddress: wholeSetting(
        env.NEW_REMINDERS_PER_ADDRESS,
        NEW_REMINDERS_PER_ADDRESS,
        0,
      ),
    }),
  });
}

/**
 * What a cron run does: the daily one forgets the vaults and reminders long
 * unused, and the daily counts no longer needed; the others send the
 * reminders due.
 * @param {string | undefined} cron
 * @param {Record<string, unknown>} env
 */
async function scheduledRun(cron, env) {
  const store = pushStoreFor(env);
  if (cron === DAILY_CRON) {
    const vaults = vaultStoreFor(env);
    await expireVaults(vaults);
    await expireReminders(store);
    await expireQuotas(vaults.quotas);
    return;
  }
  const limit = Number(env.REMINDERS_PER_RUN ?? REMINDERS_PER_RUN);
  await sendDueReminders({
    store,
    contact: pushContact(originsOf(env), env.PUSH_CONTACT),
    limit: Number.isSafeInteger(limit) && limit > 0 ? limit : REMINDERS_PER_RUN,
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
 * socket (`/v1/lobby`), a game's (`/v1/games/:id`) or a group room's
 * (`/v1/rooms/:id`). Null for any other path, which the vault API answers.
 * Only WebSocket upgrades are passed on, as they came: the objects' own
 * `/create` and the waiting room's `/no-show`, which only the relay's own
 * objects send each other, can never be reached from outside.
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @returns {Response | Promise<Response> | null}
 */
function live(request, env) {
  const { pathname } = new URL(request.url);
  const game = GAME_PATH.exec(pathname)?.[1];
  const room = ROOM_PATH.exec(pathname)?.[1];
  const id = game ?? room;
  const lobby = pathname === '/v1/lobby';
  if (!lobby && !(id !== undefined && ID_PATTERN.test(id))) return null;
  if (!originAllowed(originsOf(env), request.headers.get('Origin'))) {
    return refusal(403, 'Pages on this origin cannot play here.');
  }
  if (!liveIn(env) || (room !== undefined && !env.LIVE_GROUPS)) {
    return refusal(404, 'Live games are not set up on this relay.');
  }
  if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return refusal(426, 'Connect with a WebSocket.');
  }
  const objects = /** @type {DurableNamespace} */ (
    lobby ? env.LIVE_LOBBY : room !== undefined ? env.LIVE_GROUPS : env.LIVE_ROOMS
  );
  return objects.get(objects.idFromName(lobby ? 'lobby' : (id ?? ''))).fetch(request);
}

export default {
  /** @param {Request} request @param {Record<string, unknown>} env */
  fetch(request, env) {
    return live(request, env) ?? relayFor(env)(request);
  },
  /**
   * @param {{ cron?: string } | null} controller
   * @param {Record<string, unknown>} env
   * @param {{ waitUntil(p: Promise<unknown>): void }} ctx
   */
  scheduled(controller, env, ctx) {
    ctx.waitUntil(scheduledRun(controller?.cron, env));
  },
};
