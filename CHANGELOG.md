# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.7.0] - 2026-09-30

### Added

- **Endgame library, three times the size.** Forty-one endgame drills, every position engine-verified:
  pawn endings (the square of the pawn, key squares, connected and outside and protected passed pawns,
  triangulation, the breakthrough, Réti's manoeuvre), rook endings (rook against a pawn from both sides,
  cutting off the king, the short-side and back-rank defences, rook and two pawns, rook against bishop and
  against knight), queen endings (against knight pawn, bishop or rook pawn, knight and bishop) and minor
  pieces (the right and the wrong bishop, knight against a pawn, bishop against two pawns, opposite
  bishops with split pawns), plus the two-rook ladder mate. The **endgame ladder** orders them as rungs,
  tracks what is climbed, links each to its theory lesson and feeds the daily plan.
- **Engine ladder** on the Play page: which levels you have beaten, the next rung with a one-click game,
  a step down after three straight losses, and results per level on the Progress page.
- **Opening practice games.** _Practise vs engine_ from any repertoire: the opponent follows the
  repertoire's lines (weighted towards the moves you know least), the engine takes over when the book runs
  out, and leaving the book pauses the game with a take-back and a lapse in the review queue.
- **Puzzles by opening.** Every puzzle carries its opening; practise the tactics of a family or variation,
  from your repertoires' openings, or from the daily plan's "Tactics from the …" item.
- **Insights from your games.** Reviews are digested into phases, mistake types, colours, openings and
  engine levels; the _Work on_ list turns the biggest gaps into lessons and puzzle themes.
- **Position report** on the analysis board: material, pawn structure, king safety, open files, outposts
  and loose pieces, with plans for both sides and lesson links; hovering highlights the squares.
- **Woodpecker sets.** A fixed set of 50, 100 or 200 puzzles solved in spaced cycles, with time and
  accuracy per cycle and the improvement spelled out.
- **Mating patterns.** A gallery of the nineteen named mates (Anastasia's, Arabian, back-rank, Balestra,
  blind swine, Boden's, corner, double bishop, dovetail, epaulette, hook, kill box, Morphy's, Opera,
  Pillsbury's, smothered, swallow's tail, triangle, Vuković), each a minimal engine-checked diagram with
  what to look for, a link to the library's puzzles of that shape, and a drill that runs through them.
- **Twelve lessons:** attacking the fianchetto, defending the Greek gift, bishop endgames, pawn endgames
  III, the bishop-and-knight mate, queen versus rook, rook and bishop versus rook, Catalan and Queen's
  Gambit plans, French structures, exchange sacrifices II, calculation III and "when there is nothing to
  do" — 72 engine-verified tasks, in new course units.
- **Sixteen classic games** from Légal's mate and the Immortal Draw to Réti–Alekhine, Torre–Lasker,
  Capablanca–Tartakower, Botvinnik–Tal 1960 and Karpov–Unzicker, with **era, difficulty and played
  filters**.
- **Analysis library.** Save an analysis under a name and a collection, reopen, rename, share or delete
  it; a pasted Lichess study export saves every chapter as a collection.
- **Share links** for repertoires and Woodpecker sets: the whole thing travels compressed in the link.
- **Profiles.** Several learners on one device, each with their own progress, repertoires, games and
  library; switch from the Progress page.

### Changed

- **Icons instead of emoji** throughout the interface (navigation, feature cards, difficulty stars,
  move-list controls, theme toggle).
- **Board coordinates** moved off the squares into a gutter beside and below the board: rank numbers
  down the left, file letters along the bottom, each centred on its square, never under a piece and
  readable on every theme. The eval bar lines up with the playing surface.
- Endgame drills show the position you are about to play behind the Start card instead of the
  initial position.
- The "Install app" button uses an icon instead of a text glyph; the pawn (Play) and knight icons are
  redrawn.
- The daily plan's drill picks the next rung of the endgame ladder; the Drills page shows rungs and
  per-group progress; each drill page links to the theory lesson and the next rung.
