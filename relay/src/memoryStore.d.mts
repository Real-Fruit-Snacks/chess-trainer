import type { VaultStore } from './handler.mjs';

/** Vaults in memory (see memoryStore.mjs). */
export function memoryStore(): VaultStore & { size(): number };
