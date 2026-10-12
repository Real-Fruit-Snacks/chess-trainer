import type { PushStore } from './reminders.mjs';
export function d1PushStore(db: { prepare(sql: string): unknown }): PushStore;
