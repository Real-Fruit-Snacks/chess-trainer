import { fetchWithTimeout, isTimeoutError } from '@/lib/fetchWithTimeout';
import type { VaultKeys } from './vaultCrypto';

/**
 * Talking to the device-sync relay (relay/src/handler.mjs): one encrypted
 * file per vault, read and replaced by version (ETag) so two devices writing
 * at once never overwrite each other — the second is told to merge first.
 */

export type RelayErrorKind =
  /** No connection, or the relay did not answer in time. */
  | 'network'
  /** The relay refused this phrase's token. */
  | 'auth'
  /** The data is bigger than the relay keeps. */
  | 'too-large'
  /** Too many writes at once: try again in a moment. */
  | 'busy'
  /** Anything else the relay answered with. */
  | 'server';

export class RelayError extends Error {
  constructor(
    readonly kind: RelayErrorKind,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

/** The relay keeps vaults up to this size (relay/src/handler.mjs, DEFAULT_MAX_BYTES). */
export const RELAY_MAX_BYTES = 1_400_000;
/** A request gets this long, plus a second for every 25 KB it carries (slow connections). */
const TIMEOUT_MS = 30_000;
const timeoutFor = (bytes: number) => TIMEOUT_MS + Math.ceil(bytes / 25_000) * 1_000;

const vaultUrl = (relay: string, keys: VaultKeys) =>
  `${relay.replace(/\/+$/, '')}/v1/vaults/${keys.id}`;

const unreachable = () => new RelayError('network', 'The sync service could not be reached.');

async function send(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  try {
    return await fetchWithTimeout(url, { ...init, cache: 'no-store', timeoutMs });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError' && !isTimeoutError(err)) throw err;
    throw unreachable();
  }
}

/**
 * Reads a body the sync has no use for. A response left unread is not finished:
 * browsers then cancel it (DevTools shows the request as cancelled) and cannot
 * reuse its connection.
 */
const drain = (response: Response) =>
  response.arrayBuffer().then(
    () => undefined,
    () => undefined,
  );

/** Turns a refusal into an error the sync can act on. */
function refused(response: Response): RelayError {
  if (response.status === 401 || response.status === 403) {
    return new RelayError('auth', 'The sync service did not accept this recovery phrase.');
  }
  if (response.status === 413) {
    return new RelayError('too-large', 'There is more to sync than the sync service keeps.');
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After') ?? '1');
    return new RelayError(
      'busy',
      'The sync service asked to wait a moment.',
      (Number.isFinite(seconds) ? Math.max(1, seconds) : 1) * 1000,
    );
  }
  return new RelayError('server', `The sync service answered ${response.status}.`);
}

const auth = (keys: VaultKeys) => ({ Authorization: `Bearer ${keys.token}` });

export type VaultRead =
  | { status: 'found'; etag: string; data: Uint8Array<ArrayBuffer> }
  | { status: 'unchanged' }
  | { status: 'missing' };

/**
 * Reads the vault; with `etag`, says "unchanged" instead of sending the same
 * data again (the relay answers 204 with no body: see relay/src/handler.mjs).
 */
export async function readVault(
  relay: string,
  keys: VaultKeys,
  etag: string | null = null,
): Promise<VaultRead> {
  const response = await send(
    vaultUrl(relay, keys),
    { headers: { ...auth(keys), ...(etag ? { 'X-Known-Version': etag } : {}) } },
    timeoutFor(RELAY_MAX_BYTES),
  );
  if (response.status === 204 || response.status === 404 || !response.ok) {
    await drain(response);
    if (response.status === 204) {
      // "Unchanged" answers a version named in the request; to a plain read it is no answer.
      if (!etag) throw new RelayError('server', 'The sync service sent no data.');
      return { status: 'unchanged' };
    }
    if (response.status === 404) return { status: 'missing' };
    throw refused(response);
  }
  const tag = response.headers.get('ETag');
  if (!tag) {
    await drain(response);
    throw new RelayError('server', 'The sync service sent data without a version.');
  }
  let data: ArrayBuffer;
  try {
    data = await response.arrayBuffer();
  } catch {
    // The connection dropped part-way through.
    throw unreachable();
  }
  return { status: 'found', etag: tag, data: new Uint8Array(data) };
}

export type VaultWrite = { ok: true; etag: string } | { ok: false; conflict: true };

/**
 * Writes the vault: replacing version `etag`, or creating it (`etag` null).
 * A vault that moved on meanwhile (another device wrote), or went, is a
 * conflict: read, merge and write again — the read finds out which.
 */
export async function writeVault(
  relay: string,
  keys: VaultKeys,
  data: Uint8Array<ArrayBuffer>,
  etag: string | null,
): Promise<VaultWrite> {
  if (data.byteLength > RELAY_MAX_BYTES) {
    throw new RelayError('too-large', 'There is more to sync than the sync service keeps.');
  }
  const response = await send(
    vaultUrl(relay, keys),
    {
      method: 'PUT',
      body: data,
      headers: {
        ...auth(keys),
        'Content-Type': 'application/octet-stream',
        ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }),
      },
    },
    timeoutFor(data.byteLength),
  );
  await drain(response);
  if (response.status === 412 || (etag !== null && response.status === 404)) {
    return { ok: false, conflict: true };
  }
  if (!response.ok) throw refused(response);
  const tag = response.headers.get('ETag');
  if (!tag) throw new RelayError('server', 'The sync service did not say which version it kept.');
  return { ok: true, etag: tag };
}

/** Deletes the vault (gone already counts as done). */
export async function deleteVault(relay: string, keys: VaultKeys): Promise<void> {
  const response = await send(vaultUrl(relay, keys), { method: 'DELETE', headers: auth(keys) });
  await drain(response);
  if (!response.ok && response.status !== 404) throw refused(response);
}
