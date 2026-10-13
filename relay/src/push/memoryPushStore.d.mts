import type { PushStore } from './reminders.mjs';
export function memoryPushStore(): PushStore & { size(): number };
