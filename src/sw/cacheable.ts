import { CacheableResponse } from 'workbox-cacheable-response';
import type { WorkboxPlugin } from 'workbox-core';

/**
 * Keeps a response only when it is a complete 200 of one of the given content
 * types. A 200 with the wrong body (a captive portal's sign-in page, a misrouted
 * request) is served once but never kept. `CacheableResponsePlugin` matches
 * headers by exact value and content types carry charsets, so the type is
 * checked by prefix on top of Workbox's status check.
 */
export function cacheable(...types: string[]): WorkboxPlugin {
  const status = new CacheableResponse({ statuses: [200] });
  return {
    cacheWillUpdate: ({ response }) => {
      if (!status.isResponseCacheable(response)) return Promise.resolve(null);
      const type = (response.headers.get('content-type') ?? '').toLowerCase();
      return Promise.resolve(types.some((t) => type.startsWith(t)) ? response : null);
    },
  };
}
