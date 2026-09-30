# Contributing

Thanks for helping make chess more approachable. This document explains how the project is organised
and what we expect from a change.

## Development setup

```bash
git clone https://github.com/Real-Fruit-Snacks/chess-trainer.git
cd chess-trainer
npm install
npm run dev
```

`npm run dev` downloads the pinned Stockfish build into `public/engine/` on first run (about 2 MB) and
starts Vite with hot reload. Node 22 or newer is required (see `.nvmrc`).

Before opening a pull request run:

```bash
npm run check        # lint + typecheck + unit tests + production build
npm run e2e          # optional, needs: npx playwright install --with-deps chromium
```

CI runs the same checks plus a formatting check (`npm run format:check`) and the puzzle data validator.

## Project layout

```
src/
  app/          shell, routing, PWA registration, theme
  chess/        chess.js helpers and the useChess hook (pure logic, well tested)
  engine/       UCI worker client, strength levels
  components/   board wrapper, chess widgets, generic UI primitives
  features/     one folder per page: home, learn, puzzles, play, analyze, progress
  store/        persisted settings and progress (zustand)
  lib/          rating maths, dates, PRNG
scripts/        engine download, puzzle import/verification, icon rendering
public/         static assets: engine (downloaded), puzzles (committed), icons
e2e/            Playwright smoke tests against the production build
docs/           architecture and content guides
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design of each part.

## Kinds of contributions

### Lessons and content

The most valuable contributions. Lessons live in `src/features/learn/lessons/` as plain data; the
[content guide](docs/CONTENT_GUIDE.md) explains the format, the positions rules and how to verify a
position with the engine. Every lesson is validated by `lessons.test.ts` — run `npm test` and it will
tell you if a FEN is illegal, a task move is impossible, or a "mate in one" is not actually mate. After
adding a lesson run `npm run lessons:index` (the Home and Progress pages read a generated index) and
`npm run lessons:verify` (Stockfish checks every task). Endgame studies (`src/features/studies/`),
courses, drills, repertoires and classic games follow the same pattern; `npm run studies:verify` and
`npm run drills:verify` are their engine checks.

### Puzzles

The bundled set is generated, not hand-written. To change it (more puzzles, different filters), edit
the options of `scripts/import-lichess-puzzles.mjs`, re-run it, then run `npm run puzzles:verify`
(add `--engine 40` for an engine spot-check) and commit the regenerated `public/puzzles/`. Keep the
total under ~2 MB so the offline precache stays small.

### Code

- Keep logic out of components: hooks (`useX`) own state machines, components render them.
- Anything with rules (rating maths, puzzle selection, UCI parsing, task judging) needs unit tests.
- Prefer no new runtime dependencies; the bundle is intentionally small.
- Accessibility matters: every interactive element is keyboard reachable, status changes are announced
  through `role="status"`, and the layout works from 360 px wide upwards.
- Follow the existing style — Prettier and ESLint enforce most of it (`npm run lint:fix`, `npm run format`).

### Translations

The UI strings are currently in English only and live next to the components. If you want to add a
language, open an issue first so we can agree on an approach (likely a small message catalogue) before
you spend time on it.

## Pull requests

- One topic per PR; small PRs are reviewed faster.
- Fill in the PR template, including screenshots for visual changes.
- Add or update tests, and keep `npm run check` green.
- By contributing you agree that your work is licensed under GPL-3.0-or-later like the rest of the project.

## Reporting problems

Use the issue templates. For a bug in a position (engine disagrees, wrong solution, illegal move),
include the FEN or the puzzle ID shown in the "About this puzzle" panel.

## Code of conduct

Be kind and constructive. We follow the [Contributor Covenant](CODE_OF_CONDUCT.md).
