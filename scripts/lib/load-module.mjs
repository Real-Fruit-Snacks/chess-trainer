/**
 * Loads the app's own TypeScript modules (with their `@/` imports) into a Node
 * script through Vite's SSR loader, resolved exactly as the app build resolves
 * them — so a content check reads the real data rather than scraping source.
 */
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Starts a Vite server in middleware mode, hands `run` a loader for module paths
 * such as `/src/features/drills/endgameDrills.ts`, and closes the server after.
 * @template T
 * @param {(load: (path: string) => Promise<Record<string, unknown>>) => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function withAppModules(run) {
  const server = await createServer({
    root: ROOT,
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
}
