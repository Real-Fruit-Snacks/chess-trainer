import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { siteConfig } from './src/site.config.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * `VITE_BASE_PATH` is the URL prefix the site is served from.
 *   - user/organisation pages (https://you.github.io)       → "/"
 *   - project pages         (https://you.github.io/<repo>/) → "/<repo>/"
 * The deploy workflow sets it automatically from the repository name.
 */
function resolveBase(mode: string): string {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = env.VITE_BASE_PATH || '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig(({ mode }) => {
  const base = resolveBase(mode);

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      react(),
      VitePWA({
        // A hand-written Workbox service worker (src/sw.ts): precaching plus the
        // opt-in COOP/COEP headers for the multi-threaded engine.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false, // we register from src/app/UpdatePrompt.tsx to control the UX
        includeAssets: ['favicon.svg', 'icons/*.png', 'robots.txt'],
        manifest: {
          id: base,
          name: siteConfig.name,
          short_name: siteConfig.shortName,
          description: siteConfig.description,
          start_url: base,
          scope: base,
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'any',
          background_color: siteConfig.backgroundColor,
          theme_color: siteConfig.themeColor,
          lang: 'en',
          dir: 'ltr',
          categories: ['education', 'games'],
          // Backups exported from the app can be opened with it from a file manager.
          file_handlers: [
            {
              action: base,
              accept: { 'application/json': ['.json'] },
            },
          ],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Solve puzzles',
              short_name: 'Puzzles',
              url: `${base}puzzles`,
              icons: [{ src: 'icons/shortcut-puzzles.png', sizes: '96x96', type: 'image/png' }],
            },
            {
              name: 'Play the engine',
              short_name: 'Play',
              url: `${base}play`,
              icons: [{ src: 'icons/shortcut-play.png', sizes: '96x96', type: 'image/png' }],
            },
            {
              name: 'Lessons',
              short_name: 'Learn',
              url: `${base}learn`,
              icons: [{ src: 'icons/shortcut-learn.png', sizes: '96x96', type: 'image/png' }],
            },
          ],
        },
        injectManifest: {
          // Everything the app needs offline is static, so precache all of it —
          // including the single-threaded engine WASM and the puzzle chunks.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,json,webmanifest,woff2}'],
          // The threaded engine build is optional and cached on first use instead, and so
          // are the puzzle chunks beyond the first one of each rating band (b*-00.json).
          globIgnores: [
            '**/engine/stockfish-19-lite.js',
            '**/engine/stockfish-19-lite.wasm',
            '**/puzzles/b*-@(0[1-9]|[1-9][0-9]).json',
          ],
          // The Stockfish WASM binary is ~1.8 MB; Workbox's default cap is 2 MB.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    worker: {
      format: 'es',
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    preview: {
      port: 4173,
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      },
    },
  };
});
