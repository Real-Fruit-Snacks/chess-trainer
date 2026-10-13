import { ENGINE_FILES, type EngineBuild } from '@/sw/engineFiles';

/**
 * Which Stockfish build to load, and with how many threads.
 *
 * Four builds ship (see scripts/setup-engine.mjs and sw/engineFiles.ts):
 *  - `single`: Stockfish 19 lite, one thread. Works everywhere WebAssembly
 *    does, so it is precached: the engine of the first visit.
 *  - `multi`: the lite engine with pthreads, the default. Needs
 *    `SharedArrayBuffer`, which browsers only expose to cross-origin-isolated
 *    documents (see sw/isolation.ts). Fetched on first use.
 *  - `full-single` / `full-multi`: Stockfish 19 with its large network, about
 *    99 MB, used only when the learner has switched the full engine on and
 *    downloaded it. Anything that stops them falls back to the lite builds.
 */
export type { EngineBuild };

const BASE = import.meta.env.BASE_URL;

function urls(pick: 'script' | 'wasm'): Record<EngineBuild, string> {
  const out = {} as Record<EngineBuild, string>;
  for (const [build, files] of Object.entries(ENGINE_FILES) as [
    EngineBuild,
    (typeof ENGINE_FILES)[EngineBuild],
  ][]) {
    out[build] = `${BASE}engine/${files[pick]}`;
  }
  return out;
}

/** The worker script of each build. */
export const ENGINE_BUILD_URLS: Readonly<Record<EngineBuild, string>> = urls('script');
/** The WebAssembly binary each worker script loads. */
export const ENGINE_WASM_URLS: Readonly<Record<EngineBuild, string>> = urls('wasm');

/** The full engine's download, in megabytes (decimal, as a download size is usually given). */
export const FULL_ENGINE_MB = Math.round(ENGINE_FILES['full-multi'].wasmBytes / 1_000_000);

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

/** Whether a build runs several threads (and so needs a cross-origin-isolated page). */
export function isThreadedBuild(build: EngineBuild): boolean {
  return build === 'multi' || build === 'full-multi';
}

/** Whether a build carries the large network. */
export function isFullBuild(build: EngineBuild): boolean {
  return build === 'full-single' || build === 'full-multi';
}

/**
 * What to try, in order, when `build` cannot start: the full engine falls back
 * to the lite one with the same threading, threads fall back to one thread.
 */
export function fallbackBuilds(build: EngineBuild): EngineBuild[] {
  switch (build) {
    case 'full-multi':
      return ['multi', 'single'];
    case 'full-single':
    case 'multi':
      return ['single'];
    case 'single':
      return [];
  }
}

export interface EngineBuildChoice {
  build: EngineBuild;
  threads: number;
  /**
   * Why a single-threaded build was chosen although threads were requested.
   * `one-core` covers every case where threads cannot help: fewer than three
   * reported cores, or a browser that hides the count.
   */
  reason: 'off' | 'not-isolated' | 'no-shared-memory' | 'one-core' | null;
}

/**
 * Picks the build for the current environment. `wantThreads` and `wantFull`
 * are the learner's settings; a single-threaded build is used whenever threads
 * cannot actually help. Whether the full engine has been downloaded is checked
 * when the engine starts (`EngineClient`), which falls back to lite if not.
 */
export function chooseEngineBuild(
  wantThreads: boolean,
  env: ThreadEnvironment = detectThreadEnvironment(),
  wantFull = false,
): EngineBuildChoice {
  const single: EngineBuild = wantFull ? 'full-single' : 'single';
  if (!wantThreads) return { build: single, threads: 1, reason: 'off' };
  if (!env.isolated) return { build: single, threads: 1, reason: 'not-isolated' };
  if (!env.sharedMemory) return { build: single, threads: 1, reason: 'no-shared-memory' };
  const threads = defaultThreadCount(env.cores, env.mobile ?? false);
  if (threads < 2) return { build: single, threads: 1, reason: 'one-core' };
  return { build: wantFull ? 'full-multi' : 'multi', threads, reason: null };
}

/** Short label for status lines: "Stockfish 19 lite · 4 threads", "Stockfish 19". */
export function describeEngine(build: EngineBuild, threads: number): string {
  const name = isFullBuild(build) ? 'Stockfish 19' : 'Stockfish 19 lite';
  return isThreadedBuild(build) ? `${name} · ${threads} thread${threads === 1 ? '' : 's'}` : name;
}
