# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.4] - 2026-10-01

### Changed

- **Repository clean-up.** Dead code is gone: a duplicate move-navigation component, two unused
  chess helpers, two test seams nothing used, a duplicated own-puzzle cap, a few unused constants,
  and the unused Tabs and drill styles. The puzzle
  reindex script is wired up as `npm run puzzles:reindex`, `chrome-launcher` (used by the
  Lighthouse script) is declared instead of relied on transitively, `tsconfig.node.json` no longer
  lists a file that does not exist, and the changelog is formatted like every other document.
- **Dependencies.** The GitHub Actions used by the workflows are on their current majors (checkout
  and setup-node 7, upload-artifact 7, download-artifact 8, configure-pages 6, upload-pages-artifact
  and deploy-pages 5), which also settles the open Dependabot pull requests; `@types/node` is on 26;
  Dependabot groups future Actions updates into one pull request. A transitive `basic-ftp` advisory
  under Lighthouse's Puppeteer is closed with an override to the patched line, so `npm audit` is
  clean again.
- The Lighthouse script now says that nothing is serving the preview instead of auditing a page of
  zeros.

### Testing

- `npm run lint:dead` (knip) fails on files nothing imports, exports nothing uses and dependencies
  that are missing from or unused in `package.json`; it runs in `check` and in CI.

## [0.9.3] - 2026-10-01

### Fixed

- **The placement quiz's options rendered as a run of inline checkboxes** when the quiz was the
  first page opened. Its option styles lived in the Puzzles page's stylesheet, which only loads with
  that page. The same leak affected the narrow onboarding column on the course, recall and study
  pages, the results card in Classics and repertoire training, the games overview, the board column
  of Who Stands Better?, the feedback and action rows of studies, and the engine diagnostics panel
  in the test lab. The shared pieces are now part of the always-loaded stylesheets (a choice list,
  a stat grid, a narrow column and a summary card), and the rest load the stylesheet they need.

### Testing

- A stylesheet-scope test follows every code-split page's static imports and fails if a component
  uses a class defined only in a stylesheet that page does not load, so this cannot come back.

## [0.9.2] - 2026-10-01

### Added

- **Retro sound theme.** A third theme next to Standard and Soft: an 8-bit console's sound chip,
  with square waves for the melody, triangles underneath for body and the noise channel for the
  explosion. A menu blip for a move and two blips for castling, an explosion for a capture, a siren
  pair for check, a power-up run for a promotion, a coin and a rising flourish for a solve, four steps
  down and a buzz for a miss, a four-note cadence for game over, a hurry-up tick for low time and a
  two-note question for a notification. It is level-matched to the standard set, so switching themes
  does not change how loud the app is, and it has its own shorter, buzzier vibration patterns.
- **Volume.** A slider under the sound theme in Settings (and in the test lab) sets the master volume
  in steps of 5 %. It is perceptual — half way sounds about half as loud — and a move plays at the new
  level once the slider settles.
- **A game-over cue for a loss.** Game over now tells a win from a loss: the standard theme plays
  its impact under a major chord for a win or a draw and under a minor chord that sinks for a loss;
  the retro cadence rises into the major chord or falls into the minor one. Engine games (checkmate,
  the flag and resignation) and Hand & Brain use it; between two people at one device the neutral
  cue plays.

### Changed

- The test lab's haptics card shows the patterns of the current sound theme, and its sounds card
  carries the volume slider.

### Testing

- Unit tests cover the retro set (chip waves only, noise only in the explosion, level matching with
  the capture on top), the major-versus-minor game-over pair, the volume curve, the per-theme
  vibration patterns and the new controls; an end-to-end test switches to Retro, moves the slider
  from the keyboard and checks that both persist and that the lab follows them, on all four browser
  projects.

## [0.9.1] - 2026-10-01

### Changed

