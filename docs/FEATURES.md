# Features

The complete reference of what Chess Trainer does, section by section. For how it is built, see
[ARCHITECTURE.md](ARCHITECTURE.md); for the content formats, [CONTENT_GUIDE.md](CONTENT_GUIDE.md).

## Learn

- **75 interactive lessons**, from "how the pieces move" to attacking the fianchetto, defending the
  Greek gift, bishop-and-pawn endings, the bishop-and-knight mate, queen against rook, rook and bishop
  against rook, Catalan/QGD and French plans, exchange sacrifices, calculation and "when there is
  nothing to do". Every position is legality-checked in CI and every task is verified against
  Stockfish.
- **Three courses** with unlockable units, and a two-minute **placement quiz** that recommends a
  course and a starting rating.
- **Lesson recall** brings the moves you learned back a few days later, then further apart.
- A **mating patterns** gallery: the nineteen named mates as minimal diagrams, each with a drill and
  the library's puzzles of that shape.

## Puzzles

- **48,000 tactics** from the Lichess puzzle database (CC0), sampled across eight rating bands from
  400 to 2600+ and served in chunks. The first chunk of every band is precached; download every puzzle
  from Settings for full offline use.
- **Rated mode** with a **Glicko-2** puzzle rating: a calibration run for new learners, an
  uncertainty figure, credit that depends on hints, speed and repeats, and a rough conversion to
  Lichess, chess.com and FIDE ratings.
- Daily puzzle, practice **by theme** or **by opening** (every puzzle knows the opening it came
  from), **Puzzle Rush** (three-minute and survival), **Woodpecker sets** solved in spaced cycles,
  hints, streaks and per-theme statistics.
- A **review queue** that brings missed puzzles back on a 1-3-7-14-30 day schedule, **bookmarks**,
  and **puzzles from your own games**: every reviewed blunder becomes a puzzle.

## Drills

- Coordinate trainer, piece vision, "find every capture / check" and **guess the position** drills,
  with a **blindfold** mode.
- An **endgame library of 41 drills**, every position engine-verified and played out against a
  full-strength engine, arranged as an **endgame ladder**: checkmates; pawn endings (key squares, the
  square of the pawn, outside and protected passers, triangulation, the breakthrough, Réti); rook
  endings (Lucena, Philidor, Vancura, cutting off the king, the short-side and back-rank defences,
  rook against a pawn, bishop or knight); queen endings and minor pieces.
- Eight **endgame studies** (Réti, Saavedra and the only-move endings) to solve move by move.

## Openings

- **Sixteen built-in repertoires** — Italian, Ruy Lopez, Vienna, London, King's Indian Attack,
  English, Queen's Gambit, Alapin, Caro-Kann, French, QGD, Scandinavian, Slav, Nimzo-Indian, King's
  Indian, Najdorf — trained move by move with spaced repetition (SM-2), every learner move
  engine-checked.
- Import your own PGN repertoires, **edit them on the board** with notes, **add lines straight from
  the analysis board**, **share a repertoire as a link**, and **practise it against the engine**,
  which follows the book while the game stays in it.
- An optional **opening explorer** (Lichess masters and community games) shows what is played in any
  position.

## Classic games

Guess-the-move for **46 famous games** — from Légal's mate, the Immortal Draw, the Opera Game, the
Immortal and the Evergreen through McDonnell–La Bourdonnais, Steinitz, Rubinstein, Capablanca,
Réti–Alekhine, Torre–Lasker, the Polish and Peruvian Immortals, Fischer, Tal, Petrosian, Karpov and
Kasparov to Deep Blue — with notes on every key moment, three points for the game move and two when
the engine rates yours as good. Filter by era, difficulty and what you have played.

## Play

- **Stockfish 19** in the browser at **eight strength levels**, from a beatable "Newcomer" (about 400)
  to full strength, with optional clocks from bullet to classical.
- Take-backs, hints, "show threat", keyboard move entry, PGN export and a hand-off to analysis.
- A **coach mode** that pauses after a mistake, explains it in words, links the lesson and offers a
  take-back.
- An **engine ladder** with the next rung one click away.
- **Opening practice** against a repertoire, **two players** at one device, **blindfold** play with a
  peek button, and a start from **any position**: a FEN, a lesson diagram, a solved puzzle or a moment
  of a reviewed game.

## Arcade

Eight games that are not puzzles, each with a score to beat:

- **Hand & Brain** — full-strength Stockfish as your partner: you call the piece and it finds the
  move, or the reverse, and every call is graded against the engine's best.
- **Daily Opening** — a Wordle for the 3,800-line opening book, with a shareable result and a streak.
- **Who Stands Better?** — ten quiet positions from the classic games, judged on a slider against
  the engine's verdict.
- **Odds Ladder** — full-strength Stockfish starting without a queen, then a rook, a knight, a
  bishop, a pawn and finally nothing.
