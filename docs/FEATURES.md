# Features

The complete reference of what Chess Trainer does, section by section. For how it is built, see
[ARCHITECTURE.md](ARCHITECTURE.md); for the content formats, [CONTENT_GUIDE.md](CONTENT_GUIDE.md).

## Learn

- **75 interactive lessons**, from "how the pieces move" to attacking the fianchetto, defending the
  Greek gift, bishop-and-pawn endings, the bishop-and-knight mate, queen against rook, rook and bishop
  against rook, Catalan/QGD and French plans, exchange sacrifices, calculation and "when there is
  nothing to do". Every position is legality-checked in CI, the lines quoted in the text are replayed
  (a "mate" must be mate), and every task and scripted reply is verified against Stockfish.
- **Three courses** with unlockable units — a lesson opened from a course leads back to it and on to
  the next item — and a two-minute **placement quiz** that recommends a course (the one Home suggests
  until you start another) and seeds your starting puzzle rating.
- **Lesson recall** brings the moves you learned back a few days later, then further apart; once a
  lesson has scheduled positions it is one click from Learn and from the end of every lesson, and
  showing the answer counts as a miss.
- **Mark a lesson as done** without working through it — from its card on Learn, its row in a
  course, or its own page — when you know it already; it then counts as completed in courses, on
  Learn and for the next lesson, but not as training (no streak day, no recall). Marking it not done
  starts it again; both come with an Undo. Doing every step later completes it for real.
- A **mating patterns** gallery: the nineteen named mates as minimal diagrams, each with a drill and
  the library's puzzles of that shape.

## Puzzles

- **48,000 tactics** from the Lichess puzzle database (CC0), sampled across eight rating bands from
  400 to 2600+ and served in chunks, each a sample of its whole band. A puzzle needs one chunk, not a
  band: the first chunk of every band is precached, so every mode works offline from the first visit,
  and a chunk that cannot be loaded is simply passed over; download every puzzle from Settings for
  the full set offline.
- **Rated mode** with a **Glicko-2** puzzle rating: a calibration run for new learners, an
  uncertainty figure, credit that depends on hints, speed and repeats, and a rough conversion to
  Lichess, chess.com and FIDE ratings.
- Daily puzzle (the day's first result stands), practice **by theme** or **by opening** (every
  puzzle knows the opening it came from; a repertoire trains all its openings), **Puzzle Rush**
  (three-minute and survival; the clock stops while a puzzle downloads), **Woodpecker sets** solved
  in spaced cycles and shared as links, hints, streaks and per-theme statistics. Only rated mode asks
  for a starting rating; the other modes are open at once. A promotion always asks for the piece, so
  underpromotions can be solved with auto-queen on.
- **Blind puzzles**: the board stays on the starting position while the line is played out in
  notation only, so the whole combination has to be seen in the head. Two, three or four-plus moves
  deep, each length with its own level (it starts a few hundred points under the puzzle rating, rises
  40 with a clean solve and drops 60 with a miss). Moves go in by clicking their two squares on the
  unchanging board or by typing them; a move that is not legal in the current position is turned down
  without counting as a miss. A **peek** shows the current position, but a solve after one leaves the
  level where it was; at the end the board shows where the line ends, to compare with what you saw.
- **Due puzzles**: missed puzzles come back on a 1-3-7-14-30 day schedule (Woodpecker misses stay in
  their set); **bookmarks**; and **puzzles from your own games**: every reviewed blunder becomes a
  puzzle, and a different move the engine rates as good as the review's (within half a pawn) counts
  as a solve.

## Drills

- Coordinate trainer (click the square or type it), piece vision, "find every capture / check" and
  **guess the position** drills, with a **blindfold** mode.
- **What's the threat?**: the board shows the position with your opponent to move (as if you had
  passed); play the move they threaten — two tries, then it is shown — and then a move that meets it.
  The answer says what the threat does (mates, wins the queen, a piece…), lists the moves that hold,
  and for the 1,200 bundled positions what was played in the real game instead. A threat or defence
  the stored answer does not name is put to the engine, which accepts one that is as strong. Threats
  you missed in **your own games** join the drill after a review (on the analysis board or in My
  games) and come back every third position until you have named each twice in a row. Only your own
  moves count when the game says which side you played (games against the engine, or games under the
  name you import with); otherwise both sides' do, and the drill says which side missed it.
