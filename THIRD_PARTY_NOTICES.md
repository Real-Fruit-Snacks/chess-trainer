# Third-party notices

Chess Trainer is licensed under GPL-3.0-or-later (see `LICENSE`). It is built on the following
third-party work. The deployed site distributes the components marked **shipped**; the others are
development-time tools only.

## Shipped in the app

| Component                                                                                                                                                                                  | Licence                           | Role                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------- |
| [Stockfish](https://stockfishchess.org/) via [Stockfish.js](https://github.com/nmrugg/stockfish.js) (v19 WASM: lite and full, single-threaded and pthreads builds)                         | GPL-3.0-only                      | Chess engine (`public/engine/`, downloaded by `npm run engine:setup`)         |
| [Chessground](https://github.com/lichess-org/chessground) (`@lichess-org/chessground`)                                                                                                     | GPL-3.0-or-later                  | Board rendering, drag & drop, arrows                                          |
| cburnett piece set (from the Chessground package, re-emitted by `scripts/generate-pieces.mjs` as `src/components/board/pieces-classic.css`)                                                | CC BY-SA 3.0 — Colin M.L. Burnett | The "Classic" piece graphics; the Modern, Pixel and Letters sets are original |
| [chess.js](https://github.com/jhlywa/chess.js)                                                                                                                                             | BSD-2-Clause                      | Move generation, legality, PGN/FEN                                            |
| [React](https://react.dev/) / react-dom                                                                                                                                                    | MIT                               | UI                                                                            |
| [React Router](https://reactrouter.com/)                                                                                                                                                   | MIT                               | Routing                                                                       |
| [Zustand](https://github.com/pmndrs/zustand)                                                                                                                                               | MIT                               | State and localStorage persistence                                            |
| [Workbox](https://developer.chrome.com/docs/workbox) (`workbox-core`, `-precaching`, `-routing`, `-strategies`, `-expiration`, `-cacheable-response`, `-window`; built by vite-plugin-pwa) | MIT                               | Service worker / offline caching                                              |
| [Lichess puzzle database](https://database.lichess.org/#puzzles)                                                                                                                           | CC0 1.0 (public domain)           | Puzzle positions and solutions (`public/puzzles/`)                            |
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)                                                                                                                | CC0 1.0 (public domain)           | ECO opening names and lines (`public/openings/`)                              |
| [Lichess tablebase API](https://github.com/lichess-org/lila-tablebase) (optional, network)                                                                                                 | Service — not bundled             | Seven-piece endgame lookups when enabled in settings                          |
| [Lichess opening explorer API](https://lichess.org/api#tag/Opening-Explorer) (optional, network)                                                                                           | Service — not bundled             | Master and community game statistics per position when enabled in settings    |
| [Lichess](https://lichess.org/api) and [chess.com](https://www.chess.com/news/view/published-data-api) public game APIs (optional, network)                                                | Services — not bundled            | Importing the learner's own games on request                                  |

The "Letters" piece set (`src/components/board/pieces-letters.css`), the sounds, the lessons, courses,
endgame drills and the study annotations are original work of this project and covered by its licence.
The game scores of the classic games and the positions of the endgame studies (Réti 1921, Saavedra 1895
and traditional endings) are public-domain facts; every annotation is written for this project.

Stockfish is GPL-3.0 software. The source code corresponding to the shipped binaries is the
[Stockfish.js v19.0.0 release](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.0) (built from
the [Stockfish](https://github.com/official-stockfish/Stockfish) sources it names); the exact files and
their SHA-256 checksums are pinned in `scripts/setup-engine.mjs`. The four builds are the same engine:
two embed Stockfish's small network ("lite"), two its large one ("full"), each single-threaded and with
pthreads. A full build reaches a device only when the learner switches the full engine on. The full
GPL-3.0 text ships with the site as `licence.txt`.

## Development tools (not shipped)

Vite, TypeScript, Vitest, Playwright, ESLint, Prettier and their dependencies — MIT/Apache-2.0 licensed.
Run `npx license-checker --summary` for the full transitive list.

## Attribution requirements

- The built site carries the licence and these notices: `scripts/postbuild.mjs` copies `LICENSE` to
  `licence.txt` and this file to `notices.txt` in `dist/`, and the footer of every page links to both.
  Keep them (and the engine source link above) when redistributing the site.
- The cburnett piece set requires attribution (CC BY-SA 3.0); it is credited here and in the footer of
  every page ("Pieces (Classic): Colin M.L. Burnett, CC BY-SA 3.0", linked to the licence). The
  figurines are used unmodified.
- Puzzles are CC0 and need no attribution; a link to the source game on Lichess is shown anyway.
  Some lesson tasks and the placement quiz use positions from the same database and say so.
