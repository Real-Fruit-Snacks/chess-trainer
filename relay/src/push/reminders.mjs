/**
 * Push from the relay: its HTTP endpoints, the daily reminders, and the sender
 * the game rooms use for correspondence games.
 *
 *   GET    /v1/push/key        → 200 { key }: the relay's VAPID public key (base64url), for
 *                                 `pushManager.subscribe({ applicationServerKey })`
 *   POST   /v1/push/reminder   { token, subscription, minute, tz, trained? }
 *                               → 201 made / 200 changed, { next }: when the next reminder is due
 *   DELETE /v1/push/reminder   { token } → 204
 *   POST   /v1/push/trained    { token, day, tz? } → 204; 404 when the relay has no such reminder
 *
 * A device names its reminder by a random token of its own (32 bytes,
 * base64url); the relay keeps only the token's SHA-256, as for vaults. A
 * reminder is pushed every day at `minute` (after midnight, in quarter hours)
 * in the device's time zone `tz`, unless the device has said that day was a
 * training day (`trained`). A cron sends the reminders due every 15 minutes
 * (`sendDueReminders`); a reminder whose device has not been heard from for 60
 * days is deleted (`expireReminders`), and so is one whose push service says
 * its subscription is gone.
 *
 * Every request comes from the app's origins only (403 otherwise), with a body
 * of at most `PUSH_BODY_BYTES`, at most `PUSH_REQUESTS_PER_MINUTE` from one
 * address; the relay keeps `MAX_REMINDERS` at most.
 */
import { hashToken, originAllowed, readBody } from '../handler.mjs';
import { sendPush, subscriptionOf, vapidKeys } from './webpush.mjs';

/**
 * @typedef {import('./webpush.mjs').VapidKeys} VapidKeys
 * @typedef {import('./webpush.mjs').Subscription} Subscription
 * @typedef {import('./webpush.mjs').PushMessage} PushMessage
 *
 * @typedef {{
 *   key: string,
 *   endpoint: string,
 *   p256dh: string,
 *   auth: string,
 *   minute: number,
 *   tz: string,
 *   nextAt: number,
 *   trainedDay: string | null,
 *   createdAt: number,
 *   touchedAt: number,
 * }} Reminder
 *   `key`: the SHA-256 of the device's token; `minute`: the time of day, in the
 *   device's time zone `tz`; `nextAt`: when the next one is due; `trainedDay`:
 *   the last day the device trained ("YYYY-MM-DD" there)
 *
 * @typedef {{
 *   keys(): Promise<VapidKeys | null>,
 *   saveKeys(keys: VapidKeys): Promise<void>,
 *   reminder(key: string): Promise<Reminder | null>,
 *   saveReminder(reminder: Reminder): Promise<void>,
 *   deleteReminder(key: string): Promise<boolean>,
 *   forgetEndpoint(endpoint: string): Promise<number>,
 *   countReminders(): Promise<number>,
 *   dueReminders(now: number, limit: number): Promise<Reminder[]>,
 *   expireReminders(before: number): Promise<number>,
 * }} PushStore
 *   `saveKeys` keeps the first pair only (another relay may have made one at
 *   the same moment); `dueReminders` gives the ones due by `now`, the oldest first
 */

/** Reminders are set in quarter hours. */
export const REMINDER_STEP_MINUTES = 15;
/** The most reminders a relay keeps. */
export const MAX_REMINDERS = 5000;
/**
 * Reminders sent by one cron run at most: a Worker on the free plan may make
 * 50 requests of its own per run. The rest wait for the next run.
 */
export const REMINDERS_PER_RUN = 25;
/** A reminder found more than this late (the relay was down) waits for the next day. */
export const REMINDER_LATE_MS = 60 * 60_000;
/** A reminder nothing has been heard of (no training day, no change) for this long is deleted. */
export const REMINDER_KEEP_MS = 60 * 24 * 60 * 60_000;
/** The largest body a push request may have. */
export const PUSH_BODY_BYTES = 4096;
/** Push requests one address may make a minute (more get 429). */
export const PUSH_REQUESTS_PER_MINUTE = 20;
/** The contact a push service may write to about the relay's messages, when none is set. */
export const DEFAULT_PUSH_CONTACT = 'mailto:relay@example.invalid';