- **Army Draft** — both sides buy an army from a points budget and fight with it.
- **Fortress** — hold a clearly worse position, with the evaluation as a health bar.
- **Engine Says** — a Simon game played with the moves of real opening lines.
- **Blindfold** — a full game with the pieces hidden and three peeks.

## Analyze

- Multi-line engine analysis with an evaluation bar, a full **variation tree** (promote, delete,
  annotate, comment, PGN export with variations) and ECO opening names.
- A **position report**: structure, king safety, open files, outposts, loose pieces and plans for both
  sides.
- A board editor, optional Lichess tablebase lookups, **shareable links** (the game travels in the
  URL), and an **analysis library** with named collections and Lichess study import.
- **Game review** with an evaluation graph, **key moments explained in words** — hanging pieces,
  forks, pins, missed mates, each linked to the lesson and the puzzle theme — and a choice of depth.
- **Import games** by pasting or opening a PGN, or straight from a Lichess or chess.com username.

## My games

Import your games (Lichess and chess.com with time-control, colour and rated filters, or PGN), see
your **opening statistics** per colour, find where you or your opponents **left your repertoire**,
review every game in one go, turn the mistakes into puzzles, and read the **insights** — accuracy by
phase, the mistakes you make most, results by colour, opening and engine level — with a "work on" list
of lessons and themes.

## Home and Progress

- A first-run tour, your current course, and an **adaptive daily plan**: the daily puzzle and
  opening, rated puzzles or your weakest theme, the review queue, lesson recall, opening reviews,
  tactics from your repertoire's openings, what your games say to work on, the next lesson and the
  next rung of the endgame ladder, with a training-day streak.
- **Progress**: rating history chart, a weekly summary, solve statistics, strengths and weaknesses by
  theme, lesson completion, the game log with results per engine level, arcade records, drill and
  rush records, opening and puzzle review counts, and a reminder when a backup is overdue.

## Settings

Appearance (colour scheme, board colours, piece sets, coordinates, sounds), play defaults, engine and
analysis options (strength, review and analysis depth, the multi-threaded engine, coach mode), the
puzzle rating reset or calibration, **profiles** for several learners on one device, an engine
diagnostics panel with a speed test, offline puzzle download, install, a **storage meter**, and
backups — export or import as JSON, **share a backup** straight to another device, or open a backup
file with the installed app to import it.

### The test lab

_Settings → Open the test lab_ (`/settings/lab`) is a single page for checking a device by hand:

- **Platform:** installed-app mode, service worker, online state, WebAssembly, workers, shared memory
  and cross-origin isolation, CPU cores, Web Audio, vibration, the app badge, Web Share (with files),
  Compression Streams, clipboard, the CSS features the layout relies on, colour-scheme and
  reduced-motion preferences, pointer type, viewport, language and the browser's storage estimate.
- **Storage:** the meter, the largest keys, and a button that fills local storage to the browser's
  limit to show the "storage is full" warning, with another to remove the filler.
- **Sounds and haptics:** a button for every cue, with the sound theme, the volume and the switches
  to hand; the vibration patterns shown follow the theme.
- **Icons:** every icon at 16, 20, 24 and 32 px, on light or dark.
- **Controls and feedback:** every button, input, badge, stat, alert, toast and the dialog.
- **Board:** the board colours, both piece sets, highlights, arrows, check and the promotion menu.
- **Type and colour:** the colour tokens and the type scale.
- **Engine:** the diagnostics panel and speed test.
- **Errors:** a deliberate crash, to see the error page and its report link.

## Reference

The rules of chess, notation (SAN, PGN, FEN, engine evaluations), a searchable glossary linked to the
lessons, and an FAQ.

## Sounds and haptics

Eleven synthesized cues, built on a small Web Audio synth with no audio files, in three themes:

- **Standard** — a wooden thock for a move and a double thock for castling, a capture that lands like
  a hit (the loudest cue), an alarm for check, a fanfare for a promotion, a chime for a solve, a thud
  for a miss, an impact under a chord for game over — major when you won or drew, minor and sinking
  when you lost — a weighted tick for low time and a two-note ping for notifications.
- **Soft** — the same cues halved and rounded off, for quiet rooms.
- **Retro** — an 8-bit console's sound chip: a menu blip for a move, an explosion for a capture, a
  siren pair for check, a power-up run for a promotion, a coin and a flourish for a solve, four steps
  down and a buzz for a miss, a four-note cadence for game over (major for a win, minor for a loss),
  a hurry-up tick and a two-note question.

A **volume** slider sets how loud all of it is. Phones that support it get a matching vibration for
each cue — the Retro set's are shorter and buzzier — and sounds, theme, volume and vibration are all
in Settings; every cue can be tried in the test lab.

## Accessibility

