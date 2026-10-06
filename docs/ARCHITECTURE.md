# Architecture

Chess Trainer is a single-page application with **no backend**. Everything — lessons, puzzles, the
engine and the user's progress — is either shipped as static files or lives in the browser; a
learner who connects a Lichess account has the browser keep it in step with that account directly.
This document explains the moving parts and the reasoning behind them.

## Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                │
│                                                                        │
│  React app (Vite build)                                                │
│  ├─ features/learn      lessons · courses · recall ── useLessonStep    │
│  ├─ features/puzzles    puzzleService · ownPuzzles ── usePuzzleTrainer │
│  ├─ features/drills     useDrillGame (engine) · endgame ladder ───────┐│
│  │                      vision · coordinates                         ││
│  ├─ features/patterns   mating patterns gallery + drill              ││
│  ├─ features/studies    endgame studies ── useStudy                  ││
│  ├─ features/openings   repertoires + SM-2 ── useRepertoireTrainer   ││
│  ├─ features/classics   useGuessTheMove (engine grades guesses) ─────┤│
│  ├─ features/play       usePlayVsEngine + clock · coach · openingBook┤│
│  │                      engine ladder (ladder.ts)                    ││
│  │                      human-like: engine/maia (Maia-3)             ││
│  ├─ features/analyze    useAnalysis (GameTree) · share links ────────┤ EngineClient ──▶ Worker
│  │                      gameReview · commentary · positionReport     │
│  │                      analysis library (LibraryDialog)             │
│  ├─ features/games      my games: import · stats · deviations ───────┤   (UCI)          Stockfish
│  │                      insights (phases · motifs · work-on list)    │
│  ├─ features/arcade     eleven games: useHandAndBrain · useFortress ─┤
│  │                      useSimul (one engine, a queue of boards)     │
│  │                      odds · army · dailyOpening · engineSays      │
│  │                      whoStandsBetter (positions.json)             │
│  │                      useArbiter · useGhostKnight (no engine)      │
│  ├─ features/reference  rules, notation, glossary                    │
│  ├─ features/progress   charts, weekly summary, arcade records       │
│  ├─ features/settings   appearance · engine · profiles · backups     │
│  └─ features/lab        test lab: platform · sounds · icons · board  │
│                                                                      │
│  ├─ features/home       adaptive daily plan · courses · first-run tour│
│  ├─ features/placement  placement quiz → course + starting rating    │
│  app/ Shell · PlatformHooks (icon badge, file handlers) · routes      │
│  chess/ (chess.js helpers, PGN, GameTree, geometry) components/board  │
│  lib/ srs · puzzleReview · gameImport · clock · sound · haptics       │
│       shareLink · shareCodes · backup · explorer · tablebase · glicko │
│       lichess/ account sync: OAuth · outbox · studies ── lichess.org  │
│  store/ settings · progress · repertoire · games · analyses           │
│         profiles (namespaces the four per-learner stores)             │
│                                                                        │
│  Service worker (src/sw.ts, Workbox) ── precache · runtime caches for  │
│    puzzle chunks and engine builds · COOP/COEP for threads             │
└────────────────────────────────────────────────────────────────────────┘
        ▲ static files only (+ optional lichess.org / chess.com API calls:
          game import, tablebase, opening explorer, the Lichess account
          sync — each opt-in)
