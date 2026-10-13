/**
 * The relay's push tables, the same in D1 and in SQLite: its VAPID key pair
 * (one row) and the daily reminders, one per device. Made on first use, so a
 * fresh database needs no migration step.
 */
export const PUSH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS push_keys (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS push_reminders (
    key TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    minute INTEGER NOT NULL,
    tz TEXT NOT NULL,
    next_at INTEGER NOT NULL,
    trained_day TEXT,
    created_at INTEGER NOT NULL,
    touched_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS push_reminders_due ON push_reminders (next_at)',
  'CREATE INDEX IF NOT EXISTS push_reminders_endpoint ON push_reminders (endpoint)',
  'CREATE INDEX IF NOT EXISTS push_reminders_touched ON push_reminders (touched_at)',
];

const COLUMNS =
  'key, endpoint, p256dh, auth, minute, tz, next_at, trained_day, created_at, touched_at';

export const SQL = {
  keys: 'SELECT public_key, private_key FROM push_keys WHERE id = 1',
  saveKeys: 'INSERT OR IGNORE INTO push_keys (id, public_key, private_key) VALUES (1, ?, ?)',
  reminder: `SELECT ${COLUMNS} FROM push_reminders WHERE key = ?`,
  saveReminder: `INSERT OR REPLACE INTO push_reminders (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  deleteReminder: 'DELETE FROM push_reminders WHERE key = ?',
  forgetEndpoint: 'DELETE FROM push_reminders WHERE endpoint = ?',
  count: 'SELECT COUNT(*) AS n FROM push_reminders',
  due: `SELECT ${COLUMNS} FROM push_reminders WHERE next_at <= ? ORDER BY next_at LIMIT ?`,
  expire: 'DELETE FROM push_reminders WHERE touched_at < ?',
};

/** A reminder as a row's values, in the columns' order. @param {import('./reminders.mjs').Reminder} r */
export const rowValues = (r) => [
  r.key,
  r.endpoint,
  r.p256dh,
  r.auth,
  r.minute,
  r.tz,
  r.nextAt,
  r.trainedDay,
  r.createdAt,
  r.touchedAt,
];

/** A row back as a reminder. @param {Record<string, unknown>} row @returns {import('./reminders.mjs').Reminder} */
export const reminderOf = (row) => ({
  key: String(row.key),
  endpoint: String(row.endpoint),
  p256dh: String(row.p256dh),
  auth: String(row.auth),
  minute: Number(row.minute),
  tz: String(row.tz),
  nextAt: Number(row.next_at),
  trainedDay:
    row.trained_day === null || row.trained_day === undefined ? null : String(row.trained_day),
  createdAt: Number(row.created_at),
  touchedAt: Number(row.touched_at),
});
