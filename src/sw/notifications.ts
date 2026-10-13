/**
 * Notices: what a system notification shows, and the page of the app it
 * opens. The relay pushes them (a correspondence game's move, the daily
 * reminder) and the service worker shows them; the page shows its own the
 * same way while it is in the background (a live game's move). Shared by the
 * page and the service worker, so no DOM and no React here.
 */

/** A notice: `url` is a path in the app, from its root ("play/online/<id>"; '' for the home page). */
export interface Notice {
  title: string;
  body: string;
  url: string;
  /** A newer notice with the same tag replaces the one before (a game's id, 'reminder'). */
  tag: string;
}

const PATH = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const TAG = /^[A-Za-z0-9_-]{1,64}$/;

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

/**
 * The notice a push message carries (its JSON), checked; null for anything
 * else. A path that is not one of the app's own plain paths opens the home page.
 */
export function noticeOf(data: unknown): Notice | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  const title = text(message.title, 120);
  if (!title) return null;
  const url = typeof message.url === 'string' && PATH.test(message.url) ? message.url : '';
  const tag = typeof message.tag === 'string' && TAG.test(message.tag) ? message.tag : 'notice';
  return { title, body: text(message.body, 400) ?? '', url, tag };
}

/**
 * The address a notice opens: its path under the app's base ("/" or
 * "/open-file/") on `origin`. Anything but a plain path gives the home page.
 */
export function noticeTarget(base: string, path: unknown, origin: string): string {
  const safe = typeof path === 'string' && PATH.test(path) ? path : '';
  return new URL(`${base}${safe}`, origin).href;
}

/** The options a notice is shown with: the app's icons, its tag, and its path to open. */
export function notificationOptions(notice: Notice, base: string): NotificationOptions {
  return {
    body: notice.body,
    tag: notice.tag,
    icon: `${base}icons/icon-192.png`,
    badge: `${base}icons/icon-monochrome-512.png`,
    data: { url: notice.url },
  };
}
