/**
 * Vaults in memory: for the tests, and a relay that may forget everything when
 * it stops. Same contract as the other stores (see `VaultStore` in handler.mjs).
 * @returns {import('./handler.mjs').VaultStore & { size(): number }}
 */
export function memoryStore() {
  /** @type {Map<string, import('./handler.mjs').Vault>} */
  const vaults = new Map();
  const copy = (vault) => ({ ...vault, data: vault.data.slice() });
  return {
    size: () => vaults.size,
    get: (id) => Promise.resolve(vaults.has(id) ? copy(vaults.get(id)) : null),
    create(id, authHash, data, now) {
      if (vaults.has(id)) return Promise.resolve(false);
      vaults.set(id, { version: 1, authHash, data: data.slice(), updatedAt: now, touchedAt: now });
      return Promise.resolve(true);
    },
    update(id, expected, data, now) {
      const vault = vaults.get(id);
      if (!vault) return Promise.resolve({ ok: false, current: null });
      if (vault.version !== expected) return Promise.resolve({ ok: false, current: vault.version });
      const version = expected + 1;
      vaults.set(id, { ...vault, version, data: data.slice(), updatedAt: now, touchedAt: now });
      return Promise.resolve({ ok: true, version });
    },
    touch(id, now) {
      const vault = vaults.get(id);
      if (vault) vaults.set(id, { ...vault, touchedAt: now });
      return Promise.resolve();
    },
    delete: (id) => Promise.resolve(vaults.delete(id)),
    expire(before) {
      let removed = 0;
      for (const [id, vault] of vaults) {
        if (Math.max(vault.updatedAt, vault.touchedAt) < before) {
          vaults.delete(id);
          removed++;
        }
      }
      return Promise.resolve(removed);
    },
  };
}
