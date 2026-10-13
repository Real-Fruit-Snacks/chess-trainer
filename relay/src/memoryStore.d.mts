import type { VaultStore } from './handler.mjs';
import type { QuotaStore } from './quota.mjs';

/** Vaults in memory (see memoryStore.mjs); its `quotas` count in memory too. */
export function memoryStore(): VaultStore & { size(): number; quotas: QuotaStore };

/** The relay's daily counts in memory; `bytes` says how big the data kept is (null: unknown). */
export function memoryQuotas(bytes?: () => number | null): QuotaStore;
