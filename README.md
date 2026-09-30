# Chess Trainer

**Learn, practice and solve — at any level.** A free, open-source chess trainer that runs entirely in
the browser and deploys as a static site to GitHub Pages. No accounts, no servers, no ads; installable
as an app and fully usable offline.

[![CI](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/ci.yml)
[![Deploy](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/deploy.yml/badge.svg)](https://github.com/Real-Fruit-Snacks/chess-trainer/actions/workflows/deploy.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

## Features

| Area              | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Learn**         | 75 interactive lessons from "how the pieces move" to attacking the fianchetto, defending the Greek gift, bishop and pawn endings, the bishop-and-knight mate, queen against rook, rook and bishop against rook, Catalan/QGD and French plans, exchange sacrifices, calculation and "when there is nothing to do", organised into three **courses** with unlockable units; **lesson recall** brings the moves you learned back a few days later; a two-minute **placement quiz** recommends a course and a starting rating. Every position is legality-checked in CI and every task is verified against Stockfish. A **mating patterns** gallery shows the nineteen named mates as minimal diagrams, each with a drill and the library's puzzles of that shape.                                                                                                  |
| **Puzzles**       | 48,000 bundled tactics from the Lichess database (CC0), sampled across eight rating bands from 400 to 2600+ and served in chunks (the first of each band is precached; **download every puzzle** for full offline use from Settings). Rated mode with a **Glicko-2** puzzle rating (with a calibration run, an uncertainty figure, credit that depends on hints, speed and repeats, and a rough conversion to Lichess / chess.com / FIDE ratings), daily puzzle, practice by theme or **by opening** (every puzzle knows the opening it came from), **Puzzle Rush** (3-minute and survival), **Woodpecker sets** solved in spaced cycles, hints, streaks, per-theme statistics, a **review queue** that brings missed puzzles back on a 1-3-7-14-30 day schedule, **bookmarks**, and **puzzles from your own games** (every reviewed blunder becomes a puzzle). |
| **Drills**        | Coordinate trainer, piece-vision, "find every capture / check" and **guess the position** drills (with a **blindfold** mode), the mating-patterns drill, and an **endgame library of 41 drills** — checkmates, pawn endings (key squares, the square of the pawn, outside and protected passers, triangulation, the breakthrough, Réti), rook endings (Lucena, Philidor, Vancura, cutting off the king, the short-side and back-rank defences, rook against a pawn, bishop or knight), queen endings and minor pieces — every position engine-verified and played out against a full-strength engine, arranged as an **endgame ladder**; plus eight **endgame studies** (Réti, Saavedra and the only-move endings) to solve move by move.                                                                                                                       |
| **Openings**      | Sixteen built-in repertoires (Italian, Ruy Lopez, Vienna, London, King's Indian Attack, English, Queen's Gambit, Alapin, Caro-Kann, French, QGD, Scandinavian, Slav, Nimzo-Indian, King's Indian, Najdorf) trained move by move with spaced repetition (SM-2), every learner move engine-checked; import your own PGN repertoires, **edit them on the board** with notes, **add lines straight from the analysis board**, **share a repertoire as a link**, and **practise it against the engine**, which follows the book while the game stays in it. An optional **opening explorer** (Lichess masters and community games) shows what is played in any position.                                                                                                                                                                                             |
| **Classic games** | Guess-the-move for 46 famous games — from Légal's mate, the Immortal Draw, the Opera Game, the Immortal and the Evergreen through McDonnell–La Bourdonnais, Steinitz, Rubinstein, Capablanca, Réti–Alekhine, Torre–Lasker, the Polish and Peruvian Immortals, Fischer, Tal, Petrosian, Karpov and Kasparov to Deep Blue — with notes on every key moment, three points for the game move and two when the engine rates yours as good; filter by era, difficulty and what you have played.                                                                                                                                                                                                                                                                                                                                                                       |
| **Play**          | Stockfish 19 in the browser at eight strength levels, from a beatable "Newcomer" (~400) to full strength, with optional clocks (bullet to classical), take-backs, hints, "show threat", a **coach mode** that pauses after a mistake, explains it in words, links the lesson and offers a take-back, keyboard move entry, an **engine ladder** with the next rung one click away, PGN export and hand-off to analysis. **Opening practice** against a repertoire, **two players** at one device, **blindfold** play with a peek button, and a start from **any position**: a FEN, a lesson diagram, a solved puzzle or a moment of a reviewed game.                                                                                                                                                                                                             |
| **Analyze**       | Multi-line engine analysis with an evaluation bar, a full **variation tree** (promote, delete, annotate, comment, PGN export with variations), ECO opening names, a **position report** (structure, king safety, open files, outposts, loose pieces and plans for both sides), a board editor, optional Lichess tablebase lookups, **shareable links** (the game travels in the URL), an **analysis library** with named collections and Lichess study import, and game review with an **evaluation graph**, **key moments explained in words** (hanging pieces, forks, pins, missed mates — each linked to the lesson and the puzzle theme) and a choice of depth. **Import games** by pasting or opening a PGN, or straight from a Lichess or chess.com username.                                                                                             |
| **My games**      | Import your games (Lichess and chess.com with time-control, colour and rated filters, or PGN), see your **opening statistics** per colour, find where you or your opponents **left your repertoire**, review every game in one go, turn the mistakes into puzzles, and read the **insights** — accuracy by phase, the mistakes you make most, results by colour, opening and engine level — with a "work on" list of lessons and themes.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Reference**     | The rules of chess, notation (SAN, PGN, FEN, engine evaluations), a searchable glossary linked to the lessons, and an FAQ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Home**          | A first-run tour, your current course, and an **adaptive daily plan** (daily puzzle, rated puzzles or your weakest theme, review queue, lesson recall, opening reviews, tactics from your repertoire's openings, what your games say to work on, next lesson, the next rung of the endgame ladder) with a training-day streak.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Progress**      | Rating history chart, a **weekly summary**, solve statistics, strengths and weaknesses by theme, lesson completion, game log with results per engine level, drill and rush records, opening and puzzle review counts, an engine diagnostics panel with a speed test, and **profiles** for several learners on one device. Export/import as JSON, **share a backup** straight to another device, open a backup file with the installed app to import it, and a reminder when a backup is overdue. Everything lives in `localStorage` on the device.                                                                                                                                                                                                                                                                                                              |
| **Accessibility** | Moves announced to screen readers, **keyboard board control** (arrow keys, Enter, Esc, or type a square) with a "describe position" button, keyboard shortcuts (press `?`), focus management, a colour-blind-safe high-contrast board theme, a high-legibility **Letters** piece set, a soft sound theme, reduced-motion support and WCAG-AA text contrast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **PWA**           | Web manifest, hand-written Workbox service worker with offline precache (app, engine, openings, the first puzzle chunk of every band) and on-demand caching of the rest, install prompt with iOS instructions, update notifications, window-controls overlay on desktop, a **badge with due reviews** on the app icon, **haptic feedback** on phones, and layouts for notches and phones held sideways.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Live site:** <https://real-fruit-snacks.github.io/chess-trainer/> (after the first deploy — see below).

## Quick start

```bash
npm install          # Node 22+
npm run dev          # downloads the engine on first run, then starts Vite on http://localhost:5173
```

Other useful commands:

| Command                   | Purpose                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run check`           | Lint, format check, typecheck, unit tests and a production build — what CI runs.               |
| `npm test`                | Unit tests (Vitest). `npm run test:watch` for watch mode.                                      |
| `npm run e2e`             | Playwright smoke tests against the production build (`npx playwright install chromium` first). |
| `npm run build`           | Production build to `dist/` (adds `404.html` + `.nojekyll` for Pages).                         |
| `npm run preview`         | Serve the production build locally.                                                            |
| `npm run engine:setup`    | (Re)download the pinned Stockfish build into `public/engine/`.                                 |
| `npm run puzzles:import`  | Rebuild the puzzle set from the Lichess database (see below).                                  |
| `npm run puzzles:verify`  | Validate the bundled puzzles; add `--engine 40` for an engine spot-check.                      |
| `npm run openings:import` | Rebuild the ECO opening table from lichess-org/chess-openings.                                 |
| `npm run lessons:verify`  | Engine-verify every lesson task (slow; run after editing lessons).                             |
| `npm run lessons:index`   | Regenerate the lightweight lesson index used outside the Learn pages (also runs before build). |
| `npm run drills:verify`   | Engine-verify the endgame drill positions.                                                     |
| `npm run studies:verify`  | Engine-verify every endgame study (accepted moves keep the goal, alternatives do not).         |
| `npm run icons:generate`  | Re-render the PWA icons from `scripts/icons/logo.svg`.                                         |

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
- **Engine.** [Stockfish.js](https://github.com/nmrugg/stockfish.js) (lite NNUE build). The
  single-threaded build is used by default and is far stronger than any human. The lowest playing levels
  are weakened in software (shallow search, sampling among several candidate moves, occasional random
  moves) so that real beginners can win.
- **Multi-threaded engine (experimental).** Multi-threaded WASM needs `SharedArrayBuffer`, which browsers
  only expose to cross-origin-isolated pages, and GitHub Pages cannot send the required headers. Turning on
  _Progress → Settings → Multi-threaded engine_ makes the service worker add the `Cross-Origin-Opener-Policy`
  and `Cross-Origin-Embedder-Policy` headers itself on the next reload; the app then loads the pthreads build
  with all but one CPU core. If anything goes wrong the single-threaded engine takes over automatically.
  Off by default because the headers also block cross-origin resources that are not CORS-enabled.
- **Puzzles.** `scripts/import-lichess-puzzles.mjs` streams the ~300 MB Lichess puzzle dump, keeps
  well-established puzzles (≥ 500 plays, popularity ≥ 70) and reservoir-samples 6,000 per rating band with a
  fixed seed, keeping the ids of the previous set so histories stay valid, and writes them in chunks of 500.
  The first chunk of every band is precached; the rest are fetched on demand and cached, or all at once with
  _Settings → Download every puzzle_. The trainer picks puzzles within ±150 of your rating and widens the
  window when it runs out of unseen ones.
- **Puzzle rating.** Glicko-2 (`src/lib/glicko.ts`, the system Lichess uses), one rating period per
  puzzle, with the puzzle's own rating deviation from the Lichess data. A solve is worth less with hints,
  when it was slow for the puzzle's size, or when the puzzle had been seen before; the deviation grows
  during long breaks. New learners can run a twelve-puzzle calibration instead of guessing a level, and
  the Progress page translates the rating into rough Lichess / chess.com / FIDE ranges.
- **Lessons, courses, drills, studies, repertoires and classic games** are plain TypeScript data. Test suites
  check that every FEN is legal, every accepted move is legal, every "mate in one" task lists exactly the
  mating moves, every repertoire line and classic game replays legally, and `npm run lessons:verify` /
  `npm run drills:verify` / `npm run studies:verify` confirm the chess content against Stockfish. See
  [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md).
- **Your games** are imported from the public Lichess and chess.com APIs (or pasted as PGN) and stored on
  the device; the review runs in the browser engine and its mistakes become puzzles in the "Mine" mode.
- **Shareable links** put the game in the URL fragment (`/analyze#z=…`, deflated with the Compression Streams
  API), so nothing is sent to a server and a link opens the same game at the same move. Repertoires
  (`/openings#rep=…`) and Woodpecker sets (`/puzzles/woodpecker#wp=…`) travel the same way.
- **Profiles** namespace the persisted stores: the first profile keeps the plain `localStorage` keys, every
  other one gets `<key>:<profile id>`; switching reloads the app into the other namespace. Device settings
  (appearance, sounds, engine) are shared.
- **Openings.** `scripts/import-openings.mjs` turns the lichess-org/chess-openings dataset (CC0) into a
  table keyed by position, so the analysis board can name an opening even after a transposition. The
  repertoire trainer schedules each move with an SM-2 spaced-repetition algorithm (`src/lib/srs.ts`).
- **Move commentary and coach.** Game review and coach mode explain mistakes with rules, not prose
  generation: static exchange evaluation, fork and pin detection and the engine's own lines turn a
  swing into "Ne5 hangs the knight to dxe5" with a link to the lesson and the puzzle theme
  (`src/features/analyze/commentary.ts`).
- **Tablebase and opening explorer.** Positions with seven pieces or fewer can be checked against the
  Lichess Syzygy tablebase, and the Lichess opening explorer can show what masters and online players play
  in a position. These are the only features that talk to the network (besides importing your games) and
  both are off by default (Progress → Settings).

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
