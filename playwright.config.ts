import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end smoke tests run against the production build (`vite preview`),
 * so they exercise the real service worker, engine worker and code splitting.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH to reuse a system Chromium instead of the one
 * Playwright downloads.
 */
const CROSS_BROWSER_SPECS = [
  /smoke\.spec\.ts/,
  /features\.spec\.ts/,
  /accessibility\.spec\.ts/,
  /release-0-8\.spec\.ts/,
  /release-0-9\.spec\.ts/,
];

/** Pixel snapshots run only when asked (VISUAL=1); see e2e/visual.spec.ts. */
const VISUAL = process.env.VISUAL === '1';

export default defineConfig({
  testDir: './e2e',
  testIgnore: VISUAL ? [] : [/visual\.spec\.ts/],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    // The other engines run a broad sample: the shell, the engine, the arcade,
    // the settings, the small-phone layout and the accessibility checks.
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: CROSS_BROWSER_SPECS,
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: CROSS_BROWSER_SPECS,
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
