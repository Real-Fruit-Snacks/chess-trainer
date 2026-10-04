/**
 * The first URL segment of every page the app has. The service worker serves
 * the app shell only for navigations under one of these (plus the root), so a
 * sibling site on the same origin (a `user.github.io` with other projects) is
 * never hijacked by this app's offline fallback. `routes.tsx` is checked
 * against this list by a test.
 *
 * Shared by the page and the service worker, so no React or DOM here.
 */
export const APP_ROUTE_PREFIXES = [
  'learn',
  'placement',
  'puzzles',
  'play',
  'analyze',
  'drills',
  'patterns',
  'arcade',
  'openings',
  'games',
  'studies',
  'classics',
  'reference',
  'progress',
  'settings',
] as const;

/**
 * Matches navigations the app shell should answer: the root itself, or the
 * root followed by one of the prefixes (as a whole segment). `base` is the
 * deployment prefix with a trailing slash ("/" or "/chess-trainer/").
 */
export function appNavigationPattern(base: string): RegExp {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(?:(?:${APP_ROUTE_PREFIXES.join('|')})(?:/|$)|$)`);
}
