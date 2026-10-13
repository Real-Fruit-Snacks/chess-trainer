/**
 * Vaults in a SQLite file through Node's built-in `node:sqlite`: the store of
 * a self-hosted relay (`server.mjs`), with the relay's daily counts beside
 * them (`quotas`, see quota.mjs). Same contract as the others; the tables are
 * the D1 store's (vaultSchema.mjs), the bytes kept as a BLOB.
 */
import { DatabaseSync } from 'node:sqlite';
import { QUOTA_SCHEMA, QUOTA_SQL, saltName, utcDay } from './quota.mjs';
import {
  ADDED_COLUMNS,
  addColumn,
  COLUMNS_SQL,
  DROP_OLD_INDEX,
  isDuplicateColumn,
  refusedUpdate,
  VAULT_SQL,
  vaultOf,
  vaultTable,
} from './vaultSchema.mjs';

/** The highest count a write cap can have: past it, a vault's writes are not limited. */
const UNCAPPED = Number.MAX_SAFE_INTEGER;

/**
 * @param {string} path a file, or ':memory:'
 * @returns {import('./handler.mjs').VaultStore & {
 *   close(): void,
 *   quotas: import('./quota.mjs').QuotaStore,
 * }}
 */
export function sqliteStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(vaultTable('BLOB'));
  // A table made by an earlier relay: the columns it lacks. Another process on the same file
  // may add one between this one's look and its own ALTER, which then fails as a duplicate.
  const have = new Set(
    db
      .prepare(COLUMNS_SQL)
      .all()
      .map((column) => String(column.name)),
  );
  for (const [name, type] of ADDED_COLUMNS) {
    if (have.has(name)) continue;
    try {
      db.exec(addColumn(name, type));
    } catch (err) {
      if (!isDuplicateColumn(err)) throw err;
    }
  }
  db.exec(DROP_OLD_INDEX);
  for (const sql of QUOTA_SCHEMA) db.exec(sql);

  const statements = Object.fromEntries(
    Object.entries({ ...VAULT_SQL, ...QUOTA_SQL }).map(([name, sql]) => [name, db.prepare(sql)]),
  );
  const at = (/** @type {keyof typeof VAULT_SQL | keyof typeof QUOTA_SQL} */ name) =>
    /** @type {import('node:sqlite').StatementSync} */ (statements[name]);
  const pageCount = db.prepare('PRAGMA page_count');
  const pageSize = db.prepare('PRAGMA page_size');

  /** @type {import('./quota.mjs').QuotaStore} */
  const quotas = {
    take(kind, key, day, limit) {
      if (limit <= 0) return Promise.resolve(false);
      const row = at('take').get(kind, key, day, limit);
      return Promise.resolve(row !== undefined && Number(row.count) <= limit);
    },
    salt(day, fresh) {
      const name = saltName(day);
      at('keepSalt').run(name, fresh);
      const row = at('salt').get(name);
      return Promise.resolve(row ? String(row.value) : fresh);
    },
    expire(before) {
      const counts = Number(at('expireCounts').run(before).changes);
      const salts = Number(at('expireSalts').run(saltName(before)).changes);
      return Promise.resolve(counts + salts);
    },
    bytes: () =>
      Promise.resolve(Number(pageCount.get()?.page_count) * Number(pageSize.get()?.page_size)),
  };

  return {
    close: () => db.close(),
    quotas,
    get(id) {
      const row = at('get').get(id);
      return Promise.resolve(
        row ? vaultOf(row, new Uint8Array(/** @type {any} */ (row.data))) : null,
      );
    },
    create: (id, authHash, data, now) =>
      Promise.resolve(
        Number(at('create').run(id, authHash, data, now, now, utcDay(now)).changes) === 1,
      ),
    update(id, expected, data, now, writesPerDay = UNCAPPED) {
      const day = utcDay(now);
      const changes = at('update').run(
        data,
        now,
        now,
        day,
        day,
        id,
        expected,
        day,
        writesPerDay,
      ).changes;
      if (Number(changes) === 1) return Promise.resolve({ ok: true, version: expected + 1 });
      return Promise.resolve(refusedUpdate(at('state').get(id), expected, day, writesPerDay));
    },
    touch(id, now) {
      at('touch').run(now, id);
      return Promise.resolve();
    },
    delete: (id) => Promise.resolve(Number(at('delete').run(id).changes) === 1),
    expire: (before, abandonedBefore = before) =>
      Promise.resolve(
        Number(at('expire').run(before, before, abandonedBefore, abandonedBefore).changes),
      ),
    count: () => Promise.resolve(Number(at('count').get()?.n ?? 0)),
  };
}
