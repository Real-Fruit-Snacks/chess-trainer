# Engine binaries

This directory holds the Stockfish WASM build that powers the **Play**, **Analyze**
and **Puzzle hint** features. The files are **not committed** — they are downloaded
and checksum-verified by `npm run engine:setup`, which also runs automatically
before `npm run dev` and `npm run build`.

| File                             | Purpose                              |
| -------------------------------- | ------------------------------------ |
| `stockfish-19-lite-single.js`    | Worker bootstrap / Emscripten glue   |
| `stockfish-19-lite-single.wasm`  | Engine + embedded lite NNUE network  |
| `version.json`                   | Written by the setup script          |

Source: <https://github.com/nmrugg/stockfish.js> (GPL-3.0). Pinned version and
SHA-256 checksums live in [`scripts/setup-engine.mjs`](../../scripts/setup-engine.mjs).

## Why the single-threaded "lite" build?

- GitHub Pages cannot send the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
  headers that `SharedArrayBuffer` — and therefore multi-threaded WASM — requires.
- The lite network is ~1.8 MB instead of ~95 MB, so first load and offline caching stay fast.
- Even single-threaded in a browser it plays far above any human level, and it is
  strength-limited in software for the lower difficulty levels.

## Offline installation

If you cannot reach GitHub from your machine, download the two files from the
release page linked above, place them here and run `npm run engine:setup` — it will
verify the checksums and write `version.json`.
