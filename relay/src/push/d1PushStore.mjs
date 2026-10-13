/**
 * The relay's push data in Cloudflare D1, beside the vaults: its VAPID keys
 * and the daily reminders. The tables are made on first use.
 */
import { PUSH_SCHEMA, reminderOf, rowValues, SQL } from './pushSchema.mjs';

/**
 * @param {{ prepare(sql: string): any }} db the D1 binding
 * @returns {import('./reminders.mjs').PushStore}
 */
export function d1PushStore(db) {
  /** @type {Promise<void> | null} */
  let ready = null;
  const init = () =>
    (ready ??= (async () => {
      for (const sql of PUSH_SCHEMA) await db.prepare(sql).run();
    })().catch((err) => {
      ready = null;
      throw err;
    }));
  /** @param {string} sql @param {unknown[]} params */
  const run = async (sql, ...params) => {
    await init();
    return db
      .prepare(sql)
      .bind(...params)
      .run();
  };
  /** @param {string} sql @param {unknown[]} params */
  const first = async (sql, ...params) => {
    await init();
    return db
      .prepare(sql)
      .bind(...params)
      .first();
  };

  return {
    async keys() {
      const row = await first(SQL.keys);
      return row
        ? { publicKey: String(row.public_key), privateKey: String(row.private_key) }
        : null;
    },
    async saveKeys(keys) {
      await run(SQL.saveKeys, keys.publicKey, keys.privateKey);
    },
    async reminder(key) {
      const row = await first(SQL.reminder, key);
      return row ? reminderOf(row) : null;
    },
    async saveReminder(reminder) {
      await run(SQL.saveReminder, ...rowValues(reminder));
    },
    async deleteReminder(key) {
      return Number((await run(SQL.deleteReminder, key)).meta.changes ?? 0) === 1;
    },
    async forgetEndpoint(endpoint) {
      return Number((await run(SQL.forgetEndpoint, endpoint)).meta.changes ?? 0);
    },
    async countReminders() {
      const row = await first(SQL.count);
      return Number(row?.n ?? 0);
    },
    async dueReminders(now, limit) {
      await init();
      const { results } = await db.prepare(SQL.due).bind(now, limit).all();
      return (results ?? []).map(reminderOf);
    },
    async expireReminders(before) {
      return Number((await run(SQL.expire, before)).meta.changes ?? 0);
    },
  };
}
