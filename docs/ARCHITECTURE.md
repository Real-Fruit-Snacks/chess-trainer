# Architecture

Chess Trainer is a single-page application with **no backend**. Everything — lessons, puzzles, the
engine and the user's progress — is either shipped as static files or lives in the browser. This
document explains the moving parts and the reasoning behind them.

## Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                │
│                                                                        │
│  React app (Vite build)                                                │
│  ├─ features/learn      lessons · courses · recall ── useLessonStep    │
│  ├─ features/puzzles    puzzleService · ownPuzzles ── usePuzzleTrainer │
│  ├─ features/drills     useDrillGame (engine) · vision · coordinates ─┐│
│  ├─ features/studies    endgame studies ── useStudy                  ││
│  ├─ features/openings   repertoires + SM-2 ── useRepertoireTrainer   ││
│  ├─ features/classics   useGuessTheMove (engine grades guesses) ─────┤│
│  ├─ features/play       usePlayVsEngine (engine or hot-seat) + clock ┤│
│  ├─ features/analyze    useAnalysis (GameTree) · share links ────────┤ EngineClient ──▶ Worker
│  ├─ features/games      my games: import · stats · deviations ───────┤   (UCI)          Stockfish
│  ├─ features/reference  rules, notation, glossary                    │
│  └─ features/progress   charts, weekly summary, settings, diagnostics│
│                                                                      │
│  ├─ features/home       adaptive daily plan · courses · first-run tour│
│  chess/ (chess.js helpers, PGN parser, GameTree)   components/board   │
│  lib/ srs · puzzleReview · gameImport · clock · sound · shareLink     │
│  store/ settings · progress · repertoire · games (zustand + storage)  │
│                                                                        │
│  Service worker (src/sw.ts, Workbox) ── precache · opt-in COOP/COEP    │
└────────────────────────────────────────────────────────────────────────┘
        ▲ static files only (+ optional lichess.org / chess.com API calls)