- An **endgame library of 41 drills**, every position engine-verified and played out against a
  full-strength engine, arranged as an **endgame ladder**: checkmates; pawn endings (key squares, the
  square of the pawn, outside and protected passers, triangulation, the breakthrough, Réti); rook
  endings (Lucena, Philidor, Vancura, cutting off the king, the short-side and back-rank defences,
  rook against a pawn, bishop or knight); queen endings and minor pieces. A drill opened without a
  `?pos=` starts from one of its positions at random. A promotion counts once the new piece is safe,
  and won material once it is kept (a trade or a piece taken straight back is not a win).
- Eight **endgame studies** (Réti, Saavedra and the only-move endings) to solve move by move; every
  accepted move, and every refused alternative, is checked against the engine.

## Openings

- **Sixteen built-in repertoires** — Italian, Ruy Lopez, Vienna, London, King's Indian Attack,
  English, Queen's Gambit, Alapin, Caro-Kann, French, QGD, Scandinavian, Slav, Nimzo-Indian, King's
  Indian, Najdorf — trained move by move with spaced repetition (SM-2), every learner move
  engine-checked. A missed move comes back ten minutes later as a move to recall (not as a new move
  shown with an arrow), then at growing intervals. A move reached by another move order (a
  transposition) is learned once: recalling or missing it counts in both lines.
- Import your own PGN repertoires, **edit them on the board** with notes, **add lines straight from
  the analysis board**, **share a repertoire as a link** (through the share sheet where the device
  has one), and **practise it against the engine**, which follows the book while the game stays in
  it. Deleting a line or forgetting a repertoire's progress asks first; a stored repertoire that can
  no longer be read offers to copy its text or delete it.
- An optional **opening explorer** (Lichess masters and community games) shows what is played in any
  position; the card carries its own switch and says plainly when you are offline.

## Classic games

Guess-the-move for **46 famous games** — from Légal's mate, the Immortal Draw, the Opera Game, the
Immortal and the Evergreen through McDonnell–La Bourdonnais, Steinitz, Rubinstein, Capablanca,
Réti–Alekhine, Torre–Lasker, the Polish and Peruvian Immortals, Fischer, Tal, Petrosian, Karpov and
Kasparov to Deep Blue — with notes on every key moment, three points for the game move and two when
the engine rates yours as good. Filter by era, difficulty and what you have played.

## Play

- **Stockfish 19** in the browser at **eight strength levels**, from a beatable "Newcomer" (about 400)
  to full strength (the ratings are a rough guide), with optional clocks from bullet to classical. A
  flag that falls when the other side could never checkmate is a draw, as in the rules.
- A **human-like opponent** at any rating from 600 to 2600, in steps of 100. Maia-3, a neural network
  trained on millions of online games, predicts how players of that rating move in the position, and
  the opponent plays a move drawn from the prediction (never one the model expects fewer than 2% of
  such players to choose). So it plays like a person of the rating — natural plans, misjudged positions, missed tactics
  — rather than a strong engine with random blunders added, and no two games go the same way. It
  takes a moment over a move, longer when the position is less clear to it and less when its clock
  runs low. It is a one-time download of about 25 MB (the model and the runtime that plays it), kept
  on the device for offline play and removable in Settings, and it runs in a worker on your device.
  Hints, the coach and the review still come from Stockfish, and the blunder check and opening
  practice work as they do against the engine. Its games are recorded by rating, and two wins or two losses in a row
  at one rating suggest a step of 100 up or down.
