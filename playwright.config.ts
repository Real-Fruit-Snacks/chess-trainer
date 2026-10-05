import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * The URL prefix the build under test was made with — `VITE_BASE_PATH` from the
 * environment, normalised as vite.config.ts does: "/" by default, "/chess-trainer/"
 * in the CI job that checks the production path. Specs written with relative URLs
 * (`page.goto('play')`) follow it; specs that start from "/" assume the root.
 */
const BASE_PATH = (() => {
  const raw = process.env.VITE_BASE_PATH ?? '';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
})();
const baseURL = `http://127.0.0.1:${PORT}${BASE_PATH}`;

/**
 * End-to-end smoke tests run against the production build (`vite preview`),
 * so they exercise the real service worker, engine worker and code splitting.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH to reuse a system Chromium instead of the one
 * Playwright downloads.
 */
const CROSS_BROWSER_SPECS = [
  /smoke\.spec\.ts/,
  /threads\.spec\.ts/,
  /features\.spec\.ts/,
  /accessibility\.spec\.ts/,
  /release-0-8\.spec\.ts/,
  /release-0-9\.spec\.ts/,
  /release-0-10\.spec\.ts/,
  /release-0-11\.spec\.ts/,
  /release-0-12-[a-z]+\.spec\.ts/,
  /release-0-13-[a-z]+\.spec\.ts/,
  /release-0-15-[a-z]+\.spec\.ts/,
  /release-0-16-[a-z]+\.spec\.ts/,
  /release-0-17-[a-z]+\.spec\.ts/,
];

/** Pixel snapshots run only when asked (VISUAL=1, `npm run e2e:visual`); see e2e/visual.spec.ts. */
const VISUAL = process.env.VISUAL === '1';

/**
 * Firefox and WebKit run in CI, and locally only with ALL_BROWSERS=1 (after
 * `npx playwright install firefox webkit`), so a plain `npm run e2e` needs
 * nothing but Chromium.
 */
const ALL_BROWSERS = !!process.env.CI || process.env.ALL_BROWSERS === '1';

export default defineConfig({
  testDir: './e2e',
  testIgnore: VISUAL ? [] : [/visual\.spec\.ts/],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retries keep a pull request from failing on one unlucky run; the nightly CI run
  // sets PLAYWRIGHT_FAIL_ON_FLAKY=1, so a test that only passed on a retry fails there.
  retries: process.env.CI ? 2 : 0,
  failOnFlakyTests: process.env.PLAYWRIGHT_FAIL_ON_FLAKY === '1',
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
    ...(ALL_BROWSERS
      ? [
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
        ]
      : []),
  ],
  webServer: {
    // At the root, `vite preview` (which answers unknown paths with index.html). Under a
    // sub-path, a server that behaves like GitHub Pages: 404.html, with a 404, for any
    // path without a file — the fallback deep links rely on in production.
    command:
      BASE_PATH === '/'
        ? `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`
        : `node scripts/serve-dist.mjs --port ${PORT} --host 127.0.0.1 --base ${BASE_PATH}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