- **Every sound rebuilt on a new synth.** The synth gained filtered-noise layers and a "punch" chain
  (a compressor and a soft clipper that squeeze a cue's layers into one dense sound), and all ten
  cues were redesigned on it as one family: a wooden thock for a move and a double thock for
  castling; a **capture that lands like a hit** — kick-drum thump, sub, crack, crunch, debris and the
  bright tick, the loudest sound in the set; an alarm with a crack on each note for check; a short
  fanfare with sparkle for a promotion; a ringing chime for a solve; a heavy thud and a slide down for
  a miss; an impact under a swelling chord for game over; a weighted tick for low time; a two-note
  ping with air for a notification. Levels are matched so the capture stays on top and a move is the
  quietest. The audio context now wakes on the first tap so even the first hit lands at full weight;
  the soft theme keeps halved, dulled versions without the punch chain. The capture vibration is a
  double tap followed by a longer buzz.

### Testing

- The visual-snapshot job is blocking now that its baselines have matched the CI runner.

## [0.9.0] - 2026-10-01

The release candidate for 1.0: everything below is what 1.0 will ship, and the compatibility promise
starts here — a backup made by this version imports into every later version, and a share link made
by this version keeps opening.

### Added

- **A test lab** (_Settings → Open the test lab_, `/settings/lab`) for checking a device by hand:
  every platform capability (installed app, service worker, WebAssembly, shared memory, audio,
  vibration, badge, sharing, compression, CSS features, viewport, storage estimate), the storage
  meter with a fill-to-the-limit test, a button for every sound and every haptic cue, every icon at
  four sizes on light and dark, every control, badge, alert, toast and the dialog, the board colours,
  piece sets, highlights, arrows and the promotion menu, the type scale and colour tokens, the engine
  diagnostics, and a deliberate crash to see the error page.
- **Storage that survives a full disk.** Browsers cap local storage at about 5 MB; when a write no
  longer fits, the app now keeps running, warns once ("Storage is full…") and shows the failure in
  Settings instead of silently dropping the change. Settings shows how much local data the app keeps.
- **A crash page that reports itself:** the version, build date, route, browser and the stack, with
  "Copy details", "Go home" and a bug-report link whose form is already filled in.
- **A privacy and data note** in Settings and the FAQ: what stays on the device (everything), what
  leaves it and when (only the imports and lookups you trigger), what a backup is and how much the app
  can store.
- **Three more browsers in CI.** Firefox and WebKit run the shell, engine, arcade, settings, lab,
  small-phone and accessibility tests alongside desktop and mobile Chromium, each in its own job.
- **Budgets in CI:** `npm run bundle:check` fails the build when a gzipped chunk or the precache
  outgrows its limit; `npm run lighthouse` audits five pages and fails on an accessibility,
  best-practices or SEO regression, a layout shift above 0.1 or a serious performance drop.
- **Visual snapshots** (`npm run e2e:visual`) of the static pages on desktop and phone, compared in
  CI as an informative job until the baselines are confirmed on the runner.
- **Compatibility fixtures:** real backups from the 0.3, 0.5 and 0.7 export formats and share links
  from 0.4 and 0.6 are imported and decoded in the unit suite on every run.

- **Arcade.** Eight games that are not puzzles, each with a score to beat, under _More → Arcade_:
  - **Hand & Brain** — full-strength Stockfish as your partner. As the Brain you call a piece type and
    the partner plays its best move with that piece; as the Hand the partner names the piece of its best
    move and you find the move. Every call is graded against the engine's real best (best, good,
    inaccuracy, mistake, blunder) and the game ends with an accuracy figure. Opponent at any level.
  - **Daily Opening** — one line a day from the 3,800-line opening book, six guesses, Wordle-style
    feedback per move (right place, elsewhere in the line, not in it), the known prefix shown on the
    board, hints that unlock with wrong guesses, a streak, a shareable text result, and a practice mode.
  - **Who Stands Better?** — ten quiet positions from the classic games, judged on a ±5-pawn slider
    against the engine's evaluation (515 positions evaluated at depth 16); points for closeness, nothing
    for calling the wrong side, a streak bonus and the engine's move revealed each time.
  - **Odds Ladder** — full-strength Stockfish gives queen odds; a win climbs to rook, knight, bishop and
    pawn odds and finally a level game. Results per rung, no take-backs, no hints.
  - **Army Draft** — both sides buy an army from a points budget (20, 30 or 39) and fight from the
    first two ranks; presets, a live preview, and the engine's own random draft (or a mirror of yours).
  - **Fortress** — hold a clearly worse position for twenty moves against a chosen level; the
    evaluation (graded at full strength after every move) is the health bar, three lives, positions
    tiered from "a pawn or so down" to "on the brink".
  - **Engine Says** — a Simon game: the engine plays the first moves of a real opening line, the board
    resets, you replay them; every round adds a move, and finishing a line carries on with a new one.
  - **Blindfold** — a full game against the engine with the pieces hidden and three two-second peeks;
    a win with peeks to spare is the top score.
