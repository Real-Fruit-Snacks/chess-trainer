// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './fakeD1';
import { createRelay, hashToken } from './src/handler.mjs';
import { memoryStore } from './src/memoryStore.mjs';
import { d1PushStore } from './src/push/d1PushStore.mjs';
import { memoryPushStore } from './src/push/memoryPushStore.mjs';
import {
  createPushApi,
  DEFAULT_PUSH_CONTACT,
  expireReminders,
  instantOf,
  knownTimeZone,
  localDay,
  MAX_REMINDERS,
  nextReminderAt,
  PUSH_BODY_BYTES,
  PUSH_REQUESTS_PER_MINUTE,
  pushContact,
  pushSender,
  REMINDER_KEEP_MS,
  REMINDER_MESSAGE,
  sendDueReminders,
  type PushStore,
  type Reminder,
} from './src/push/reminders.mjs';
import { sqlitePushStore } from './src/push/sqlitePushStore.mjs';
import {
  encryptPush,
  fromBase64Url,
  makeVapidKeys,
  pushEndpointAllowed,
  sendPush,
  subscriptionOf,
  toBase64Url,
  vapidAuthorization,
} from './src/push/webpush.mjs';
import worker, { DAILY_CRON } from './src/worker.mjs';

/** RFC 8291, section 5 and Appendix A: the example message and its keys. */
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const bytes = (text: string) => fromBase64Url(text)!;

/** A P-256 key pair from a raw public point and a private scalar, as WebCrypto takes them. */
async function ecdhPair(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const point = bytes(publicKey);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(point.slice(1, 33)),
    y: toBase64Url(point.slice(33, 65)),
    d: privateKey,
  };
  const algorithm = { name: 'ECDH', namedCurve: 'P-256' };
  return {
    publicKey: await crypto.subtle.importKey('raw', point, algorithm, true, []),
    privateKey: await crypto.subtle.importKey('jwk', jwk, algorithm, true, ['deriveBits']),
  };
}

/** What a browser does with a push message: decrypts it with its own keys (RFC 8291, 8188). */
async function decrypt(
  body: Uint8Array<ArrayBuffer>,
  uaPublic: string,
  uaPrivate: string,
  auth: string,
) {
  const salt = body.slice(0, 16);
  const keyLength = body[20] ?? 0;
  const asPublic = body.slice(21, 21 + keyLength);
  const record = body.slice(21 + keyLength);
  const ua = await ecdhPair(uaPublic, uaPrivate);
  const as = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: as }, ua.privateKey, 256),
  );
  const hkdf = async (s: BufferSource, ikm: BufferSource, info: BufferSource, bits: number) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: s, info },
        await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
        bits,
      ),
    );
  const text = (s: string) => new TextEncoder().encode(s);
  const join = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const zero = new Uint8Array([0]);
  const ikm = await hkdf(
    bytes(auth),
    shared,
    join(text('WebPush: info'), zero, bytes(uaPublic), asPublic),
    256,
  );
  const cek = await hkdf(salt, ikm, join(text('Content-Encoding: aes128gcm'), zero), 128);
  const nonce = await hkdf(salt, ikm, join(text('Content-Encoding: nonce'), zero), 96);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );
  expect(padded.at(-1)).toBe(2);
  return new TextDecoder().decode(padded.slice(0, -1));
}

