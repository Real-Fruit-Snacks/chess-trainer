/// <reference lib="webworker" />
/**
 * Service worker (built by vite-plugin-pwa in `injectManifest` mode).
 *
 * - Precaches every build asset so the app works offline.
 * - Serves `index.html` for navigations to the app's own routes, so deep links
 *   boot the SPA offline — and only for those, so another site on the same
 *   origin is left alone.
 * - Caches puzzle chunks and the optional multi-threaded engine build as they
 *   are fetched. Only complete responses of the right type are kept, and they
 *   expire, so a captive portal's HTML answer can never poison a chunk for good.
 * - Adds the COOP/COEP headers to documents when the learner has enabled the
 *   experimental multi-threaded engine — see `sw/isolation.ts`.
 * - Adds `Content-Security-Policy: frame-ancestors 'none'` to the pages it
 *   serves, the one directive the page's meta policy cannot set — see `sw/framing.ts`.
 */
import { clientsClaim, type WorkboxPlugin } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  PrecacheController,
  type PrecacheEntry,
  PrecacheRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { appNavigationPattern } from './sw/appRoutes';
import { cacheable } from './sw/cacheable';
import { isNavigation, withFramePolicy } from './sw/framing';
import { ISOLATION_CHANGED_MESSAGE, readIsolationFlag, withIsolationHeaders } from './sw/isolation';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

const BASE = import.meta.env.BASE_URL;
const DAY = 24 * 60 * 60;

/**
 * The isolation flag, read from the Cache API once per worker lifetime rather
 * than on every response. The page posts a message when it changes the flag
 * (`writeIsolationFlag`), which drops the cached value.
 */
let isolationFlag: Promise<boolean> | null = null;
function isolationEnabled(): Promise<boolean> {
  isolationFlag ??= readIsolationFlag();
  return isolationFlag;
}

/**
 * Adds the isolation headers to every response this worker serves while the
 * option is on. Documents need them to become cross-origin isolated; worker
 * scripts need them because a dedicated worker must be at least as isolated
 * as the page that created it.
 */
const isolationPlugin: WorkboxPlugin = {
  handlerWillRespond: async ({ response }) =>
    (await isolationEnabled()) ? withIsolationHeaders(response) : response,
};

/** Pages served from the precache (the shell for every app route) refuse to be framed. */
const framingPlugin: WorkboxPlugin = {
  handlerWillRespond: ({ request, response, event }) =>
    Promise.resolve(isNavigation(request, event) ? withFramePolicy(response) : response),
};

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return;
  const type = (data as { type?: unknown }).type;
  if (type === 'SKIP_WAITING') {
    void self.skipWaiting();
  } else if (type === ISOLATION_CHANGED_MESSAGE) {
    const enabled = (data as { enabled?: unknown }).enabled;
    isolationFlag = typeof enabled === 'boolean' ? Promise.resolve(enabled) : null;
  }
});

clientsClaim();
cleanupOutdatedCaches();

const precache = new PrecacheController({ plugins: [isolationPlugin, framingPlugin] });
precache.precache(self.__WB_MANIFEST);
registerRoute(new PrecacheRoute(precache));

// SPA fallback: a navigation to one of the app's own routes gets the app shell.
// Anything else on this origin (another site under the same user page) goes to
// the network as if there were no worker.
registerRoute(
  new NavigationRoute(precache.createHandlerBoundToURL(`${BASE}index.html`), {
    allowlist: [appNavigationPattern(BASE)],
  }),
);

// Puzzle chunks beyond the precached first one of each band are cached as
// they are fetched (or all at once from Settings → "Download every puzzle").
// Chunk names carry no hash, so a cached chunk is served at once and refreshed
// in the background.
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && /\/puzzles\/b\d{4}-\d{2}\.json$/.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'chess-trainer-puzzles',
    plugins: [
      cacheable('application/json', 'text/json'),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 90 * DAY }),
      isolationPlugin,
    ],
  }),
);

// The threaded engine build is fetched on demand and kept for offline use. Its
// files are versioned by name, so once cached they are good until they expire.
registerRoute(
  ({ url, sameOrigin }) =>
    sameOrigin && /\/engine\/stockfish-[\w.-]+\.(?:js|wasm)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'chess-trainer-engine',
    plugins: [
      cacheable('application/wasm', 'application/javascript', 'text/javascript'),
      new ExpirationPlugin({ maxEntries: 6, maxAgeSeconds: 180 * DAY }),
      isolationPlugin,
    ],
  }),
);
