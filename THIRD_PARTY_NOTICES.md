# Third-party notices

Chess Trainer is licensed under GPL-3.0-or-later (see `LICENSE`). It is built on the following
third-party work. The deployed site distributes the components marked **shipped**; the others are
development-time tools only.

## Shipped in the app

| Component                                                                                                                            | Licence                           | Role                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------- |
| [Stockfish](https://stockfishchess.org/) via [Stockfish.js](https://github.com/nmrugg/stockfish.js) (v19, lite single-threaded WASM) | GPL-3.0-only                      | Chess engine (`public/engine/`, downloaded by `npm run engine:setup`) |
| [Chessground](https://github.com/lichess-org/chessground) (`@lichess-org/chessground`)                                               | GPL-3.0-or-later                  | Board rendering, drag & drop, arrows                                  |
| cburnett piece set (bundled with Chessground)                                                                                        | CC BY-SA 3.0 — Colin M.L. Burnett | Piece graphics                                                        |
| [chess.js](https://github.com/jhlywa/chess.js)                                                                                       | BSD-2-Clause                      | Move generation, legality, PGN/FEN                                    |
| [React](https://react.dev/) / react-dom                                                                                              | MIT                               | UI                                                                    |
| [React Router](https://reactrouter.com/)                                                                                             | MIT                               | Routing                                                               |
| [Zustand](https://github.com/pmndrs/zustand)                                                                                         | MIT                               | State and localStorage persistence                                    |
| [Workbox](https://developer.chrome.com/docs/workbox) (via vite-plugin-pwa)                                                           | MIT                               | Service worker / offline caching                                      |
| [Lichess puzzle database](https://database.lichess.org/#puzzles)                                                                     | CC0 1.0 (public domain)           | Puzzle positions and solutions (`public/puzzles/`)                    |

Stockfish source code corresponding to the shipped binary is available from the Stockfish.js and Stockfish
repositories linked above; the exact version and checksums are pinned in `scripts/setup-engine.mjs`.

## Development tools (not shipped)

Vite, TypeScript, Vitest, Playwright, ESLint, Prettier and their dependencies — MIT/Apache-2.0 licensed.
Run `npx license-checker --summary` for the full transitive list.

## Attribution requirements

- When redistributing the site, keep this file, `LICENSE`, and the engine's `Copying.txt` available.
- The cburnett piece set requires attribution (CC BY-SA); it is credited here and in the app footer.
- Puzzles are CC0 and need no attribution; a link to the source game on Lichess is shown anyway.