- Take-backs (until the game is over — a finished game is recorded once), hints and "show threat"
  (the arrow's move is also given in words), keyboard move entry that keeps its focus between moves,
  PGN export and a hand-off to analysis from your side of the board. "Play again" repeats the last
  settings; "New game" opens the setup.
- A **coach mode** that pauses after a mistake, explains it in words, links the lesson and offers a
  take-back. The coach judges at full strength whatever level you play against, and never interrupts a
  move that ends the game.
- A **blunder check** (off by default, in the game setup and in Settings): before a move that lets
  the opponent mate at once, or loses two pawns' worth or more to a sequence of captures, is played,
  it asks _checks, captures, threats?_ — "Look again", "Show me" (the move and its punishment, drawn
  and named) or "Play it anyway". It says nothing when every move loses as much (a fork), works in
  timed games too (it answers in a few milliseconds, without the engine), and the game summary counts
  the moves it held back.
- An **engine ladder** with the next rung one click away; its height is remembered even when the old
  games have scrolled out of the history, and a slip (three losses at a rung) clears after one game at
  the rung below. Only ordinary engine games count: handicap, simul, drill and human-like games are
  recorded under their own mode.
- **Opening practice** against a repertoire (the hint shows the repertoire's move; a clock pauses while
  a deviation alert is up), **two players** at one device, **blindfold** play with a peek button (the
  pieces return when the game ends), and a start from **any position**: a FEN, a lesson diagram, a
  solved puzzle or a moment of a reviewed game. A position the engine cannot play (the side not to move
  in check, or a game already over) is refused with a message.

## Arcade

Eleven games that are not puzzles, each with a score to beat:

- **Hand & Brain** — full-strength Stockfish as your partner: you call the piece and it finds the
  move, or the reverse, and every call is graded against the engine's best. The score is your
  accuracy times the engine level, in full from 30 calls; a game resigned before 10 calls is not
  scored.
- **Daily Opening** — a Wordle for the 3,800-line opening book, with a streak and a result to share
  (the share sheet on a phone, a copy elsewhere). Every move of a guess is marked by a tint, a glyph
  and words; a game started before midnight keeps its day, and a day played is never played again.
- **Who Stands Better?** — ten quiet positions from the classic games, with White or Black to move,
  judged on a slider in tenths of a pawn against the engine's verdict: within 0.3 is spot on, each
  pawn of error costs 30 points.
- **Odds Ladder** — full-strength Stockfish starting without a queen, then a rook, a knight, a
  bishop, a pawn and finally nothing. Wins, draws and losses are kept per rung.
- **Army Draft** — both sides buy an army from a points budget and fight with it.
- **Fortress** — hold a clearly worse position, with the evaluation as a health bar; the last of the
  twenty moves is graded like the others before the position counts. Each position held scores the
  engine level.
- **Engine Says** — a Simon game played with the moves of real opening lines, at a normal or a slow
  pace; replay a whole line and its moves stay in the score as a new line starts.
- **Blindfold** — a full game with the pieces (and the captured material) hidden and three peeks. A
  win is 100 and a draw 50, plus 15 for each peek to spare, times the engine level; a loss scores
  nothing.
- **Simul** — two to eight games against Stockfish at once, each on its own board, at one strength
  or rising a level per board, as White, Black or both. With clocks, every board has a clock for each
  side, as in a clock simul: yours runs on every board where it is your move, even while you play
  another, and the engine's only while it thinks. Small boards show every game (on a phone a strip
  of board numbers sits under the big board too); tap one or press `N` for the next board waiting for
  you. Each win scores its board's level, a draw half of it. Leaving a simul in play asks first and
  resigns the boards still going.
- **Arbiter** — a stretch of a classic game replays at speed, and then one move breaks the rules. Call
  it (the button, or Space) before the next move would have come. Eighteen kinds of illegal move in
  three tiers: in rounds one to three a piece moves in a way it never can (a knight off its L, a bishop
  going straight, a pawn backwards or taking straight ahead); in rounds four to seven the right movement
  comes where it is not allowed (a piece jumping another, a late double step, a pawn left
  unpromoted); from round eight on it is what the king's safety and the move order forbid (a pinned
  piece moving, a king walking into check, a check ignored, castling past an attack, en passant too
  late, one side moving twice) — with now and then a kind from the tier below. Every call is answered
  with the rule and the squares that show it. Rounds speed up; calling a legal move or letting the
  illegal one pass is a strike, and three end the run. The replay pauses when the page is hidden, and
  a pause covers the board. Slow pace gives each move nearly twice as long. The score is the illegal
  moves caught.
- **Ghost Knight** — an enemy knight hides on the board and shows itself every third move. Your
  squad moves by the ordinary rules, one move a turn; the knight never jumps onto a square you attack
  and takes any piece you leave unprotected within its reach (which shows where it is). Catch it by
  landing on it — a rook or bishop that runs into it on the way stops and takes it — or corner it so
  every square it could jump to is covered. Shaded, the board marks every square it could be on;
  unshaded, you track it yourself for double points. Five hunts, each harder than the last (two rooks
  and a bishop up to rook, bishop and knight), three lives; a catch scores 10 plus a point for each
  move to spare.

The games against the engine end with "Play again" (the same settings) and "New game" (the setup),
hand the game to the analysis board from your side, copy its PGN, and follow focus mode. Odds
Ladder, Army Draft, Blindfold and Simul games go to the game log as arcade or simul games, apart
from the engine ladder and the Play results.

