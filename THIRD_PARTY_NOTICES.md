# Third-party notices

Chess Trainer is licensed under GPL-3.0-or-later (see `LICENSE`). It is built on the following
third-party work. The deployed site distributes the components marked **shipped**; the others are
development-time tools only.

## Shipped in the app

| Component                                                                                                                                                                                                                                           | Licence                           | Role                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| [Stockfish](https://stockfishchess.org/) via [Stockfish.js](https://github.com/nmrugg/stockfish.js) (v19 WASM: lite and full, single-threaded and pthreads builds)                                                                                  | GPL-3.0-only                      | Chess engine (`public/engine/`, downloaded by `npm run engine:setup`)               |
| [Maia-3](https://huggingface.co/UofTCSSLab/Maia3-5M) (5M parameters) by the University of Toronto's Computational Social Science Lab, in the [browser-ready ONNX export](https://huggingface.co/bqrio/maia3-onnx) by bqrio (half-precision weights) | AGPL-3.0                          | The human-like opponent's model (`public/maia/`, installed by `npm run maia:setup`) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (`onnxruntime-web`: its JavaScript and its SIMD WebAssembly build)                                                                                                                     | MIT                               | Runs the human-like opponent's model in a worker                                    |
| [Chessground](https://github.com/lichess-org/chessground) (`@lichess-org/chessground`)                                                                                                                                                              | GPL-3.0-or-later                  | Board rendering, drag & drop, arrows                                                |
| cburnett piece set (from the Chessground package, re-emitted by `scripts/generate-pieces.mjs` as `src/components/board/pieces-classic.css`)                                                                                                         | CC BY-SA 3.0 — Colin M.L. Burnett | The "Classic" piece graphics; the Modern, Pixel and Letters sets are original       |
| [chess.js](https://github.com/jhlywa/chess.js)                                                                                                                                                                                                      | BSD-2-Clause                      | Move generation, legality, PGN/FEN                                                  |
| [React](https://react.dev/) / react-dom                                                                                                                                                                                                             | MIT                               | UI                                                                                  |
| [React Router](https://reactrouter.com/)                                                                                                                                                                                                            | MIT                               | Routing                                                                             |
| [Zustand](https://github.com/pmndrs/zustand)                                                                                                                                                                                                        | MIT                               | State and localStorage persistence                                                  |
| [Workbox](https://developer.chrome.com/docs/workbox) (`workbox-core`, `-precaching`, `-routing`, `-strategies`, `-expiration`, `-cacheable-response`, `-window`; built by vite-plugin-pwa)                                                          | MIT                               | Service worker / offline caching                                                    |
| [Lichess puzzle database](https://database.lichess.org/#puzzles)                                                                                                                                                                                    | CC0 1.0 (public domain)           | Puzzle positions and solutions (`public/puzzles/`)                                  |
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)                                                                                                                                                                         | CC0 1.0 (public domain)           | ECO opening names and lines (`public/openings/`)                                    |
| [Lichess tablebase API](https://github.com/lichess-org/lila-tablebase) (optional, network)                                                                                                                                                          | Service — not bundled             | Seven-piece endgame lookups when enabled in settings                                |
| [Lichess opening explorer API](https://lichess.org/api#tag/Opening-Explorer) (optional, network)                                                                                                                                                    | Service — not bundled             | Master and community game statistics per position when enabled in settings          |
| [Lichess](https://lichess.org/api) and [chess.com](https://www.chess.com/news/view/published-data-api) public game APIs (optional, network)                                                                                                         | Services — not bundled            | Importing the learner's own games on request                                        |
| [Lichess API](https://lichess.org/api): OAuth, puzzle activity and results, game import and export, studies (optional, network)                                                                                                                     | Service — not bundled             | The account sync, once the learner connects an account                              |
| [scalalib](https://github.com/ornicar/scalalib) by Thibault Duplessis: the name clean-up rules of `StringOps`, ported to TypeScript (`src/lib/lichess/lichessNames.ts`)                                                                             | MIT                               | Names sent to Lichess already as Lichess keeps them                                 |

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

Maia-3 is the University of Toronto Computational Social Science Lab's model of human play (Monroe et
al., _Chessformer: A Unified Architecture for Chess Modeling_, ICLR 2026), licensed under the GNU
Affero General Public License v3. The app ships the 5M-parameter model unmodified, exactly as
published in bqrio's ONNX export at a pinned revision (the address and the SHA-256 are in
`scripts/setup-maia.mjs`); the original checkpoints are at
[huggingface.co/UofTCSSLab/Maia3-5M](https://huggingface.co/UofTCSSLab/Maia3-5M). The model reaches a
device only when the learner downloads the human-like opponent. The app combines it with its own
GPL-3.0-or-later code as section 13 of the GPL v3 allows, so the combination also falls under the
AGPL's network clause: the complete source code of the app is the repository linked from the footer of
every page. The AGPL-3.0 text ships with the site as `licence-agpl.txt`.

ONNX Runtime Web is MIT-licensed (© Microsoft Corporation; the build keeps its notice in the
human-like opponent's worker script). Its WebAssembly build contains the open-source components
listed in ONNX Runtime's
[third-party notices](https://github.com/microsoft/onnxruntime/blob/v1.30.0/ThirdPartyNotices.txt).

The rules by which Lichess cleans study and chapter names come from scalalib (MIT), whose notice
follows:

> Copyright (c) Thibault Duplessis
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
> OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
> CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Development tools (not shipped)

Vite, TypeScript, Vitest, Playwright, ESLint, Prettier and their dependencies — MIT/Apache-2.0 licensed.
Run `npx license-checker --summary` for the full transitive list.

## Attribution requirements

- The built site carries the licences and these notices: `scripts/postbuild.mjs` copies `LICENSE` to
  `licence.txt`, `LICENSES/AGPL-3.0.txt` to `licence-agpl.txt` and this file to `notices.txt` in
  `dist/`, and the footer of every page links to all three. Keep them (and the engine source link
  above) when redistributing the site.
- Maia-3 (AGPL-3.0) is credited in the footer of every page, next to a link to its licence and one to
  the app's source code; keep both when redistributing the site.
- The cburnett piece set requires attribution (CC BY-SA 3.0); it is credited here and in the footer of
  every page ("Pieces (Classic): Colin M.L. Burnett, CC BY-SA 3.0", linked to the licence). The
  figurines are used unmodified.
- Puzzles are CC0 and need no attribution; a link to the source game on Lichess is shown anyway.
  Some lesson tasks and the placement quiz use positions from the same database and say so.
