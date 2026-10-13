/**
 * The vault table, the same in D1 and in SQLite but for how the bytes are kept
 * (base64 text in D1, a BLOB in SQLite). Made on first use, so a fresh
 * database needs no migration step; a table made by an earlier relay gains the
 * columns it lacks (`ADDED_COLUMNS`) when a store first opens it.
 *
 * Each vault counts its own writes per UTC day (`writes_day`, `writes`), in
 * the row the write replaces anyway, so the count costs no row of its own.
 * There is no index beside the primary key: an index on the times would be one
 * more row written with every write, and the daily expiry reads the whole
 * table, once.
 */

/** @param {'TEXT' | 'BLOB'} dataType how the bytes are kept */
export const vaultTable = (dataType) => `CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    auth_hash TEXT NOT NULL,
    version INTEGER NOT NULL,
    data ${dataType} NOT NULL,
    updated_at INTEGER NOT NULL,
    touched_at INTEGER NOT NULL,
    writes_day TEXT,
    writes INTEGER NOT NULL DEFAULT 0
  )`;

/** Columns an earlier relay's table lacks, each with its type, in the order they are added. */
export const ADDED_COLUMNS = /** @type {const} */ ([
  ['writes_day', 'TEXT'],
  ['writes', 'INTEGER NOT NULL DEFAULT 0'],
]);

/** An earlier relay's index on the times, dropped (see above). */
export const DROP_OLD_INDEX = 'DROP INDEX IF EXISTS vaults_used';

export const COLUMNS_SQL = 'PRAGMA table_info(vaults)';

/** @param {string} name @param {string} type */
export const addColumn = (name, type) => `ALTER TABLE vaults ADD COLUMN ${name} ${type}`;

/**
 * Whether an error is a column added meanwhile by another isolate or process
 * (both saw it missing; the first added it).
 * @param {unknown} err
 */
export const isDuplicateColumn = (err) =>
  /duplicate column/i.test(err instanceof Error ? err.message : String(err));

export const VAULT_SQL = {
  get: 'SELECT version, auth_hash, data, updated_at, touched_at, writes_day, writes FROM vaults WHERE id = ?',
  create:
    'INSERT OR IGNORE INTO vaults (id, auth_hash, version, data, updated_at, touched_at, writes_day, writes) VALUES (?, ?, 1, ?, ?, ?, ?, 1)',
  /**
   * Replaces the data from version `expected`, unless the vault has been
   * written `limit` times on `day` already: the count starts again each day.
   * Binds: data, now, now, day, day, id, expected, day, limit.
   */
  update: `UPDATE vaults SET data = ?, version = version + 1, updated_at = ?, touched_at = ?,
      writes = CASE WHEN writes_day = ? THEN writes + 1 ELSE 1 END, writes_day = ?
    WHERE id = ? AND version = ? AND (writes_day IS NOT ? OR writes < ?)`,
  /** Why an update changed nothing: the version moved on, the day's writes are spent, or the vault went. */
  state: 'SELECT version, writes_day, writes FROM vaults WHERE id = ?',
  touch: 'UPDATE vaults SET touched_at = ? WHERE id = ?',
  delete: 'DELETE FROM vaults WHERE id = ?',
  /**
   * Vaults neither written nor read since the first time, and vaults never
   * written after they were made (version 1) neither written nor read since the
   * second. Binds: before, before, abandonedBefore, abandonedBefore.
   */
  expire: `DELETE FROM vaults WHERE (touched_at < ? AND updated_at < ?)
    OR (version = 1 AND touched_at < ? AND updated_at < ?)`,
  count: 'SELECT COUNT(*) AS n FROM vaults',
};

/**
 * What an update that changed nothing means, from the vault's row as it is now
 * (`VAULT_SQL.state`): gone, moved on, or written all it may be today.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {number} expected
 * @param {string} day
 * @param {number} limit
 * @returns {{ ok: false, current: number | null, capped?: true }}
 */
export function refusedUpdate(row, expected, day, limit) {
  if (!row) return { ok: false, current: null };
  const current = Number(row.version);
  if (current === expected && row.writes_day === day && Number(row.writes) >= limit) {
    return { ok: false, current, capped: true };
  }
  return { ok: false, current };
}

/**
 * A row back as a vault.
 * @param {Record<string, unknown>} row
 * @param {Uint8Array} data the bytes, as the store reads them
 * @returns {import('./handler.mjs').Vault}
 */
export const vaultOf = (row, data) => ({
  version: Number(row.version),
  authHash: String(row.auth_hash),
  data,
  updatedAt: Number(row.updated_at),
  touchedAt: Number(row.touched_at),
  writesDay:
    row.writes_day === null || row.writes_day === undefined ? null : String(row.writes_day),
  writes: Number(row.writes ?? 0),
});
