# Chess Trainer

**Learn, practice and solve — at any level.** A free, open-source chess trainer that runs entirely in
the browser and deploys as a static site to GitHub Pages. No accounts, no servers, no ads; installable
as an app and fully usable offline.

[![CI](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/ci.yml)
[![Deploy](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/deploy.yml/badge.svg)](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/deploy.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

## Features

| Area         | What you get                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Learn**    | 21 interactive lessons from "how the pieces move" to the Greek gift sacrifice. Every position is legality-checked in CI and every tactical claim was verified with Stockfish.                     |
| **Puzzles**  | 4,000 bundled tactics from the Lichess database (CC0), sampled across eight rating bands from 400 to 2600+. Rated mode with an Elo-style rating, daily puzzle, practice by theme, hints, streaks. |
| **Play**     | Stockfish 19 in the browser at eight strength levels, from a beatable "Newcomer" (~400) to full strength. Take-backs, hints, PGN export, hand-off to analysis.                                    |
| **Analyze**  | Multi-line engine analysis of any FEN/PGN with an evaluation bar, plus one-click game review that grades every move (inaccuracy / mistake / blunder) and shows the better move.                   |
| **Progress** | Rating history chart, solve statistics, lesson completion, game log. Export/import as JSON. Everything lives in `localStorage` on the device.                                                     |
| **PWA**      | Web manifest, service worker with full offline precache (app, engine, puzzles), install prompt with iOS instructions, update notifications, window-controls overlay on desktop.                   |

**Live site:** <https://real-fruit-snacks.github.io/chess-trainer/> (after the first deploy — see below).

## Quick start

```bash
npm install          # Node 22+
npm run dev          # downloads the engine on first run, then starts Vite on http://localhost:5173
```

Other useful commands:

| Command                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm run check`          | Lint, typecheck, unit tests and a production build — what CI runs.                             |
| `npm test`               | Unit tests (Vitest). `npm run test:watch` for watch mode.                                      |
| `npm run e2e`            | Playwright smoke tests against the production build (`npx playwright install chromium` first). |
| `npm run build`          | Production build to `dist/` (adds `404.html` + `.nojekyll` for Pages).                         |
| `npm run preview`        | Serve the production build locally.                                                            |
| `npm run engine:setup`   | (Re)download the pinned Stockfish build into `public/engine/`.                                 |
| `npm run puzzles:import` | Rebuild the puzzle set from the Lichess database (see below).                                  |
| `npm run puzzles:verify` | Validate the bundled puzzles; add `--engine 40` for an engine spot-check.                      |
| `npm run icons:generate` | Re-render the PWA icons from `scripts/icons/logo.svg`.                                         |

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the _Deploy to GitHub Pages_ workflow manually).

The workflow builds the site with the correct base path for both user/organisation pages
(`https://real-fruit-snacks.github.io/`) and project pages (`https://real-fruit-snacks.github.io/chess-trainer/`)
— no configuration needed. Deep links work through the `404.html` fallback, and the service worker precaches everything so
the site keeps working offline after the first visit.

To use a custom domain, add a `CNAME` file to `public/` and configure the domain in the Pages settings.

## Renaming / branding

Everything user-visible lives in [`src/site.config.ts`](src/site.config.ts) (name, tagline, repository
URL, theme colours). Replace `scripts/icons/logo.svg` and run `npm run icons:generate` for new icons.
Update the badge URLs at the top of this file and the links in `.github/ISSUE_TEMPLATE/config.yml`.

## How it works

- **Static only.** Vite + React + TypeScript build to plain files. There is no backend; the engine is a
  WebAssembly worker and the puzzle database is a set of JSON chunks fetched on demand.
- **Engine.** [Stockfish.js](https://github.com/nmrugg/stockfish.js) (lite, single-threaded NNUE build).
  GitHub Pages cannot send the cross-origin-isolation headers that multi-threaded WASM needs, so the
  single-threaded build is used; it is still far stronger than any human. The lowest playing levels are
  weakened in software (shallow search, sampling among several candidate moves, occasional random moves)
  so that real beginners can win.
- **Puzzles.** `scripts/import-lichess-puzzles.mjs` streams the ~300 MB Lichess puzzle dump, keeps
  well-established puzzles (≥ 500 plays, popularity ≥ 70) and reservoir-samples 500 per rating band with a
  fixed seed, so re-running it is reproducible. The trainer picks puzzles within ±150 of your rating and
  widens the window when it runs out of unseen ones.
- **Lessons.** Plain TypeScript data (`src/features/learn/lessons/*.ts`). A test suite checks every FEN is
  legal, every accepted move is legal, every "mate in one" task lists exactly the mating moves, and every
  scripted reply is playable. See [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) to add lessons.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Browser support

Any evergreen browser with WebAssembly and Web Workers: Chrome/Edge 90+, Firefox 90+, Safari 16+
(iOS 16+). The app degrades gracefully if the engine fails to load — lessons and puzzles still work.

## Contributing

Bug reports, lesson proposals and pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) first; it covers the development workflow, the content guidelines and
the checks CI runs.

## Licence

Chess Trainer is licensed under the **GNU General Public License v3.0 or later** — see [LICENSE](LICENSE).

The project bundles GPL-licensed components that are inseparable from the delivered app
([Chessground](https://github.com/lichess-org/chessground) for the board, Stockfish for the engine), so a
copyleft licence for the whole is the honest choice. Third-party components and their licences are listed
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The puzzle data is CC0 from Lichess.

If you need a permissively licensed fork, replace Chessground with an MIT-licensed board (for example
`react-chessboard`) and keep Stockfish as a separately distributed asset; the rest of the code base is
original work and could then be relicensed by its authors.