- The arcade hub shows every game's best result; the Progress page lists them; the daily plan includes
  the Daily Opening.
- `public/openings/lines.json`: every opening line's moves (from the same lichess-org/chess-openings
  import), for the games that quiz them.
- `npm run arcade:positions` evaluates the classic games' middlegame positions with the engine for
  Who Stands Better? and Fortress (`src/features/arcade/positions.json`).
- Backups (export version 6) include arcade results, the Daily Opening streak and the odds ladder.

### Changed

- **Settings has its own page.** Appearance, play, engine and analysis, the puzzle rating, profiles,
  backups and the app itself moved from the bottom of the Progress page to _More → Settings_
  (`/settings`), each in its own card; the Progress page is statistics only, in two columns, with a
  button to Settings. The profile badge opens Settings.
- **The More menu is grouped** — Train, Games and App/Tools — as three columns on a desktop and a
  titled bottom sheet on a phone (which never grows past the screen).
- **Phones held upright keep the whole board on screen.** Pages with a board get a compact title,
  and the ones that explain themselves further down (Play, Puzzles, Analyze, the arcade games) drop
  the description, so on a 375 × 667 screen the board, both player bars and the first controls all
  fit between the app header and the bottom bar without scrolling.
- **Finger-sized controls on touch screens:** small buttons, segmented controls, the board-colour
  swatches and the breadcrumb links grow to at least 40 px when the pointer is a finger; the Army
  Draft shop keeps its − count + stepper on one line.
- Every link that looks like a button now is one (`LinkButton`): the "All games", "All drills",
  "Analyze" and similar links on the drill and arcade result cards used to render as plain text.
- The framework (React, React DOM, React Router) is built as its own chunk, so an app update
  re-downloads about 33 KB (gzipped) of app code instead of 128 KB.
- The README is a project overview with screenshots; the full feature reference moved to
  `docs/FEATURES.md`, the scripts table to `CONTRIBUTING.md` and the branding notes to
  `docs/DEPLOYMENT.md`.
- While a page chunk loads, the loading screen is taller than the window, so the footer no longer
  appears at the bottom and jumps away (Lighthouse's layout shift went from 0.12 to 0).
- The install banner's "Not now" button no longer carries a label that contradicts its text.

### Testing

- An automated accessibility sweep (`e2e/axe.spec.ts`, axe-core WCAG 2.1 A/AA) over every top-level
  page in both colour schemes; it found and fixed four things — `aria-label` on plain containers
  (the repertoire progress bars and captured-material rows), the move lists' list role, and a
  stray contrast check on a fading toast.
- The engine-dependent end-to-end tests use positions with one right answer (a missed mate in one, a
  queen given away), so a transposition-table mood can no longer change their outcome.

### Fixed

- On a phone, every move scrolled the page down to the move list and the board slid off the screen
  (most visibly when playing on from a puzzle). Move lists now scroll only themselves.
- The engine client put `searchmoves` before the search limits in the `go` command; Stockfish reads
  every token after `searchmoves` as a move, so such searches never ended.

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

- The puzzle rating is consistently called a _puzzle_ rating; "provisional" now means the deviation is
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
