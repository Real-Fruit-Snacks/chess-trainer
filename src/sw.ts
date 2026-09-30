/// <reference lib="webworker" />
/**
 * Service worker (built by vite-plugin-pwa in `injectManifest` mode).
 *
 * - Precaches every build asset so the whole trainer works offline.
 * - Serves `index.html` for navigations, so deep links boot the SPA offline.
 * - Caches the optional multi-threaded engine build on first use (it is not
 *   precached: most learners never switch it on).
 * - Adds the COOP/COEP headers to documents when the learner has enabled the
 *   experimental multi-threaded engine — see `sw/isolation.ts`.
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
import { CacheFirst } from 'workbox-strategies';
import { readIsolationFlag, withIsolationHeaders } from './sw/isolation';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

const BASE = import.meta.env.BASE_URL;

/**
 * Adds the isolation headers to every response this worker serves while the
 * option is on. Documents need them to become cross-origin isolated; worker
 * scripts need them because a dedicated worker must be at least as isolated
 * as the page that created it.
 */
const isolationPlugin: WorkboxPlugin = {
  handlerWillRespond: async ({ response }) =>
    (await readIsolationFlag()) ? withIsolationHeaders(response) : response,
};

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting();
  }
});

clientsClaim();
cleanupOutdatedCaches();

const precache = new PrecacheController({ plugins: [isolationPlugin] });
precache.precache(self.__WB_MANIFEST);
registerRoute(new PrecacheRoute(precache));

// SPA fallback: any navigation that is not a precached file gets the app shell.
registerRoute(
  new NavigationRoute(precache.createHandlerBoundToURL(`${BASE}index.html`), {
    denylist: [/^\/api\//],
  }),
);

// Puzzle chunks beyond the precached first one of each band are cached as
// they are fetched (or all at once from Settings → "Download every puzzle").
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && /\/puzzles\/b\d{4}-\d{2}\.json$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'chess-trainer-puzzles',
    plugins: [new ExpirationPlugin({ maxEntries: 400 }), isolationPlugin],
  }),
);

// The threaded engine build is fetched on demand and kept for offline use.
registerRoute(
  ({ url, sameOrigin }) =>
    sameOrigin && /\/engine\/stockfish-[\w.-]+\.(?:js|wasm)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'chess-trainer-engine',
    plugins: [new ExpirationPlugin({ maxEntries: 6 }), isolationPlugin],
  }),
);
