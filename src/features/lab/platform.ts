/**
 * What this device and browser can do — the checks a tester wants to see
 * before trying a feature by hand. Every probe is guarded so the list renders
 * on any browser, including jsdom.
 */
export type CheckState = 'yes' | 'no' | 'unknown';

/**
 * What a "no" means: a capability the app would use is missing (worth a red
 * badge), a preference or circumstance is simply not set (neutral), or the row
 * is plain information.
 */
export type CheckKind = 'capability' | 'preference' | 'info';

export interface PlatformCheck {
  id: string;
  label: string;
  state: CheckState;
  /** A value or explanation shown next to the state. */
  detail?: string;
  /** How to colour a "no"; capabilities when missing. */
  kind?: CheckKind;
}

function yesNo(value: boolean | undefined): CheckState {
  return value === undefined ? 'unknown' : value ? 'yes' : 'no';
}

function supportsCss(declaration: string): CheckState {
  try {
    return typeof CSS === 'undefined' ? 'unknown' : yesNo(CSS.supports(declaration));
  } catch {
    return 'unknown';
  }
}

function supportsSelector(selector: string): CheckState {
  try {
    return typeof CSS === 'undefined' ? 'unknown' : yesNo(CSS.supports(`selector(${selector})`));
  } catch {
    return 'unknown';
  }
}

function media(query: string): CheckState {
  try {
    return typeof window.matchMedia === 'function'
      ? yesNo(window.matchMedia(query).matches)
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The synchronous checks; `storageEstimate` adds the asynchronous one. */
export function platformChecks(): PlatformCheck[] {
  const nav = navigator as Navigator & {
    standalone?: boolean;
    setAppBadge?: unknown;
    share?: unknown;
    canShare?: (data: ShareData) => boolean;
    vibrate?: unknown;
  };
  const g = globalThis as typeof globalThis & { crossOriginIsolated?: boolean };
  let canShareFiles: CheckState;
  try {
    canShareFiles = yesNo(
      typeof nav.canShare === 'function' &&
        nav.canShare({ files: [new File(['x'], 'backup.json', { type: 'application/json' })] }),
    );
  } catch {
    canShareFiles = 'unknown';
  }
  return [
    {
      id: 'standalone',
      kind: 'preference',
      label: 'Running as an installed app',
      state:
        media('(display-mode: standalone)') === 'yes' || nav.standalone === true ? 'yes' : 'no',
    },
    {
      id: 'service-worker',
      kind: 'preference',
      label: 'Service worker controls the page',
      state: yesNo(!!nav.serviceWorker?.controller),
      detail: nav.serviceWorker ? undefined : 'Service workers are not available',
    },
    {
      id: 'online',
      kind: 'preference',
      label: 'Online',
      state: yesNo(nav.onLine),
    },
    {
      id: 'wasm',
      label: 'WebAssembly',
      state: yesNo(typeof WebAssembly !== 'undefined'),
    },
    {
      id: 'workers',
      label: 'Web Workers',
      state: yesNo(typeof Worker !== 'undefined'),
    },
    {
      id: 'shared-memory',
      kind: 'preference',
      label: 'SharedArrayBuffer (multi-threaded engine)',
      state: yesNo(typeof SharedArrayBuffer !== 'undefined'),
    },
    {
      id: 'isolated',
      kind: 'preference',
      label: 'Cross-origin isolated',
      state: yesNo(g.crossOriginIsolated === true),
    },
    {
      id: 'cores',
      kind: 'info',
      label: 'CPU cores reported',
      state: nav.hardwareConcurrency ? 'yes' : 'unknown',
      detail: nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : undefined,
    },
    {
      id: 'audio',
      label: 'Web Audio (sound effects)',
      state: yesNo(
        typeof AudioContext !== 'undefined' ||
          'webkitAudioContext' in (globalThis as Record<string, unknown>),
      ),
    },
    {
      id: 'vibrate',
      kind: 'preference',
      label: 'Vibration API (haptics)',
      state: yesNo(typeof nav.vibrate === 'function'),
    },
    {
      id: 'badge',
      kind: 'preference',
      label: 'App icon badge',
      state: yesNo(typeof nav.setAppBadge === 'function'),
    },
    {
      id: 'share',
      kind: 'preference',
      label: 'Web Share',
      state: yesNo(typeof nav.share === 'function'),
    },
    {
      id: 'share-files',
      kind: 'preference',
      label: 'Web Share with files (share a backup)',
      state: canShareFiles,
    },
    {
      id: 'compression',
      label: 'Compression Streams (compact share links)',
      state: yesNo(
        typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined',
      ),
    },
    {
      id: 'clipboard',
      label: 'Clipboard writing',
      state: yesNo(typeof nav.clipboard?.writeText === 'function'),
    },
    {
      id: 'css-has',
      label: 'CSS :has()',
      state: supportsSelector(':has(a)'),
    },
    {
      id: 'css-container',
      label: 'CSS container queries',
      state: supportsCss('container-type: inline-size'),
    },
    {
      id: 'css-dvh',
      label: 'CSS dynamic viewport units',
      state: supportsCss('height: 1dvh'),
    },
    {
      id: 'dark',
      kind: 'preference',
      label: 'System prefers dark colours',
      state: media('(prefers-color-scheme: dark)'),
    },
    {
      id: 'reduced-motion',
      kind: 'preference',
      label: 'System prefers reduced motion',
      state: media('(prefers-reduced-motion: reduce)'),
    },
    {
      id: 'coarse',
      kind: 'preference',
      label: 'Touch (coarse pointer)',
      state: media('(pointer: coarse)'),
    },
    {
      id: 'viewport',
      kind: 'info',
      label: 'Viewport',
      state: 'yes',
      detail: `${window.innerWidth} × ${window.innerHeight} at ${window.devicePixelRatio}×`,
    },
    {
      id: 'language',
      kind: 'info',
      label: 'Language',
      state: 'yes',
      detail: nav.language,
    },
  ];
}

/** How much the origin may store (caches and all), where the browser says. */
export async function storageEstimate(): Promise<PlatformCheck> {
  try {
    const estimate = await navigator.storage?.estimate();
    if (!estimate?.quota) return { id: 'quota', label: 'Origin storage', state: 'unknown' };
    const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(0)} MB`;
    return {
      id: 'quota',
      label: 'Origin storage (caches included)',
      state: 'yes',
      detail: `${mb(estimate.usage ?? 0)} used of ${mb(estimate.quota)} allowed`,
    };
  } catch {
    return { id: 'quota', label: 'Origin storage', state: 'unknown' };
  }
}
