/**
 * Vaults in a SQLite file through Node's built-in `node:sqlite`: the store of
 * a self-hosted relay (`server.mjs`). Same contract as the others.
 */
import { DatabaseSync } from 'node:sqlite';

/**
 * @param {string} path a file, or ':memory:'
 * @returns {import('./handler.mjs').VaultStore & { close(): void }}
 */
export function sqliteStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      auth_hash TEXT NOT NULL,
      version INTEGER NOT NULL,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      touched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vaults_used ON vaults (touched_at, updated_at);
  `);
  const select = db.prepare(
    'SELECT version, auth_hash, data, updated_at, touched_at FROM vaults WHERE id = ?',
  );
  const insert = db.prepare(
    'INSERT OR IGNORE INTO vaults (id, auth_hash, version, data, updated_at, touched_at) VALUES (?, ?, 1, ?, ?, ?)',
  );
  const replace = db.prepare(
    'UPDATE vaults SET data = ?, version = version + 1, updated_at = ?, touched_at = ? WHERE id = ? AND version = ?',
  );
  const versionOf = db.prepare('SELECT version FROM vaults WHERE id = ?');
  const touch = db.prepare('UPDATE vaults SET touched_at = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM vaults WHERE id = ?');
  const expire = db.prepare('DELETE FROM vaults WHERE touched_at < ? AND updated_at < ?');

  return {
    close: () => db.close(),
    get(id) {
      const row = select.get(id);
      return Promise.resolve(
        row
          ? {
              version: Number(row.version),
              authHash: String(row.auth_hash),
              data: new Uint8Array(row.data),
              updatedAt: Number(row.updated_at),
              touchedAt: Number(row.touched_at),
            }
          : null,
      );
    },
    create: (id, authHash, data, now) =>
      Promise.resolve(Number(insert.run(id, authHash, data, now, now).changes) === 1),
    update(id, expected, data, now) {
      if (Number(replace.run(data, now, now, id, expected).changes) === 1) {
        return Promise.resolve({ ok: true, version: expected + 1 });
      }
      const row = versionOf.get(id);
      return Promise.resolve({ ok: false, current: row ? Number(row.version) : null });
    },
    touch(id, now) {
      touch.run(now, id);
      return Promise.resolve();
    },
    delete: (id) => Promise.resolve(Number(remove.run(id).changes) === 1),
    expire: (before) => Promise.resolve(Number(expire.run(before, before).changes)),
  };
}