/** What a reminder says. */
export const REMINDER_MESSAGE = Object.freeze({
  title: 'Time for some chess',
  body: 'A few minutes today keeps your training going.',
  url: '',
  tag: 'reminder',
});

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * The contact in the relay's VAPID tokens: the one configured, if it is a
 * mailto: or https: address; else the app's first https origin; else a
 * placeholder.
 * @param {readonly string[]} allowedOrigins
 * @param {unknown} [configured]
 */
export function pushContact(allowedOrigins, configured) {
  if (typeof configured === 'string' && /^(?:mailto:\S+@\S+|https:\/\/\S+)$/.test(configured)) {
    return configured;
  }
  return allowedOrigins.find((origin) => origin.startsWith('https://')) ?? DEFAULT_PUSH_CONTACT;
}

/* ------------------------------------------------------------------ */
/* Time zones                                                         */
/* ------------------------------------------------------------------ */

/** @type {Map<string, Intl.DateTimeFormat>} */
const formats = new Map();

/** Whether `tz` is a time zone this runtime knows (an IANA name: "Europe/London"). @param {unknown} tz */
export function knownTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in `tz` at `instant`. @param {number} instant @param {string} tz */
function wallClock(instant, tz) {
  let format = formats.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formats.set(tz, format);
  }
  /** @type {Record<string, number>} */
  const parts = {};
  for (const { type, value } of format.formatToParts(instant)) parts[type] = Number(value);
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** The calendar day at `instant` in `tz`, "YYYY-MM-DD". @param {number} instant @param {string} tz */
export function localDay(instant, tz) {
  const { year, month, day } = wallClock(instant, tz);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** How far `tz`'s clock is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(/** @type {number} */ instant, /** @type {string} */ tz) {
  const w = wallClock(instant, tz);
  return (
    Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) -
    Math.floor(instant / 1000) * 1000
  );
}

/**
 * The moment `tz`'s clocks show `minute` (after midnight) on `day`. On the
 * night the clocks change, a time that does not exist there falls an hour off,
 * which is near enough for a reminder.
 * @param {string} day "YYYY-MM-DD"
 * @param {number} minute
 * @param {string} tz
 */
export function instantOf(day, minute, tz) {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minute);
  const first = wall - offsetAt(wall, tz);
  return wall - offsetAt(first, tz);
}