## Analyze

- Multi-line engine analysis with an evaluation bar, a full **variation tree** (promote, delete,
  annotate, comment, PGN export with variations) and ECO opening names.
- A **position report**: structure, king safety, open files, outposts, loose pieces and plans for both
  sides.
- A board editor (castling rights, en passant, impossible piece counts refused), optional Lichess
  tablebase lookups ("mate in N" counts moves, the DTM in half-moves is in the tooltip), **shareable
  links** (the game travels in the URL, opening at the shared move — a variation included), and an
  **analysis library** with named collections and Lichess study import; a reopened entry is updated
  rather than duplicated, and every delete or reset asks first.
- **Game review** with an evaluation graph, **key moments explained in words** — hanging pieces,
  forks, pins, missed mates, each linked to the lesson and the puzzle theme — and a choice of depth.
  The engine sees each position with the moves that led to it (so it knows about repetitions), and a
  move that looks like a slip is compared with the engine's choice once more, both moves in one
  search at depth 14 or more, before it is called one — so a deep sacrifice is not marked down for
  what a shallow search cannot see.
- **Analyze it yourself first**: before the engine's review, go through the game with the engine,
  the explorer, the tablebase and the position report out of sight; mark the moves where the game
  turned (M, or the button) and play what you would have played instead. "Check with the engine" then
  runs the review and scores you: the turning points (mistakes and blunders, either side) you found —
  on the move or one move late — the ones you missed, false alarms (a mark on an inaccuracy is
  neither), and each of your moves against the engine's. Offered on the analysis board, at the end of
  a game against the engine and next to each unreviewed game in My games.
- **Import games** by pasting or opening a PGN (ChessBase-style `1.e4` numbering, chess.com clock
  tags, evaluation symbols and 4-field FENs included; an illegal move is named and the moves before
  it can be loaded), or straight from a Lichess or chess.com username. Variant games are skipped.

## My games

Import your games (Lichess and chess.com with time-control, colour and rated filters, or PGN), see
your **opening statistics** per colour, find where you or your opponents **left your repertoire**,
review every game in one go, turn the mistakes into puzzles and the threats you missed into
positions for the threat drill, analyze a game yourself before the engine does, and read the
**insights** — accuracy by
phase, the mistakes you make most, results by colour and opening — with a "work on" list
of lessons and themes. Rows resting on fewer than 3 games or 20 reviewed moves are greyed out.

## Home and Progress

- A first-run tour, your current course, and an **adaptive daily plan**: the daily puzzle and
  opening, rated puzzles — plus your weakest theme once it is clearly behind (20 or more attempts and
  15 points under your own accuracy) — the review queue, lesson recall, opening reviews, tactics from
  your repertoire's openings, what your games say to work on, the next lesson and the next rung of
  the endgame ladder, with a training-day streak. A returning learner sees the day first; the
  introduction is for newcomers.
