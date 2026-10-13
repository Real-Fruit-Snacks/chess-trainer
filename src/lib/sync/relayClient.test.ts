import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RELAY_MESSAGES, RelayError, readVault, writeVault } from './relayClient';
import { deriveVaultKeys, type VaultKeys } from './vaultCrypto';

const RELAY = 'https://relay.test';
let keys: VaultKeys;

beforeAll(async () => {
  keys = await deriveVaultKeys(new Uint8Array(16).fill(7));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A relay that answers every request with `status` and these headers. */
function answers(status: number, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status, headers }))),
  );
}

/** What a write throws: creating a synced copy (no version), or replacing version 3. */
async function refusal(creating: boolean): Promise<RelayError> {
  try {
    await writeVault(RELAY, keys, new Uint8Array([1, 2, 3]), creating ? null : '"3"');
  } catch (err) {
    if (err instanceof RelayError) return err;
    throw err;
  }
  throw new Error('The write went through.');
}

describe('the relay’s refusals', () => {
  it('take a short wait as a moment, as before', async () => {
    answers(429, { 'Retry-After': '1' });
    expect(await refusal(false)).toMatchObject({ kind: 'busy', retryAfterMs: 1000 });
    answers(429, { 'Retry-After': '60' });
    expect(await refusal(true)).toMatchObject({ kind: 'busy', retryAfterMs: 60_000 });
    answers(429);
    expect(await refusal(false)).toMatchObject({ kind: 'busy', retryAfterMs: 1000 });
  });

  it('take a wait until tomorrow as a daily limit, said plainly', async () => {
    answers(429, { 'Retry-After': '10800' });
    const changes = await refusal(false);
    expect(changes).toMatchObject({ kind: 'limited', retryAfterMs: 10_800_000 });
    expect(changes.message).toBe(RELAY_MESSAGES.changesToday);
    const copies = await refusal(true);
    expect(copies).toMatchObject({ kind: 'limited', retryAfterMs: 10_800_000 });
    expect(copies.message).toBe(
      'Too many synced copies were set up from this network today. Try again tomorrow.',
    );
  });

  it('say when the relay sets up no new synced copies today, or is full', async () => {
    answers(503, { 'Retry-After': '3600' });
    expect((await refusal(true)).message).toBe(
      'The sync service is not setting up new synced copies today. Try again tomorrow.',
    );
    // To anything but a new synced copy, 503 is the relay in trouble.
    expect(await refusal(false)).toMatchObject({
      kind: 'server',
      message: 'The sync service answered 503.',
    });
    answers(507);
    expect(await refusal(true)).toMatchObject({
      kind: 'full',
      message:
        'The sync service is full and is not setting up new synced copies. Try again another day.',
    });
  });

  it('read a limit on reads the same way', async () => {
    answers(429, { 'Retry-After': '7200' });
    await expect(readVault(RELAY, keys, '"1"')).rejects.toMatchObject({
      kind: 'limited',
      retryAfterMs: 7_200_000,
    });
  });
});
