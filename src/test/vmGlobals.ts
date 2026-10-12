import { webcrypto } from 'node:crypto';
import * as webStreams from 'node:stream/web';

/**
 * The app's unit tests run in the vmThreads pool (vite.config.ts): each file in a
 * fresh context of jsdom's own, which lacks web APIs that browsers and Node
 * have and the app uses — SubtleCrypto (the sync's encryption) and the streams
 * (downloads, compression). This lends the context Node's; where they are
 * there already (Node's own globals, the forks project) it does nothing.
 */
if (!('subtle' in crypto)) {
  Object.defineProperty(crypto, 'subtle', { value: webcrypto.subtle, configurable: true });
}
for (const [name, value] of Object.entries(webStreams)) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}
