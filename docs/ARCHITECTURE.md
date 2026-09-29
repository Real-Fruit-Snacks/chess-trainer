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
│  ├─ features/learn     lessons (static TS data) ── useLessonStep       │
│  ├─ features/puzzles   puzzleService ── usePuzzleTrainer               │
│  ├─ features/play      usePlayVsEngine ──┐                             │
│  ├─ features/analyze   useAnalysis ──────┤ EngineClient ──▶ Web Worker │
│  └─ features/progress  charts, settings  │   (UCI over postMessage)    │   Stockfish WASM
│                                          │                             │
│  store/ (zustand + localStorage)         │  components/board/Board     │
│     settings · progress                  │   (Chessground wrapper)     │
│                                                                        │
│  Service worker (Workbox) ── precaches app shell, engine, puzzle JSON  │
└────────────────────────────────────────────────────────────────────────┘
        ▲ static files only
┌───────┴───────────────────────┐
│ GitHub Pages (dist/)          │
│  index.html, 404.html, assets │
│  engine/*.wasm, puzzles/*.json│
└───────────────────────────────┘
```

## Build and deployment

- **Vite + React 19 + TypeScript**, strict settings (`noUncheckedIndexedAccess`, no non-null assertions).
- Each feature page is a lazily loaded chunk (`src/app/routes.tsx`), so the first paint only needs the
  shell (~70 kB gzipped including React and Chessground).
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

### Why single-threaded

Multi-threaded WASM needs `SharedArrayBuffer`, which needs `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` headers. GitHub Pages cannot set headers. A service-worker shim can
inject them, but it is fragile across browsers and unnecessary here: the single-threaded lite build
reaches depth 18–20 in a few seconds on a laptop.

## The board (`src/components/board/`)

`Board.tsx` wraps [Chessground](https://github.com/lichess-org/chessground), the board used by
Lichess. The instance is created once per mount and reconfigured through `api.set()` on prop changes,
which keeps piece animations intact. `viewOnly` is the only creation-time prop (it changes which DOM
events Chessground binds), so toggling it recreates the board. Board colours come from a CSS variable
holding an SVG data URI generated in `boardThemes.ts`; piece sprites are Chessground's cburnett set.

The board is deliberately "dumb": it reports `onMove(from, to)` and renders whatever `fen`, `dests`,
`shapes` and highlights it is given. All rules live in hooks built on chess.js.

## Chess state (`src/chess/`)

- `helpers.ts` — pure functions: legal destinations for Chessground, UCI/SAN conversion, promotion
  detection, game status, material.
- `useChess.ts` — owns a mutable `Chess` instance in a ref and publishes immutable
  `PositionSnapshot`s. It also models the **promotion dialog**: `playMove` returns `'promotion'` when
  a piece must be chosen and `resolvePromotion` completes or cancels it.

## Feature state machines

| Hook               | Phases                                                                | Notes                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usePuzzleTrainer` | idle → intro → solving ⇄ replying → solved / failed                   | Lichess semantics: first move is the opponent's; any checkmate is accepted as the final move; outcome reported exactly once; "try again" continues unrated. |
| `useLessonStep`    | reading / awaiting → wrong → awaiting / replying → correct / revealed | Judges SAN against the task (`taskCheck.ts`), plays scripted replies, exposes hint shapes.                                                                  |
| `usePlayVsEngine`  | setup → playing (player turn / engine thinking) → game over           | Engine moves are requested from an effect keyed on the position; take-backs cancel pending searches.                                                        |
| `useAnalysis`      | continuous evaluation of the _viewed_ ply; optional game review       | Truncates the game when a new move is played from an earlier ply (no variation tree, by design).                                                            |

## Persistence (`src/store/`)

Two zustand stores persisted to `localStorage` with versioned keys:

- `settings` — appearance, board theme, engine defaults, puzzle preferences.
- `progress` — onboarding flag, puzzle rating and history, attempts, seen puzzle IDs, streaks, daily
  puzzle state, lesson progress, game records. Capped lists keep storage small.

The Elo-style rating (`lib/rating.ts`) uses a high K-factor for the first 30 rated puzzles so new
users converge quickly. Hints halve the credit for a solve. Theme practice and the daily puzzle are
unrated to keep the rating meaningful.

## Puzzle data pipeline (`scripts/`)

```
Lichess CSV.zst ──▶ import-lichess-puzzles.mjs ──▶ public/puzzles/index.json + b*.json
                    (stream, filter, reservoir sample per band, legality check)
                                        │
                                        ▼
                             verify-puzzles.mjs (CI: structure + legality;
                                                  local: --engine N agreement)
```

Buckets are rating bands (400–799, 800–1099, …, 2600+). The app loads only the buckets around the
user's rating. `index.json` also carries per-theme counts for the practice catalogue.

## Offline and PWA

`vite-plugin-pwa` generates a Workbox service worker that precaches every build asset, the engine files
and the puzzle chunks (~3.6 MB). `registerType: 'prompt'` means a new deploy does not silently replace
the running app; `UpdatePrompt` shows a "Reload" toast instead. `pwa.ts` captures `beforeinstallprompt`
before React mounts and exposes an install button; iOS gets manual instructions because Safari has no
install API.

## Testing strategy

- **Unit (Vitest + jsdom):** pure logic (UCI parsing, rating, selection, review grading, stores) and
  hook state machines via `renderHook`.
- **Content tests:** every lesson position and task is validated for legality and mate claims.
- **E2E (Playwright):** smoke tests against the production build on desktop and mobile viewports,
  including a real engine reply and service-worker registration.
- **Engine verification:** tactical and endgame claims in lessons were checked with Stockfish at
  depth 22–30 during authoring; `scripts/verify-puzzles.mjs --engine` spot-checks puzzles.

## Non-goals (for now)

- Accounts or cross-device sync — would need a backend; `localStorage` export/import covers the basics.
- Human vs human — needs a relay; the Play feature links conceptually to sites that offer it.
- Variation trees in analysis — a linear line keeps the UI simple for learners.
