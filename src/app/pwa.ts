import { create } from 'zustand';

/** Not yet in lib.dom: https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

interface InstallState {
  /** The deferred browser prompt, when the browser offered one. */
  deferred: BeforeInstallPromptEvent | null;
  /** Running as an installed app (standalone window). */
  isStandalone: boolean;
  /** The app was installed during this session. */
  installed: boolean;
  /** User dismissed our banner; remembered for the session only. */
  dismissed: boolean;
  platform: InstallPlatform;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch-points check catches it.
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (ua.includes('Android')) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'unknown';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export const useInstall = create<InstallState>((set, get) => ({
  deferred: null,
  isStandalone: detectStandalone(),
  installed: false,
  dismissed: false,
  platform: detectPlatform(),
  promptInstall: async () => {
    const event = get().deferred;
    if (!event) return 'unavailable';
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') set({ installed: true, deferred: null });
    else set({ deferred: null });
    return outcome;
  },
  dismiss: () => set({ dismissed: true }),
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
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    useInstall.setState({ isStandalone: e.matches });
  });
}

/** Whether we can show *any* install affordance (a native prompt or iOS instructions). */
export function canOfferInstall(
  state: Pick<InstallState, 'deferred' | 'isStandalone' | 'installed' | 'platform'>,
): boolean {
  if (state.isStandalone || state.installed) return false;
  return state.deferred !== null || state.platform === 'ios';
}
