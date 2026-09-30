# Engine binaries

This directory holds the Stockfish WASM build that powers the **Play**, **Analyze**
and **Puzzle hint** features. The files are **not committed** — they are downloaded
and checksum-verified by `npm run engine:setup`, which also runs automatically
before `npm run dev` and `npm run build`.

| File                            | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `stockfish-19-lite-single.js`   | Single-threaded worker bootstrap / Emscripten glue         |
| `stockfish-19-lite-single.wasm` | Engine + embedded lite NNUE network (one thread)           |
| `stockfish-19-lite.js`          | Multi-threaded (pthreads) bootstrap — experimental option  |
| `stockfish-19-lite.wasm`        | Engine + embedded lite NNUE network (shared memory)        |
| `version.json`                  | Written by the setup script                                |

Source: <https://github.com/nmrugg/stockfish.js> (GPL-3.0). Pinned version and
SHA-256 checksums live in [`scripts/setup-engine.mjs`](../../scripts/setup-engine.mjs).

## Why the single-threaded "lite" build by default?

- GitHub Pages cannot send the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
  headers that `SharedArrayBuffer` — and therefore multi-threaded WASM — requires.
- The lite network is ~1.8 MB instead of ~95 MB, so first load and offline caching stay fast.
- Even single-threaded in a browser it plays far above any human level, and it is
  strength-limited in software for the lower difficulty levels.

## The multi-threaded build

`stockfish-19-lite.js` / `.wasm` is the same engine compiled with pthreads. It is **not**
precached; the service worker fetches and caches it the first time it is used. The app only
loads it when the learner turns on *Settings → Multi-threaded engine* and the page is
cross-origin isolated, which the service worker arranges by adding the COOP/COEP headers to
the document response (see `src/sw.ts` and `src/sw/isolation.ts`). If the threaded build
fails to start for any reason, the client falls back to the single-threaded one.

## Offline installation

If you cannot reach GitHub from your machine, download the four files from the
release page linked above, place them here and run `npm run engine:setup` — it will
verify the checksums and write `version.json`.
