/**
 * The Stockfish files the app ships, by build — shared by the page (which
 * picks a build and downloads the full one) and the service worker (which
 * keeps the downloaded files and drops the ones a newer version no longer
 * names). The names and checksums are pinned in scripts/setup-engine.mjs; a
 * test keeps the two lists the same.
 *
 * This module is shared by the page and the service worker, so it must not
 * touch `window`, `document` or React.
 */

/**
 * - `single` / `multi`: Stockfish 19 "lite" (a 1 MiB network), one thread or
 *   several (pthreads, which need a cross-origin-isolated page).
 * - `full-single` / `full-multi`: the same with Stockfish's large network
 *   (about 99 MB), downloaded only when the learner asks for it.
 */
export type EngineBuild = 'single' | 'multi' | 'full-single' | 'full-multi';

export interface EngineFiles {
  /** The worker script (Emscripten glue). */
  script: string;
  /** The WebAssembly binary the script loads from the same folder. */
  wasm: string;
  /** Size of the binary, for download progress when the server sends no length. */
  wasmBytes: number;
}

export const ENGINE_FILES: Readonly<Record<EngineBuild, EngineFiles>> = {
  single: {
    script: 'stockfish-19-lite-single.js',
    wasm: 'stockfish-19-lite-single.wasm',
    wasmBytes: 1_787_571,
  },
  multi: {
    script: 'stockfish-19-lite.js',
    wasm: 'stockfish-19-lite.wasm',
    wasmBytes: 1_636_291,
  },
  'full-single': {
    script: 'stockfish-19-single.js',
    wasm: 'stockfish-19-single.wasm',
    wasmBytes: 99_102_793,
  },
  'full-multi': {
    script: 'stockfish-19.js',
    wasm: 'stockfish-19.wasm',
    wasmBytes: 99_065_439,
  },
};

/** Every engine file name, scripts and binaries. */
export const ENGINE_FILE_NAMES: readonly string[] = Object.values(ENGINE_FILES).flatMap((f) => [
  f.script,
  f.wasm,
]);

/** The runtime cache that keeps the engine builds fetched on demand. */
export const ENGINE_CACHE = 'chess-trainer-engine';

/**
 * Marks the page's own download of the full engine. The service worker leaves
 * such a request to the network, so stopping the download stops the transfer
 * (a worker fetching on the page's behalf would carry on and keep the file);
 * the page stores the files itself.
 */
export const ENGINE_DOWNLOAD_HEADER = 'X-Engine-Download';

/** Whether a URL path names an engine file the service worker caches on demand. */
export function isEngineFilePath(pathname: string): boolean {
  return /\/engine\/stockfish-[\w.-]+\.(?:js|wasm)$/.test(pathname);
}

/** Whether an engine file URL belongs to the current version (otherwise it can be dropped). */
export function isCurrentEngineFile(pathname: string): boolean {
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  return ENGINE_FILE_NAMES.includes(name);
}