- The nine mating-pattern themes that had no name are now named and described in the puzzle catalogue.
- Backups (export version 5) include the analysis library.
- Updates reach returning visitors sooner: the app checks for a new build whenever it comes back
  into view and loads a ready update at the next in-app navigation, not only on a reload.
- Pushing a version tag publishes a GitHub release with the changelog notes.

### Fixed

- Clicks on the board are mapped against its current position: after a scroll or a layout shift
  above the board a click could land on the wrong square.

## [0.6.0] - 2026-09-30

### Added

- **48,000 puzzles.** Six times more tactics, sampled 6,000 per rating band with the ids of the previous
  set kept so histories and review queues stay valid. Puzzles are served in chunks of 500: the first chunk
  of every band is precached and the rest are cached as they are used, or all at once with _Settings →
  Download every puzzle_ (with progress, cancel and a status that survives reloads).
- **Move commentary.** Game review explains every judged move in words — hanging pieces (static exchange
  evaluation), forks, pins and skewers, discovered checks, missed and allowed mates, what the best move
  would have won — each with a link to the lesson and the puzzle theme; key moments carry a one-line why.
- **Coach mode.** Untimed games against the engine pause after a mistake or blunder (or any missed or
  allowed mate) with the same explanation, the lesson link and a take-back; the engine's reply waits.
  On by default for new games, switchable in the setup and in Settings.
- **Opening explorer** (opt-in, network): what masters or Lichess players play in the current position,
  with results and top games, on the analysis board and in the repertoire explorer. Clicking a move plays
  it.
- **Repertoire building.** _Add line to repertoire_ on the analysis board merges the current line into a
  custom repertoire or starts a new one; custom repertoires have an _Edit lines_ mode with a movable board,
  explorer suggestions, per-move notes, "make main line" and "delete from here".
- **Twelve lessons:** knight endgames, rook against a pawn, passed pawns in the middlegame, bishop
  against knight, the initiative, transitions into the endgame, defending worse positions, zwischenzug and
  quiet moves, plans in the Sicilian, plans in the King's Indian, practical play and the clock, attacking
  with opposite-coloured bishops — 66 new engine-verified tasks, many from Lichess games, in new course
  units.
- **Six repertoires:** Ruy Lopez, Vienna, Alapin, Nimzo-Indian, King's Indian and Najdorf. Every learner
  move in all sixteen repertoires was checked against the engine; the flagged lines in five older
  repertoires were repaired.
- **Fifteen classic games:** Lasker–Thomas, Levitsky–Marshall, Réti–Bogoljubov, Bernstein–Capablanca, the
  Immortal Zugzwang, Adams–Torre, Alekhine–Nimzowitsch, Paulsen–Morphy, Zukertort–Blackburne,
  Spassky–Bronstein, Robert Byrne–Fischer, Fischer–Benko, Botvinnik–Portisch, Petrosian–Spassky 1966 and
  Deep Blue–Kasparov.
- **Placement quiz** (`/placement`): five questions and three positions produce a recommended course,
  first lessons, puzzle themes to practise and a starting rating for the calibration run.
- **Device transfer.** Share a backup straight to another device (Web Share API) where supported; the
  installed app opens `.json` backups from the file manager and imports them; a reminder appears after 40
  rated puzzles or two weeks without a backup, and Settings shows the last backup date.
- **App icon badge** with the number of due reviews (puzzles, lesson recall and repertoire moves), with a
  setting.
- **Haptic feedback** on moves, solves and mistakes on phones (setting).
- **Layouts** for phones held sideways (board and panel side by side, compact chrome) and for notches and
  rounded corners (safe-area insets).

### Changed

- Settings gained `haptics`, `appBadge`, `playCoach`, `explorer`, `explorerDatabase`, `lastBackupAt` and
  `lastBackupAttempts` (defaults merged into existing saves); the progress store gained `placement`.
- Reviewed moves keep the position, the best line and the reply line so they can be explained.
- The repertoire explorer follows a path of moves rather than the tree cursor, so edits do not lose the
  place.
