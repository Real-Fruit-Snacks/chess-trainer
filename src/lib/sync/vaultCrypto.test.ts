import { describe, expect, it } from 'vitest';
import {
  deriveVaultKeys,
  fromBase64Url,
  gunzipText,
  gzipText,
  openSnapshot,
  SealError,
  sealSnapshot,
  toBase64Url,
} from './vaultCrypto';

const SECRET = Uint8Array.from({ length: 16 }, (_, i) => i);

/** HKDF-SHA-256 of SECRET, worked out apart from WebCrypto (RFC 5869 over HMAC). */
const EXPECTED = {
  id: 'YVUmr3Gz6jT-CGqdYZE8PMvaji_j1XYlm2xTQYWr9dk',
  token: 'iSDKqKZsZk-fCQbLyZ4Z5AazNDtFjIERCf8gVdWN7JI',
  key: 'b14ef7f62aedc9cd6229308e117afa86635dd9049e93357a39d01d77c84e3849',
};

const hexBytes = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16));

describe('deriveVaultKeys', () => {
  it('derives the vault id and token by HKDF-SHA-256', async () => {
    const keys = await deriveVaultKeys(SECRET);
    expect(keys.id).toBe(EXPECTED.id);
    expect(keys.token).toBe(EXPECTED.token);
    expect(keys.key.extractable).toBe(false);
    expect(keys.key.usages.sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('derives the encryption key by HKDF-SHA-256 too', async () => {
    const keys = await deriveVaultKeys(SECRET);
    const sealed = await sealSnapshot(keys, '{"hello":"world"}');
    // Open it by hand with the independently derived key.
    const key = await crypto.subtle.importKey('raw', hexBytes(EXPECTED.key), 'AES-GCM', false, [
      'decrypt',
    ]);
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: sealed.slice(4, 16),
        additionalData: new TextEncoder().encode(`chess-trainer-sync:1:${EXPECTED.id}`),
      },
      key,
      sealed.slice(16),
    );
    expect(await gunzipText(new Uint8Array(plain))).toBe('{"hello":"world"}');
  });

  it('gives each secret its own vault', async () => {
    const other = await deriveVaultKeys(Uint8Array.from({ length: 16 }, (_, i) => i + 1));
    expect(other.id).not.toBe(EXPECTED.id);
    expect(other.token).not.toBe(EXPECTED.token);
    expect(other.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('sealSnapshot and openSnapshot', () => {
  const json = JSON.stringify({ name: 'Ruy López', moves: 'e4 e5 Nf3 Nc6 Bb5', note: '♞ ½–½' });

  it('round-trips, with a fresh nonce every time', async () => {
    const keys = await deriveVaultKeys(SECRET);
    const a = await sealSnapshot(keys, json);
    const b = await sealSnapshot(keys, json);
    expect(new TextDecoder().decode(a.slice(0, 4))).toBe('CTS1');
    expect(toBase64Url(a)).not.toBe(toBase64Url(b));
    expect(await openSnapshot(keys, a)).toBe(json);
    expect(await openSnapshot(keys, b)).toBe(json);
  });

  it('notices any change to the sealed bytes', async () => {
    const keys = await deriveVaultKeys(SECRET);
    const sealed = await sealSnapshot(keys, json);
    for (const at of [5, 20, sealed.length - 1]) {
      const altered = sealed.slice();
      altered[at] = (altered[at] ?? 0) ^ 1;
      await expect(openSnapshot(keys, altered)).rejects.toBeInstanceOf(SealError);
    }
    await expect(openSnapshot(keys, sealed.slice(0, sealed.length - 1))).rejects.toThrow(
      /could not be opened/,
    );
  });

  it('refuses what is not a sealed snapshot', async () => {
    const keys = await deriveVaultKeys(SECRET);
    const sealed = await sealSnapshot(keys, json);
    const renamed = sealed.slice();
    renamed[0] = 'X'.charCodeAt(0);
    await expect(openSnapshot(keys, renamed)).rejects.toThrow(/not in a form this app knows/);
    await expect(openSnapshot(keys, sealed.slice(0, 16))).rejects.toBeInstanceOf(SealError);
  });

  it('opens only with the same phrase, and only under the same vault id', async () => {
    const keys = await deriveVaultKeys(SECRET);
    const sealed = await sealSnapshot(keys, json);
    const other = await deriveVaultKeys(Uint8Array.from({ length: 16 }, () => 7));
    await expect(openSnapshot(other, sealed)).rejects.toBeInstanceOf(SealError);
    // The right key, but the data moved to another vault: the additional data no longer matches.
    await expect(openSnapshot({ ...keys, id: other.id }, sealed)).rejects.toBeInstanceOf(SealError);
  });
});

describe('helpers', () => {
  it('gzips text', async () => {
    const text = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({ id: i, outcome: 'solved' })),
    );
    const zipped = await gzipText(text);
    expect(zipped.length).toBeLessThan(text.length / 5);
    expect(await gunzipText(zipped)).toBe(text);
  });

  it('writes base64url without padding', () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xbf, 0x00, 0x10]);
    expect(toBase64Url(bytes)).toBe('-_-_ABA');
    expect([...fromBase64Url('-_-_ABA')]).toEqual([...bytes]);
  });
});
