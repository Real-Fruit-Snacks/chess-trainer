/**
 * The human-like opponent's files: the Maia-3 model and ONNX Runtime's
 * WebAssembly build that runs it — shared by the page (which downloads them),
 * the model's worker (which reads them from the cache) and the service worker
 * (which drops the ones a newer version no longer names). The names and
 * checksums are pinned in scripts/setup-maia.mjs; a test keeps the two lists
 * the same, and the runtime's version the installed one.
 *
 * Both names carry a version: a cached file is never mistaken for a newer one
 * (an old runtime binary under a new runtime's code would not load).
 *
 * This module is shared by the page and the service worker, so it must not
 * touch `window`, `document` or React.
 */

/** ONNX Runtime Web, as installed (package.json pins it exactly). */
export const ORT_VERSION = '1.30.0';

export interface MaiaFile {
  name: string;
  /** Size in bytes, for the download's progress and the size shown before it. */
  bytes: number;
  /** SHA-256 of the file: a download counts only when it is exactly this file. */
  sha256: string;
}

export const MAIA_FILES = {
  /** Maia-3, 5 million parameters, half-precision weights (AGPL-3.0). */
  model: {
    name: 'maia3-5m.fp16.onnx',
    bytes: 10_755_531,
    sha256: 'ca22fc3031975932e693f9758149302efc177749165443ed52de828add8864fa',
  },
  /** ONNX Runtime's WebAssembly build: SIMD, threads optional (MIT). */
  runtime: {
    name: `ort-${ORT_VERSION}-simd-threaded.wasm`,
    bytes: 14_239_897,
    sha256: '3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2',
  },
} as const satisfies Record<string, MaiaFile>;

/** Both files together, for "about 25 MB". */
export const MAIA_TOTAL_BYTES = MAIA_FILES.model.bytes + MAIA_FILES.runtime.bytes;

/** The folder the files are served from, under the app's base path. */
export const MAIA_DIR = 'maia/';

/** The cache the page downloads the files into; the model's worker reads them from there. */
export const MAIA_CACHE = 'chess-trainer-maia';

const MAIA_FILE_NAMES: readonly string[] = Object.values(MAIA_FILES).map((f) => f.name);

/** Whether a URL path names one of the human-like opponent's files (any version). */
export function isMaiaFilePath(pathname: string): boolean {
  return /\/maia\/[\w.-]+\.(?:onnx|wasm)$/.test(pathname);
}

/** Whether a file URL belongs to the current version (otherwise it can be dropped). */
export function isCurrentMaiaFile(pathname: string): boolean {
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  return MAIA_FILE_NAMES.includes(name);
}