describe('Web Push encryption (RFC 8291)', () => {
  it('encrypts the RFC’s example message to the very bytes of its Appendix A', async () => {
    const body = await encryptPush(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      { salt: bytes(RFC.salt), keys: await ecdhPair(RFC.asPublic, RFC.asPrivate) },
    );
    expect(toBase64Url(body.slice(0, 86))).toBe(RFC.header);
    expect(toBase64Url(body.slice(86))).toBe(RFC.ciphertext);
    expect(toBase64Url(body)).toBe(RFC.message);
  });

  it('makes a message only its subscriber can read, with fresh keys and salt each time', async () => {
    const plaintext = new TextEncoder().encode(JSON.stringify({ title: 'Your move' }));
    const one = await encryptPush(plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth });
    const two = await encryptPush(plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth });
    expect(toBase64Url(one)).not.toBe(toBase64Url(two));
    expect(one.slice(16, 21)).toEqual(new Uint8Array([0, 0, 0x10, 0, 65]));
    expect(await decrypt(one, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"title":"Your move"}');
    expect(await decrypt(two, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"title":"Your move"}');
    await expect(encryptPush(plaintext, { p256dh: 'short', auth: RFC.auth })).rejects.toThrow();
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs a token for the push service’s origin, lasting at most a day, that its public key verifies', async () => {
    const keys = await makeVapidKeys();
    expect(bytes(keys.publicKey)).toHaveLength(65);
    const now = Date.UTC(2026, 9, 11, 12);
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, {
      contact: 'mailto:relay@example.org',
      now,
    });
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(bytes(head)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    const body = JSON.parse(new TextDecoder().decode(bytes(claims))) as Record<string, unknown>;
    expect(body).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'mailto:relay@example.org',
    });
    const publicKey = await crypto.subtle.importKey(
      'raw',
      bytes(keys.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      bytes(signature),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
    // The same token serves the same push service a while; another origin gets its own.
    expect(
      await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', keys, {
        contact: 'mailto:relay@example.org',
        now: now + 60_000,
      }),
    ).toBe(header);
    expect(
      await vapidAuthorization('https://web.push.apple.com/abc', keys, {
        contact: 'mailto:relay@example.org',
        now,
      }),
    ).toContain(
      toBase64Url(
        new TextEncoder().encode(
          JSON.stringify({
            aud: 'https://web.push.apple.com',
            exp: now / 1000 + 12 * 3600,
            sub: 'mailto:relay@example.org',
          }),
        ),
      ),
    );
  });
});

describe('subscriptions', () => {
  it('writes only to the browsers’ push services', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGuQyavXutnMH6',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(pushEndpointAllowed(ok), ok).toBe(true);
    }
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/x',
      'https://user@fcm.googleapis.com/x',
      'https://fcm.googleapis.com.evil.test/x',
      'https://169.254.169.254/latest',
      'https://localhost/x',
      `https://fcm.googleapis.com/${'x'.repeat(1100)}`,
      'not a url',
      42,
    ]) {
      expect(pushEndpointAllowed(bad), String(bad)).toBe(false);
    }
  });

  it('takes a subscription as the browser gives it, checked', () => {
    const json = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      expirationTime: null,
      keys: { p256dh: RFC.uaPublic, auth: RFC.auth },
    };
    expect(subscriptionOf(json)).toEqual({
      endpoint: json.endpoint,
      p256dh: RFC.uaPublic,
      auth: RFC.auth,
    });
    expect(subscriptionOf({ ...json, endpoint: 'https://example.org/x' })).toBeNull();
    expect(subscriptionOf({ ...json, keys: { p256dh: RFC.auth, auth: RFC.auth } })).toBeNull();
    expect(subscriptionOf({ ...json, keys: { p256dh: RFC.uaPublic, auth: 'AAAA' } })).toBeNull();
    expect(subscriptionOf({ ...json, keys: null })).toBeNull();
    expect(subscriptionOf('nope')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Sending                                                            */
/* ------------------------------------------------------------------ */

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1';
const SUBSCRIPTION = { endpoint: ENDPOINT, p256dh: RFC.uaPublic, auth: RFC.auth };
/** The subscription as a browser hands it over. */
const BROWSER_SUBSCRIPTION = {
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: { p256dh: RFC.uaPublic, auth: RFC.auth },
};

/** The address a fetch was asked for. */
const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** A push service that answers `status` and keeps what it was sent. */
function pushService(status: number | ((url: string) => number) = 201) {
  const sent: { url: string; headers: Headers; body: Uint8Array<ArrayBuffer> }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    sent.push({
      url,
      headers: new Headers(init?.headers),
      body: new Uint8Array(await new Response(init?.body).arrayBuffer()),
    });
    return new Response(null, { status: typeof status === 'number' ? status : status(url) });
  });
  return { sent, fetch: fetch as unknown as typeof globalThis.fetch };
}

