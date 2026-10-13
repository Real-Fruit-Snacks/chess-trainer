/**
 * Vaults in a Cloudflare D1 database (SQLite), and the relay's daily counts
 * beside them (`quotas`, see quota.mjs). The tables are made on first use, so
 * a fresh database needs no migration step, and a table an earlier relay made
 * gains the columns it lacks (see vaultSchema.mjs). D1 hands BLOBs back as
 * arrays of numbers, so the bytes are kept as base64 text: a 1.4 MB vault
 * stays under D1's 2 MB row. The base64 is Node's (`node:buffer`, which the
 * Worker gets from its `nodejs_compat` flag): native code turns a full vault
 * around in about 2 ms, where JavaScript would spend the free plan's 10 ms of
 * CPU many times over.
 *
 * How big the database is comes from D1 itself: each query's answer says
 * (`meta.size_after`), and `quotas.bytes()` asks with a query that reads no rows.
 */
import { Buffer } from 'node:buffer';
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

/** Bytes as base64. */
export function toBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

/** Base64 back to bytes (a copy of their own, not a view of Node's pool). */
export function fromBase64(text) {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/** The highest count a write cap can have: past it, a vault's writes are not limited. */
const UNCAPPED = Number.MAX_SAFE_INTEGER;

/**
 * @param {{ prepare(sql: string): any }} db the D1 binding
 * @returns {import('./handler.mjs').VaultStore & { quotas: import('./quota.mjs').QuotaStore }}
 */
export function d1Store(db) {
  /** The database's size after the latest query that said, in bytes. @type {number | null} */
  let size = null;
  /** Notes the size a query's answer gives, and passes the answer on. */
  const noted = (/** @type {any} */ result) => {
    const after = result?.meta?.size_after;
    if (typeof after === 'number' && Number.isFinite(after) && after > 0) size = after;
    return result;
  };

  /** @type {Promise<void> | null} */
  let ready = null;
  const init = () =>
    (ready ??= (async () => {
      await db.prepare(vaultTable('TEXT')).run();
      // A table made by an earlier relay: the columns it lacks. Another isolate may add one
      // between this one's look and its own ALTER, which then fails as a duplicate: fine.
      const { results } = await db.prepare(COLUMNS_SQL).all();
      const have = new Set((results ?? []).map((/** @type {any} */ c) => String(c.name)));
      for (const [name, type] of ADDED_COLUMNS) {
        if (have.has(name)) continue;
        try {
          await db.prepare(addColumn(name, type)).run();
        } catch (err) {
          if (!isDuplicateColumn(err)) throw err;
        }
      }
      await db.prepare(DROP_OLD_INDEX).run();
      for (const sql of QUOTA_SCHEMA) await db.prepare(sql).run();
    })().catch((err) => {
      ready = null;
      throw err;
    }));
  /** @param {string} sql @param {unknown[]} params */
  const run = async (sql, ...params) => {
    await init();
    return noted(
      await db
        .prepare(sql)
        .bind(...params)
        .run(),
    );
  };
  /** @param {string} sql @param {unknown[]} params */
  const all = async (sql, ...params) => {
    await init();
    return noted(
      await db
        .prepare(sql)
        .bind(...params)
        .all(),
    );
  };
  /** @param {string} sql @param {unknown[]} params */
  const first = async (sql, ...params) => {
    await init();
    return db
      .prepare(sql)
      .bind(...params)
      .first();
  };

  /** @type {import('./quota.mjs').QuotaStore} */
  const quotas = {
    async take(kind, key, day, limit) {
      if (limit <= 0) return false;
      const { results } = await all(QUOTA_SQL.take, kind, key, day, limit);
      const row = (results ?? [])[0];
      return row !== undefined && Number(row.count) <= limit;
    },
    async salt(day, fresh) {
      const name = saltName(day);
      const kept = await first(QUOTA_SQL.salt, name);
      if (kept) return String(kept.value);
      await run(QUOTA_SQL.keepSalt, name, fresh);
      const row = await first(QUOTA_SQL.salt, name);
      return row ? String(row.value) : fresh;
    },
    async expire(before) {
      const counts = await run(QUOTA_SQL.expireCounts, before);
      const salts = await run(QUOTA_SQL.expireSalts, saltName(before));
      return Number(counts.meta?.changes ?? 0) + Number(salts.meta?.changes ?? 0);
    },
    async bytes() {
      // A query that reads no rows: its answer says how big the database is now.
      await all('SELECT 1');
      return size;
    },
  };

  return {
    quotas,
    async get(id) {
      const row = await first(VAULT_SQL.get, id);
      return row ? vaultOf(row, fromBase64(String(row.data))) : null;
    },
    async create(id, authHash, data, now) {
      const result = await run(
        VAULT_SQL.create,
        id,
        authHash,
        toBase64(data),
        now,
        now,
        utcDay(now),
      );
      return result.meta.changes === 1;
    },
    async update(id, expected, data, now, writesPerDay = UNCAPPED) {
      const day = utcDay(now);
      const result = await run(
        VAULT_SQL.update,
        toBase64(data),
        now,
        now,
        day,
        day,
        id,
        expected,
        day,
        writesPerDay,
      );
      if (result.meta.changes === 1) return { ok: true, version: expected + 1 };
      return refusedUpdate(await first(VAULT_SQL.state, id), expected, day, writesPerDay);
    },
    async touch(id, now) {
      await run(VAULT_SQL.touch, now, id);
    },
    async delete(id) {
      const result = await run(VAULT_SQL.delete, id);
      return result.meta.changes === 1;
    },
    async expire(before, abandonedBefore = before) {
      const result = await run(VAULT_SQL.expire, before, before, abandonedBefore, abandonedBefore);
      return Number(result.meta.changes ?? 0);
    },
    async count() {
      const row = await first(VAULT_SQL.count);
      return Number(row?.n ?? 0);
    },
  };
}
