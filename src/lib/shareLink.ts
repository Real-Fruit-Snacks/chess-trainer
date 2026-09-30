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
}

const hasStreams = () =>
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

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const writer = stream.writable.getWriter();
  const writing = writer.write(bytes.slice()).then(() => writer.close());
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writing;
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
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
  return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decompressText(encoded: string): Promise<string> {
  const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(bytes);
}

/** Builds the fragment (without the leading `#`) for a share link. */
export async function buildShareFragment(params: ShareParams): Promise<string> {
  const parts: string[] = [];
  if (params.pgn) {
    if (hasStreams()) parts.push(`z=${await compressText(params.pgn)}`);
    else parts.push(`pgn=${encodeURIComponent(params.pgn)}`);
    if (params.ply !== undefined && params.ply > 0) parts.push(`ply=${params.ply}`);
  } else if (params.fen) {
    parts.push(`fen=${encodeURIComponent(params.fen)}`);
  }
  return parts.join('&');
}

/** Reads a share fragment back. Returns null when it carries nothing useful. */
export async function parseShareFragment(fragment: string): Promise<ShareParams | null> {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const ply = Number(params.get('ply'));
  const out: ShareParams = {};
  const z = params.get('z');
  const pgn = params.get('pgn');
  const fen = params.get('fen');
  try {
    if (z) out.pgn = await decompressText(z);
    else if (pgn) out.pgn = pgn;
    else if (fen) out.fen = fen;
    else return null;
  } catch {
    return null;
  }
  if (Number.isFinite(ply) && ply > 0) out.ply = Math.floor(ply);
  return out;
}
