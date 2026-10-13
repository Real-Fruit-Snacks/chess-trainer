import type { SyncSnapshot } from '@/lib/sync/merge';
import { phraseToSecret } from '@/lib/sync/phrase';
import { deleteVault, readVault, writeVault } from '@/lib/sync/relayClient';
import { readSnapshotJson, snapshotJson, withWrite } from '@/lib/sync/snapshot';
import { deriveVaultKeys, openSnapshot, sealSnapshot } from '@/lib/sync/vaultCrypto';
import { siteConfig } from '@/site.config';

/**
 * Another device with the same recovery phrase, talking to the relay directly
 * (through the test's fake relay). Its writes are the app's: one generation
 * more, and the vault's record of writes kept, with its own write added.
 */
export async function otherDevice(words: readonly string[], device = 'other-device-1') {
  const check = await phraseToSecret(words.join(' '));
  if (!check.ok) throw new Error(check.reason);
  const keys = await deriveVaultKeys(check.secret);
  const relay = siteConfig.syncRelay;
  const read = async () => {
    const vault = await readVault(relay, keys);
    if (vault.status !== 'found') throw new Error(`The vault is ${vault.status}.`);
    const parsed = readSnapshotJson(await openSnapshot(keys, vault.data));
    if (!parsed.ok) throw new Error(parsed.reason);
    return { ...parsed, etag: vault.etag, data: vault.data };
  };
  const writeJson = async (json: string, etag: string) => {
    const result = await writeVault(relay, keys, await sealSnapshot(keys, json), etag);
    if (!result.ok) throw new Error('Conflict');
  };
  return {
    keys,
    read,
    /** Changes the synced data as a sync from that device would. */
    async change(edit: (snapshot: SyncSnapshot) => SyncSnapshot) {
      const current = await read();
      const next = current.generation + 1;
      const writes = withWrite(current.writes, device, next);
      await writeJson(snapshotJson(edit(current.snapshot), next, writes), current.etag);
    },
    writeJson,
    remove: () => deleteVault(relay, keys),
  };
}
