/** Types for webpush.mjs, for the relay's tests. */

/** A push subscription as the relay keeps it. */
export interface Subscription {
  endpoint: string;
  /** The browser's P-256 public key, raw (65 bytes), base64url. */
  p256dh: string;
  /** The browser's 16-byte authentication secret, base64url. */
  auth: string;
}

/** The relay's VAPID key pair: the public key raw (65 bytes, base64url), the private key as JWK text. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** What a push message says: shown as a notification; `url` is a path in the app ("play/online/<id>"). */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function toBase64Url(bytes: Uint8Array): string;
export function fromBase64Url(text: unknown): Uint8Array<ArrayBuffer> | null;
export function pushEndpointAllowed(endpoint: unknown): boolean;
export function subscriptionOf(value: unknown): Subscription | null;
export function makeVapidKeys(): Promise<VapidKeys>;
export function encryptPush(
  plaintext: Uint8Array,
  subscription: { p256dh: string; auth: string },
  fixed?: { salt?: Uint8Array; keys?: CryptoKeyPair },
): Promise<Uint8Array<ArrayBuffer>>;
export function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  options: { contact: string; now?: number },
): Promise<string>;
export function sendPush(
  subscription: Subscription,
  message: PushMessage,
  options: {
    keys: VapidKeys;
    contact: string;
    fetch?: typeof fetch;
    ttl?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
    now?: number;
  },
): Promise<'sent' | 'gone' | 'failed'>;
export function vapidKeys(store: {
  keys(): Promise<VapidKeys | null>;
  saveKeys(keys: VapidKeys): Promise<void>;
}): Promise<VapidKeys>;