- The calibration run can start from a given rating (used by the placement quiz).
- Engine verification (`NodeEngine.analyse`) caps every search at 90 seconds and each lesson task gets
  five minutes, so a position with a long forced mate no longer times out and throws the rest of the run
  out of step.
- "Download every puzzle" retries a chunk that fails to download (three attempts with a short pause),
  waits for the service worker to finish writing the cache before reporting, and says how many files
  are missing if some could not be stored.
- E2E: the review-queue test reads the first puzzle chunk; the my-games test expects the Caro-Kann
  deviation now that 3. Bb5 follows the Ruy Lopez repertoire.

## [0.5.0] - 2026-09-30

### Added

- **Glicko-2 puzzle rating.** The rating now carries an uncertainty (shown as "± 60" everywhere it
  appears) and a volatility, and is updated with the system Lichess uses, verified against the worked
  example in Glickman's paper. The puzzle's own rating deviation from the Lichess data weights each
  result.
- **Calibration run.** New learners can let twelve rated puzzles find their level instead of guessing it
  (a self-assessment is still available and starts less uncertain); the Progress page can restart a
  calibration at any time.
- **What an attempt is worth** now depends on how it went: hints cost credit according to what they
  revealed (the piece: 0.6, the whole move: 0.25), a solve that was slow for the puzzle's size and
  difficulty earns less (never below 0.75), and a puzzle seen before applies only a quarter of its
  update.
- **Inactivity.** The deviation grows during breaks (a settled rating becomes provisional again after
  about a year away), so a returning learner's first solves count more.
- **What the rating means.** A Progress card converts the puzzle rating into rough Lichess, chess.com
  and FIDE ranges (±150), with the caveats spelled out; the FAQ explains the ± figure.

### Changed

- The puzzle rating is consistently called a *puzzle* rating; "provisional" now means the deviation is
  at least 110 rather than "fewer than 30 rated puzzles".
- Progress store version 5 and export version 4: older saves and exports get a deviation derived from
  how many rated puzzles their Elo rating had seen, and the last rated time from the rating history.
- Attempts record the hint level and the Glicko score they were worth.

### Removed

- The Elo K-factor schedule (`updateRating`, `kFactor`, `PROVISIONAL_GAMES`).

## [0.4.0] - 2026-09-30

### Added

- **Puzzles from your own games:** every mistake or blunder found by a game review (Analyze or My games)
  can become a puzzle — one click per moment or "Add N as puzzles" for the whole game — and a new
  **Mine** mode on the Puzzles page drills them; solved and failed ones follow the 1-3-7-14-30 review
  schedule. Any puzzle can be **bookmarked** (☆) into the same queue.
- **My games** (`/games`): import games from Lichess or chess.com (time control, colour and rated
  filters, "load older games"), or paste a PGN; an overview of results, **opening statistics** per colour
  by family, a **repertoire tab** that shows where you or your opponents left the lines you study
  (deviated / opponent left / in book, with "study line" and "analyze position" links), one-click
  **review of every game** in a batch, and "add as puzzles" for the mistakes found.
- **Home:** the daily plan adapts — it targets your weakest puzzle theme when the accuracy drops below
  70 %, rotates through every drill, and adds due lesson recalls; the current course and its next item
  are shown.
- **Progress:** a **weekly summary** (puzzles, accuracy, lessons, games, drills, training days, rating
  change against the previous week) and an **engine diagnostics** panel (build in use, WebAssembly, cores,
  isolation, service worker) with a "Test the engine" speed check.
- **Courses:** First steps, Club player and Strategy & calculation — guided paths of lessons, drills,
  puzzle and repertoire targets, engine games and classic games, with units that unlock in order and a
  "Continue" button that goes to the next item.
- **Lesson recall:** three days after finishing a lesson its tasks come back as recall cards
  (`/learn/recall`); a miss brings the card back sooner and "reread the lesson" jumps to the step.
- **Learn:** eight lessons — pawn endgames II (breakthrough, outflanking, the spare tempo), rook endgames
  III (cutting the king off, checking from behind, Vancura), how to study openings, good and bad bishops,
  opposite-side castling (with Karpov–Korchnoi 1974), converting an extra pawn, candidate moves and
  elimination (Réti–Tartakower and Marshall's Qg3), and planning from the pawn structure (hanging pawns
  and the Maróczy Bind) — 33 engine-verified tasks, all placed in the courses.
