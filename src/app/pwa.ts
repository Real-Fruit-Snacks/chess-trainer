import { create } from 'zustand';

/** Not yet in lib.dom: https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

/**
 * Why no install affordance is on offer, for Settings to explain. `null`
 * means one is (a browser prompt, or the iOS instructions).
 */
export type InstallUnavailableReason =
  /** Already running as the installed app. */
  | 'installed'
  /** Installed during this session; the browser window stays as it is. */
  | 'just-installed'
  /** The browser does not offer an install prompt (Firefox, Safari on a desktop). */
  | 'no-prompt';

/** Where the banner's dismissal is remembered. */
export const INSTALL_DISMISSED_KEY = 'chess-trainer:install-dismissed';
/** How long "Not now" keeps the banner away. */
export const INSTALL_DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export interface InstallState {
  /** The deferred browser prompt, when the browser offered one. */
  deferred: BeforeInstallPromptEvent | null;
  /** Running as an installed app (standalone window, or a window with the browser's controls overlaid). */
  isStandalone: boolean;
  /** The app was installed during this session. */
  installed: boolean;
  /** User dismissed our banner within the cool-down. */
  dismissed: boolean;
  platform: InstallPlatform;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
}

function detectPlatform(ua: string, touchPoints: number): InstallPlatform {
  // iPadOS reports itself as a Mac; the touch-points check catches it.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && touchPoints > 1);
  if (isIOS) return 'ios';
  if (ua.includes('Android')) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'unknown';
}

/** The display modes an installed app runs in (the manifest's `display_override` first). */
export const STANDALONE_DISPLAY_MODES = ['standalone', 'window-controls-overlay', 'minimal-ui'];

/**
 * Whether the page runs as an installed app: any of the app display modes, or
 * iOS Safari's home-screen flag.
 */
export function detectStandalone(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = typeof window ===
    'undefined' || typeof window.matchMedia !== 'function'
    ? undefined
    : window.matchMedia.bind(window),
  nav: { standalone?: boolean } | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { standalone?: boolean }),
): boolean {
  if (nav?.standalone === true) return true;
  if (!matchMedia) return false;
  return STANDALONE_DISPLAY_MODES.some((mode) => matchMedia(`(display-mode: ${mode})`).matches);
}

/** Whether "Not now" was pressed within the cool-down. */
export function readInstallDismissed(
  now = Date.now(),
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(INSTALL_DISMISSED_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return now - at < INSTALL_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function writeInstallDismissed(now = Date.now()): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(now));
  } catch {
    // Storage full or blocked: the dismissal lasts the session.
  }
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const useInstall = create<InstallState>((set, get) => ({
  deferred: null,
  isStandalone: detectStandalone(),
  installed: false,
  dismissed: readInstallDismissed(),
  platform: detectPlatform(ua, typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints),
  promptInstall: async () => {
    const event = get().deferred;
    if (!event) return 'unavailable';
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') set({ installed: true, deferred: null });
    else set({ deferred: null });
    return outcome;
  },
  dismiss: () => {
    writeInstallDismissed();
    set({ dismissed: true });
  },
}));

/**
 * Must run as early as possible: Chrome fires `beforeinstallprompt` shortly
 * after load and only once, so we capture it before React has mounted.
 */
export function setupInstallListeners(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    useInstall.setState({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    useInstall.setState({ installed: true, deferred: null });
  });
  if (typeof window.matchMedia !== 'function') return;
  for (const mode of STANDALONE_DISPLAY_MODES) {
    window.matchMedia(`(display-mode: ${mode})`).addEventListener('change', () => {
      useInstall.setState({ isStandalone: detectStandalone() });
    });
  }
}

export type OfferState = Pick<InstallState, 'deferred' | 'isStandalone' | 'installed' | 'platform'>;

/**
 * Why nothing can be offered, or `null` when an install affordance makes sense:
 * a native prompt, or the iOS Safari instructions.
 */
export function installUnavailableReason(state: OfferState): InstallUnavailableReason | null {
  if (state.isStandalone) return 'installed';
  if (state.installed) return 'just-installed';
  // iOS has no prompt API; the button shows the Share → Add to Home Screen steps instead.
  if (state.deferred || state.platform === 'ios') return null;
  return 'no-prompt';
}

/** Whether we can show *any* install affordance (a native prompt or iOS instructions). */
export function canOfferInstall(state: OfferState): boolean {
  return installUnavailableReason(state) === null;
}

/** A sentence for Settings when there is nothing to offer. */
export function describeInstallUnavailable(reason: InstallUnavailableReason): string {
  switch (reason) {
    case 'installed':
      return 'Installed as an app — works offline.';
    case 'just-installed':
      return 'Installed. Open it from your home screen or app list.';
    case 'no-prompt':
      return 'This browser does not offer app installs; the trainer still works offline here once it has loaded.';
  }
}
