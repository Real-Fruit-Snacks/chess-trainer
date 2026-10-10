import { defineConfig, devices } from '@playwright/test';
import { offlineBundle } from './e2e/offlineBundle';

/**
 * The offline copy of a release, as a learner gets it: unpacked and started
 * with its own launcher, which serves it like GitHub Pages serves the live
 * site. `npm run release:offline` makes it; `npm run e2e:offline` runs
 * e2e/offline.spec.ts against it (OFFLINE_BUNDLE names another unpacked copy).
 */
const PORT = 4180;
const { launcher } = offlineBundle();

export default defineConfig({
  testDir: './e2e',
  testMatch: /offline\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `"${launcher}" -no-browser -port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
