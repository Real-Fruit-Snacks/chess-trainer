/**
 * Shareable analysis links. The game travels in the URL fragment, so it never
 * reaches a server: `#z=<deflated PGN>&ply=12`, or `#pgn=<PGN>` where the
 * Compression Streams API is unavailable. `#fen=` carries a single position.
 */

export interface ShareParams {
  pgn?: string;
  fen?: string;
  /** 1-based ply to open the game at (0 = the starting position). */
  ply?: number;
  /**
   * The moves from the start to the viewed node, in UCI, when it lies in a
   * variation (the main line needs only `ply`). Older links have none.
   */
  line?: string[];
  /** Title of a shared analysis, shown when it opens. */
  name?: string;
}

/** Roughly where browsers, chat apps and QR codes start truncating URLs. */
export const SHARE_LINK_WARN_CHARS = 2000;

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Inflated payloads stop here: a real PGN or repertoire is a few kilobytes. */
export const MAX_INFLATED_BYTES = 1024 * 1024;
/** A pasted `#pgn=` or `#fen=` longer than this is not a chess game either. */
export const MAX_PLAIN_CHARS = 1024 * 1024;

/** Why a fragment could not be read. */
export type ShareLinkFailure =
  /** Nothing in the fragment. */
  | 'empty'
  /** The link is compressed and this browser has no Compression Streams (Safari before 16.4). */
  | 'unsupported'
  /** The data is not a valid payload. */
  | 'invalid'
  /** The payload inflates past the cap. */
  | 'too-large';

export class ShareLinkError extends Error {
  constructor(
    readonly kind: ShareLinkFailure,
    message = `Share link could not be read (${kind})`,
  ) {
    super(message);
    this.name = 'ShareLinkError';
  }
}

export const hasCompressionStreams = () =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Runs bytes through a (de)compression stream and collects the output, giving
 * up once `limit` bytes have come out. The write side is watched too, so a
 * malformed input never leaves an unhandled rejection behind.
 */
export async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit = MAX_INFLATED_BYTES,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const failure: { error: Error | null } = { error: null };
  const writing = writer
    .write(bytes.slice())
    .then(() => writer.close())
    .catch((error: unknown) => {
      failure.error = error instanceof Error ? error : new Error('write failed');
    });
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new ShareLinkError('too-large');
      }
      chunks.push(value);
    }
  } finally {
    await writing;
  }
  if (failure.error !== null) throw failure.error;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Deflates text to a URL-safe string. */
export async function compressText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw'), Infinity));
}

/** Inflates a `#z=` payload; throws a `ShareLinkError` when it cannot. */
export async function decompressText(encoded: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new ShareLinkError('unsupported');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(encoded);
  } catch {
    throw new ShareLinkError('invalid');
  }
  try {
    const out = await pipe(bytes, new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(out);
  } catch (error) {
    if (error instanceof ShareLinkError) throw error;
    throw new ShareLinkError('invalid');
  }
}

/** Builds the fragment (without the leading `#`) for a share link. */
export async function buildShareFragment(params: ShareParams): Promise<string> {
  const parts: string[] = [];
  if (params.pgn) {
    if (hasCompressionStreams()) parts.push(`z=${await compressText(params.pgn)}`);
    else parts.push(`pgn=${encodeURIComponent(params.pgn)}`);
    if (params.ply !== undefined && params.ply >= 0) parts.push(`ply=${params.ply}`);
    if (params.line && params.line.length > 0 && params.line.every((m) => UCI.test(m))) {
      parts.push(`line=${params.line.join('.')}`);
    }
    if (params.name) parts.push(`name=${encodeURIComponent(params.name)}`);
  } else if (params.fen) {
    parts.push(`fen=${encodeURIComponent(params.fen)}`);
  }
  return parts.join('&');
}

export type ShareReadResult =
  { ok: true; params: ShareParams } | { ok: false; kind: ShareLinkFailure };

/**
 * Reads a share fragment back, saying why when it cannot — so a browser
 * without Compression Streams can be told "this browser cannot open
 * compressed links" rather than "that link does not contain a game".
 */
export async function readShareFragment(fragment: string): Promise<ShareReadResult> {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!raw) return { ok: false, kind: 'empty' };
  const params = new URLSearchParams(raw);
  const ply = Number(params.get('ply'));
  const out: ShareParams = {};
  const z = params.get('z');
  const pgn = params.get('pgn');
  const fen = params.get('fen');
  if (z) {
    try {
      out.pgn = await decompressText(z);
    } catch (error) {
      return { ok: false, kind: error instanceof ShareLinkError ? error.kind : 'invalid' };
    }
  } else if (pgn) {
    if (pgn.length > MAX_PLAIN_CHARS) return { ok: false, kind: 'too-large' };
    out.pgn = pgn;
  } else if (fen) {
    if (fen.length > 200) return { ok: false, kind: 'invalid' };
    out.fen = fen;
  } else {
    return { ok: false, kind: 'empty' };
  }
  if (params.has('ply') && Number.isFinite(ply) && ply >= 0) out.ply = Math.floor(ply);
  const line = params.get('line');
  if (line) {
    const moves = line.split('.').slice(0, 1000);
    if (moves.every((m) => UCI.test(m))) out.line = moves;
  }
  const name = params.get('name');
  if (name) out.name = name.slice(0, 200);
  return { ok: true, params: out };
}

/** Reads a share fragment back. Returns null when it carries nothing useful. */
export async function parseShareFragment(fragment: string): Promise<ShareParams | null> {
  const result = await readShareFragment(fragment);
  return result.ok ? result.params : null;
}
