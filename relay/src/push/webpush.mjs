/**
 * Web Push from the relay, on WebCrypto alone (the Worker and Node both have
 * it): a message is encrypted for the subscription it goes to with the
 * aes128gcm content coding (RFC 8291 over RFC 8188), and the relay proves who
 * sends it with a VAPID token (RFC 8292) signed by its own key pair, which it
 * makes on first use and keeps (see `vapidKeys`). No push service ever sees
 * what a message says.
 *
 * Only the push services of the browsers the app runs in are written to
 * (`pushEndpointAllowed`): a subscription is an address a device hands the
 * relay, and the relay must not be talked into requesting anything else.
 */

const encoder = new TextEncoder();

/** The record size written in each message's header: one record holds any message the relay sends. */
const RECORD_SIZE = 4096;
/** A VAPID token lasts this long (RFC 8292 allows a day at most); a fresh one is signed before it runs out. */
const TOKEN_LIFETIME_S = 12 * 60 * 60;

/**
 * The push services the relay writes to: Google's (Chrome, Edge on Android,
 * Samsung Internet, Opera, Brave), Mozilla's (Firefox), Apple's (Safari) and
 * Microsoft's (Edge on Windows).
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/,
];

/** The longest subscription address taken. */
const MAX_ENDPOINT = 1024;

/** Bytes as unpadded base64url. @param {Uint8Array} bytes */
export function toBase64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url (padded or not) back to bytes; null when it is not base64url. @param {unknown} text */
export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(text)) return null;
  const plain = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (plain.length % 4 === 1) return null;
  try {
    const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** @param {(Uint8Array | number[])[]} parts */
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** HKDF-SHA-256, extract and expand, to `bits` bits. */
async function hkdf(
  /** @type {Uint8Array} */ salt,
  /** @type {Uint8Array} */ ikm,
  /** @type {Uint8Array} */ info,
  /** @type {number} */ bits,
) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bits,
  );
  return new Uint8Array(derived);
}

/**
 * Whether the relay will write to this subscription address: https, on one of
 * the browsers' push services, nothing else in it that a URL could hide.
 * @param {unknown} endpoint
 */
export function pushEndpointAllowed(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    PUSH_HOSTS.some((host) => host.test(url.hostname))
  );
}

/**
 * @typedef {{ endpoint: string, p256dh: string, auth: string }} Subscription
 * @typedef {{ publicKey: string, privateKey: string }} VapidKeys
 *   the public key as a raw P-256 point (65 bytes, base64url), the private key as JWK text
 * @typedef {{ title: string, body: string, url: string, tag: string }} PushMessage
 *   `url` is a path in the app, relative to its root ("play/online/<id>")
 */

/**
 * A subscription as a device hands it over — `{ endpoint, keys: { p256dh,
 * auth } }`, the shape of `PushSubscription.toJSON()` — checked; null when it
 * is not one the relay writes to.
 * @param {unknown} value
 * @returns {Subscription | null}
 */
export function subscriptionOf(value) {
  if (typeof value !== 'object' || value === null) return null;
  const { endpoint, keys } = /** @type {{ endpoint?: unknown, keys?: unknown }} */ (value);
  if (!pushEndpointAllowed(endpoint) || typeof keys !== 'object' || keys === null) return null;
  const { p256dh, auth } = /** @type {{ p256dh?: unknown, auth?: unknown }} */ (keys);
  const point = fromBase64Url(p256dh);
  const secret = fromBase64Url(auth);
  if (!point || point.length !== 65 || point[0] !== 4 || !secret || secret.length !== 16) {
    return null;
  }
  return {
    endpoint: /** @type {string} */ (endpoint),
    p256dh: toBase64Url(point),
    auth: toBase64Url(secret),
  };
}

/** A new VAPID key pair (ECDSA on P-256), as text to keep. @returns {Promise<VapidKeys>} */
export async function makeVapidKeys() {
  const pair = /** @type {CryptoKeyPair} */ (
    await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
  );
  const raw = new Uint8Array(
    /** @type {ArrayBuffer} */ (await crypto.subtle.exportKey('raw', pair.publicKey)),
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: toBase64Url(raw), privateKey: JSON.stringify(jwk) };
}

/**
 * Encrypts a push message for a subscription (RFC 8291): one aes128gcm record
 * behind its header (salt, record size, the relay's ephemeral public key).
 * Each message gets a fresh salt and a fresh ECDH key pair; `fixed` gives them
 * instead, for the tests (RFC 8291's own example).
 * @param {Uint8Array} plaintext
 * @param {{ p256dh: string, auth: string }} subscription
 * @param {{ salt?: Uint8Array, keys?: CryptoKeyPair }} [fixed]
 */