- **Endgame studies** (`/studies`): eight composed positions with a single solution — Réti's king walk,
  the Saavedra position, the classic breakthrough, knight underpromotion, one pawn down, the rook's
  last trick and two only-move king endings — solved move by move with hints, notes after every move,
  "play it out" against the engine and a record of clean solves. Every line is verified by
  `npm run studies:verify`.
- **Guess the position** drill: the opening of a famous game as text, an empty board, and three questions
  about where the pieces stand now (captures, castling and en passant included).
- **Play:** **two players at one device** (the board can turn towards the side to move; the side to move
  resigns; games are not counted as engine games) and **blindfold** play with a peek button and a peek
  counter.
- **Classic games:** Capablanca–Marshall 1918 (the Marshall Attack), Lasker–Capablanca 1914,
  Short–Timman 1991 (the king walk) and Fischer–Spassky 1972, game 6.
- **Openings:** French Defence and English Opening repertoires.
- **Keyboard board control:** Tab to any board, move a square cursor with the arrow keys, select a piece
  and its destination with Enter, clear with Escape, or type a square name to jump to it; a visually
  hidden "Describe position" button reads the whole position out. The shortcuts dialog lists it.
- **Shareable links:** "Copy link" on the analysis board puts the game (deflated) or the position in the
  URL fragment — `/analyze#z=…&ply=N` — so nothing is sent anywhere and the link opens at the same move.
- **Appearance:** an original **Letters** piece set (high legibility on small boards) and a **soft**
  sound theme.

### Changed

- The lesson content is no longer loaded on the Home, Progress and course pages: a generated index
  (`src/features/learn/lessonMeta.ts`, `npm run lessons:index`, run before every build) carries the
  titles and lengths, which keeps ~55 kB of gzipped JavaScript off the first page load.
- Toasts stay in the bottom-right corner on wide screens so they never cover the board.
- Interactive boards expose `role="application"` with a description; view-only boards stay images.
- The "My games" and "Endgame studies" pages are in the More menu; the Play page header describes both
  opponents.
- Progress export version 3 (adds own puzzles, lesson recall and study results); the store migrates
  older saves.

### Fixed

- A reply animation could swallow the next click on the board in the studies e2e flow; the tests now
  dismiss toasts and wait for the animation.
- `useNow()` re-reads the clock when the review queue changes, so due counts update immediately after a
  bookmark or a solve.
- Opening a shared game at a given move no longer depends on stale tree state (`loadPgn(pgn, atPly)`).

## [0.3.0] - 2026-09-29

### Added

- **Game review:** an evaluation graph (click or use the arrow keys to jump to any move), a list of key
  moments (the biggest mistakes, one click away), a choice of review depth with a time estimate, and a
  "retry from here against the engine" link on every reviewed move.
- **Play from any position:** start a game from a FEN (`/play?fen=…`), from any position on the analysis
  board, from a lesson diagram, from a solved puzzle or from a moment of a reviewed game. Custom starts show
  the correct move numbers and hide the material count.
- **Import games:** paste or open a PGN with several games and pick one, or fetch the most recent games of
  a Lichess or chess.com player by username (public APIs, nothing uploaded; usernames are remembered).
- **Puzzle review queue:** missed puzzles (rated, themed, daily or rush) come back after 1, 3, 7, 14 and 30
  days; a hint keeps the card on its step. The Puzzles page shows the due count, the Progress page counts
  the queue and the daily plan includes it.
- **Home:** a first-run tour, a daily plan (daily puzzle, five rated puzzles, review queue, opening reviews,
  the next lesson and a drill) and a training-day streak across every activity.
- **Learn:** eight lessons — the isolated queen's pawn, outposts and weak squares, the minority attack,
  fortresses and zugzwang, rook against a minor piece, queen endgames, attacking the uncastled king and
  visualisation — with 27 engine-verified tasks.