Moves announced to screen readers, **keyboard board control** (arrow keys, Enter, Esc, or type a
square) with a "describe position" button, keyboard shortcuts (press `?`), focus management, a
colour-blind-safe high-contrast board theme, a high-legibility **Letters** piece set, a soft sound
theme, reduced-motion support and WCAG-AA text contrast — checked by an automated axe-core sweep of
every page in both colour schemes.

## App and offline

Web manifest, a hand-written Workbox service worker with an offline precache (app, engine, openings,
the first puzzle chunk of every band) and on-demand caching of the rest, an install prompt with iOS
instructions, update notifications, window-controls overlay on desktop, a **badge with due reviews**
on the app icon, **haptic feedback** on phones, and layouts for notches, small phones and phones held
sideways.

## Privacy and network use

There are no accounts and no server: everything you do is stored in your browser, on your device.
The app talks to the network only when you ask it to — importing your games from Lichess or
chess.com, and the opening explorer and tablebase lookups, which are off by default. Backups are
files you keep.

Browsers allow a site roughly 5 MB of local storage. The app caps what it keeps (300 puzzle
attempts, 200 imported games, 500 saved analyses, 300 own-game puzzles) and shows the total in
Settings; if a write no longer fits it keeps running, warns once and marks the failure in Settings
rather than losing the change silently.

## Compatibility promise

From 0.9 on:

- a backup made by any version imports into every later version;
- data stored in the browser migrates on load, so an update never loses progress;
- share links (`#z=`, `#rep=`, `#wp=`) made by any version keep opening.

Fixtures from each earlier export format live in `src/store/fixtures/` and are imported in the unit
suite on every run.

## Under the hood

- **Static only.** Vite, React and TypeScript build to plain files. The engine is a WebAssembly
  worker and the puzzle database is a set of JSON chunks fetched on demand.
- **Engine.** [Stockfish.js](https://github.com/nmrugg/stockfish.js) (lite NNUE build). The
  single-threaded build is used by default and is far stronger than any human; the lowest playing
  levels are weakened in software (shallow search, sampling among several candidate moves, occasional
  random moves) so that real beginners can win.
- **Multi-threaded engine (experimental).** Multi-threaded WASM needs `SharedArrayBuffer`, which
  browsers only expose to cross-origin-isolated pages, and GitHub Pages cannot send the required
  headers. Turning on _Settings → Multi-threaded engine_ makes the service worker add the
  `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers itself on the next reload;
  the app then loads the pthreads build with all but one CPU core. If anything goes wrong the
  single-threaded engine takes over. Off by default because the headers also block cross-origin
  resources that are not CORS-enabled.
- **Puzzles.** `scripts/import-lichess-puzzles.mjs` streams the Lichess puzzle dump, keeps
  well-established puzzles (at least 500 plays, popularity 70 or more) and reservoir-samples 6,000 per
  rating band with a fixed seed, keeping the ids of the previous set so histories stay valid. The
  trainer picks puzzles within ±150 of your rating and widens the window when it runs out of unseen
  ones.
- **Puzzle rating.** Glicko-2 (`src/lib/glicko.ts`, the system Lichess uses), one rating period per
  puzzle, with the puzzle's own rating deviation from the Lichess data. A solve is worth less with
  hints, when it was slow for the puzzle's size, or when the puzzle had been seen before; the
  deviation grows during long breaks.
- **Content is data.** Lessons, courses, drills, studies, repertoires and classic games are plain
  TypeScript. Test suites check that every FEN is legal, every accepted move is legal, every "mate in
  one" task lists exactly the mating moves and every line replays legally; `npm run lessons:verify`,
  `npm run drills:verify` and `npm run studies:verify` confirm the chess against Stockfish.
- **Shareable links** put the game in the URL fragment (`/analyze#z=…`, deflated with the
  Compression Streams API), so nothing is sent to a server and a link opens the same game at the same
  move. Repertoires (`/openings#rep=…`) and Woodpecker sets (`/puzzles/woodpecker#wp=…`) travel the
  same way.
- **Profiles** namespace the persisted stores: the first profile keeps the plain `localStorage`
  keys, every other one gets `<key>:<profile id>`; switching reloads the app into the other
  namespace. Device settings are shared.
- **Openings.** `scripts/import-openings.mjs` turns the lichess-org/chess-openings dataset (CC0) into
  a table keyed by position, so the analysis board can name an opening even after a transposition.
- **Move commentary and the coach** explain mistakes with rules, not generated prose: static exchange
  evaluation, fork and pin detection and the engine's own lines turn a swing into "Ne5 hangs the
  knight to dxe5", with a link to the lesson and the puzzle theme.

## Browser support

Any evergreen browser with WebAssembly and Web Workers: Chrome and Edge 90+, Firefox 90+, Safari 16+
(iOS 16+). If the engine fails to load, lessons and puzzles still work. CI runs the end-to-end tests
on Chromium (desktop and a phone profile), Firefox and WebKit. The interface is in English only.