export async function encryptPush(plaintext, subscription, fixed = {}) {
  const uaPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  if (!uaPublic || uaPublic.length !== 65 || !authSecret || authSecret.length !== 16) {
    throw new Error('Not a subscription’s keys.');
  }
  const salt = fixed.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const keys =
    fixed.keys ??
    /** @type {CryptoKeyPair} */ (
      await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    );
  const asPublic = new Uint8Array(
    /** @type {ArrayBuffer} */ (await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256),
  );
  const keyInfo = concat(encoder.encode('WebPush: info'), [0], uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 256);
  const cek = await hkdf(
    salt,
    ikm,
    concat(encoder.encode('Content-Encoding: aes128gcm'), [0]),
    128,
  );
  const nonce = await hkdf(salt, ikm, concat(encoder.encode('Content-Encoding: nonce'), [0]), 96);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // The last (and only) record ends with the delimiter 2, and no padding.
  const record = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, [2])),
  );
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, record);
}

/** The private keys imported, per key text (signing reuses them). @type {Map<string, Promise<CryptoKey>>} */
const signingKeys = new Map();
/** Tokens signed, per key, audience and contact, until shortly before they run out. */
const tokens = new Map();

/**
 * The `Authorization` header of a push request (RFC 8292): a JWT for the push
 * service's origin, lasting 12 hours, signed with the relay's key, and the
 * relay's public key. A token is reused until an hour before it runs out.
 * @param {string} endpoint
 * @param {VapidKeys} keys
 * @param {{ contact: string, now?: number }} options `contact`: a mailto: or https: address
 */
export async function vapidAuthorization(endpoint, keys, { contact, now = Date.now() }) {
  const aud = new URL(endpoint).origin;
  const cacheKey = `${keys.publicKey} ${aud} ${contact}`;
  const known = tokens.get(cacheKey);
  if (known && known.until > now + 60 * 60_000) return known.header;
  let key = signingKeys.get(keys.privateKey);
  if (!key) {
    key = crypto.subtle.importKey(
      'jwk',
      JSON.parse(keys.privateKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    signingKeys.set(keys.privateKey, key);
  }
  const exp = Math.floor(now / 1000) + TOKEN_LIFETIME_S;
  const part = (/** @type {unknown} */ value) => toBase64Url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud, exp, sub: contact })}`;
  // WebCrypto signs ECDSA as r || s, which is JWS's own form for ES256.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await key,
      encoder.encode(unsigned),
    ),
  );
  const header = `vapid t=${unsigned}.${toBase64Url(signature)}, k=${keys.publicKey}`;
  if (tokens.size > 100) tokens.clear();
  tokens.set(cacheKey, { header, until: exp * 1000 });
  return header;
}

/**
 * Sends one push message: 'sent' when the push service took it; 'gone' when it
 * says the subscription is no more (404 or 410), when it should be forgotten;
 * 'failed' for anything else (it may work another time).
 * @param {Subscription} subscription
 * @param {PushMessage} message
 * @param {{
 *   keys: VapidKeys,
 *   contact: string,
 *   fetch?: typeof fetch,
 *   ttl?: number,
 *   urgency?: 'very-low' | 'low' | 'normal' | 'high',
 *   topic?: string,
 *   now?: number,
 * }} options `ttl`: seconds the push service may hold the message; `topic`: a newer message with the same one replaces it
 * @returns {Promise<'sent' | 'gone' | 'failed'>}
 */
export async function sendPush(subscription, message, options) {
  if (!pushEndpointAllowed(subscription.endpoint)) return 'gone';
  const send = options.fetch ?? fetch;
  try {
    const body = await encryptPush(encoder.encode(JSON.stringify(message)), subscription);
    /** @type {Record<string, string>} */
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(options.ttl ?? 24 * 60 * 60),
      Urgency: options.urgency ?? 'normal',
      Authorization: await vapidAuthorization(subscription.endpoint, options.keys, {
        contact: options.contact,
        now: options.now,
      }),
    };
    if (options.topic) headers.Topic = options.topic;
    const response = await send(subscription.endpoint, { method: 'POST', headers, body });
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * A store's VAPID keys: the ones it keeps, or a new pair made and kept now. Two
 * relays making a pair at once keep one: each reads back what was kept.
 * @param {{ keys(): Promise<VapidKeys | null>, saveKeys(keys: VapidKeys): Promise<void> }} store
 * @returns {Promise<VapidKeys>}
 */
export async function vapidKeys(store) {
  const kept = await store.keys();
  if (kept) return kept;
  await store.saveKeys(await makeVapidKeys());
  const saved = await store.keys();
  if (!saved) throw new Error('The push keys could not be kept.');
  return saved;
}