describe('sending a push message', () => {
  it('posts the message encrypted, with its lifetime, urgency, topic and VAPID token', async () => {
    const keys = await makeVapidKeys();
    const service = pushService();
    const message = {
      title: 'Your move',
      body: 'Patient Bishop played e4.',
      url: 'play',
      tag: 'g1',
    };
    const result = await sendPush(SUBSCRIPTION, message, {
      keys,
      contact: 'mailto:relay@example.org',
      fetch: service.fetch,
      ttl: 3600,
      urgency: 'high',
      topic: 'g1',
    });
    expect(result).toBe('sent');
    const [request] = service.sent;
    expect(request?.url).toBe(ENDPOINT);
    expect(Object.fromEntries(request?.headers ?? [])).toMatchObject({
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '3600',
      urgency: 'high',
      topic: 'g1',
    });
    expect(request?.headers.get('authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    const text = await decrypt(
      request?.body ?? new Uint8Array(),
      RFC.uaPublic,
      RFC.uaPrivate,
      RFC.auth,
    );
    expect(JSON.parse(text)).toEqual(message);
  });

  it('says a subscription is gone on 404 and 410, failed on anything else', async () => {
    const keys = await makeVapidKeys();
    const send = (status: number) =>
      sendPush(SUBSCRIPTION, REMINDER_MESSAGE, {
        keys,
        contact: DEFAULT_PUSH_CONTACT,
        fetch: pushService(status).fetch,
      });
    expect(await send(404)).toBe('gone');
    expect(await send(410)).toBe('gone');
    expect(await send(429)).toBe('failed');
    expect(await send(500)).toBe('failed');
    const broken = vi.fn(() => Promise.reject(new Error('offline')));
    expect(
      await sendPush(SUBSCRIPTION, REMINDER_MESSAGE, {
        keys,
        contact: DEFAULT_PUSH_CONTACT,
        fetch: broken,
      }),
    ).toBe('failed');
    // Never anywhere but a push service, whatever a store holds.
    const elsewhere = pushService();
    expect(
      await sendPush({ ...SUBSCRIPTION, endpoint: 'https://169.254.169.254/x' }, REMINDER_MESSAGE, {
        keys,
        contact: DEFAULT_PUSH_CONTACT,
        fetch: elsewhere.fetch,
      }),
    ).toBe('gone');
    expect(elsewhere.sent).toEqual([]);
  });

  it('makes its keys on first use and keeps them; the rooms’ sender reads them once', async () => {
    const store = memoryPushStore();
    const service = pushService();
    const send = pushSender({ store, contact: DEFAULT_PUSH_CONTACT, fetch: service.fetch });
    const keysRead = vi.spyOn(store, 'keys');
    const message = { title: 'Your move', body: 'e4', url: 'play/online/abc', tag: 'abc' };
    expect(await send(SUBSCRIPTION, message)).toBe('sent');
    expect(await send(SUBSCRIPTION, { ...message, tag: 'not a topic!' })).toBe('sent');
    // Read when there were none, and again once made: never for the second message.
    expect(keysRead).toHaveBeenCalledTimes(2);
    const kept = await store.keys();
    expect(kept?.publicKey).toHaveLength(87);
    expect(service.sent[0]?.headers.get('authorization')).toContain(`k=${kept?.publicKey}`);
    expect(service.sent[0]?.headers.get('topic')).toBe('abc');
    expect(service.sent[1]?.headers.has('topic')).toBe(false);
    expect(service.sent[0]?.headers.get('ttl')).toBe(String(2 * 24 * 3600));
  });

  it('names a contact the push services can reach', () => {
    expect(pushContact(['*'], 'mailto:me@example.org')).toBe('mailto:me@example.org');
    expect(pushContact(['*'], 'https://example.org/contact')).toBe('https://example.org/contact');
    expect(pushContact(['http://localhost:8064', 'https://app.example'], 'not an address')).toBe(
      'https://app.example',
    );
    expect(pushContact(['*'])).toBe(DEFAULT_PUSH_CONTACT);
  });
});

/* ------------------------------------------------------------------ */
/* Reminders                                                          */
/* ------------------------------------------------------------------ */

/** 11 October 2026, 12:00 UTC: British Summer Time (UTC+1) until the 25th. */
const NOON = Date.UTC(2026, 9, 11, 12);
const HOUR = 3_600_000;

describe('a reminder’s time', () => {
  it('falls at the chosen time of day in the device’s own time zone', () => {
    expect(localDay(NOON, 'Europe/London')).toBe('2026-10-11');
    expect(localDay(NOON, 'Pacific/Kiritimati')).toBe('2026-10-12');
    expect(instantOf('2026-10-11', 18 * 60, 'Europe/London')).toBe(Date.UTC(2026, 9, 11, 17));
    expect(instantOf('2026-10-11', 9 * 60, 'Asia/Kolkata')).toBe(Date.UTC(2026, 9, 11, 3, 30));
    expect(instantOf('2026-10-11', 7 * 60 + 45, 'America/New_York')).toBe(
      Date.UTC(2026, 9, 11, 11, 45),
    );
    expect(instantOf('2026-10-11', 0, 'UTC')).toBe(Date.UTC(2026, 9, 11));
  });

  it('is today’s unless that has passed or today was a training day; and follows the clocks', () => {
    expect(nextReminderAt(NOON, 18 * 60, 'Europe/London', null)).toBe(Date.UTC(2026, 9, 11, 17));
    expect(nextReminderAt(NOON, 18 * 60, 'Europe/London', '2026-10-11')).toBe(
      Date.UTC(2026, 9, 12, 17),
    );
    expect(nextReminderAt(NOON, 18 * 60, 'Europe/London', '2026-10-10')).toBe(
      Date.UTC(2026, 9, 11, 17),
    );
    expect(nextReminderAt(NOON, 9 * 60, 'Europe/London', null)).toBe(Date.UTC(2026, 9, 12, 8));
    // The clocks go back on 25 October: 18:00 is 17:00 UTC before, 18:00 UTC after.
    const evening24th = Date.UTC(2026, 9, 24, 18);
    expect(nextReminderAt(evening24th, 18 * 60, 'Europe/London', null)).toBe(
      Date.UTC(2026, 9, 25, 18),
    );
  });

  it('takes only time zones the runtime knows', () => {
    expect(knownTimeZone('Europe/London')).toBe(true);
    expect(knownTimeZone('Asia/Kathmandu')).toBe(true);
    expect(knownTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(knownTimeZone('')).toBe(false);
    expect(knownTimeZone(42)).toBe(false);
  });
});

const DEVICE_TOKEN = 'D'.repeat(43);

/** A reminder as a store keeps it. */
function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    key: 'k1',
    ...SUBSCRIPTION,
    minute: 18 * 60,
    tz: 'Europe/London',
    nextAt: Date.UTC(2026, 9, 11, 17),
    trainedDay: null,
    createdAt: NOON - 10 * 24 * HOUR,
    touchedAt: NOON - HOUR,
    ...over,
  };
}