- **Progress**: rating history chart, a weekly summary (the last seven calendar days against the seven
  before, with the trend shown by an arrow as well as colour), solve statistics, strengths and
  weaknesses by theme (measured against your own accuracy), lesson completion, the game log with results per engine level and per human-like rating, arcade records, drill and
  rush records, **thinking skills** (threats named and met, blind-puzzle levels, the share of turning
  points caught in your own analyses, moves the blunder check held back), opening and puzzle review counts, and a reminder when a backup is overdue (shown once
  there is anything worth keeping — puzzles, lessons, openings or games — with a week's "Later").
  Solve counts, accuracy and solve time are lifetime figures, not just the last 300 attempts.

## Settings

**Appearance:** the colour scheme (system, light, dark, or black for OLED screens), **move
notation** — figurines drawn from the piece set (♘f3) or letters (Nf3), everywhere a move is
written — and the sounds. **Board:** every Lichess board — the flat Brown, Blue, Green, IC and
Purple, and twenty pictures from Wood and Maple to Marble, Metal and Newspaper (each downloaded the
first time it is chosen, then kept for offline use; the picker shows small previews) — plus the
app's own Ice, Walnut and colour-blind-safe High contrast; nine piece sets from the Lichess collection
(the classic cburnett figurines, Merida, Chessnut, MPChess, Celtic, California, Maestro, Staunty and
Cardinal, each credited with its author and licence) shown as strips to pick from, coordinates, legal-move dots, last-move and check highlights, animation, a
**magnified dragged piece** with a circle or square **drag target**, moving by tap, drag or either,
and captured material beside the player bars as the difference, every capture, or nothing.
**Play:** defaults plus **focus mode**, which hides the header and navigation while you play the
computer: in Play, the simul and the arcade games; and the **human-like opponent**'s download, with
its progress, and a Delete that frees its 25 MB. **Single-key shortcuts** can be turned off.
Engine and analysis options (the engine level for the next game, review and analysis depth,
threads — on by default — and the optional **full engine** download with its progress, coach mode),
the puzzle rating reset or calibration (a button with a
confirmation; the rating history is kept), **profiles** for several learners on one device, an engine
diagnostics panel with a speed test, offline puzzle download (it keeps going when you change page),
install, a **storage meter**, and backups — export or import as JSON, **share a backup** straight to
another device, or open a backup file with the installed app. An import is checked field by field,
then asks first: it shows the backup's date and what it holds (puzzle attempts, imported games, saved
analyses, custom repertoires), offers to export the current progress, replaces everything in the
profile at once, and can be undone from the toast that follows. Backups since 0.22 (format 11) keep
the rounds from the Lichess puzzle history counted lately (so sync between devices counts a round
two devices both brought in once) and a random id of the profile's history (so a backup of the
profile is known as such, however long ago it was made); since 0.17 (format 10) they keep the
Lichess puzzles waiting in the review queue and which games went to Lichess; since 0.16 (format 9)
they keep games against the human-like opponent with its rating; since 0.15 (format 8) they carry
the thinking-skill records too; since 0.12 (format 7) they include the imported games and, on a
device with several profiles, carry the profile's name in the file name. _Reset everything_ clears
this profile's progress, repertoires, library and imported games and the device settings, a
downloaded full engine included, turns sync between devices off on this device first (so the synced
copy and the other devices keep their data), and disconnects the profile's Lichess account
(withdrawing the permission); the other profiles are kept, and the dialog says so. With sync between
devices on, an import joins the backup with this device's data and the synced data instead of
replacing anything (an item that differs is kept twice, the backup's version as "… (backup)"), and
the dialog says that instead; the device syncs first, so this needs a connection, and only what goes
beyond the synced data is added. **Sync between devices** and the **Lichess account:** see below.

### The test lab

_Settings → Open the test lab_ (`/settings/lab`) is a single page for checking a device by hand:

- **Platform:** installed-app mode, service worker, online state, WebAssembly, workers, shared memory
  and cross-origin isolation, CPU cores, Web Audio, vibration, the app badge, Web Share (with files),
  Compression Streams, clipboard, the CSS features the layout relies on, colour-scheme and
  reduced-motion preferences, pointer type, viewport, language and the browser's storage estimate.
- **Storage:** the meter, the largest keys, and a button that fills local storage to the browser's
  limit to show the "storage is full" warning, with another to remove the filler. The filler never
  outlives the lab: it is removed when you leave the page and at every app start, and the limit it
  measured is what the storage meter in Settings shows from then on.
- **Sounds and haptics:** a button for every cue, with the sound theme, the volume and the switches
  to hand; the vibration patterns shown follow the theme.
- **Icons:** every icon at 16, 20, 24 and 32 px, on light or dark.
- **Controls and feedback:** every button, input, badge, stat, alert, toast and the dialog.
- **Board:** the board themes, the piece sets, highlights, arrows, check and the promotion menu.
- **Type and colour:** the colour tokens and the type scale.
- **Engine:** the diagnostics panel and speed test.
- **Errors:** a deliberate crash, to see the error page and its report link.

## Sync between devices

_Settings → Sync between devices_ keeps a profile in step across a learner's phone, tablet and
computer, with no account:

- **Turning it on** gives a **recovery phrase**: 12 words from the BIP-39 list (the first four
  letters of each are enough), shown with a QR code of a link that carries them. The dialog can
  copy the words or the link; any device that syncs shows the phrase again (_Show recovery phrase_).
- **Joining**: scan the code with the other device's camera — the link opens Settings there with the
  phrase filled in, and takes it out of the address at once — or choose _I have a recovery phrase_
  and type or paste the words (numbering, line breaks and capitals are fine; a mistyped word is
  named, and a checksum catches the rest). A device with progress of its own chooses whether it
  joins the synced data (_Keep both_, the default) or makes way for it, with an export offered first.
  _Keep both_ adds up what two devices did apart, and keeps the puzzle rating, with its chart, of
  the one that rated a puzzle last. A device restored from the other's backup is recognised by the
  history they share, so what they have in common is not counted twice.
- **What syncs:** progress, ratings, lessons, flashcards, review schedules, repertoires and their
  cards, saved analyses and imported games — everything a backup holds. Device settings, the
  Lichess sign-in and the backup reminder stay on each device.
- **When:** a few seconds after something changes, when the app opens, comes back into view or back
  online, and every 5 minutes while it is on screen; _Sync now_ runs it at once. Tabs take turns.
- **Merging, not overwriting.** Each device remembers the version it last agreed with the relay and
  merges three ways: what only one side changed carries over, deletions included; logs (puzzle
  attempts, rating points, games, training days) join; counts add up both sides' increments; the
  puzzle review queue keeps the card with more misses and a repertoire card the latest review; a
  repertoire or analysis edited on two devices before they synced is kept twice, the other version
  named "… (other device)". Writes go by version, so two devices syncing at once never overwrite each
  other: the second merges again.
- **Private by design.** The data is encrypted on the device (AES-256-GCM, with keys from the phrase
  by HKDF-SHA-256) before it leaves; the relay stores scrambled bytes under a random name — no
  account, email or device name — and never sees the phrase. A relay that altered a vault, swapped
  one for another or rolled one back to an older copy would be caught. The phrase is the only key,
  so the join dialog asks for one from the learner's own devices: whoever made a phrase can read
  everything synced with it.
- **Ending it:** _Turn off_ stops syncing on one device (its data stays); _Delete synced copy_
  deletes the encrypted copy, and every device keeps what it has — the others say so at their next
  sync. A synced copy no device has used for a year is deleted. _Reset everything_ turns sync off
  on the device before clearing it.
- **Limits:** up to 1.4 MB of compressed data — far more than the app's own storage caps produce.
  Data from a newer version of the app pauses the sync until the device is updated. When this
  device's storage is full, syncing waits and says so: nothing it could not save is agreed with the
  other devices, and it carries on once there is room. Offline it waits for the connection; when
  the sync service cannot be reached, it says so and tries again a few minutes later.

While sync between devices is on, the Lichess account sync leaves repertoires and analyses to it.
The relay is a small Cloudflare Worker (or a Node server) in `relay/`; see `relay/README.md`.

## Lichess account sync

_Settings → Lichess account_ connects the profile to a Lichess account, which then keeps the
device in step with it — and, through it, with the learner's other devices. The sign-in happens on
lichess.org (the OAuth authorization-code flow with PKCE, which Lichess offers to apps without a
server): Lichess asks whether the app may read and write the puzzle activity and the studies, and
sends the learner back to `/settings/lichess`, which finishes the connection and starts the first
sync. A personal token made on lichess.org and pasted into the card works too — the card links to
the page with the permissions ticked — for a window that cannot finish the sign-in: an app on the
Home Screen of an iPhone or iPad, which iOS sends to Safari for it. Each part can be switched off:

- **Puzzles.** Every Lichess puzzle solved here counts on Lichess too: rated when it was rated
  here, a win only when solved without a hint (blind and rush solves go up unrated). Results from
  offline play wait in an outbox on the device — the Puzzles page says how many while offline — and
  go up in batches once it is back online. Lichess's puzzle history comes down: puzzles new to this
  device count toward the theme statistics and the training days, and the newest misses (up to 30
  per sync) are fetched whole and join the review queue, so they work offline too. The puzzle
  rating follows the Lichess puzzle rating (a switch of its own); results sent from here are
  recognised when they come back and never count twice.
- **Games.** A game finished here (drill positions excepted) is imported to the account, where the
  Lichess analysis board can look at it; the game log links to it. The app's record of the game
  travels with it in a `ChessTrainer` PGN tag, so another device reads the account's imported games
  back and restores its game log, newest first. Lichess imports the same text once, so a retried
  upload never doubles a game.
- **Repertoires and analyses.** Custom repertoires live as chapters of a private study (only you may
  share or export it) named _Chess Trainer · Repertoires_, saved analyses in one study per
  collection (_Chess Trainer · Analyses: Endgames_), continued in "(2)", "(3)" when a study reaches
  Lichess's 64 chapters. Each side is compared with how it looked at the last sync (a hash of each
  side's own version, so the small rewrites Lichess makes to a PGN never look like edits): new
  moves, comments, glyphs and arrows, a new name or side, and deletions come across either way; when
  the same item changed on both sides, both versions are kept — the Lichess one here as "…
  (Lichess)". Only a deletion made in the app deletes on Lichess: an item that went missing on the
  device any other way (a damaged save) comes back from its chapter, and a study deleted outright on
  Lichess is made again from the device. An item too big for a chapter (3,000 moves) or refused by
  Lichess stays on the device until it changes. A study nothing changed in is not read again. Names
  go to Lichess the way Lichess keeps them — a chapter's cut to 80 characters, a collection's
  without emoji and symbols — while the device keeps them as typed.
- **Ratings.** The account's game ratings suggest a starting rating for the human-like opponent
  (rapid, else blitz, else classical).

The sync runs on its own a few seconds after the app opens, when the device comes back online or the
app back into view, half a minute after results start to wait, and every 15 minutes while the app is
on screen; _Sync now_ runs it at once. One request at a time, as Lichess asks; a pause when Lichess
asks for one; nothing lost when it fails part-way — the outbox empties only as Lichess confirms. If
Lichess stops accepting the sign-in (withdrawn, lapsed, or short of a permission), the card says so
and offers to connect again — the sign-in is checked once more when the app opens; anything else
Lichess refuses is noted in the card while the rest of the sync goes on. Results and games the
device recorded without sending — before connecting, while disconnected or while that part was off —
are offered after connecting and when a part is switched back on (_Send them_ / _Not now_).
Lessons, flashcards, review schedules and settings stay on the device: a backup, or sync between
devices, moves those (settings aside). While sync between devices is on, the repertoires and
analyses part pauses: those travel with it instead. The token is kept in this profile's storage on
this device, never in a backup; _Disconnect_ revokes it on Lichess. Importing a backup starts the matching over, so nothing on Lichess is deleted for
items the backup does not hold.

## Reference

The rules of chess, notation (SAN, PGN, FEN, engine evaluations), a searchable glossary — including
the rating and tablebase terms the app prints (Glicko-2, rating deviation, DTZ, DTM) — linked to the
step of the lesson that teaches each idea, and an FAQ.

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
square — the letters never trigger page shortcuts) with a "describe position" button and spoken
descriptions of view-only diagrams, keyboard shortcuts (press `?`; the single-letter ones can be
switched off in Settings for speech input and switch devices, while Enter, Space and the arrows keep
working), focus management, a
colour-blind-safe high-contrast board theme, high-contrast piece sets (**MPChess** and **California**), a soft sound
theme, reduced-motion support, a visible focus ring on every surface (and Windows High Contrast
styles) and WCAG-AA text contrast — checked by an automated axe-core sweep of every page, one of each
parameterised route included, in all three colour schemes.