┌───────┴─────────────────────────────┐
│ GitHub Pages (dist/)                │
│  index.html, 404.html, assets       │
│  engine/*.wasm, puzzles/*.json,     │
│  openings/openings.json             │
│  maia/ (the human-like opponent,    │
│  downloaded on request)             │
└─────────────────────────────────────┘
```

## Build and deployment

- **Vite + React 19 + TypeScript**, strict settings (`noUncheckedIndexedAccess`, no non-null assertions).
- Each feature page is a lazily loaded chunk (`src/app/routes.tsx`), so the first paint only needs the
  shell (~133 kB gzipped including React and the router, of which React is ~96 kB; measured for 0.12
  with `node scripts/check-bundle-size.mjs --print`). Code that only some visits need — the import
  dialog for a file the OS opens the app with, the lab's clean-up, the sound engine, the repertoire
  part of the due count — is imported dynamically when it is needed. The lesson content (~91 kB
  gzipped) is only loaded on the Learn pages: everything else (Home, Progress, courses, the reference) reads
  `src/features/learn/lessonMeta.ts`, a generated index of ids, titles and lengths that
  `scripts/build-lesson-index.mjs` rewrites before every build (`npm run lessons:index`); a unit test fails
  when it is stale.
- `VITE_BASE_PATH` sets the URL prefix. The deploy workflow derives it from `actions/configure-pages`,
  so the same code works at `https://user.github.io/` and `https://user.github.io/repo/`.
- `scripts/postbuild.mjs` copies `index.html` to `404.html` (deep links on Pages), writes `.nojekyll`,
  ships the licences and the third-party notices as `licence.txt`, `licence-agpl.txt` (Maia-3's
  licence, from `LICENSES/AGPL-3.0.txt`) and `notices.txt` (the footer links them; they are not
  precached) and moves the source maps out of `dist/` into `sourcemaps/`. The build
  writes hidden maps (no `sourceMappingURL`), so they are never deployed or precached; the deploy
  workflow keeps them as an artifact per commit, which crash reports name.
- Builds are reproducible: `__BUILD_DATE__` is the commit's date (`git log -1`, or
  `SOURCE_DATE_EPOCH`; the clock only outside git) and `__BUILD_COMMIT__` its hash, so rebuilding a
  commit gives byte-identical files and a redeploy that changed nothing triggers no update.
- `index.html` carries a Content-Security-Policy meta tag written by a Vite html transform
  (`scripts/lib/html.ts`): scripts from the site plus the inline pre-paint theme script by its
  SHA-256 hash (computed from the final HTML at build time, so it cannot go stale),
  `'wasm-unsafe-eval'` for the engine and the human-like opponent's runtime, connections to the site
  and the four APIs (lichess.org, explorer.lichess.ovh, tablebase.lichess.ovh, api.chess.com),
  inline styles (Chessground and React set style attributes), and `object-src`/`base-uri` `'none'`.
  A meta tag cannot set `frame-ancestors`; the service worker adds that header to the pages it
  serves (`src/sw/framing.ts`). The dev server has no policy.
- The engine binaries are **not in git**. `scripts/setup-engine.mjs` downloads the pinned Stockfish.js
  release and verifies SHA-256 checksums; it runs before `dev` and `build` (CI caches the download and
  still checks it), and writes `public/engine/version.json`, a record of the build for people — the
  app does not read it and it is not precached. This keeps the repository small and avoids a 200 MB
  npm dependency, while still failing loudly if the upstream file changes.
- The human-like opponent's files are not in git either. `scripts/setup-maia.mjs`
  (`npm run maia:setup`; it runs before `build`, and before `dev` with `--optional`, where a failure
  only warns) downloads the Maia-3 model from a pinned Hugging Face revision and copies ONNX Runtime
  Web's WebAssembly build out of `node_modules` under a versioned name
  (`ort-<version>-simd-threaded.wasm`), checking both SHA-256 checksums and that the installed
  `onnxruntime-web` is the pinned version; anything else in the folder (an earlier pin's files) is
  removed so it is never deployed. It writes `public/maia/version.json` for people, like the
  engine's. Vite copies the files into `dist/maia/`; they are left out of the precache.

## The engine layer (`src/engine/`)

`EngineClient` wraps a Web Worker running Stockfish and speaks UCI over `postMessage`:

- `init()` performs the `uci`/`isready` handshake once and caches the promise.
- `search(params, onInfo)` returns a handle whose `result` resolves on `bestmove`. Searches and
  `newGame()` share one **FIFO queue**, so only one command talks to the engine at a time. Starting a
  search asks the _running_ one to stop (it resolves early with `stopped: true`); searches already
  waiting in the queue still run, in order, unless their own handle's `stop()` is called before they
  start (they then resolve with `stopped: true` and no best move without reaching the engine).
  `newGame()` stops the search in progress (it belongs to the old game), runs once it has ended and
  before any search requested later, so `ucinewgame` can never land after the new game's first `go`.
  This makes React effects safe — an effect can start a search and stop it in its cleanup without
  worrying about interleaved `bestmove` lines. Callers must not trust a `stopped` result (it may be
  depth 1) and must never cache one.
- A worker that dies **after** the handshake rejects the pending search or `newGame` with
  `EngineCrashedError`, sets `status = 'error'` and notifies `onError` listeners; `useEngine()` mirrors
  that into React state so pages show their Retry button, and `start()` then builds a fresh client.
  `terminate()` likewise rejects everything still waiting instead of leaving promises pending.
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

### Engine builds: threads and the full network

Four Stockfish builds ship (`scripts/setup-engine.mjs` pins them; `src/sw/engineFiles.ts` names them
for the page and the service worker, and a test keeps the two lists equal): the **lite** engine, with
Stockfish's small network (about 2 MB), single-threaded and with pthreads, and the **full** engine,
with the large network (about 99 MB), in the same two flavours. `chooseEngineBuild(wantThreads, env,
wantFull)` (`src/engine/build.ts`) picks one from the settings and the environment. `EngineClient`
starts it and, when it cannot, the next one in `fallbackBuilds` — full to lite, threads to one thread
— so the engine always starts; `fallbackReason` says why (`not-downloaded`, an expected and quiet
case, or `failed`), and the diagnostics benchmark reports it.

**Threads, on by default.** Multi-threaded WASM needs `SharedArrayBuffer`, which browsers only expose
to **cross-origin-isolated** documents — those served with `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp`. GitHub Pages cannot set headers, so the service
worker does it:

1. A flag in the Cache API (`src/sw/isolation.ts`) — the one storage both the page and the worker can
   read without a message round-trip — says whether to isolate; no flag means on
   (`ISOLATION_DEFAULT`). The setting `settings.engineThreads` is the source of truth: `PlatformHooks`
   brings the flag in line with it at start-up (`syncIsolationFlag` writes only when they differ — a
   save from before 0.14, a change made in another tab), switching threads off writes the flag, and
   _Reset everything_ deletes it so the default applies again.
2. The service worker's `handlerWillRespond` plugin adds the two headers to every same-origin response
   it serves (documents need them to become isolated; dedicated worker scripts need them because a
   worker must be at least as isolated as its owner). The first visit has no service worker yet and
   runs one thread; from the next load on, the page is isolated.
3. `chooseEngineBuild()` picks a threaded build only when the page reports `crossOriginIsolated`,
   `SharedArrayBuffer` exists and there are at least three logical cores; it uses all cores but one,
   capped at eight (four on phones and tablets, detected through `navigator.userAgentData.mobile` or a
   coarse pointer). A hidden core count (iOS Safari, Firefox with resist-fingerprinting) or fewer than
   three cores means a one-thread build — the message says "fewer than three cores are reported, or
   the count is hidden", never "only one core". `EngineClient` sends `setoption name Threads` after
   `uciok`.

Under `require-corp` every cross-origin resource must be CORS-enabled. The app loads none: its only
cross-origin requests are CORS calls to the Lichess and Chess.com APIs, which keep working (an e2e test
checks one in every browser).

**The full engine, opt-in.** _Settings → Full engine_ (`EngineFullSetting.tsx`,
`fullEngineDownload.ts`) downloads the full build this device would run — threaded or not, by the same
`chooseEngineBuild` — and stores it in the engine cache itself (`fetchBuild` in
`src/engine/fullEngine.ts`). Its requests carry `ENGINE_DOWNLOAD_HEADER`, which the service worker
leaves to the network, and skip the HTTP cache: a worker fetching on the page's behalf would finish
the transfer, and keep the file, after the learner pressed Stop. The binary streams through a counter
(the progress bar, against the server's length or the known size when the response is compressed)
into `cache.put`, which keeps a response only once its body is complete, so a stopped or broken
download leaves nothing behind; it goes in after the script, so a build counts as downloaded exactly
when it is whole. The setting waits for a service worker to control the page and, while threads are
on but the page is not isolated yet, for the reload that isolates it (otherwise the one-thread build
would be fetched, and the threaded one 99 MB later). The download task lives at module level, so it
carries on while the learner moves around the app; once the files are stored, the other full build,
if any, is deleted. `EngineClient` starts a full build only when both its files are stored and the
page is served by the service worker (`isBuildAvailable`: a page loaded past it, by a hard reload,
would have its engine worker fetch 99 MB from the network) — otherwise lite runs, quietly — and gives
it four times the usual start-up timeout, since compiling 99 MB takes a while on a phone. Switching
it off deletes the files, as do _Reset everything_ and a start-up that finds the switch off with
files left over.

Only the one-thread lite build is precached. The others are excluded from the precache manifest and
served by a `CacheFirst` route on the engine cache (`chess-trainer-engine`), which also keeps the
threaded lite build the first time it is fetched, and never expires them — a 99 MB file must not
quietly need downloading again. Their names carry the engine version, and a new release's service
worker deletes, when it activates, every engine file the release no longer names.

### The human-like opponent (`src/engine/maia/`)

Stockfish's weakened levels lose by blundering at random; a person of a given rating plays plausible
moves and goes wrong in the ways that rating does. The human-like opponent is
[Maia-3](https://huggingface.co/UofTCSSLab/Maia3-5M) (5M parameters, half-precision weights, the
browser-ready ONNX export at `huggingface.co/bqrio/maia3-onnx`), a network trained on online games
that predicts the move a player of a given rating makes, run by
[ONNX Runtime Web](https://onnxruntime.ai) in a module worker.

- **Encoding** (`encoding.ts`, pure, and checked against the reference implementation): the board as
  64 squares × 12 piece planes (`PNBRQKpnbrqk`, a1 first), always from the side to move's point of
  view — with Black to move the ranks are mirrored and the colours swapped. Moves are indices into a
  4,352-entry vocabulary: `from × 64 + to` (in the mirrored frame for Black), then the promotions
  after 4,096 by file of departure, file of arrival and piece. The rating goes in twice, as the
  player's and as the opponent's (`elo_self`, `elo_oppo`). `maiaPolicy()` keeps the logits of the
  legal moves only and turns them into probabilities; `maiaValue()` reads the loss, draw and win head.
- **Choosing a move** (`sampleHumanMove`): a weighted draw among the moves with at least 2 % of the
  probability (`SAMPLE_FLOOR`; the likeliest is always in), so the opponent varies without ever
  playing a move nobody at that rating would. `humanThinkMs` gives it a person's pace: 0.3 s plus up
  to 1.2 s as the position gets less clear to it (a lower top probability), halved in the opening,
  between one and two times that at random, and never more than a fortieth of its clock (0.3 s at
  most under ten seconds).
- **Running it** (`session.ts`, `maia.worker.ts`, `protocol.ts`, `maiaClient.ts`): `session.ts`
  creates the inference session and runs one position; the worker and a Node test that plays real
  positions (`scripts/maia-model.test.ts`) share it. The worker imports `onnxruntime-web/wasm` (the
  WebAssembly backend only), reads both files from their cache — or the network, on the dev server —
  and hands ONNX Runtime the runtime's bytes itself (`env.wasm.wasmBinary`) with one thread, so it
  starts the same way in an isolated page and in one that is not. `MaiaClient` owns the one worker:
  `load()` is single-flight and a failure leaves it ready to retry, `predict()` matches answers to
  requests by id and fails what was waiting when the worker dies, and `useMaiaStatus()` mirrors its
  status into React.
- **Getting the files** (`maiaDownload.ts`, `src/sw/maiaFiles.ts`): nothing is fetched until the
  learner asks — in the game setup or in Settings. The download streams both files (the runtime, then
  the model) through a byte counter for the progress bar, checks each one's size and SHA-256 before
  it goes into the `chess-trainer-maia` cache (a captive portal's page or a cut-off transfer is
  refused, and nothing of it kept), and can be stopped; the task lives at module level, so it carries
  on while the learner moves around the app. `maiaFiles.ts` names the files for the page and the
  service worker, and a test keeps it equal to the setup script's pins. The service worker does not
  route `/maia/`; on activation it deletes the files the release no longer names, as the download
  does before it starts. Delete in Settings stops the worker and removes the cache.
- **Build** (`vite.config.ts`): ONNX Runtime's bundle points at its WebAssembly file with
  `new URL('ort-wasm-simd-threaded.wasm', import.meta.url)`, which Vite would copy into
  `dist/assets/` — 14 MB that nothing loads, and too big to precache. The worker build's
  `ortWasmReference` plugin splits that literal so Vite leaves it alone (and fails the build if the
  bundle stops containing it), and `scripts/check-bundle-size.mjs` fails on any `.wasm` in
  `dist/assets/`. The worker chunk itself is about 24 kB gzipped.
- **Play** (`usePlayVsEngine` with `opponent: 'humanlike'`): the model loads when such a game starts;
  the opponent's turn asks for a prediction instead of a search, draws a move and waits out the think
  time. Stockfish still gives hints and threats and runs the coach and the review; the blunder check
  needs neither. Games are recorded with `source: 'humanlike'`, `level: 0` and `opponentRating`, so
  the engine ladder and the level statistics never count them; `buildInsights` gives them rows by
  rating (`ratings`, next to `levels`), which Progress shows, and two wins or two losses in a row at
  one rating suggest a step of 100.

## The board (`src/components/board/`)

`Board.tsx` wraps [Chessground](https://github.com/lichess-org/chessground), the board used by
Lichess. The instance is created once per mount and reconfigured through `api.set()` on prop changes,
which keeps piece animations intact. `viewOnly` is the only creation-time prop (it changes which DOM
events Chessground binds), so toggling it recreates the board. Board colours come from a CSS variable
holding an SVG data URI generated in `boardThemes.ts`; piece sprites come from the piece-set
stylesheets described below (the default Classic set is Colin M.L. Burnett's cburnett figurines,
CC BY-SA 3.0, credited in the footer).

The board is deliberately "dumb": it reports `onMove(from, to)` and renders whatever `fen`, `dests`,
`shapes` and highlights it is given. All rules live in hooks built on chess.js. It is also
self-healing: after `onMove` it re-applies the position from its props unless the page answered with a
new one, so a cancelled promotion or a drill that keeps its position puts the piece back and stays
movable. `onMove` runs inside `flushSync`, because Chessground calls it from a timeout. A king dropped on
its own rook castles (the rook squares are added to the king's destinations and translated back to
the castling square before `onMove`). User-drawn arrows survive reconfiguration (`drawable.shapes` is
passed along with every `fen`). `Board` and `MoveList` are memoised so a ticking clock in the parent
does not redraw them. Coordinates are not
Chessground's: with `showCoordinates` on, the `.board` element keeps a gutter (`--coord-gutter`, sized
from the board width with container-query units) down the left and along the bottom, the playing
surface (`.board__surface`, which holds Chessground and the keyboard cursor) fills the rest, and
`BoardCoords` draws one rank number and one file letter per square in the gutter, centred on the
square, in the muted text colour. Off the squares they never sit under a piece and read the same on
every theme and both orientations. The eval bar on the analysis board matches the surface height
with the same gutter (`.trainer__board:has(.board--coords) > .evalbar`).

Every interactive board is also keyboard-operable (`keyboard.ts`): the container is focusable, the arrow
keys move a square cursor (from the viewer's side), Enter selects the piece under the cursor and then its
destination through Chessground's own `selectSquare`, so the same legality, callbacks and highlights apply
as for the mouse; Escape clears the selection and typing a square name (either case) jumps to it. While
the board has focus, file letters, Space and Enter are swallowed, so page shortcuts such as `h` (hint)
or `s` (solution) never fire from a typed square and Space never scrolls. The cursor square is spoken on
focus and after every step (with ", legal destination" while a piece is selected); a refused Enter says
"Not a legal destination" or "It is not your move". An `aria-describedby` paragraph holds the key
instructions, a visually hidden "Describe position" button reads the whole position out through a live
region, and a view-only board (`role="img"`) carries the same description as `aria-description`. The
promotion picker is a modal dialog with a focus trap that gives focus back on close; `ClickBoard` (the
drills and the board editor) is one `role="group"` tab stop with a roving tabindex and the same arrow
keys, and marks the selected square with `aria-pressed`. Piece sets are chosen with a `data-pieces` attribute on
`<html>`; every set is a stylesheet of inline SVG with the same selectors (`pieces-*.css`, written by
`scripts/generate-pieces.mjs`: the cburnett figurines re-emitted from the Chessground package, and the
original Modern and Pixel sets, drawn in the script; the Letters set is hand-written). A more specific
`.piece-preview.pieces-<set>` selector lets a picker show every set at once. The drag feel comes
from settings too: `draggable`/`selectable` follow the move method, the magnifier is a `scale` on
`piece.dragging`, and the drag target is an overlay the board positions straight from pointer
events while Chessground reports a drag in progress.

Move notation is a display concern: `src/chess/notation.ts` splits a SAN move into piece letters
and the rest, and `San.tsx` draws each letter as a `piece` element from the active set (with the
letter kept in a visually hidden span, so screen readers, searches and copying still see "Nf3");
`Notated` does the same for moves inside prose. Stored games, PGN and share links always use
letters.

## Chess state (`src/chess/`)

- `helpers.ts` — pure functions: legal destinations for Chessground (with the rook squares for
  castling-by-rook), UCI/SAN conversion (including `tryNotation` for typed moves: lowercase pieces,
  `a8=q`, and `e8`/`e7e8` promotions completed as a queen when `autoQueen` is on), promotion detection,
  game status, material. `normalizeFen` repairs a user FEN — castling rights whose king or rook has
  moved are dropped, an impossible en passant square is cleared, 4- and 5-field FENs/EPDs are padded —
  and `isValidFen`/`sanitizeFen` build on it; `GameTree` and `useChess` normalise every start position.
- `useChess.ts` — owns a mutable `Chess` instance in a ref and publishes immutable
  `PositionSnapshot`s. It also models the **promotion dialog**: `playMove` returns `'promotion'` when
  a piece must be chosen and `resolvePromotion` completes or cancels it. Used by Play and the drills.
- `pgn.ts` — a tokenising PGN parser that understands headers, `{comments}`, nested `(variations)`,
  `$n` NAGs and `!?`-style glyphs, and is forgiving about movetext in the wild: move numbers glued to
  moves (`1.e4`, `2...Nc6`), `[%clk …]`/`[%eval …]`/`[%csl …]` commands split out of comments into
  each move's `commands` (the prose stays clean), evaluation symbols (`+-`, `∞`, `±` …) turned into
  NAGs, `%` escape lines and stray words dropped, a comment before a variation's first move kept as
  `commentBefore`. `splitPgnGames` handles multi-game files, header-less games included (a result
  followed by a blank line, or a `1.` that restarts a game).
- `tree.ts` — `GameTree`, a tree of positions where the first child is the main line. It supports
  adding moves (re-using existing children), navigation, promoting/deleting variations, comments and
  glyphs, and round-trips to PGN (the comment before the first move and `[%clk]` commands included).
  `fromParsed` validates a `FEN` header and throws a `PgnParseError` naming it, so a bad header never
  reaches a board; `parsePgnGames` (`lib/gameImport.ts`) skips such games. `parsePgnCached` memoises
  `fromPgn` per PGN string (a 32-entry LRU, each call returns a fresh clone) for the Home, Progress and
  due-count code that re-reads the repertoires on every render. The analysis board and the repertoire
  trainer are built on it.
- `blunderCheck.ts` — the play page's blunder check, without the engine: a move that allows mate in
  one, or loses two pawns' worth or more to a capture sequence (an alpha-beta search over captures
  only, material as the measure, both sides free to stop capturing), is held back — but only when
  some other move does at least two pawns better, so a fork or a lost position is not nagged about.
  It asks first "do the answers win two pawns more than the move took?" with a null-window search,
  and runs the full search only for a move that fails it. The searching runs on `QuickBoard`, not
  chess.js: it runs on the main thread before every move, and chess.js builds SAN, FENs and move
  objects for every move it makes, which cost hundreds of milliseconds in sharp positions; on
  `QuickBoard` an ordinary move costs well under a millisecond and the slowest a few. chess.js only
  plays the move asked about and spells the answer for the warning.
- `quickBoard.ts` — a small move generator for such searches: an 0x88 board whose make and unmake
  are a few array writes. It follows chess.js exactly — the same rules and the same move order
  (squares a8 to h1, promotions N B R Q, castling last) — so a search visits the same moves in the
  same order on either. Its tests count moves from the standard perft positions and compare its move
  lists with chess.js's through random games and two moves deep from the threat-drill positions.
- `geometry.ts` — how the pieces move on a bare board, read straight from a FEN placement: attacks
  (lines stop at the first piece), who attacks a square, the squares between two others, where a
  piece can go by its own movement. No kings, turns or check: chess.js plays legal chess and refuses
  anything else, and the arcade needs both a board without kings (Ghost Knight's hunters) and the
  moves the rules forbid (Arbiter). The board's spoken square and position descriptions read pieces
  through it too, so they describe such boards as well.

### Sounds and clocks (`src/lib/`)

- `sound.ts` synthesises every sound effect with the Web Audio API (no audio files to license or cache):
  each cue is a table of oscillator and filtered-noise layers played through a compressor and soft
  clipper, with one table for the standard set and one for the 8-bit retro set (the soft theme softens
  the standard table as it plays); the volume setting scales the output on a squared curve.
- `clock.ts` is a pure clock model (timestamps, increments, flagging) that Play drives with a 100 ms tick.
- `srs.ts` is an SM-2 scheduler used for opening moves; `puzzleReview.ts` is the simpler fixed-step
  (1-3-7-14-30 days) scheduler behind the puzzle review queue; `openings.ts` looks up ECO names by EPD;
  `tablebase.ts` wraps the Lichess tablebase API and normalises per-move results to the mover's view;
  results are cached per position including the halfmove clock (the 50-move categories depend on it),
  and `describeDtm` turns the API's half-move DTM into "mate in N" moves.
- `fetchWithTimeout.ts` is the one `fetch` wrapper for every network call (Lichess, chess.com, the
  explorer, the tablebase): it combines the caller's signal with a 15 s `AbortSignal.timeout` and reads
  `Retry-After` on 429 responses.
- `gameImport.ts` splits multi-game PGN text (`parsePgnGamesDetailed` also returns the first parse error
  and the legal prefix before an illegal move), replays each game for legality, skips variant games
  (`Variant` header, chess.com `rules`), keeps only `https:` links on lichess.org or chess.com as source
  URLs (`safeSourceUrl`), and fetches recent games from the public Lichess (`/api/games/user/…`, PGN
  stream, standard perfs only) and chess.com (monthly archives under the player's own path, at most six
  per page) APIs with typed errors (`not-found`, `rate-limited`, `network`, `empty`), time-control /
  colour / rated filters and cursors for "load older games" (the chess.com cursor carries the month).
- `shareLink.ts` builds and reads the analysis share links: the PGN is deflated with the Compression
  Streams API and carried in the URL fragment (`#z=…&ply=N`, or `#pgn=` / `#fen=` as fallbacks), so a
  link never reaches a server.
- `dates.ts` keeps the calendar helpers, including `trainingStreak()` for the training-day streak.

## Feature state machines

| Hook                                           | Phases                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usePuzzleTrainer`                             | idle → intro → solving ⇄ replying → solved / failed                                      | Lichess semantics: first move is the opponent's; any checkmate is accepted as the final move; outcome reported exactly once; "try again" continues unrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `useLessonStep`                                | reading / awaiting → wrong → awaiting / replying → correct / revealed                    | Judges SAN against the task (`taskCheck.ts`), plays scripted replies, exposes hint shapes (also on their own, for Recall). Reports how the task ended (`{ revealed, mistakes, hinted }`) to `onSolved` in the same call, so Recall grades a shown answer or a wrong move as a miss; “Show answer” works only while the task waits for a move.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `usePlayVsEngine`                              | setup → playing (player turn / engine thinking) → game over                              | Engine moves come from an effect keyed on the position (against the human-like opponent, a prediction from Maia-3, a move drawn from it and a person's pause — see above); take-backs cancel pending searches and are refused once the game is over (it is recorded once), and pause alerts close with the game. Clock: a flag loses (draws when the winner cannot mate); the engine's think time is capped by its clock — the level's depth kept, a `movetime` added as a second limit, the cosmetic pause skipped under ten seconds. Hints and threats carry a run token, are dropped if the position changed and are also given in words (`hintMove`, a live region on the page). `start({ source, event })` names the mode the game is recorded under (`'play'` by default; `'ladder'`, `'book'`, `'arcade'`); the hook never writes the Play defaults — `PlayPage` does. The skill cache resets when `useEngine` hands out a new client (on Retry). With `opponent: 'human'` the engine never moves, both colours are movable, the board can turn towards the side to move and the game is never recorded. |
| `useStudy`                                     | solving → wrong → solving / replying → solved / revealed                                 | One endgame study: each solver move is checked against the scripted line (alternatives allowed), the reply is played automatically, hints escalate from a circle to an arrow, and the outcome is reported once with an "assisted" flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `useAnalysis`                                  | continuous evaluation of the current `GameTree` node; optional review                    | A move played from the middle of a line becomes a variation; the review grades the main line at the configured depth and produces win probabilities for the evaluation graph and `keyMoments()`; a move the first pass flags is searched again together with the engine's choice from the position before it (`searchmoves`, two lines, depth 14 or more) and judged by that one search. Opening name, tablebase and opening-explorer lookups follow the current node. Each reviewed move keeps its best line and the reply line so `commentary.ts` can explain it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| coach (in `usePlayVsEngine`)                   | player moves → coach checking → alert (take back / play on) → engine replies             | In untimed engine games the position before and after the learner's move is searched at a fixed depth (`COACH_DEPTH`) and at `Skill Level` 20, one search after the other (a parallel pair would stop the first at a shallow depth; stopped results are never cached); the best move is the top line's first move, not the skill-weakened `bestmove`. A mistake or blunder, or any missed or allowed mate, pauses the game with the rules-based explanation and the lesson it belongs to. A move that ends the game is never checked, and a mated position with no engine line counts as a win. The engine's reply waits until the alert is resolved; resolving the coach or book alert clears both.                                                                                                                                                                                                                                                                                                                                                                                                            |
| blunder check (in `usePlayVsEngine`)           | player moves → check → alert (look again / show me / play it anyway) or move played      | `checkBlunder` runs before the move is made (the board snaps back when it is held); a promotion is checked once its piece is chosen. Counted once per position and move in a game.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useRush`                                      | idle → running → finished                                                                | Difficulty climbs with every solve; three misses (or the 3-minute clock) end the run. Built on `usePuzzleTrainer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useBlindPuzzle`                               | loading → solving ⇄ replying → solved / failed (→ solving, practice)                     | The board keeps the start position (`blind.ts`: `prepareBlind`, `judgeBlindMove`); moves come from two clicks on a `ClickBoard` or typed SAN, judged in the hidden position. Any mate solves. A peek shows the current position and keeps the level of that length from rising (+40 clean, −60 for a miss).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `useThreatDrill`                               | loading → threat → (checking) → defend → (checking) → done                               | The threat stage shows `passMove(fen)` (the opponent to move); a guess or a defence the position does not list is put to the engine (`verifyThreatGuess`, `verifyDefence`: searchmoves, within 50 and 70 cp). Own threats come up every third position while due.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `useSelfReview` (on `useAnalysis`)             | off → marking → checking → done                                                          | Turns the analysis engine off while the learner marks moves and plays alternatives (the first move from the position before a mark is taken as its suggestion); then runs the review, scores the marks (`selfReview.ts`), judges each suggestion against the review's move in one searchmoves search, records the result and puts the engine back.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useDrillGame`                                 | idle → playing → won / lost                                                              | Full-strength engine plays the other side; the position is adjudicated after every move (mate, promotion, stalemate, material loss counted from the learner's side, move limit, engine eval). `endgameLadder.ts` orders the 41 drills by difficulty into rungs and reports what is climbed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `PatternDrill`                                 | intro → solving → solved / failed, per pattern                                           | The nineteen named mates (`matingPatterns.ts`: a lead-in move plus a forced mate, all checked in tests) run through `usePuzzleTrainer` one after another; results are stored per pattern and per full run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| book (in `usePlayVsEngine`)                    | in-book ⇄ out-of-book / deviated                                                         | `openingBook.ts` follows the game through a repertoire's tree: the opponent's replies come from the book, weighted towards the learner's least-known moves (the store keys cards by repertoire and path, so the hook passes them through `cardsFor()`; a lapsed move counts as relearning, not new). The engine takes over when the book ends. A learner move outside the book pauses the game, clocks included, with a take-back, and lapses the SM-2 card: the alert comes with the move that left the book (again after a take-back and the same move; never for later moves of a game played on), the lapse once per ply and move. The hint in book is the repertoire's move; a repertoire that cannot be read is refused at the start.                                                                                                                                                                                                                                                                                                                                                                     |
| `useRepertoireTrainer`                         | idle → opponent ⇄ learner → lineDone → sessionDone                                       | Picks the line with the most due SM-2 cards, shows new moves with an arrow (a lapsed move is relearning, not new), grades every recall into the repertoire store. Cards are keyed by move path; grading a move also grades its transpositions (the same move from the same position reached by another move order, `transpositionTwins()` in `model.ts`) — a success only if that card was not already recalled today, a miss always.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `useGuessTheMove`                              | intro → guess → (checking) → feedback → auto … → done                                    | 3 points for the game move; a different move is scored 2 when the engine rates it within 40 cp of the game move.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `useHandAndBrain`                              | setup → (partner thinking → call → partner move / hand move → grading) ⇄ opponent → over | One engine instance serves both sides: the partner searches at full strength (`Skill Level` 20, depth 12) and the opponent at its level (`engineMove.ts`, shared with `usePlayVsEngine`). The Brain's call restricts a second search to that piece's moves (`searchmoves`); the Hand's move is graded by searching the position after it. `busy` tells the partner studying the position from the partner finding the called piece's move. Work in flight carries a run token, so re-renders never cancel it and a new game makes it stale. The score (`handAndBrainScore`) is the accuracy × the engine level × the share of a full game (30 calls); a resignation before 10 calls is not scored.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useFortress`                                  | idle → playing → held / fallen → … → over                                                | A position from `positions.json` where the side to move is clearly worse (either side defends); after every opponent move the position is graded at full strength and becomes the health bar; `FALLEN_CP` or mate ends the position, `HOLD_MOVES` of the learner's moves or a draw holds it — the last move graded like the others before it counts; three lives per run, each position held scoring the engine level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Odds Ladder, Army Draft, Blindfold             | plain `usePlayVsEngine` games                                                            | Each starts the shared play hook from its own FEN (`odds.ts`, `army.ts`) or with the board's `board--blindfold` class and a peek budget (`blindfold.ts`), with `source: 'arcade'` and an event naming the game; results go to the progress store's arcade slices (the Odds Ladder keeps wins, draws and losses per rung). `EngineGameBoard.tsx` holds the shared board column and move panel; `arcadeControls.tsx` the engine-level field, focus toggle, PGN/analysis buttons and the resign confirmation every arcade engine game uses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Daily Opening, Engine Says, Who Stands Better? | pure models + a page                                                                     | No engine at run time: `dailyOpening.ts` seeds the day's line from the date (answers and guesses come from the same entries; the page freezes the day while a game is under way, and a day in the history is never playable again) and grades guesses like Wordle; `engineSays.ts` grows a sequence by one move per round and carries the moves of every finished line into the score; `whoStandsBetter.ts` scores a slider guess in tenths of a pawn against evaluations computed offline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `useSimul`                                     | setup → playing (per board: your move → waiting → thinking → your move) → over           | One engine serves every board from a first-in, first-out queue (`SimulRunner`, a plain class so the engine loop never reads a stale state); the pure model (`simul.ts`) keeps a clock per board for each side — the player's runs wherever it is their move, the engine's only while it searches, with the search time cut to what it has left (never a floor longer than half of it). A flag against a side that cannot mate is a draw (FIDE 6.9), here and in Play. A board that ends while the engine thinks about it stops that search; an engine that keeps failing sets `stalled`, which the page shows with a Retry; announcements wait their turn (`Announcer`). Finished boards are saved as games (`source: 'simul'`); leaving mid-simul asks first (`useBlocker`, `beforeunload`) and resigns the boards in play; the summary hands any board to Analyze through `lib/handoff.ts`.                                                                                                                                                                                                                   |
| `useArbiter`                                   | idle → watching (start position → real moves → the illegal move) → verdict → … → over    | Each round comes from `arbiter.ts`: a classic game replayed with chess.js, two to six of its real moves, then an illegal move from `arbiterMoves.ts` — eighteen kinds in three tiers (a piece moving in a way it never can; the right movement where it is not allowed; what the king's safety and the move order forbid). They are worked out on a bare board (`chess/geometry.ts`) since chess.js refuses them, and a test checks every one it finds across the collection against chess.js. The replay speeds up each round, pauses itself when the page is hidden (covering the board), and a call counts until the next move would have come, plus a quarter of a second.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `useGhostKnight`                               | idle → hunting → ended → … → over                                                        | `ghostKnight.ts` keeps a hunt as pure state: hunter moves on a board without kings, the knight's reply by fixed rules (take an unprotected hunter in reach, else the safe square with the most room, with a little chance) and, because those rules are fixed, the exact set of squares it could be on — what the shaded mode draws. A slider that runs into the unseen knight stops and takes it. Budgets were set from simulated hunts, and a test plays every squad with a hunter that looks one move ahead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Persistence (`src/store/`)

Five zustand stores persisted to `localStorage` with versioned keys (and `migrate` functions), plus the
profile list:

- `settings` (version 5) — device-wide preferences only: appearance (colour scheme, notation), board
  (theme, piece set, highlights, drag feel, material display), sound theme and volume, focus mode, the
  engine level for the next game, the opponent (`playOpponent`: the engine, the human-like opponent or
  two players) and the human-like opponent's rating (`playHumanRating`), review depth, threads (on by default — version 5 switched them on
  for every earlier save) and the full engine, puzzle preferences (auto-advance, the blind-puzzle
  length), time control, keyboard move entry, blindfold play, coach mode and the blunder check,
  tablebase opt-in. Enum fields are validated on
  load (an unknown board theme falls back to the default) and nested defaults (`simul`) are merged
  field by field. The learner-scoped fields it used to hold (backup reminder, tour flag, import
  usernames) moved to `progress` in 0.12; `migrate` hands them over once.
- `progress` (version 8) — onboarding flag, puzzle rating and history, attempts (capped) plus
  `lifetime` counters that never forget (attempts, solved, failed, solves per theme, solve time), seen
  puzzle IDs (capped at 20,000), streaks (`puzzleStreak()` gives the live value, `bestStreak` the
  longest training run ever), daily puzzle state, lesson progress (steps keyed by the step's `id`, or its position without one) and lesson-recall cards, game records
  (each with a unique `id` and a `source`: play, ladder, book, arcade, simul, drill or humanlike —
  the last with the `opponentRating` it played at), per-theme
  statistics, Puzzle Rush runs, drill results, study results, guess-the-move scores, the puzzle review
  queue (capped at 500; bookmarks and own-game puzzles live there too; Woodpecker misses stay out of it)
  and the list of training days; since version 8 also the thinking skills: blind-puzzle levels per
  length (`blind`), the threat drill's record (`threatStats`, with the bundled positions seen
  lately) and the threats from the learner's own games (`ownThreats`, capped at 200, learned ones
  dropped first), self-analysis results (`selfReview`, with the last 50) and the blunder check's
  counts. Every recorded activity calls `touchTraining()`, which is what the
  Home page streak is built on. Also the learner's backup reminder state, tour flag and import
  usernames. Export/import covers all four per-learner stores.
- `repertoire` — SM-2 cards keyed by repertoire and move path, custom PGN repertoires, session history.
- `games` — the learner's imported games (up to 200; past the cap unreviewed games go first, and
  `addGames` returns `{ added, dropped }`) with their review results, keyed by URL or PGN hash. Each
  review also stores a `digest` (loss and errors per phase and colour, mistake motifs) that
  `insights.ts` aggregates for the Insights card and the daily plan's work-on items. Included in
  backups since export version 7.
- `analyses` — the analysis library: PGNs with variations under a name and a collection (a Lichess study
  export becomes one collection per study). Included in backups (export version 5); an import replaces
  the library, within the 500 cap, like every other store.
- `profiles` (`src/store/profiles.ts`, `localStorage` through the quota-safe wrapper) — the learners on
  this device and which one is active. `storageKeyFor(base)` maps a store's key into the active
  profile's namespace at module load; the first profile keeps the plain keys, others get
  `<key>:<profile id>`. Switching profiles reloads the app (not when the choice could not be saved).
  Names are unique; when the list is unreadable it is rebuilt from the store keys that exist. Settings
  are shared across profiles.

Every store hydrates through a schema (`src/store/backupSchema.ts`, shared with the backup validator)
in repair mode: a field of the wrong type falls back to its default, damaged list entries are
dropped, unknown keys are kept (so a save from a newer version survives a round trip through an
older build, which `migrate` also tolerates), and a blob that cannot be parsed is copied to
`<key>:corrupt-<timestamp>` by `keepCorruptBlob` before the first write replaces it.
`rehydrateOnStorageChange` reloads a store when another tab writes its key.

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
from RD 350; the Settings page can restart one at any time, and older saves get an RD derived from how
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

Buckets are rating bands (400–799, 800–1099, …, 2600+), 6,000 puzzles each, written as chunks of 500
(`b1400-00.json` … `b1400-11.json`). A band's puzzles are dealt over its chunks round-robin by rating
(sorted by rating and id, puzzle i goes to chunk i mod n — `dealChunks` in `scripts/lib/puzzle-index.mjs`,
checked by `verify-puzzles.mjs`), so every chunk, the precached first one included, samples the whole
band; `npm run puzzles:reindex` re-deals the files without re-importing. Re-importing keeps the ids
already in `public/puzzles` (the `--keep` list) so review queues and histories survive a refresh.
`index.json` carries the chunk size, the file list and each chunk's rating span per bucket, and the
per-theme and per-opening counts for the practice catalogues.

`puzzleService.ts` caches per chunk and loads lazily: a selection (rated, theme, opening, Rush, a
Woodpecker set) searches the chunks already in memory, then one more chunk per band (the precached
one), then two, four and the rest, stopping as soon as it has enough candidates — usually after the
first. A lookup by id does the same, nearest band to its rating hint first, and stops at the hit; the
daily puzzle loads the one chunk that holds it. Chunks are fetched with `allSettled`: one that cannot
be loaded (offline, not cached) is passed over, and only a load where nothing at all arrives fails
(`PuzzleLoadError`, which tells "offline" from "not in the set"). `downloadAllPuzzles` fetches every
chunk into the service worker's runtime cache for full offline use; Stop resolves it, a file that
keeps failing rejects it and stops the other downloads.

`import-openings.mjs` builds `public/openings/openings.json` (EPD → ECO code and name, ~3,800
positions) and `public/openings/lines.json` (every line's moves, for the Daily Opening and Engine Says
games) from the lichess-org/chess-openings TSV files at a pinned commit (`DATASET_REF`; `--ref` moves
it), so a re-run reproduces the committed files; `openings.json` records the commit and the time under
its `ref` and `generatedAt` keys.

`build-threats.mjs` (`npm run threats:build`, about half an hour) finds the threat drill's positions in
the bundled puzzles: a Lichess puzzle starts one move before the tactic, and when that move ignored a
threat already on the board, the puzzle's solution is the threat. Per rating band it searches a
seeded sample of puzzles twice — after a pass (a null move: `passMove`) and normally — and keeps a
position when the opponent's best move after the pass is the puzzle's solution (or as strong), passing
would cost two pawns or allow mate, the threat stands out from the opponent's other moves, the best
defence leaves the side to move no worse than −1.5, and the move played in the game was not a
defence. The output, `src/features/drills/threat-positions.json` (1,200 positions), is loaded with the
drill in a chunk of its own; a unit test replays every position, threat, line and defence. The game
review does the same pass search for each mistake and blunder (`passThreat` on the reviewed move), and
`ownThreatsFromReview` turns those whose punishment was already threatened into the learner's own
threats.

`build-arcade-positions.mjs` replays the classic games, evaluates their middlegame positions with the
engine (depth 16) and writes `src/features/arcade/positions.json` (White-view centipawns, the best move,
whether it is forcing, piece count). Every other game is sampled a ply later, so about half the
positions have Black to move. `positions.ts` filters it into the quiet positions of Who Stands
Better? and the clearly-worse ones of Fortress; the games' names are joined from `CLASSIC_GAMES` at run
time.

## Offline and PWA

The service worker is hand-written (`src/sw.ts`, built by `vite-plugin-pwa` in `injectManifest` mode and
type-checked by `tsconfig.sw.json` against the WebWorker library). It precaches every build asset, the
single-threaded engine, the first puzzle chunk of every rating band and the opening table (~5.8 MB),
serves `index.html` for navigations to the app's own routes so deep links work offline (the allowlist in
`src/sw/appRoutes.ts` keeps a sibling site on the same origin out of it; a test checks it against
`routes.tsx`), caches the remaining puzzle chunks (`chess-trainer-puzzles`, stale-while-revalidate — the
chunk names carry no hash) and the threaded engine build on first use (`chess-trainer-engine`,
cache-first, which also serves the full engine once the page has stored it), applies the
cross-origin-isolation headers described above unless threads are switched off, and adds
`Content-Security-Policy: frame-ancestors 'none'` to every page it serves. Both runtime caches keep
only complete responses of the expected content type (`src/sw/cacheable.ts`, and the same check in
`fetchBuild`), so a captive portal's HTML can never poison a file; puzzle chunks expire, engine files
go when a newer engine replaces them. The human-like opponent's files are neither precached nor
routed: the page stores them in their own cache after checking them (see above), and an activating
worker deletes the ones its release no longer names. The isolation flag is read from the Cache API once per worker
lifetime; `writeIsolationFlag` posts `ISOLATION_FLAG_CHANGED` with the new
value so the worker drops its copy, and `resetIsolationFlag` posts it without one, so the worker reads
the flag again. `registerType: 'prompt'` means a new deploy does not silently replace the running app;
`UpdatePrompt` shows a "Reload now" toast, otherwise applies the update at the next in-app navigation,
and reloads only the tab that asked (it listens for `controllerchange` itself, so a page that was not
controlled at registration still reloads). `pwa.ts` captures `beforeinstallprompt` before React mounts
and exposes an install button; iOS gets manual instructions because Safari has no install API. "Not
now" on the install banner is remembered in `localStorage['chess-trainer:install-dismissed']` for 30
days; `detectStandalone` recognises every `display_override` mode, and `installUnavailableReason` tells
Settings why there is nothing to offer. `index.html` runs a small inline script that applies the saved
colour scheme and piece set before the first paint (the page's Content-Security-Policy allows it by
hash), and its title, description and social-card tags are filled from `site.config.ts` by a Vite
html transform.

## Platform integrations (`src/app/PlatformHooks.tsx`, `src/lib/backup.ts`)

- **Icon badge.** `useDueCount` adds up due puzzle reviews, lesson recall and repertoire cards (each
  repertoire PGN parsed once, through `parsePgnCached`);
  `useAppBadge` writes the total with the Badging API (`navigator.setAppBadge`) and clears it when
  nothing is due or the setting is off. Browsers without the API ignore it.
- **Backups.** Export is a JSON file (`downloadBackup`, named after the profile and the date); where
  the Web Share API can share files (`canShareBackup`) the same file goes straight to another device or
  app (`shareBackup`). The manifest registers the app as a handler for `.json` files, and
  `consumeLaunchFiles` reads the launch queue; a launch file goes through the same flow as the Settings
  import (`useImportBackup`): `readBackupFile` (size cap, PGN detection), `inspectBackup` (the
  validator, no store touched), a confirmation dialog with the summary, then `importWithUndo`, which
  stashes the current export under `chess-trainer:pre-import-backup` for the toast's "Undo import".
  Nothing is ever imported without the confirmation. `backupStatus` decides when the reminder shows:
  once there is activity worth keeping (5 training days, 3 lessons, 10 repertoire cards or 3 games),
  then on the first backup, after 40 rated puzzles or after 14 days with activity; "Later" snoozes it
  for a week.
- **Haptics.** `playSound` also calls `vibrate` (Vibration API, `src/lib/haptics.ts`) with a pattern
  per cue and sound theme, gated by the `haptics` setting. Neither plays before the first tap or key
  press. Sound output runs through one limiter at the destination, resumes a suspended or interrupted
  context, claims an `ambient` audio session where WebKit offers one and suspends after a quiet minute.
- **Explorer.** `lib/explorer.ts` wraps the Lichess opening explorer (masters or community database),
  cached per position and database, debounced and abortable in `useExplorer`, and goes through
  `fetchWithTimeout` (15 s; a 429 names the server's `Retry-After` wait). `describeExplorerError`
  turns offline, unreachable and timed-out lookups into plain words for the card. `ExplorerPanel` is
  the shared card used by Analyze and the repertoire editor, with its own switch. Off by default
  because it uses the network.

## The Lichess account sync (`src/lib/lichess/`)

Cross-device sync without a server of our own: the learner's Lichess account is the shared copy,
and the browser talks to lichess.org directly. The rules below follow lila, the Lichess server —
its source was read for every endpoint used.

- **Requests** (`api.ts`). Everything goes through one queue, body reading included, because
  Lichess asks for one request at a time. Failures come back as a `LichessError` whose kind says what
  to do: `network` (wait for a connection), `auth` and `forbidden` (connect again: a 401 means the
  token is gone, a 403 whose body says "Missing scope" that a permission is), `refused` (any other
  403: Lichess refuses the request itself, and the sign-in is fine), `rate-limited` (wait
  `Retry-After`, a minute if unnamed), `invalid` (Lichess refused what was sent: not worth
  retrying), `server`. Streams (ndjson, long PGN exports) are read as they arrive and can stop early.
- **Sign-in** (`pkce.ts`, `auth.ts`). The authorization-code flow with PKCE (S256), which Lichess
  offers to clients without a secret: no app registration, the client id is the site's own address,
  and the redirect URI is `/settings/lichess` under it. The verifier and state wait in
  local storage (30 minutes, used once, tied to the profile; not the tab's own storage, since an
  installed app on Android finishes the sign-in in a browser tab of its own); the callback page
  (`features/settings/LichessCallbackPage.tsx`) checks them, trades the code for a token, reads
  `/api/account` and clears the code from the address bar. Scopes: `puzzle:read puzzle:write
study:read study:write`. Disconnect and Reset everything revoke the token (`DELETE /api/token`). A
  personal token can be pasted instead (`connectWithToken`): `/api/token/test` says whose it is and
  what it allows, and it must allow those four. That is the way in for an app on the Home Screen of
  an iPhone or iPad, which iOS sends to Safari — with its own storage — for the sign-in.
- **State** (`store/lichess.ts`, per profile, never in a backup). The account and token; the
  options; the **outbox** (puzzle results and game records waiting to go up — what makes offline
  play sync later — capped at 2,000 and 200); `sent` (puzzle ids sent from here, so their rounds in
  the history are recognised); cursors (the newest history round read, when the game exports were
  last read); the **study links** (item key → study and chapter, with the hash of each side's version
  at the last agreement); study stamps (`updatedAt` as last read); items Lichess refused (by content
  hash); and the linked items the learner deleted, which the repertoire and library stores note. The
  store is part of start-up (the progress store queues results into it), so it stays small: its
  stored blob is repaired with the backup schema's helpers, and what only the sync changes in the
  progress store lives with the sync (`progressSync.ts`).
  A different Lichess user starts the bookkeeping afresh; a backup import keeps the account and the
  outbox but restarts the matching (`restartSync`), so nothing on Lichess is deleted for items the
  backup does not hold.
- **Puzzles** (`puzzles.ts`). Results go up through the batch-solve endpoint (`POST
/api/puzzle/batch/mix`, fewer than 100 per request: 50 here), win meaning solved without a hint and
  `rated` as it was here. The history (`/api/puzzle/activity`, newest first, `since` inclusive) comes
  down from the cursor; rounds sent from here are skipped. A missed puzzle is fetched
  (`/api/puzzle/{id}`) and converted: the game's moves up to `initialPly` are replayed to find the
  position before the opponent's move, which with the solution makes the app's own form — the same
  FEN, moves and game link as the app's puzzle files, a unit test checks it on real answers. Kept
  in `progress.lichessPuzzles` while a review card points at them (300 at most), so reviews work
  offline; `findPuzzleById` looks there.
- **Games** (`records.ts`, `games.ts`). A finished game is imported (`POST /api/import`), its record
  in a `ChessTrainer` tag (form-encoded) after the other tags. Lichess keeps an imported PGN exactly
  as sent and imports the same text once, so retries are harmless; the account's imports export
  (`/api/games/export/imports`, newest first, the original texts) brings records back on another
  device, read until the game log's 50 are found.
- **Repertoires and analyses** (`studyModel.ts` without network code, `studies.ts`). One private
  study per list, parts past 64 chapters, made with chat and cloning off and sharing — which governs
  export too — left to the owner: lila's study export (`/api/study/{id}.pgn`) checks that setting
  even for the owner, and "nobody" refuses everyone. 0.17.0 made its studies so, and the API cannot
  change a study's settings, so a study whose export is refused is read from the export of all the
  account's studies (`/api/study/by/{user}/export.pgn`, which does not check it): the most recently
  updated study first, each with its chapters in a row, so reading stops once the wanted studies
  have gone by, and a study counts as read only once all its chapters have come. A run stopped
  before it read back what it sent leaves its links waiting for Lichess's version of their
  chapters; the next run settles them and removes the new study's empty first chapter from what it
  read. Each item and chapter is hashed twice — moves and
  annotations (comments, glyphs, `%cal`/`%csl` shapes; clocks and tags left out), and moves alone —
  over the start position's placement and side to move. `reconcile` compares each side with its own
  hash in the link (Lichess rewrites PGNs slightly, so the two sides' hashes are never compared with
  each other): one side changed wins (new moves update the chapter in place; a new name, side, list
  or start replaces it); both changed keeps both; a deletion on one side deletes an unchanged item on
  the other — on this side only a deletion the learner made (the repertoire and library stores
  note it), so an item lost to a damaged save comes back instead; a whole study gone is recreated;
  an unreadable study or chapter decides nothing.
  Unlinked items are matched to identical chapters by moves, name and side (after a reinstall or an
  import), otherwise sent or brought in. Chapters are imported in batches named by their
  `ChapterName` tags; afterwards the touched studies are read again so each link remembers Lichess's
  own version, and a new study's empty first chapter is deleted. Names are sent as Lichess will
  keep them (`lichessNames.ts` ports lila's `fullCleanUp` for study names and `softCleanUp` for
  chapter names, with their 100- and 80-character cuts), so a name never comes back changed. A list nothing changed in is not
  read: the study stamps and the links decide that.
- **Runs** (`sync.ts`). Send results, send games, read the history, read games (first sync, then
  twice a day or on _Sync now_), reconcile studies, refresh the ratings (and take the puzzle rating).
  One run at a time per tab (a call meanwhile makes one more run follow) and per profile across tabs
  (Web Locks, when the browser has them). A part that fails without stopping the run is noted in the
  report; offline, signed-out, rate-limited and server failures stop it with everything kept, and a
  timer tries again. `startLichessSync` (loaded by `PlatformHooks` only while an account is connected)
  runs it 3 s after start, on `online`, on coming back into view, 30 s after results start to wait and
  every 15 minutes in view. A sign-in marked as refused is looked at again once as the app opens
  (`recheckSignIn`): when `/api/token/test` still knows the token, for this account and with all four
  scopes, the mark goes and the sync starts.
- **Tests.** `src/test/fakeLichess.ts` is a stand-in lichess.org that answers as lila does (the OAuth
  flow with an approval page, puzzle batches and history, imports and their export, studies with the
  64-chapter limit, the empty first chapter, the import that stops at the first chapter it cannot
  take, and the sharing setting a study's own export checks). The unit tests reach it through a
  `fetch` stub, the end-to-end tests through page routes.

## Accessibility

- Every `Board` derives a plain-language description of the last move from consecutive positions
  (`components/board/announce.ts`: "White knight takes pawn on f7, checkmate.") and announces it in a
  visually hidden `aria-live` region, so no feature has to report its own moves. The move is replayed on
  the previous position and that account is used only when it really produces the new one; otherwise
  (stepping back, a jump, a new puzzle) the move is described from the shown position alone, and a
  position change with no last move is announced as "New position". Statuses are live regions too;
  the engine lines are not (they change many times a second) — the top line is announced once when a
  search finishes. The eval bar is a `role="meter"` that reads "No evaluation" until a score arrives and
  keeps the last score, marked stale, between searches; the evaluation graph is a `role="slider"`.
- The keyboard shortcut reference (`src/app/shortcuts.ts`, opened with `?`) is the single source of
  truth for the `keydown` handlers in the feature pages. Every page reads keys through
  `src/lib/shortcutKey.ts`: case-insensitive, never with a modifier, never from a field, a dialog or
  the board, and — with `pageShortcutKey` / `characterShortcutsOn` — no single-character shortcut
  at all when the learner turns them off in Settings (WCAG 2.1.4); Enter, Space and the arrows are
  not character keys and keep working.
- The shell moves focus to `<main>` after in-app navigation (not when only the hash or the search
  changed) and `<ScrollRestoration>` starts each new page at the top while back/forward restore the
  old offset; `html { scroll-padding }` keeps focused controls clear of the sticky header and bottom
  bar. Dialogs use the native `<dialog>` element (focus trap, Escape, inert background), carry a close
  button whenever they are dismissible, scroll internally when tall and lock the page behind them;
  `ConfirmDialog` is the one shape for "are you sure?", cancel first and the action last. Toasts live
  in a permanent `aria-live` region (danger ones are alerts), show their tone as an edge colour and an
  icon, and move into an open dialog so they stay reachable. The "More" navigation is a disclosure
  over plain lists of links, not an ARIA menu. Focus is an opaque 2px outline with a halo in the page
  colour; `@media (forced-colors: active)` redraws switches, segments, progress and focus with system
  colours.
- `useReducedMotion()` turns Chessground animation off under `prefers-reduced-motion`; the CSS does the
  same for transitions. The high-contrast board palette uses Okabe–Ito highlight colours, and the text
  tokens are chosen to meet WCAG AA contrast on every surface.

## Compatibility

Three things are promised from 0.9 on, and `src/store/compatibility.test.ts` holds the fixtures that
keep the promise honest:

- **Backups.** `exportState` writes `{ app, version, progress, repertoire, analyses, games }` (format
  9: since 0.16 a game record may come from the human-like opponent, with its rating); `validateBackupFile` checks every field of every part against the schemas in `backupSchema.ts`
  (strict: a field of the wrong type refuses the file by name, damaged list entries are dropped and
  counted, unknown keys are dropped, actions can never be overwritten), `importState` applies all four
  parts only after every one passed, fills in the fields invented since (`withRatingDefaults` derives
  the Glicko-2 deviation from the old Elo history, theme statistics and lifetime counters are rebuilt
  from the attempts, game records get ids and sources) and returns `{ ok, summary }` or
  `{ ok: false, reason }`. A newer format imports with a warning. When the export version changes, add
  a fixture for the previous one; never edit an old fixture. The compatibility test imports every
  fixture and also rehydrates `{ state, version }` blobs of every store through `persist.rehydrate()`.
- **Stored state.** The persisted stores carry a version and a `migrate` step; an update never
  resets progress, and a newer save loaded by an older build keeps its unknown fields.
- **Share links.** `#z=` (a deflated PGN), `#rep=` and `#wp=` are decoded from fixed strings made by
  earlier versions.

Local storage is wrapped once (`src/lib/persistStorage.ts`): a write refused for lack of space is
caught, recorded per key in `useStorageHealth` and reported once, so the stores never throw into the
UI; as soon as a write fits again every registered store is saved again (`repersistAll`) and the
warning gives way to a confirmation.

## Testing strategy

- **Unit (Vitest + jsdom):** pure logic (UCI parsing, rating, selection, review grading, stores) and
  hook state machines via `renderHook`.
- **Content tests:** every lesson position and task, every repertoire line, every classic game, every
  endgame study (including the scripted replies after every accepted alternative), every drill position
  and every threat-drill position (the threat after a pass, its line, the defences and the game move)
  is validated for legality (and mate claims) on every test run; the generated lesson index must match the
  lesson content.
- **E2E (Playwright):** smoke and feature tests against the production build on desktop and mobile
  viewports, including real engine replies, clocks, the variation tree, the board editor, Puzzle Rush,
  drills, the repertoire trainer, guess-the-move, service-worker registration, game review with the
  evaluation graph, playing from a FEN, game import with mocked Lichess/chess.com responses, the review
  queue, the daily plan, own-game puzzles, bookmarks, My games (mocked APIs, paging, deviations, batch
  review), courses, lesson recall, endgame studies, two-player and blindfold games, the recall drill,
  keyboard board control, shareable links, the settings, the accessibility features, the arcade games,
  blind puzzles, the threat drill, the blunder check and self-analysis through to its score, the
  small-phone layout, threads by default and the full engine's download (which need the real service
  worker, so they only run against the built app), and the human-like opponent: its download, a game
  with its real replies, its record on Progress, a game played offline from the stored copy after a
  reload (online in WebKit, which Playwright cannot start a worker in while offline), Delete in
  Settings, and a game in a cross-origin-isolated page.
- **Accessibility sweep (axe-core):** `e2e/axe.spec.ts` audits every page — the top-level ones and
  one of each parameterised route — in all three colour schemes, against WCAG 2.1 A/AA, and fails on
  any violation (the chessground board and the transient toasts are excluded). It sees each page as
  it first renders; states reached by playing are covered by the release specs' own axe checks.
- **Browsers.** CI runs four Playwright projects in parallel jobs: the whole suite on desktop and
  mobile Chromium, and the shell, engine, arcade, settings, lab, small-phone, accessibility and
  release specs on Firefox and WebKit. A local `npm run e2e` runs the two Chromium projects;
  `ALL_BROWSERS=1` adds the other two. CI allows two retries; the nightly run sets
  `PLAYWRIGHT_FAIL_ON_FLAKY=1`, so a test that needed one fails it.
- **Production path.** One CI job builds with `VITE_BASE_PATH=/chess-trainer/` and runs
  `e2e/release-0-12-meta.spec.ts` (every URL in it relative) behind `scripts/serve-dist.mjs`, which
  answers like GitHub Pages: `404.html` with a 404 for a deep link. The same spec checks the footer
  credits and licence files, that the app runs without a Content-Security-Policy violation (engine
  included) and the service worker's frame policy.
- **Coverage.** `npm run test:coverage` (CI) fails below the floor in `vite.config.ts`; lesson data,
  the generated lesson index, fixtures and the service-worker entry are left out of the figures.
- **Build scripts** have unit tests next to them (`scripts/**/*.test.ts`, run in Node): the static
  server, the post-build step, the engine runner (a fake engine that exits mid-search must reject the
  search), the engine version record, the release check, the CI path filter, the opening data's
  provenance and the Content-Security-Policy, recomputed from `index.html`. The human-like opponent's
  pins are checked against `src/sw/maiaFiles.ts` and the installed runtime, and
  `scripts/maia-model.test.ts` runs the real model in Node through the app's own modules — the
  openings people play at each rating, a hanging queen taken, promotions for both colours, whole games
  of legal moves at 600, 1500 and 2600, and the very scores the three browsers computed — whenever
  `npm run maia:setup` has installed it (CI's quality job does).
- **Budgets.** `scripts/check-bundle-size.mjs` fails the build when a gzipped chunk, the start-up
  code (the entry chunk plus what it imports statically, React aside) or the precache outgrows its
  limit; `scripts/lighthouse.mjs` audits five pages against floors for accessibility,
  best practices and SEO, a layout-shift ceiling and a performance floor.
- **Visual snapshots.** `e2e/visual.spec.ts` compares the static pages pixel by pixel on desktop and
  phone (baselines in `e2e/visual.spec.ts-snapshots/`, regenerated with `--update-snapshots` after a
  deliberate design change); the CI job blocks a merge.
- **Dead code.** `npm run lint:dead` (knip, configured in `knip.json`) fails on files nothing imports,
  exports nothing uses and dependencies that are missing from or unused in `package.json`. A
  module that is loaded by path at build time (the lesson index generator) is listed as an entry.
- **Stylesheet scope.** Pages are code-split and so are their stylesheets, so a class defined in
  one page's CSS does not exist until that page has loaded. `src/styles/cssScope.test.ts` follows
  each lazily loaded page's static imports and fails if a component uses a class defined only in a
  stylesheet that page does not load. Styles shared by several pages belong in `ui.css` or
  `global.css`; a component that has its own rules imports its stylesheet itself.
- **The test lab** (`src/features/lab/`) is for the checks no automation covers: sounds, haptics,
  installs and the feel of a real device.
- **Engine verification:** `npm run lessons:verify` checks every lesson task against Stockfish (the
  accepted moves must be mate, keep a decisive win, or stay within 80 cp of the engine's choice) and
  every scripted reply; `npm run drills:verify` confirms the drill positions are won/drawn as claimed
  (it loads the drills through Vite and fails unless every drill is accounted for);
  `npm run studies:verify` walks every study ply by ply (accepted moves keep the goal, the alternatives
  that are not listed lose it); `npm run repertoires:verify` scores every move of every built-in
  repertoire against the engine's best at depth 14 (a learner move may lose at most 120 cp, an
  opponent move 300); `scripts/verify-puzzles.mjs --engine` spot-checks puzzles. The **Content**
  workflow runs the first four whenever the content or the checks change, and weekly. The Node-side
  engine (`scripts/lib/node-engine.mjs`) copies the WASM build into a temp directory of its own per
  process and rejects pending requests if the engine process exits.

## Non-goals (for now)

- An account or a sync server of the app's own. Cross-device sync goes through the learner's Lichess
  account (above); backups cover the rest (lessons, flashcards, review schedules, settings).
- Human vs human over the network — needs a relay; two people at one device can play on the Play page.