/** The day after `day` ("YYYY-MM-DD"). */
function dayAfter(/** @type {string} */ day) {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * When the next reminder is due after `now`: today at `minute` in `tz`, unless
 * that time has passed or today was a training day there; tomorrow's otherwise.
 * @param {number} now
 * @param {number} minute
 * @param {string} tz
 * @param {string | null} trainedDay
 */
export function nextReminderAt(now, minute, tz, trainedDay) {
  const today = localDay(now, tz);
  const atToday = instantOf(today, minute, tz);
  if (atToday > now && trainedDay !== today) return atToday;
  return instantOf(dayAfter(today), minute, tz);
}

/* ------------------------------------------------------------------ */
/* Sending                                                            */
/* ------------------------------------------------------------------ */

/**
 * The game rooms' sender: a correspondence game's "your move" and the like,
 * to the subscription a player left with their seat. The message's tag is its
 * topic, so a newer message of the same game replaces one not yet delivered.
 * @param {{ store: Pick<PushStore, 'keys' | 'saveKeys'>, contact: string, fetch?: typeof fetch }} options
 * @returns {(subscription: Subscription, message: PushMessage) => Promise<'sent' | 'gone' | 'failed'>}
 */
export function pushSender({ store, contact, fetch: send }) {
  /** The keys, read once: a pair once kept never changes. */
  /** @type {VapidKeys | null} */
  let known = null;
  return async (subscription, message) => {
    let keys;
    try {
      keys = known ??= await vapidKeys(store);
    } catch {
      return 'failed';
    }
    const topic = /^[A-Za-z0-9_-]{1,32}$/.test(message.tag) ? message.tag : undefined;
    return sendPush(subscription, message, {
      keys,
      contact,
      fetch: send,
      ttl: 2 * 24 * 60 * 60,
      topic,
    });
  };
}

/**
 * Sends the reminders due (at most `limit`, the oldest first), each unless its
 * device trained today, and sets each one's next time. A reminder more than an
 * hour late waits for the next day. One whose subscription is gone is deleted.
 * @param {{
 *   store: PushStore,
 *   contact: string,
 *   fetch?: typeof fetch,
 *   now?: number,
 *   limit?: number,
 * }} options
 */
export async function sendDueReminders({
  store,
  contact,
  fetch: send,
  now = Date.now(),
  limit = REMINDERS_PER_RUN,
}) {
  const due = await store.dueReminders(now, limit);
  const counts = { sent: 0, skipped: 0, gone: 0, failed: 0 };
  if (due.length === 0) return counts;
  const keys = await vapidKeys(store);
  for (const reminder of due) {
    const trained = reminder.trainedDay === localDay(now, reminder.tz);
    const late = now - reminder.nextAt > REMINDER_LATE_MS;
    if (trained || late) {
      counts.skipped++;
    } else {
      const result = await sendPush(reminder, REMINDER_MESSAGE, {
        keys,
        contact,
        fetch: send,
        // A reminder an hour late is no reminder.
        ttl: 60 * 60,
        topic: 'reminder',
        now,
      });
      if (result === 'gone') {
        await store.forgetEndpoint(reminder.endpoint);
        counts.gone++;
        continue;
      }
      counts[result]++;
    }
    await store.saveReminder({
      ...reminder,
      nextAt: nextReminderAt(now, reminder.minute, reminder.tz, reminder.trainedDay),
    });
  }
  return counts;
}

/** Deletes the reminders nothing has been heard of for `REMINDER_KEEP_MS`. @param {PushStore} store */
export function expireReminders(store, now = Date.now()) {
  return store.expireReminders(now - REMINDER_KEEP_MS);
}

/* ------------------------------------------------------------------ */
/* The endpoints                                                      */
/* ------------------------------------------------------------------ */

/**
 * At most `limit` requests per address in each `windowMs`; the addresses seen
 * are kept in memory only, and only while they count.
 * @param {number} limit
 * @param {number} windowMs
 */
export function rateLimiter(limit, windowMs) {
  /** @type {Map<string, { start: number, count: number }>} */
  const seen = new Map();
  return (/** @type {string} */ address, /** @type {number} */ now) => {
    if (seen.size >= 10_000) {
      for (const [key, entry] of seen) if (now - entry.start >= windowMs) seen.delete(key);
      if (seen.size >= 10_000) seen.clear();
    }
    const entry = seen.get(address);
    if (!entry || now - entry.start >= windowMs) {
      seen.set(address, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

/**
 * @typedef {{
 *   json(status: number, body: unknown, extra?: Record<string, string>): Response,
 *   empty(status: number, extra?: Record<string, string>): Response,
 *   fail(status: number, error: string, extra?: Record<string, string>): Response,
 * }} Respond the relay's answers, with its CORS headers
 *
 * @typedef {{
 *   store: PushStore,
 *   allowedOrigins?: readonly string[],
 *   allowReminder?: (request: Request) => boolean | Promise<boolean>,
 *   now?: () => number,
 * }} PushApiOptions `allowReminder`: asked before a new reminder is kept (a limit per address)
 */

/** A JSON object from the body, at most `PUSH_BODY_BYTES`; 'too-big', or null when it is no object. */
async function bodyOf(/** @type {Request} */ request) {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > PUSH_BODY_BYTES) return 'too-big';
  const data = await readBody(request, PUSH_BODY_BYTES);
  if (data === null) return 'too-big';
  try {
    const value = JSON.parse(new TextDecoder().decode(data));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  } catch {
    return null;
  }
}

/**
 * The push endpoints, as part of the relay's handler (handler.mjs passes on
 * every path under /v1/push/ with its own way of answering).
 * @param {PushApiOptions} options
 * @returns {(request: Request, respond: Respond) => Promise<Response>}
 */
export function createPushApi({ store, allowedOrigins = ['*'], allowReminder, now = Date.now }) {
  const limit = rateLimiter(PUSH_REQUESTS_PER_MINUTE, 60_000);

  return async function push(request, { json, empty, fail }) {
    const { pathname } = new URL(request.url);
    const at = now();
    if (pathname === '/v1/push/key') {
      if (request.method !== 'GET') return fail(405, 'Method not allowed.', { Allow: 'GET' });
      return json(200, { key: (await vapidKeys(store)).publicKey });
    }
    const route =
      pathname === '/v1/push/reminder'
        ? 'reminder'
        : pathname === '/v1/push/trained'
          ? 'trained'
          : null;
    if (!route) return fail(404, 'Not found.');
    const allowed = route === 'reminder' ? ['POST', 'DELETE'] : ['POST'];
    if (!allowed.includes(request.method)) {
      return fail(405, 'Method not allowed.', { Allow: allowed.join(', ') });
    }
    if (!originAllowed(allowedOrigins, request.headers.get('Origin'))) {
      return fail(403, 'Pages on this origin cannot ask for reminders here.');
    }
    if (!limit(request.headers.get('CF-Connecting-IP') ?? '', at)) {
      return fail(429, 'Too many requests: try again in a minute.', { 'Retry-After': '60' });
    }
    const body = await bodyOf(request);
    if (body === 'too-big') return fail(413, 'That is too much.');
    if (!body || typeof body.token !== 'string' || !TOKEN.test(body.token)) {
      return fail(400, 'A reminder token is needed.');
    }
    const key = await hashToken(body.token);

    if (route === 'reminder' && request.method === 'DELETE') {
      await store.deleteReminder(key);
      return empty(204);
    }

    if (route === 'trained') {
      const reminder = await store.reminder(key);
      if (!reminder) return fail(404, 'No such reminder.');
      if (typeof body.day !== 'string' || !DAY.test(body.day)) return fail(400, 'Which day?');
      const tz = knownTimeZone(body.tz) ? /** @type {string} */ (body.tz) : reminder.tz;
      await store.saveReminder({
        ...reminder,
        tz,
        trainedDay: body.day,
        nextAt: nextReminderAt(at, reminder.minute, tz, body.day),
        touchedAt: at,
      });
      return empty(204);
    }

    // A reminder made or changed: its subscription, its time and its time zone.
    const subscription = subscriptionOf(body.subscription);
    const minute = body.minute;
    if (
      !subscription ||
      typeof minute !== 'number' ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute >= 24 * 60 ||
      minute % REMINDER_STEP_MINUTES !== 0 ||
      !knownTimeZone(body.tz) ||
      (body.trained !== undefined &&
        body.trained !== null &&
        (typeof body.trained !== 'string' || !DAY.test(body.trained)))
    ) {
      return fail(400, 'That reminder cannot be kept.');
    }
    const tz = /** @type {string} */ (body.tz);
    const known = await store.reminder(key);
    if (!known) {
      if ((await store.countReminders()) >= MAX_REMINDERS) {
        return fail(503, 'This relay keeps all the reminders it can.');
      }
      if (allowReminder && !(await allowReminder(request))) {
        return fail(429, 'Too many new reminders from here: try again in a minute.', {
          'Retry-After': '60',
        });
      }
    }
    const trainedDay =
      typeof body.trained === 'string' ? body.trained : (known?.trainedDay ?? null);
    /** @type {Reminder} */
    const reminder = {
      key,
      ...subscription,
      minute,
      tz,
      nextAt: nextReminderAt(at, minute, tz, trainedDay),
      trainedDay,
      createdAt: known?.createdAt ?? at,
      touchedAt: at,
    };
    await store.saveReminder(reminder);
    return json(known ? 200 : 201, { next: reminder.nextAt });
  };
}
