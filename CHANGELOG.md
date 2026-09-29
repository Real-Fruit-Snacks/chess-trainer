# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Added

- Interactive lesson curriculum (21 lessons across beginner, intermediate and advanced levels) with
  engine-verified positions and per-step progress tracking.
- Puzzle trainer with 4,000 bundled Lichess puzzles, rating-aware selection, an Elo-style rating,
  daily puzzle, practice by theme, hints, solutions and day streaks.
- Play against Stockfish 19 (WASM) at eight strength levels with take-backs, hints, resignation,
  PGN export and hand-off to the analysis board.
- Analysis board with multi-line evaluation, evaluation bar, FEN/PGN import and one-click game
  review (accuracy, inaccuracies, mistakes, blunders, better moves).
- Progress page with rating history chart, statistics, recent puzzles/games, settings and JSON
  export/import.
- Progressive Web App: manifest, icons, offline precaching of the whole app (engine and puzzles
  included), install prompt, update notifications.
- GitHub Actions workflows for CI (lint, typecheck, unit + e2e tests, build) and GitHub Pages deployment.
