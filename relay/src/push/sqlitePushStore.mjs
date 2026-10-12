/**
 * The relay's push data in a SQLite file through Node's `node:sqlite`: the
 * store of a self-hosted relay (`server.mjs`), beside its vaults.
 */
import { DatabaseSync } from 'node:sqlite';
import { PUSH_SCHEMA, reminderOf, rowValues, SQL } from './pushSchema.mjs';

/**
 * @param {string} path a file, or ':memory:'
 * @returns {import('./reminders.mjs').PushStore & { close(): void }}
 */
export function sqlitePushStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  for (const sql of PUSH_SCHEMA) db.exec(sql);
  const statements = Object.fromEntries(
    Object.entries(SQL).map(([name, sql]) => [name, db.prepare(sql)]),
  );
  const at = (/** @type {keyof typeof SQL} */ name) =>
    /** @type {import('node:sqlite').StatementSync} */ (statements[name]);

  return {
    close: () => db.close(),
    keys() {
      const row = at('keys').get();
      return Promise.resolve(
        row ? { publicKey: String(row.public_key), privateKey: String(row.private_key) } : null,
      );
    },
    saveKeys(keys) {
      at('saveKeys').run(keys.publicKey, keys.privateKey);
      return Promise.resolve();
    },
    reminder(key) {
      const row = at('reminder').get(key);
      return Promise.resolve(row ? reminderOf(row) : null);
    },
    saveReminder(reminder) {
      at('saveReminder').run(.../** @type {never[]} */ (rowValues(reminder)));
      return Promise.resolve();
    },
    deleteReminder: (key) => Promise.resolve(Number(at('deleteReminder').run(key).changes) === 1),
    forgetEndpoint: (endpoint) =>
      Promise.resolve(Number(at('forgetEndpoint').run(endpoint).changes)),
    countReminders: () => Promise.resolve(Number(at('count').get()?.n ?? 0)),
    dueReminders: (now, limit) =>
      Promise.resolve(
        at('due')
          .all(now, limit)
          .map((row) => reminderOf(row)),
      ),
    expireReminders: (before) => Promise.resolve(Number(at('expire').run(before).changes)),
  };
}
