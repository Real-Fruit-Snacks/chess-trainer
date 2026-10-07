/**
 * Everything device sync keeps on the relay is sealed here first. From the
 * 16-byte secret behind the recovery phrase, HKDF-SHA-256 derives three
 * independent values:
 *
 * - the vault id, the file's name on the relay;
 * - the write token, which the relay checks (it keeps only its hash);
 * - an AES-256-GCM key, which never leaves the device.
 *
 * A sealed snapshot is "CTS1", a 12-byte random nonce and the AES-GCM
 * ciphertext of the gzipped JSON, bound to its vault id (additional data), so
 * the relay can neither read nor alter it unnoticed.
 */

export interface VaultKeys {
  /** The vault's name on the relay: 32 bytes, base64url. */
  id: string;
  /** Proves to the relay that a request comes from a device with the phrase: 32 bytes, base64url. */
  token: string;
  /** Seals and opens the snapshots. */
  key: CryptoKey;
}

const MAGIC = new TextEncoder().encode('CTS1');
const NONCE_BYTES = 12;
const SALT = new TextEncoder().encode('chess-trainer device sync v1');

/** Bytes as unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Derives the vault id, the write token and the encryption key from the secret. */
export async function deriveVaultKeys(secret: Uint8Array<ArrayBuffer>): Promise<VaultKeys> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const params = (label: string): HkdfParams => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: SALT,
    info: new TextEncoder().encode(label),
  });
  const bits = async (label: string) =>
    new Uint8Array(await crypto.subtle.deriveBits(params(label), base, 256));
  const [id, token, key] = await Promise.all([
    bits('vault id'),
    bits('write token'),
    crypto.subtle.deriveKey(
      params('encryption key'),
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
  ]);
  return { id: toBase64Url(id), token: toBase64Url(token), key };
}

const additionalData = (id: string) => new TextEncoder().encode(`chess-trainer-sync:1:${id}`);

/** Pipes a body through a (de)compression stream and collects what comes out. */
function through(
  body: string | Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
) {
  const source = new Response(body).body;
  if (!source) throw new Error('Nothing to compress.');
  return new Response(source.pipeThrough(transform));
}

/** UTF-8 text, gzipped. */
export async function gzipText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await through(text, new CompressionStream('gzip')).arrayBuffer());
}

export async function gunzipText(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return through(bytes, new DecompressionStream('gzip')).text();
}

/** Compresses and encrypts a snapshot's JSON for the vault. */
export async function sealSnapshot(
  keys: VaultKeys,
  json: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: additionalData(keys.id) },
      keys.key,
      await gzipText(json),
    ),
  );
  const sealed = new Uint8Array(MAGIC.length + NONCE_BYTES + ciphertext.length);
  sealed.set(MAGIC, 0);
  sealed.set(nonce, MAGIC.length);
  sealed.set(ciphertext, MAGIC.length + NONCE_BYTES);
  return sealed;
}

/** Thrown when a vault's contents cannot be opened with these keys (altered, or not ours). */
export class SealError extends Error {}

/** Decrypts and decompresses a vault's contents back into the snapshot's JSON. */
export async function openSnapshot(
  keys: VaultKeys,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const header = sealed.subarray(0, MAGIC.length);
  if (sealed.length <= MAGIC.length + NONCE_BYTES || !header.every((b, i) => b === MAGIC[i])) {
    throw new SealError('The synced data is not in a form this app knows.');
  }
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: sealed.slice(MAGIC.length, MAGIC.length + NONCE_BYTES),
        additionalData: additionalData(keys.id),
      },
      keys.key,
      sealed.slice(MAGIC.length + NONCE_BYTES),
    );
  } catch {
    throw new SealError('The synced data could not be opened with this recovery phrase.');
  }
  return gunzipText(new Uint8Array(plain));
}
