import { vi } from 'vitest';
import { siteConfig } from '@/site.config';
import { createRelay, type RelayOptions } from '../../relay/src/handler.mjs';
import { memoryStore } from '../../relay/src/memoryStore.mjs';

/**
 * The real device-sync relay (relay/src/handler.mjs) over an in-memory store,
 * behind `fetch` for a unit test. Requests anywhere else fail loudly.
 */
export interface FakeRelay {
  store: ReturnType<typeof memoryStore>;
  /** While true, every request fails as if the device were offline. */
  offline: boolean;
  /** Each request that reached the relay, with its answer's status. */
  requests: { method: string; status: number }[];
  /** Runs before a request reaches the relay: to slip another device's write in first, say. */
  beforeRequest: ((method: string) => Promise<void> | void) | null;
  /** Starts the relay over with other options (the vaults stay). */
  reconfigure(options: Omit<RelayOptions, 'store'>): void;
  /** How many writes reached the relay. */
  puts(): number;
}

export function installFakeRelay(options: Omit<RelayOptions, 'store'> = {}): FakeRelay {
  const store = memoryStore();
  const make = (extra: Omit<RelayOptions, 'store'>) =>
    createRelay({ store, minWriteIntervalMs: 0, ...extra });
  let handle = make(options);
  const relay: FakeRelay = {
    store,
    offline: false,
    requests: [],
    beforeRequest: null,
    reconfigure: (next) => {
      handle = make(next);
    },
    puts: () => relay.requests.filter((r) => r.method === 'PUT').length,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (relay.offline) throw new TypeError('Failed to fetch');
      if (!url.startsWith(`${siteConfig.syncRelay}/`)) {
        throw new Error(`Unexpected request to ${url}`);
      }
      const method = init.method ?? 'GET';
      await relay.beforeRequest?.(method);
      // Only what the relay reads: the test page's AbortSignal is not the one Node's Request takes.
      const response = await handle(
        new Request(url, { method, headers: init.headers, body: init.body ?? null }),
      );
      relay.requests.push({ method, status: response.status });
      return response;
    }),
  );
  return relay;
}
