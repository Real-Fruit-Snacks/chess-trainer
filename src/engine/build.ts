/**
 * Which Stockfish build to load, and with how many threads.
 *
 * Two builds ship (both Stockfish 19 "lite" NNUE, see scripts/setup-engine.mjs):
 *  - `single`: one thread, works everywhere WebAssembly does. Precached.
 *  - `multi`:  pthreads build. Needs `SharedArrayBuffer`, which browsers only
 *              expose to cross-origin-isolated documents (see sw/isolation.ts).
 *              Fetched on first use.
 */
export type EngineBuild = 'single' | 'multi';

const BASE = import.meta.env.BASE_URL;

export const ENGINE_BUILD_URLS: Readonly<Record<EngineBuild, string>> = {
  single: `${BASE}engine/stockfish-19-lite-single.js`,
  multi: `${BASE}engine/stockfish-19-lite.js`,
};

/** Never take every core: the UI thread and the browser need room too. */
export const MAX_ENGINE_THREADS = 8;
/** Phones and tablets throttle hard and share cores with the UI: a lower cap keeps them responsive. */
export const MAX_MOBILE_ENGINE_THREADS = 4;

export interface ThreadEnvironment {
  /** `globalThis.crossOriginIsolated` */
  isolated: boolean;
  /** `typeof SharedArrayBuffer !== 'undefined'` */
  sharedMemory: boolean;
  /** `navigator.hardwareConcurrency` (undefined when the browser hides it). */
  cores: number | undefined;
  /** A phone or tablet (client hints, or a coarse pointer): threads are capped lower. */
  mobile?: boolean;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hinted = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    ?.mobile;
  if (hinted !== undefined) return hinted;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export function detectThreadEnvironment(): ThreadEnvironment {
  const g = globalThis as typeof globalThis & { crossOriginIsolated?: boolean };
  return {
    isolated: g.crossOriginIsolated === true,
    sharedMemory: typeof SharedArrayBuffer !== 'undefined',
    cores: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
    mobile: isMobileDevice(),
  };
}

/**
 * Threads the engine may use on this device: all reported cores but one, capped
 * at eight (four on phones and tablets). One thread when the browser hides the
 * count (iOS Safari, Firefox with resist-fingerprinting) or reports fewer than
 * three cores — threads only help once two can search while one runs the UI.
 */
export function defaultThreadCount(cores: number | undefined, mobile = false): number {
  if (!cores || !Number.isFinite(cores)) return 1;
  const cap = mobile ? MAX_MOBILE_ENGINE_THREADS : MAX_ENGINE_THREADS;
  return Math.max(1, Math.min(cap, Math.floor(cores) - 1));
}

export interface EngineBuildChoice {
  build: EngineBuild;
  threads: number;
  /**
   * Why the single-threaded build was chosen although threads were requested.
   * `one-core` covers every case where threads cannot help: fewer than three
   * reported cores, or a browser that hides the count.
   */
  reason: 'off' | 'not-isolated' | 'no-shared-memory' | 'one-core' | null;
}

/**
 * Picks the build for the current environment. `wantThreads` is the learner's
 * setting; the single build is used whenever threads cannot actually help.
 */
export function chooseEngineBuild(
  wantThreads: boolean,
  env: ThreadEnvironment = detectThreadEnvironment(),
): EngineBuildChoice {
  if (!wantThreads) return { build: 'single', threads: 1, reason: 'off' };
  if (!env.isolated) return { build: 'single', threads: 1, reason: 'not-isolated' };
  if (!env.sharedMemory) return { build: 'single', threads: 1, reason: 'no-shared-memory' };
  const threads = defaultThreadCount(env.cores, env.mobile ?? false);
  if (threads < 2) return { build: 'single', threads: 1, reason: 'one-core' };
  return { build: 'multi', threads, reason: null };
}

/** Short label for status lines: "Stockfish 19 · 4 threads". */
export function describeEngine(build: EngineBuild, threads: number): string {
  return build === 'multi'
    ? `Stockfish 19 · ${threads} thread${threads === 1 ? '' : 's'}`
    : 'Stockfish 19 lite';
}