- **Drills:** Vancura, wrong bishop (hold), bishop and knight in the wrong corner, queen vs rook and queen
  vs pawn (win the last piece); a blindfold mode for the board-vision drills.
- **Classic games:** Byrne–Fischer (the Game of the Century), Botvinnik–Capablanca, Karpov–Kasparov 1985
  (the Octopus Knight) and Kasparov–Topalov.
- **Openings:** King's Indian Attack and Slav Defence repertoires.
- **Multi-threaded engine (experimental):** a hand-written Workbox service worker (`src/sw.ts`) that can add
  the COOP/COEP headers itself, so the pthreads Stockfish build runs on GitHub Pages when the learner opts
  in; the thread count is shown in the analysis status line and the app falls back to the single-threaded
  build automatically.
- **Accessibility:** every move is announced to screen readers, a keyboard-shortcut reference (`?`), focus
  moves to the new page after navigation, a colour-blind-safe high-contrast board theme (Okabe–Ito
  highlights), `prefers-reduced-motion` disables board animation, and text colours meet WCAG AA contrast.

### Changed

- The review queue keeps the last card on the board until "Next" so the solution can be studied.
- Tall dialogs scroll inside the dialog instead of pushing the title off screen.
- Game review depth is a setting (fast / balanced / thorough).
- Endgame drill positions are checked in CI to be legal and to not start in check.

### Fixed

- Two lesson tasks that Stockfish rated below the accepted tolerance at depth 18: the queenside
  castling example now uses a Sicilian Yugoslav Attack position where O-O-O is the best move, and the
  Blackburne Shilling "decline the bait" task no longer accepts c3.
- The threaded engine's worker scripts are served with the isolation headers too (a dedicated worker
  must be at least as isolated as the page that spawns it).

## [0.2.0] - 2026-09-29

### Added

- **Play:** clocks with bullet, blitz, rapid and classical time controls (loss on time, engine think
  time capped by its remaining time, low-time warning), keyboard move entry, "show threat", automatic
  level suggestions after two wins or two losses in a row.
- **Analysis:** full variation tree (play a move from anywhere to create a variation; promote, delete,
  annotate with glyphs and comments; PGN export with variations), keyboard navigation, ECO opening names,
  board editor with position validation, PGN download, optional Lichess tablebase lookups (off by default).
- **Puzzles:** Puzzle Rush (3-minute and survival modes), per-theme accuracy with a strengths and
  weaknesses report on the Progress page, and a puzzle set doubled to 8,000 (1,000 per rating band).
- **Drills:** coordinate trainer, piece-movement / find-every-capture / find-every-check drills, and
  checkmate and endgame drills (KQ, KR, two bishops, bishop and knight, king and pawn win and hold,
  Lucena, Philidor) played against the full-strength engine with automatic adjudication and best results.
- **Openings:** repertoire trainer with six built-in repertoires (Italian, London, Queen's Gambit,
  Caro-Kann, Queen's Gambit Declined, Scandinavian), custom PGN import, SM-2 spaced repetition, an
  explore mode and due/learned statistics.
- **Classic games:** guess-the-move for seven annotated masterpieces with engine grading of alternatives.
- **Learn:** fourteen new lessons (draws and how games end, opening traps, trading pieces, pawn races,
  minor-piece endgames, opposite-coloured bishops, queen vs pawn, rook endgames II, the active king,
  building a repertoire, space and pawn breaks, the exchange sacrifice, the bishop pair, analysing your
  games); every lesson task is now verified against Stockfish by `npm run lessons:verify`.
- **Reference:** rules of chess, notation (SAN, PGN, FEN, engine evaluations), searchable glossary and FAQ.
- Sound effects (synthesised, no audio files), a settings switch for them, and a redesigned navigation
  with a "More" menu on desktop and a bottom sheet on phones.

### Changed

- Progress export now includes the opening repertoire data; importing an older export still works.
- The Home page presents all sections; the Progress page has a training summary card.

### Fixed

- Two beginner lesson positions where the taught move was objectively poor (the examples now keep the
  balance so the engine agrees with the lesson).

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
