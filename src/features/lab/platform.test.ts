import { describe, expect, it, vi } from 'vitest';
import { platformChecks, storageEstimate } from './platform';

describe('platform checks', () => {
  it('reports every capability with a yes, no or unknown', () => {
    const checks = platformChecks();
    const ids = checks.map((c) => c.id);
    for (const id of [
      'standalone',
      'service-worker',
      'online',
      'wasm',
      'workers',
      'shared-memory',
      'isolated',
      'audio',
      'vibrate',
      'badge',
      'share',
      'share-files',
      'compression',
      'clipboard',
      'css-has',
      'css-container',
      'css-dvh',
      'dark',
      'reduced-motion',
      'coarse',
      'viewport',
      'language',
    ]) {
      expect(ids).toContain(id);
    }
    for (const check of checks) {
      expect(['yes', 'no', 'unknown']).toContain(check.state);
      expect(check.label.length).toBeGreaterThan(0);
    }
    expect(checks.find((c) => c.id === 'viewport')?.detail).toMatch(/^\d+ × \d+ at \d+(\.\d+)?×$/);
    expect(checks.find((c) => c.id === 'online')?.state).toBe('yes');
  });

  it('turns the browser storage estimate into a readable line', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: () => Promise.resolve({ usage: 2 * 1024 * 1024, quota: 500 * 1024 * 1024 }),
      },
      configurable: true,
    });
    const check = await storageEstimate();
    expect(check.state).toBe('yes');
    expect(check.detail).toBe('2 MB used of 500 MB allowed');
  });

  it('says unknown when the browser gives no estimate', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: vi.fn(() => Promise.reject(new Error('nope'))) },
      configurable: true,
    });
    expect((await storageEstimate()).state).toBe('unknown');
  });
});
