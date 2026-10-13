import { utcDay } from './quota.mjs';

/** The highest count a write cap can have: past it, a vault's writes are not limited. */
const UNCAPPED = Number.MAX_SAFE_INTEGER;

/**
 * The relay's daily counts in memory (see `QuotaStore` in quota.mjs): for the
 * tests, and a relay that may forget everything when it stops.
 * @param {() => number | null} [bytes] how big the data kept is, in bytes
 * @returns {import('./quota.mjs').QuotaStore}
 */
export function memoryQuotas(bytes = () => null) {
  /** @type {Map<string, { day: string, count: number }>} */
  const counts = new Map();
  /** @type {Map<string, string>} */
  const salts = new Map();
  return {
    take(kind, key, day, limit) {
      const id = JSON.stringify([kind, key, day]);
      const count = counts.get(id)?.count ?? 0;
      if (count >= limit) return Promise.resolve(false);
      counts.set(id, { day, count: count + 1 });
      return Promise.resolve(true);
    },
    salt(day, fresh) {
      if (!salts.has(day)) salts.set(day, fresh);
      return Promise.resolve(salts.get(day) ?? fresh);
    },
    expire(before) {
      let removed = 0;
      for (const [id, { day }] of counts) {
        if (day >= before) continue;
        counts.delete(id);
        removed++;
      }
      for (const day of salts.keys()) {
        if (day >= before) continue;
        salts.delete(day);
        removed++;
      }
      return Promise.resolve(removed);
    },
    bytes: () => Promise.resolve(bytes()),
  };
}

/**
 * Vaults in memory: for the tests, and a relay that may forget everything when
 * it stops. Same contract as the other stores (see `VaultStore` in
 * handler.mjs); its `quotas` count in memory too, and take the database's size
 * to be the bytes of the vaults kept.
 * @returns {import('./handler.mjs').VaultStore & {
 *   size(): number,
 *   quotas: import('./quota.mjs').QuotaStore,
 * }}
 */
export function memoryStore() {
  /** @type {Map<string, import('./handler.mjs').Vault>} */
  const vaults = new Map();
  const copy = (vault) => ({ ...vault, data: vault.data.slice() });
  const quotas = memoryQuotas(() => {
    let total = 0;
    for (const vault of vaults.values()) total += vault.data.byteLength;
    return total;
  });
  return {
    size: () => vaults.size,
    quotas,
    get: (id) => Promise.resolve(vaults.has(id) ? copy(vaults.get(id)) : null),
    create(id, authHash, data, now) {
      if (vaults.has(id)) return Promise.resolve(false);
      vaults.set(id, {
        version: 1,
        authHash,
        data: data.slice(),
        updatedAt: now,
        touchedAt: now,
        writesDay: utcDay(now),
        writes: 1,
      });
      return Promise.resolve(true);
    },
    update(id, expected, data, now, writesPerDay = UNCAPPED) {
      const vault = vaults.get(id);
      if (!vault) return Promise.resolve({ ok: false, current: null });
      if (vault.version !== expected) return Promise.resolve({ ok: false, current: vault.version });
      const day = utcDay(now);
      const writes = vault.writesDay === day ? vault.writes : 0;
      if (writes >= writesPerDay) {
        return Promise.resolve({ ok: false, current: vault.version, capped: true });
      }
      const version = expected + 1;
      vaults.set(id, {
        ...vault,
        version,
        data: data.slice(),
        updatedAt: now,
        touchedAt: now,
        writesDay: day,
        writes: writes + 1,
      });
      return Promise.resolve({ ok: true, version });
    },
    touch(id, now) {
      const vault = vaults.get(id);
      if (vault) vaults.set(id, { ...vault, touchedAt: now });
      return Promise.resolve();
    },
    delete: (id) => Promise.resolve(vaults.delete(id)),
    expire(before, abandonedBefore = before) {
      let removed = 0;
      for (const [id, vault] of vaults) {
        const used = Math.max(vault.updatedAt, vault.touchedAt);
        if (used < before || (vault.version === 1 && used < abandonedBefore)) {
          vaults.delete(id);
          removed++;
        }
      }
      return Promise.resolve(removed);
    },
    count: () => Promise.resolve(vaults.size),
  };
}
