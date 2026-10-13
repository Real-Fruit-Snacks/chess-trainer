import type { PushStore } from './reminders.mjs';
export function sqlitePushStore(path: string): PushStore & { close(): void };