describe('sending the reminders due', () => {
  it('sends each due one, unless its device trained today or it is long late; then sets the next', async () => {
    const store = memoryPushStore();
    const at = Date.UTC(2026, 9, 11, 17, 0, 30);
    await store.saveReminder(reminder({ key: 'due' }));
    await store.saveReminder(
      reminder({ key: 'trained', endpoint: `${ENDPOINT}-t`, trainedDay: '2026-10-11' }),
    );
    await store.saveReminder(
      reminder({ key: 'late', endpoint: `${ENDPOINT}-l`, nextAt: at - 2 * HOUR }),
    );
    await store.saveReminder(
      reminder({ key: 'later', endpoint: `${ENDPOINT}-x`, nextAt: at + HOUR }),
    );
    const service = pushService();
    const counts = await sendDueReminders({
      store,
      contact: DEFAULT_PUSH_CONTACT,
      fetch: service.fetch,
      now: at,
    });
    expect(counts).toEqual({ sent: 1, skipped: 2, gone: 0, failed: 0 });
    expect(service.sent.map((s) => s.url)).toEqual([ENDPOINT]);
    expect(service.sent[0]?.headers.get('ttl')).toBe('3600');
    expect(service.sent[0]?.headers.get('topic')).toBe('reminder');
    const text = await decrypt(
      service.sent[0]?.body ?? new Uint8Array(),
      RFC.uaPublic,
      RFC.uaPrivate,
      RFC.auth,
    );
    expect(JSON.parse(text)).toEqual(REMINDER_MESSAGE);
    // Each one sent or skipped is due again tomorrow at 18:00 London time.
    for (const key of ['due', 'trained', 'late']) {
      expect((await store.reminder(key))?.nextAt).toBe(Date.UTC(2026, 9, 12, 17));
    }
    expect((await store.reminder('later'))?.nextAt).toBe(at + HOUR);
    // Nothing more is due this run.
    expect(
      await sendDueReminders({
        store,
        contact: DEFAULT_PUSH_CONTACT,
        fetch: service.fetch,
        now: at,
      }),
    ).toEqual({
      sent: 0,
      skipped: 0,
      gone: 0,
      failed: 0,
    });
  });

  it('deletes a reminder whose subscription is gone, and sends only so many a run', async () => {
    const store = memoryPushStore();
    const at = Date.UTC(2026, 9, 11, 17);
    for (const n of [1, 2, 3]) {
      await store.saveReminder(
        reminder({ key: `k${n}`, endpoint: `${ENDPOINT}-${n}`, nextAt: at - n * 60_000 }),
      );
    }
    const service = pushService((url) => (url.endsWith('-3') ? 410 : 201));
    const first = await sendDueReminders({
      store,
      contact: DEFAULT_PUSH_CONTACT,
      fetch: service.fetch,
      now: at,
      limit: 2,
    });
    // The oldest first: k3 (gone, deleted), then k2.
    expect(first).toEqual({ sent: 1, skipped: 0, gone: 1, failed: 0 });
    expect(await store.reminder('k3')).toBeNull();
    expect(store.size()).toBe(2);
    const second = await sendDueReminders({
      store,
      contact: DEFAULT_PUSH_CONTACT,
      fetch: service.fetch,
      now: at,
      limit: 2,
    });
    expect(second).toEqual({ sent: 1, skipped: 0, gone: 0, failed: 0 });
  });

  it('forgets reminders nothing has been heard of for 60 days', async () => {
    const store = memoryPushStore();
    await store.saveReminder(reminder({ key: 'old', touchedAt: NOON - REMINDER_KEEP_MS - 1 }));
    await store.saveReminder(reminder({ key: 'new', touchedAt: NOON - REMINDER_KEEP_MS + 1 }));
    expect(await expireReminders(store, NOON)).toBe(1);
    expect(await store.reminder('old')).toBeNull();
    expect(await store.reminder('new')).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The endpoints                                                      */
/* ------------------------------------------------------------------ */

const APP = 'https://app.test';

function pushRelay(
  options: { store?: PushStore; allowReminder?: () => boolean; now?: () => number } = {},
) {
  const store = options.store ?? memoryPushStore();
  let time = NOON;
  const relay = createRelay({
    store: memoryStore(),
    allowedOrigins: [APP],
    push: createPushApi({
      store,
      allowedOrigins: [APP],
      allowReminder: options.allowReminder,
      now: options.now ?? (() => time),
    }),
  });
  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    relay(
      new Request(`https://relay.test${path}`, {
        method,
        headers: { Origin: APP, 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  return { relay, store, call, tick: (ms: number) => (time += ms) };
}

const newReminder = (over: Record<string, unknown> = {}) => ({
  token: DEVICE_TOKEN,
  subscription: BROWSER_SUBSCRIPTION,
  minute: 18 * 60,
  tz: 'Europe/London',
  ...over,
});

describe('the push endpoints', () => {
  it('give the relay’s public key, made once and kept', async () => {
    const { call, store } = pushRelay();
    const first = await call('GET', '/v1/push/key');
    expect(first.status).toBe(200);
    const { key } = (await first.json()) as { key: string };
    expect(fromBase64Url(key)).toHaveLength(65);
    expect(((await (await call('GET', '/v1/push/key')).json()) as { key: string }).key).toBe(key);
    expect((await store.keys())?.publicKey).toBe(key);
    expect((await call('POST', '/v1/push/key', {})).status).toBe(405);
  });

  it('keep a device’s reminder by its token’s hash, change it, and delete it', async () => {
    const { call, store } = pushRelay();
    const made = await call('POST', '/v1/push/reminder', newReminder());
    expect(made.status).toBe(201);
    expect(await made.json()).toEqual({ next: Date.UTC(2026, 9, 11, 17) });
    const key = await hashToken(DEVICE_TOKEN);
    expect(await store.reminder(key)).toMatchObject({
      endpoint: ENDPOINT,
      minute: 18 * 60,
      tz: 'Europe/London',
      trainedDay: null,
    });
    expect(JSON.stringify(await store.reminder(key))).not.toContain(DEVICE_TOKEN);

    const changed = await call(
      'POST',
      '/v1/push/reminder',
      newReminder({ minute: 7 * 60 + 30, tz: 'America/New_York', trained: '2026-10-11' }),
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ next: Date.UTC(2026, 9, 12, 11, 30) });

    expect((await call('DELETE', '/v1/push/reminder', { token: DEVICE_TOKEN })).status).toBe(204);
    expect(await store.reminder(key)).toBeNull();
    expect((await call('DELETE', '/v1/push/reminder', { token: DEVICE_TOKEN })).status).toBe(204);
  });

  it('hear of a training day: no reminder that day', async () => {
    const { call, store } = pushRelay();
    expect(
      (await call('POST', '/v1/push/trained', { token: DEVICE_TOKEN, day: '2026-10-11' })).status,
    ).toBe(404);
    await call('POST', '/v1/push/reminder', newReminder());
    const told = await call('POST', '/v1/push/trained', {
      token: DEVICE_TOKEN,
      day: '2026-10-11',
      tz: 'Europe/London',
    });
    expect(told.status).toBe(204);
    expect(await store.reminder(await hashToken(DEVICE_TOKEN))).toMatchObject({
      trainedDay: '2026-10-11',
      nextAt: Date.UTC(2026, 9, 12, 17),
      touchedAt: NOON,
    });
    expect(
      (await call('POST', '/v1/push/trained', { token: DEVICE_TOKEN, day: 'today' })).status,
    ).toBe(400);
  });

  it('refuse what is not a reminder', async () => {
    const { call, store } = pushRelay();
    for (const bad of [
      newReminder({ token: 'short' }),
      newReminder({ minute: 18 * 60 + 5 }),
      newReminder({ minute: 24 * 60 }),
      newReminder({ minute: '1080' }),
      newReminder({ tz: 'Mars/Olympus_Mons' }),
      newReminder({ trained: 'yesterday' }),
      newReminder({ subscription: { ...BROWSER_SUBSCRIPTION, endpoint: 'https://evil.test/x' } }),
      newReminder({ subscription: { ...BROWSER_SUBSCRIPTION, keys: { p256dh: 'x', auth: 'y' } } }),
    ]) {
      expect((await call('POST', '/v1/push/reminder', bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await call('POST', '/v1/push/reminder', 'not json')).status).toBe(400);
    expect((await call('POST', '/v1/push/reminder', [1, 2])).status).toBe(400);
    expect((await call('PUT', '/v1/push/reminder', newReminder())).status).toBe(405);
    expect((await call('POST', '/v1/push/elsewhere', newReminder())).status).toBe(404);
    expect(await store.countReminders()).toBe(0);
  });

  it('answer only the app’s pages, small bodies, and so many requests a minute', async () => {
    const { call, tick } = pushRelay();
    expect(
      (await call('POST', '/v1/push/reminder', newReminder(), { Origin: 'https://elsewhere.test' }))
        .status,
    ).toBe(403);
    const big = JSON.stringify(newReminder({ padding: 'x'.repeat(PUSH_BODY_BYTES) }));
    expect((await call('POST', '/v1/push/reminder', big)).status).toBe(413);
    const from = (address: string) =>
      call(
        'POST',
        '/v1/push/trained',
        { token: DEVICE_TOKEN, day: '2026-10-11' },
        {
          'CF-Connecting-IP': address,
        },
      );
    for (let i = 0; i < PUSH_REQUESTS_PER_MINUTE; i++) {
      expect((await from('203.0.113.7')).status).toBe(404);
    }
    const refused = await from('203.0.113.7');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('60');
    expect((await from('203.0.113.8')).status).toBe(404);
    tick(60_000);
    expect((await from('203.0.113.7')).status).toBe(404);
    // Preflights are answered for the app.
    const preflight = await call('OPTIONS', '/v1/push/reminder');
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });

  it('keep so many reminders, and ask the limit per address before a new one', async () => {
    const full = memoryPushStore();
    vi.spyOn(full, 'countReminders').mockResolvedValue(MAX_REMINDERS);
    expect(
      (await pushRelay({ store: full }).call('POST', '/v1/push/reminder', newReminder())).status,
    ).toBe(503);

    let allow = false;
    const limited = pushRelay({ allowReminder: () => allow });
    expect((await limited.call('POST', '/v1/push/reminder', newReminder())).status).toBe(429);
    allow = true;
    expect((await limited.call('POST', '/v1/push/reminder', newReminder())).status).toBe(201);
    // A change to a reminder kept is no new one.
    allow = false;
    expect(
      (await limited.call('POST', '/v1/push/reminder', newReminder({ minute: 60 }))).status,
    ).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* The stores                                                         */
/* ------------------------------------------------------------------ */

const pushStores: [string, () => PushStore][] = [
  ['memory', () => memoryPushStore()],
  ['sqlite', () => sqlitePushStore(':memory:')],
  ['d1', () => d1PushStore(fakeD1())],
];

describe.each(pushStores)('the %s push store', (_name, makeStore) => {
  it('keeps the first key pair only', async () => {
    const store = makeStore();
    expect(await store.keys()).toBeNull();
    await store.saveKeys({ publicKey: 'one', privateKey: 'secret one' });
    await store.saveKeys({ publicKey: 'two', privateKey: 'secret two' });
    expect(await store.keys()).toEqual({ publicKey: 'one', privateKey: 'secret one' });
  });

  it('keeps, finds, lists and deletes reminders', async () => {
    const store = makeStore();
    await store.saveReminder(reminder({ key: 'a', nextAt: 300 }));
    await store.saveReminder(reminder({ key: 'b', nextAt: 100, endpoint: `${ENDPOINT}-b` }));
    await store.saveReminder(reminder({ key: 'c', nextAt: 200, trainedDay: '2026-10-10' }));
    await store.saveReminder(reminder({ key: 'd', nextAt: 900, touchedAt: 5 }));
    expect(await store.reminder('c')).toEqual(
      reminder({ key: 'c', nextAt: 200, trainedDay: '2026-10-10' }),
    );
    expect(await store.countReminders()).toBe(4);
    expect((await store.dueReminders(300, 10)).map((r) => r.key)).toEqual(['b', 'c', 'a']);
    expect((await store.dueReminders(300, 2)).map((r) => r.key)).toEqual(['b', 'c']);
    await store.saveReminder(reminder({ key: 'b', nextAt: 1000, endpoint: `${ENDPOINT}-b` }));
    expect((await store.dueReminders(300, 10)).map((r) => r.key)).toEqual(['c', 'a']);
    expect(await store.deleteReminder('a')).toBe(true);
    expect(await store.deleteReminder('a')).toBe(false);
    // A subscription gone takes every reminder with it.
    expect(await store.forgetEndpoint(ENDPOINT)).toBe(2);
    expect(await store.reminder('c')).toBeNull();
    expect(await store.expireReminders(NOON - 2 * HOUR)).toBe(0);
    expect(await store.countReminders()).toBe(1);
    await store.saveReminder(reminder({ key: 'e', touchedAt: 10 }));
    expect(await store.expireReminders(11)).toBe(1);
    expect((await store.dueReminders(Number.MAX_SAFE_INTEGER, 10)).map((r) => r.key)).toEqual([
      'b',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* The Worker                                                         */
/* ------------------------------------------------------------------ */

describe('push on the Worker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serves the endpoints over D1, and its 15-minute cron sends the reminders due', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON);
    const env = { DB: fakeD1(), ALLOWED_ORIGINS: APP, PUSH_CONTACT: 'mailto:me@example.org' };
    const call = (method: string, path: string, body?: unknown) =>
      worker.fetch(
        new Request(`https://relay.test${path}`, {
          method,
          headers: { Origin: APP, 'Content-Type': 'application/json' },
          body: body === undefined ? null : JSON.stringify(body),
        }),
        env,
      );
    expect(
      await (await worker.fetch(new Request('https://relay.test/v1/health'), env)).json(),
    ).toMatchObject({
      push: true,
    });
    const { key } = (await (await call('GET', '/v1/push/key')).json()) as { key: string };
    expect(fromBase64Url(key)).toHaveLength(65);
    expect((await call('POST', '/v1/push/reminder', newReminder())).status).toBe(201);

    const service = pushService();
    vi.stubGlobal('fetch', service.fetch);
    const run = async (cron: string) => {
      const waits: Promise<unknown>[] = [];
      worker.scheduled({ cron }, env, { waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    };
    await run('*/15 * * * *');
    expect(service.sent).toEqual([]);
    vi.setSystemTime(Date.UTC(2026, 9, 11, 17));
    // The daily cron sends nothing; the next quarter's does.
    await run(DAILY_CRON);
    expect(service.sent).toEqual([]);
    await run('*/15 * * * *');
    expect(service.sent.map((s) => s.url)).toEqual([ENDPOINT]);
    const token = /^vapid t=([^.]+)\.([^.]+)\./.exec(
      service.sent[0]?.headers.get('authorization') ?? '',
    );
    expect(JSON.parse(new TextDecoder().decode(bytes(token?.[2] ?? '')))).toMatchObject({
      sub: 'mailto:me@example.org',
      aud: 'https://fcm.googleapis.com',
    });
    // 60 days without a word from the device: the daily cron forgets it.
    vi.setSystemTime(NOON + REMINDER_KEEP_MS + 1);
    await run(DAILY_CRON);
    expect(
      (await call('POST', '/v1/push/trained', { token: DEVICE_TOKEN, day: '2026-12-11' })).status,
    ).toBe(404);
  });

  it('limits new reminders per address when the Worker has a NEW_REMINDERS binding', async () => {
    const asked: string[] = [];
    const env = {
      DB: fakeD1(),
      NEW_REMINDERS: {
        limit: ({ key }: { key: string }) => {
          asked.push(key);
          return Promise.resolve({ success: false });
        },
      },
    };
    const refused = await worker.fetch(
      new Request('https://relay.test/v1/push/reminder', {
        method: 'POST',
        headers: { Origin: APP, 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(newReminder()),
      }),
      env,
    );
    expect(refused.status).toBe(429);
    expect(asked).toEqual(['203.0.113.9']);
  });
});