## App and offline

Web manifest, a hand-written Workbox service worker with an offline precache (app, engine, openings,
the first puzzle chunk of every band) and on-demand caching of the rest, an install prompt with iOS
instructions and screenshots in the install dialog, a monochrome icon for themed launchers, update
notifications, window-controls overlay on desktop, a **badge with due reviews**
on the app icon, **haptic feedback** on phones, and layouts for notches, small phones and phones held
sideways.

## Privacy and network use

There is no sign-up: everything you do is stored in your browser, on your device. The app talks to
the network only when you ask it to — importing your games from Lichess or chess.com, the opening
explorer and tablebase lookups, which are off by default, the Lichess account sync once you connect
an account, which talks to lichess.org alone, and sync between devices once you turn it on, which
sends the relay only data encrypted on the device. Optional
downloads (the full engine, the human-like opponent, the whole puzzle set) come from the app's own
site, and the human-like opponent runs on your device like the engine: no position leaves it. Backups are
files you keep. The page's Content-Security-Policy holds the app to that: it can connect only to
its own site, those four services (lichess.org, its explorer and tablebase, api.chess.com) and the
sync relay, runs only its own scripts, and refuses to be shown inside another site's frame.

Browsers allow a site roughly 5 MB of local storage. The app caps what it keeps (300 puzzle
attempts, 200 imported games — unreviewed ones make room first — 500 saved analyses, 300 own-game
puzzles, 500 queued reviews, 20,000 remembered puzzle ids) and shows the total in Settings ("about
5 MB", or the limit the test lab measured on this device); if a write no longer fits it keeps running,
warns once, marks the failed key in Settings and saves everything again as soon as there is room.
Two tabs on the same profile stay in step: a change saved in one is picked up by the other. A saved
blob that cannot be read is set aside under `<key>:corrupt-<time>` rather than overwritten.
Reviews due a day or more away come due at 04:00 local time on that day.

## Compatibility promise

From 0.9 on:

- a backup made by any version imports into every later version (and a newer one imports with a
  warning, the fields this version does not know left out);
- data stored in the browser migrates on load, so an update never loses progress;
- share links (`#z=`, `#rep=`, `#wp=`) made by any version keep opening.

Fixtures from each earlier export format live in `src/store/fixtures/` and are imported in the unit
suite on every run.

## Under the hood

- **Static only.** Vite, React and TypeScript build to plain files. The engine is a WebAssembly
  worker and the puzzle database is a set of JSON chunks fetched on demand.
- **Free software.** GPL-3.0-or-later. The site ships its licences and the third-party notices
  (`licence.txt`, `licence-agpl.txt`, `notices.txt`), linked from the footer of every page with the
  credits: Stockfish and Chessground (GPL-3.0), Maia-3 (AGPL-3.0), the chosen piece set (the
  Classic pieces by default: Colin M.L. Burnett, CC BY-SA 3.0) and the Lichess puzzles and openings
  (CC0). The textured boards (Lichess, AGPL-3.0) are credited under the board picker.
- **Engine.** [Stockfish.js](https://github.com/nmrugg/stockfish.js) 19. The lite build, with
  Stockfish's small network (about 2 MB), runs by default and is far stronger than any human; the
  lowest playing levels are weakened in software (shallow search, sampling among several candidate
  moves, occasional random moves) so that real beginners can win.
- **Multi-threaded by default.** Multi-threaded WASM needs `SharedArrayBuffer`, which browsers only
  expose to cross-origin-isolated pages, and GitHub Pages cannot send the required headers, so the
  service worker adds the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers
  itself. The first visit runs one thread (there is no service worker yet); from the next load on, the
  engine uses all but one CPU core (at most eight, four on phones and tablets). The headers also block
  cross-origin resources that are not CORS-enabled, and the app loads none: its only cross-origin
  requests are CORS calls to the Lichess and Chess.com APIs. _Settings → Multi-threaded engine_
  switches threads, and the headers, off from the next load. If the threaded worker fails to start,
  the one-thread engine takes over; if a worker dies later, mid-game, the page shows the error with a
  Retry button that starts a fresh engine.
- **Full engine (optional).** _Settings → Full engine_ downloads Stockfish 19 with its large network
  (99 MB) — the threaded or the one-thread build, whichever this device runs — and the service worker
  keeps it offline. It is noticeably stronger in deep, sharp positions, which analysis and game review
  gain most from. Until the download is complete, or where the full engine cannot start (a phone short
  of memory, say), the lite engine runs. Switching it off deletes the download.
- **Human-like opponent.** [Maia-3](https://huggingface.co/UofTCSSLab/Maia3-5M) (University of
  Toronto Computational Social Science Lab; the 5M-parameter model in half precision, 10.8 MB) runs
  in its own worker on [ONNX Runtime Web](https://onnxruntime.ai)'s WebAssembly build (14.2 MB). It
  reads the board from the side to move's point of view and scores every move for a player of the
  chosen rating facing one of the same rating; the app keeps the legal moves, turns the scores into
  probabilities and draws one. The two files come from the app's own site, are checked against their
  SHA-256 before they are kept (a cut-off download or a captive portal's page is refused), and live
  in a cache of their own that the worker reads directly — offline, and with or without the service
  worker.
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
  `npm run drills:verify`, `npm run studies:verify` and `npm run repertoires:verify` confirm the
  chess against Stockfish, in CI whenever the content changes and every week.
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

Any evergreen browser with WebAssembly and Web Workers: Chrome and Edge 111+, Firefox 121+, Safari 16.4+
(iOS 16.4+) — the floor set by the stylesheet (`color-mix()`, `:has()`, `dvh` units and container
queries). The threaded engine runs in all of them from the second load on (once the service worker
isolates the page) wherever at least three CPU cores are reported; elsewhere the one-thread engine
runs. If the engine fails to load, lessons and puzzles still work. The human-like opponent needs
WebAssembly SIMD (in all of them) and site storage on a secure connection; where a browser cannot keep
its files, the setup says so. CI runs the end-to-end tests
on Chromium (desktop and a phone profile), Firefox and WebKit, and once more under the production
base path. The interface is in English only.
