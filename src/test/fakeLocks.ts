/**
 * Web Locks (`navigator.locks.request`) for tests, which jsdom lacks: one
 * exclusive lock per name, with the API's hand-off rules — a request that
 * waits gets the lock as soon as it is released, before any later
 * `ifAvailable` request, which is answered at once with no lock. `log` says
 * what each request met.
 */
type Grant = { name: string; mode: 'exclusive' } | null;

export function fakeLocks() {
  const held = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  const log: ('granted' | 'queued' | 'skipped')[] = [];
  return {
    log,
    async request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: Grant) => Promise<unknown>,
    ): Promise<unknown> {
      if (held.has(name)) {
        if (options.ifAvailable) {
          log.push('skipped');
          return callback(null);
        }
        log.push('queued');
        await new Promise<void>((resolve) => {
          const queue = waiting.get(name) ?? [];
          queue.push(resolve);
          waiting.set(name, queue);
        });
      } else {
        log.push('granted');
        held.add(name);
      }
      try {
        return await callback({ name, mode: 'exclusive' });
      } finally {
        const next = waiting.get(name)?.shift();
        if (next) next();
        else held.delete(name);
      }
    },
  };
}
