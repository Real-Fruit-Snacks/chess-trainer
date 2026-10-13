import { describe, expect, it } from 'vitest';
import {
  canOfferInstall,
  describeInstallUnavailable,
  detectStandalone,
  INSTALL_DISMISS_COOLDOWN_MS,
  INSTALL_DISMISSED_KEY,
  installUnavailableReason,
  readInstallDismissed,
} from './pwa';

const DAY = 24 * 60 * 60 * 1000;

describe('install banner dismissal', () => {
  it('is off with nothing stored, on within the cool-down, off after it', () => {
    const storage = new Map<string, string>();
    const api = { getItem: (k: string) => storage.get(k) ?? null };
    const now = 1_700_000_000_000;
    expect(readInstallDismissed(now, api)).toBe(false);
    storage.set(INSTALL_DISMISSED_KEY, String(now - 10 * DAY));
    expect(readInstallDismissed(now, api)).toBe(true);
    storage.set(INSTALL_DISMISSED_KEY, String(now - INSTALL_DISMISS_COOLDOWN_MS - 1));
    expect(readInstallDismissed(now, api)).toBe(false);
    storage.set(INSTALL_DISMISSED_KEY, 'garbage');
    expect(readInstallDismissed(now, api)).toBe(false);
  });

  it('survives a storage that throws', () => {
    const api = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readInstallDismissed(Date.now(), api)).toBe(false);
  });
});

describe('detectStandalone', () => {
  const matching = (modes: string[]) => (query: string) => ({
    matches: modes.some((m) => query === `(display-mode: ${m})`),
  });

  it('recognises every installed display mode and the iOS flag', () => {
    expect(detectStandalone(matching([]), {})).toBe(false);
    expect(detectStandalone(matching(['standalone']), {})).toBe(true);
    expect(detectStandalone(matching(['window-controls-overlay']), {})).toBe(true);
    expect(detectStandalone(matching(['minimal-ui']), {})).toBe(true);
    expect(detectStandalone(matching(['browser']), {})).toBe(false);
    expect(detectStandalone(matching([]), { standalone: true })).toBe(true);
    expect(detectStandalone(undefined, undefined)).toBe(false);
  });
});

describe('install offer', () => {
  const base = {
    deferred: null,
    isStandalone: false,
    installed: false,
    platform: 'desktop',
  } as const;

  it('explains why there is nothing to offer', () => {
    expect(installUnavailableReason(base)).toBe('no-prompt');
    expect(installUnavailableReason({ ...base, isStandalone: true })).toBe('installed');
    expect(installUnavailableReason({ ...base, installed: true })).toBe('just-installed');
    expect(installUnavailableReason({ ...base, platform: 'ios' })).toBeNull();
    expect(
      installUnavailableReason({
        ...base,
        deferred: {} as unknown as BeforeInstallPromptEventLike,
      }),
    ).toBeNull();
    expect(canOfferInstall(base)).toBe(false);
    expect(canOfferInstall({ ...base, platform: 'ios' })).toBe(true);
    for (const reason of ['installed', 'just-installed', 'no-prompt'] as const) {
      expect(describeInstallUnavailable(reason)).toMatch(/\S/);
    }
  });
});

type BeforeInstallPromptEventLike = Parameters<typeof installUnavailableReason>[0]['deferred'];
