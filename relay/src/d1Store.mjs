/**
 * Vaults in a Cloudflare D1 database (SQLite). The table is made on first use,
 * so a fresh database needs no migration step. D1 hands BLOBs back as arrays
 * of numbers, so the bytes are kept as base64 text: a 1.4 MB vault stays under
 * D1's 2 MB row.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    auth_hash TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    touched_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS vaults_used ON vaults (touched_at, updated_at)',
];

/** Bytes as base64 (in pieces: a spread of a large array overflows the stack). */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * @param {{ prepare(sql: string): any }} db the D1 binding
 * @returns {import('./handler.mjs').VaultStore}
 */
export function d1Store(db) {
  /** @type {Promise<void> | null} */
  let ready = null;
  const init = () =>
    (ready ??= (async () => {
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch((err) => {
      ready = null;
      throw err;
    }));

  return {
    async get(id) {
      await init();
      const row = await db
        .prepare('SELECT version, auth_hash, data, updated_at, touched_at FROM vaults WHERE id = ?')
        .bind(id)
        .first();
      if (!row) return null;
      return {
        version: Number(row.version),
        authHash: String(row.auth_hash),
        data: fromBase64(String(row.data)),
        updatedAt: Number(row.updated_at),
        touchedAt: Number(row.touched_at),
      };
    },
    async create(id, authHash, data, now) {
      await init();
      const result = await db
        .prepare(
          'INSERT OR IGNORE INTO vaults (id, auth_hash, version, data, updated_at, touched_at) VALUES (?, ?, 1, ?, ?, ?)',
        )
        .bind(id, authHash, toBase64(data), now, now)
        .run();
      return result.meta.changes === 1;
    },
    async update(id, expected, data, now) {
      await init();
      const result = await db
        .prepare(
          'UPDATE vaults SET data = ?, version = version + 1, updated_at = ?, touched_at = ? WHERE id = ? AND version = ?',
        )
        .bind(toBase64(data), now, now, id, expected)
        .run();
      if (result.meta.changes === 1) return { ok: true, version: expected + 1 };
      const row = await db.prepare('SELECT version FROM vaults WHERE id = ?').bind(id).first();
      return { ok: false, current: row ? Number(row.version) : null };
    },
    async touch(id, now) {
      await init();
      await db.prepare('UPDATE vaults SET touched_at = ? WHERE id = ?').bind(now, id).run();
    },
    async delete(id) {
      await init();
      const result = await db.prepare('DELETE FROM vaults WHERE id = ?').bind(id).run();
      return result.meta.changes === 1;
    },
    async expire(before) {
      await init();
      const result = await db
        .prepare('DELETE FROM vaults WHERE touched_at < ? AND updated_at < ?')
        .bind(before, before)
        .run();
      return Number(result.meta.changes ?? 0);
    },
  };
}
