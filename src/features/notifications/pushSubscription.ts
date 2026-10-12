import { create } from 'zustand';
import { relayBase } from '@/features/live/relayUrls';
import { safeLocalStorage } from '@/lib/persistStorage';
import { useSettings } from '@/store/settings';

/**
 * This browser's push subscription for the relay: made with the relay's key
 * once a switch that needs it goes on (correspondence games, the daily
 * reminder), and ended once neither does. It is kept here as the browser
 * hands it over, so that a correspondence game's connection can give it to its
 * room at once (in its hello). The device's, like its notification settings.
 */
export const PUSH_SUBSCRIPTION_KEY = 'chess-trainer:push-subscription';

/** A subscription as `PushSubscription.toJSON()` gives it, the part the relay needs. */
export interface PushDetails {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** A subscription checked; null when it is not one. */
function detailsOf(value: unknown): PushDetails | null {
  if (typeof value !== 'object' || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
  if (typeof keys !== 'object' || keys === null) return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  return { endpoint, keys: { p256dh, auth } };
}

function read(): PushDetails | null {
  const raw = safeLocalStorage.getItem(PUSH_SUBSCRIPTION_KEY);
  if (typeof raw !== 'string') return null;
  try {
    return detailsOf(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const usePushSubscription = create<{ subscription: PushDetails | null }>()(() => ({
  subscription: read(),
}));

function keep(subscription: PushDetails | null): void {
  usePushSubscription.setState({ subscription });
  if (subscription) {
    void safeLocalStorage.setItem(PUSH_SUBSCRIPTION_KEY, JSON.stringify(subscription));
  } else {
    void safeLocalStorage.removeItem(PUSH_SUBSCRIPTION_KEY);
  }
}

/** Base64url to bytes; null when it is not base64url. */
function bytesOf(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (a?.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

/** The relay's public key, which a subscription for it is made with. */
async function relayKey(base: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const response = await fetch(`${base}/v1/push/key`, { cache: 'no-store' });
  if (!response.ok) return null;
  const body = (await response.json()) as { key?: unknown };
  return typeof body.key === 'string' ? bytesOf(body.key) : null;
}

/** The service worker's registration; null without one (the dev server, a browser without). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker?.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribes this browser to the relay's pushes (notifications allowed
 * already): the subscription it has, or a new one when it has none or has one
 * made with another key. Kept and returned; null when none can be made (no
 * service worker, no relay, the relay unreachable, the browser refusing).
 */
export async function subscribeToPush(): Promise<PushDetails | null> {
  const base = relayBase();
  const worker = await registration();
  if (!base || !worker?.pushManager) return null;
  try {
    const key = await relayKey(base);
    if (!key) return null;
    let subscription = await worker.pushManager.getSubscription();
    if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const details = detailsOf(subscription.toJSON());
    if (details) keep(details);
    return details;
  } catch {
    return null;
  }
}

/** Ends this browser's subscription: nothing more is pushed to it, from any room or reminder. */
export async function unsubscribeFromPush(): Promise<void> {
  keep(null);
  try {
    const subscription = await (await registration())?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Gone already, or no worker: nothing is pushed either way.
  }
}

/**
 * What a correspondence game's room is told of push: this browser's
 * subscription while correspondence notifications are on, else null (the room
 * forgets the one it had).
 */
export function correspondencePush(): PushDetails | null {
  return useSettings.getState().notifyCorrespondence
    ? usePushSubscription.getState().subscription
    : null;
}

/** Calls `listener` with `correspondencePush()` each time it changes. */
export function onCorrespondencePush(listener: (push: PushDetails | null) => void): () => void {
  let last = JSON.stringify(correspondencePush());
  const check = () => {
    const push = correspondencePush();
    const now = JSON.stringify(push);
    if (now === last) return;
    last = now;
    listener(push);
  };
  const offSettings = useSettings.subscribe(check);
  const offSubscription = usePushSubscription.subscribe(check);
  return () => {
    offSettings();
    offSubscription();
  };
}
