/**
 * The relay's push data in memory: its VAPID keys and the daily reminders. For
 * the tests, and a relay that may forget everything when it stops (the Node
 * server with `--db :memory:`). Same contract as the others (see `PushStore`
 * in reminders.mjs).
 * @returns {import('./reminders.mjs').PushStore & { size(): number }}
 */
export function memoryPushStore() {
  /** @type {import('./webpush.mjs').VapidKeys | null} */
  let keys = null;
  /** @type {Map<string, import('./reminders.mjs').Reminder>} */
  const reminders = new Map();
  return {
    size: () => reminders.size,
    keys: () => Promise.resolve(keys ? { ...keys } : null),
    saveKeys(next) {
      keys ??= { ...next };
      return Promise.resolve();
    },
    reminder: (key) => Promise.resolve(reminders.has(key) ? { ...reminders.get(key) } : null),
    saveReminder(reminder) {
      reminders.set(reminder.key, { ...reminder });
      return Promise.resolve();
    },
    deleteReminder: (key) => Promise.resolve(reminders.delete(key)),
    forgetEndpoint(endpoint) {
      let removed = 0;
      for (const [key, reminder] of reminders) {
        if (reminder.endpoint !== endpoint) continue;
        reminders.delete(key);
        removed++;
      }
      return Promise.resolve(removed);
    },
    countReminders: () => Promise.resolve(reminders.size),
    dueReminders: (now, limit) =>
      Promise.resolve(
        [...reminders.values()]
          .filter((reminder) => reminder.nextAt <= now)
          .sort((a, b) => a.nextAt - b.nextAt)
          .slice(0, limit)
          .map((reminder) => ({ ...reminder })),
      ),
    expireReminders(before) {
      let removed = 0;
      for (const [key, reminder] of reminders) {
        if (reminder.touchedAt >= before) continue;
        reminders.delete(key);
        removed++;
      }
      return Promise.resolve(removed);
    },
  };
}