┌───────┴─────────────────────────────┐
│ GitHub Pages (dist/)                │
│  index.html, 404.html, assets       │
│  engine/*.wasm, puzzles/*.json,     │
│  openings/openings.json             │
└─────────────────────────────────────┘
```

## Build and deployment

- **Vite + React 19 + TypeScript**, strict settings (`noUncheckedIndexedAccess`, no non-null assertions).
- Each feature page is a lazily loaded chunk (`src/app/routes.tsx`), so the first paint only needs the
  shell (~110 kB gzipped including React and the router). The lesson content (~55 kB gzipped) is only
  loaded on the Learn pages: everything else (Home, Progress, courses, the reference) reads
  `src/features/learn/lessonMeta.ts`, a generated index of ids, titles and lengths that
  `scripts/build-lesson-index.mjs` rewrites before every build (`npm run lessons:index`); a unit test fails
  when it is stale.
- `VITE_BASE_PATH` sets the URL prefix. The deploy workflow derives it from `actions/configure-pages`,
  so the same code works at `https://user.github.io/` and `https://user.github.io/repo/`.
- `scripts/postbuild.mjs` copies `index.html` to `404.html` (deep links on Pages) and writes `.nojekyll`.
- The engine binaries are **not in git**. `scripts/setup-engine.mjs` downloads the pinned Stockfish.js
  release and verifies SHA-256 checksums; it runs before `dev` and `build`. This keeps the repository
  small and avoids a 200 MB npm dependency, while still failing loudly if the upstream file changes.

## The engine layer (`src/engine/`)

`EngineClient` wraps a Web Worker running Stockfish and speaks UCI over `postMessage`:

- `init()` performs the `uci`/`isready` handshake once and caches the promise.
- `search(params, onInfo)` returns a handle whose `result` resolves on `bestmove`. Searches are
  **serialised**: starting a new one stops the previous (its promise resolves with `stopped: true`).
  This makes React effects safe — an effect can start a search and stop it in its cleanup without
  worrying about interleaved `bestmove` lines.
- `uci.ts` parses `info`/`bestmove` lines into typed objects and converts scores to White's
  perspective and to win probabilities (the same logistic model Lichess uses).

Each page owns its own engine instance through `useEngine()`, which terminates the worker on unmount.
Creating a worker is cheap (the WASM comes from the HTTP/service-worker cache), and per-page instances
avoid leaking `MultiPV`/`Skill Level` settings between features.

### Playing strength

Stockfish's `Skill Level` bottoms out around club strength. `levels.ts` therefore weakens the lowest
levels in software: shallow fixed depth, `MultiPV` sampling with quadratic weights toward the best
move, and a per-move probability of playing a random legal move. The result is an opponent a real
beginner can beat, which matters more for retention than engine purity.

### Single- and multi-threaded builds

Two Stockfish builds ship (`scripts/setup-engine.mjs` pins both): the single-threaded lite build,
precached and used by default, and the pthreads lite build, fetched on first use. Multi-threaded WASM
needs `SharedArrayBuffer`, which browsers only expose to **cross-origin-isolated** documents — those
served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
GitHub Pages cannot set headers, so the service worker does it on request:

1. The learner switches on _Multi-threaded engine_ (Progress → Settings). The page stores a flag in the
   Cache API (`src/sw/isolation.ts`) — the one storage both the page and the worker can read without a
   message round-trip — and the setting in `settings.engineThreads`.
2. On the next navigation the service worker's `handlerWillRespond` plugin adds the two headers to every
   same-origin response it serves (documents need them to become isolated; dedicated worker scripts need
   them because a worker must be at least as isolated as its owner).
3. `chooseEngineBuild()` (`src/engine/build.ts`) picks the pthreads build only when the page reports
   `crossOriginIsolated`, `SharedArrayBuffer` exists and there are at least three logical cores; it uses
   all cores but one, capped at eight. `EngineClient` sends `setoption name Threads` after `uciok` and
   falls back to the single-threaded build if the worker fails to start.

The option is off by default: under `require-corp` every cross-origin resource must be CORS-enabled,
and the single-threaded build already reaches depth 18–20 in a few seconds on a laptop. The threaded
build is excluded from the precache manifest and cached by a `CacheFirst` route instead.

## The board (`src/components/board/`)

`Board.tsx` wraps [Chessground](https://github.com/lichess-org/chessground), the board used by
Lichess. The instance is created once per mount and reconfigured through `api.set()` on prop changes,
which keeps piece animations intact. `viewOnly` is the only creation-time prop (it changes which DOM
events Chessground binds), so toggling it recreates the board. Board colours come from a CSS variable
holding an SVG data URI generated in `boardThemes.ts`; piece sprites are Chessground's cburnett set.

The board is deliberately "dumb": it reports `onMove(from, to)` and renders whatever `fen`, `dests`,
`shapes` and highlights it is given. All rules live in hooks built on chess.js.

Every interactive board is also keyboard-operable (`keyboard.ts`): the container is focusable, the arrow
keys move a square cursor (from the viewer's side), Enter selects the piece under the cursor and then its
destination through Chessground's own `selectSquare`, so the same legality, callbacks and highlights apply
as for the mouse; Escape clears the selection and typing a square name jumps to it. Letters are not
swallowed, so page shortcuts such as `h` keep working. A visually hidden "Describe position" button reads
the whole position out through a live region. Piece sets are chosen with a `data-pieces` attribute on
`<html>`: Chessground's cburnett figurines, or the original "Letters" set generated as inline SVG
(`pieces-letters.css`).

## Chess state (`src/chess/`)

- `helpers.ts` — pure functions: legal destinations for Chessground, UCI/SAN conversion (including
  `tryNotation` for typed moves), promotion detection, game status, material.
- `useChess.ts` — owns a mutable `Chess` instance in a ref and publishes immutable
  `PositionSnapshot`s. It also models the **promotion dialog**: `playMove` returns `'promotion'` when
  a piece must be chosen and `resolvePromotion` completes or cancels it. Used by Play and the drills.
- `pgn.ts` — a tokenising PGN parser that understands headers, `{comments}`, nested `(variations)`,
  `$n` NAGs and `!?`-style glyphs. `splitPgnGames` handles multi-game files.
- `tree.ts` — `GameTree`, a tree of positions where the first child is the main line. It supports
  adding moves (re-using existing children), navigation, promoting/deleting variations, comments and
  glyphs, and round-trips to PGN. The analysis board and the repertoire trainer are built on it.

### Sounds and clocks (`src/lib/`)

- `sound.ts` synthesises every sound effect with the Web Audio API (no audio files to license or cache).
- `clock.ts` is a pure clock model (timestamps, increments, flagging) that Play drives with a 100 ms tick.
- `srs.ts` is an SM-2 scheduler used for opening moves; `puzzleReview.ts` is the simpler fixed-step
  (1-3-7-14-30 days) scheduler behind the puzzle review queue; `openings.ts` looks up ECO names by EPD;
  `tablebase.ts` wraps the Lichess tablebase API and normalises per-move results to the mover's view.
- `gameImport.ts` splits multi-game PGN text, replays each game for legality, and fetches recent games
  from the public Lichess (`/api/games/user/…`, PGN stream) and chess.com (monthly archives) APIs with
  typed errors (`not-found`, `rate-limited`, `network`, `empty`), time-control / colour / rated filters
  and cursors for "load older games".
- `shareLink.ts` builds and reads the analysis share links: the PGN is deflated with the Compression
  Streams API and carried in the URL fragment (`#z=…&ply=N`, or `#pgn=` / `#fen=` as fallbacks), so a
  link never reaches a server.
- `dates.ts` keeps the calendar helpers, including `trainingStreak()` for the training-day streak.

## Feature state machines

| Hook                   | Phases                                                                | Notes                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usePuzzleTrainer`     | idle → intro → solving ⇄ replying → solved / failed                   | Lichess semantics: first move is the opponent's; any checkmate is accepted as the final move; outcome reported exactly once; "try again" continues unrated.                                                                                                                                                                            |
| `useLessonStep`        | reading / awaiting → wrong → awaiting / replying → correct / revealed | Judges SAN against the task (`taskCheck.ts`), plays scripted replies, exposes hint shapes.                                                                                                                                                                                                                                             |
| `usePlayVsEngine`      | setup → playing (player turn / engine thinking) → game over           | Engine moves are requested from an effect keyed on the position; take-backs cancel pending searches. Optional clock: flag = loss, engine think time capped by its remaining time. With `opponent: 'human'` the engine never moves, both colours are movable, the board can turn towards the side to move and the game is not recorded. |
| `useStudy`             | solving → wrong → solving / replying → solved / revealed              | One endgame study: each solver move is checked against the scripted line (alternatives allowed), the reply is played automatically, hints escalate from a circle to an arrow, and the outcome is reported once with an "assisted" flag.                                                                                                |
| `useAnalysis`          | continuous evaluation of the current `GameTree` node; optional review | A move played from the middle of a line becomes a variation; the review grades the main line at the configured depth and produces win probabilities for the evaluation graph and `keyMoments()`. Opening name and tablebase lookups follow the current node.                                                                           |
| `useRush`              | idle → running → finished                                             | Difficulty climbs with every solve; three misses (or the 3-minute clock) end the run. Built on `usePuzzleTrainer`.                                                                                                                                                                                                                     |
| `useDrillGame`         | idle → playing → won / lost                                           | Full-strength engine plays the other side; the position is adjudicated after every move (mate, promotion, stalemate, material loss, move limit, engine eval).                                                                                                                                                                          |
| `useRepertoireTrainer` | idle → opponent ⇄ learner → lineDone → sessionDone                    | Picks the line with the most due SM-2 cards, shows new moves with an arrow, grades every recall into the repertoire store.                                                                                                                                                                                                             |
| `useGuessTheMove`      | intro → guess → (checking) → feedback → auto … → done                 | 3 points for the game move; a different move is scored 2 when the engine rates it within 40 cp of the game move.                                                                                                                                                                                                                       |

## Persistence (`src/store/`)

Four zustand stores persisted to `localStorage` with versioned keys (and `migrate` functions):

- `settings` — appearance, board theme (including the high-contrast palette), piece set, sound theme,
  engine defaults, review depth, the multi-threaded engine opt-in, puzzle preferences, time control,
  keyboard move entry, blindfold play, tablebase opt-in, remembered import usernames and the first-run
  tour flag.
- `progress` — onboarding flag, puzzle rating and history, attempts, seen puzzle IDs, streaks, daily
  puzzle state, lesson progress and lesson-recall cards, game records, per-theme statistics, Puzzle Rush
  runs, drill results, study results, guess-the-move scores, the puzzle review queue (which also holds
  bookmarks and the puzzles made from the learner's own games) and the list of training days. Every
  recorded activity calls `touchTraining()`, which is what the Home page streak is built on. Capped lists
  keep storage small. Export/import includes the repertoire store.
- `repertoire` — SM-2 cards keyed by repertoire and move path, custom PGN repertoires, session history.
- `games` — the learner's imported games (up to 200) with their review results, keyed by URL or PGN hash.

### The puzzle rating

The rating is **Glicko-2** (`lib/glicko.ts`, verified against the worked example in Glickman's
paper), the system Lichess uses: a rating, a rating deviation (RD — how uncertain the rating is; ±
2 RD is roughly a 95 % interval) and a volatility. Every rated attempt is its own rating period. What
an attempt is worth is decided by `lib/puzzleScore.ts`:

- a fail is 0 and a clean solve 1; a solve slower than the expected time for the puzzle's size and
  difficulty (2 moves at 1500 ≈ 30 s) is worth less, down to 0.75 at three times the expected time;
- hints cost credit by how much they reveal: the piece (0.6) or the whole move (0.25);
- a puzzle the learner has seen before only applies a quarter of its update;
- the puzzle's own deviation (from the Lichess data) weights the result — a puzzle whose rating is
  uncertain moves the learner less.

Between attempts the deviation grows with inactivity (Lichess' rate: a settled RD of 60 becomes
provisional, ≥ 110, after about a year), so a returning learner's first solves count more again.
Onboarding either trusts a self-assessment (RD 250) or runs a **calibration** of twelve rated puzzles
from RD 350; the Progress page can restart one at any time, and older saves get an RD derived from how
many rated puzzles their Elo rating had seen. Theme practice, the daily puzzle, rush, the review
queue and own-game puzzles are unrated to keep the rating meaningful.

The scale is the Lichess puzzle scale, which runs a few hundred points above game ratings.
`lib/ratingScales.ts` turns it into rough Lichess / chess.com / FIDE ranges (±150) for the Progress
page. Known limits: the bundled puzzles are the popular ones (popularity ≥ 70), which are slightly
easier for their rating than average, so the estimate probably runs a little high; and at the ends of
the scale the pool is one-sided (nothing below 400 or above about 3000), so extreme ratings are less
reliable.

## Puzzle data pipeline (`scripts/`)

```
Lichess CSV.zst ──▶ import-lichess-puzzles.mjs ──▶ public/puzzles/index.json + b*.json
                    (stream, filter, reservoir sample per band, legality check)
                                        │
                                        ▼
                             verify-puzzles.mjs (CI: structure + legality;
                                                  local: --engine N agreement)
```

Buckets are rating bands (400–799, 800–1099, …, 2600+), 1,000 puzzles each. The app loads only the
buckets around the user's rating. `index.json` also carries per-theme counts for the practice catalogue.

`import-openings.mjs` builds `public/openings/openings.json` (EPD → ECO code and name, ~3,800
positions) from the lichess-org/chess-openings TSV files; the output is committed.

## Offline and PWA

The service worker is hand-written (`src/sw.ts`, built by `vite-plugin-pwa` in `injectManifest` mode and
type-checked by `tsconfig.sw.json` against the WebWorker library). It precaches every build asset, the
single-threaded engine, the puzzle chunks and the opening table (~5.4 MB), serves `index.html` for
navigations so deep links work offline, caches the threaded engine build on first use, and applies the
cross-origin-isolation headers described above when asked. `registerType: 'prompt'` means a new deploy
does not silently replace the running app; `UpdatePrompt` shows a "Reload" toast and the worker honours
the `SKIP_WAITING` message. `pwa.ts` captures `beforeinstallprompt` before React mounts and exposes an
install button; iOS gets manual instructions because Safari has no install API.

## Accessibility

- Every `Board` derives a plain-language description of the last move from consecutive positions
  (`components/board/announce.ts`: "White knight takes pawn on f7, checkmate.") and announces it in a
  visually hidden `aria-live` region, so no feature has to report its own moves. Statuses and engine
  lines are live regions too.
- The keyboard shortcut reference (`src/app/shortcuts.ts`, opened with `?`) is the single source of
  truth for the `keydown` handlers in the feature pages.
- The shell moves focus to `<main>` after in-app navigation, dialogs use the native `<dialog>` element
  (focus trap, Escape, inert background) and scroll internally when tall.
- `useReducedMotion()` turns Chessground animation off under `prefers-reduced-motion`; the CSS does the
  same for transitions. The high-contrast board palette uses Okabe–Ito highlight colours, and the text
  tokens are chosen to meet WCAG AA contrast on every surface.

## Testing strategy

- **Unit (Vitest + jsdom):** pure logic (UCI parsing, rating, selection, review grading, stores) and
  hook state machines via `renderHook`.
- **Content tests:** every lesson position and task, every repertoire line, every classic game, every
  endgame study (including the scripted replies after every accepted alternative) and every drill position
  is validated for legality (and mate claims) on every test run; the generated lesson index must match the
  lesson content.
- **E2E (Playwright):** smoke and feature tests against the production build on desktop and mobile
  viewports, including real engine replies, clocks, the variation tree, the board editor, Puzzle Rush,
  drills, the repertoire trainer, guess-the-move, service-worker registration, game review with the
  evaluation graph, playing from a FEN, game import with mocked Lichess/chess.com responses, the review
  queue, the daily plan, own-game puzzles, bookmarks, My games (mocked APIs, paging, deviations, batch
  review), courses, lesson recall, endgame studies, two-player and blindfold games, the recall drill,
  keyboard board control, shareable links, the settings, the accessibility features and the
  cross-origin-isolation switch (which needs the real service worker, so it only runs against the built
  app).
- **Engine verification:** `npm run lessons:verify` checks every lesson task against Stockfish (the
  accepted moves must be mate, keep a decisive win, or stay within 80 cp of the engine's choice);
  `npm run drills:verify` confirms the drill positions are won/drawn as claimed; `npm run studies:verify`
  walks every study ply by ply (accepted moves keep the goal, the alternatives that are not listed lose
  it); `scripts/verify-puzzles.mjs --engine` spot-checks puzzles.

## Non-goals (for now)

- Accounts or cross-device sync — would need a backend; `localStorage` export/import covers the basics.
- Human vs human over the network — needs a relay; two people at one device can play on the Play page.
