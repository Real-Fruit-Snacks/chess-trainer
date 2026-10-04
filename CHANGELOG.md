# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.13.0] - 2026-10-04

Two new Arcade games built on the rules themselves: Arbiter, where you catch the illegal move in a
replayed classic, and Ghost Knight, where you hunt a knight you only see every third move.

### Added

- **Arbiter** (_Arcade_): a stretch of a classic game replays at speed and then one move breaks the
  rules — call it with the button or Space before the next move would have come. Eighteen kinds of
  illegal move in three tiers, from a knight off its L and a pawn going backwards, through a piece
  jumping another and a pawn left unpromoted, to a pinned piece moving, a king walking into check, a
  check ignored, castling past an attack, en passant too late and one side moving twice. Every call
  is answered with the rule and arrows or marks that show it. Each round is faster; a missed move or
  a legal one called is a strike, and three end the run. A normal and a slow pace; the replay pauses
  when the page is hidden, and a pause covers the board.
- **Ghost Knight** (_Arcade_): an enemy knight hides on the board and shows itself every third move.
  Your squad moves by the ordinary rules; the knight never jumps onto an attacked square and takes
  any piece left unprotected in its reach. Land on it (a rook or bishop that runs into it stops and
  takes it) or corner it. The shaded mode marks every square it could be on; unshaded, you track it
  yourself for double points. Five hunts, each harder than the last, and three lives.
- Two icons for them, a whistle and a ghost, in the same line style as the rest.

### Fixed

- In the dark and black schemes a red button under the pointer (Resign, Delete, Arbiter's call) had
  white text on light red, below the AA contrast ratio; it now has dark text.

### Changed

- The board's spoken square and position descriptions read the pieces from the position itself, so
  boards chess.js cannot load — no kings, or the position after an illegal move — are described too.
- Buttons take a `ref`, so a page can move the keyboard focus to one.
- The Arcade, the Home page and the More menu count eleven games.

### Testing

- Every illegal move found at every position of every classic game, of every kind, is checked to be
  one chess.js refuses; each kind is also tested on a position built for it. Rounds are tested for
  their real moves, their tier and the rare kinds; the run for its clock, calls, strikes, pauses and
  record.
- Ghost Knight's squares-it-could-be-on are checked to hold the real knight through random hunts with
  every squad, and every squad is won within its budget often enough by a hunter that looks one move
  ahead. Catching, running into the knight, cornering it, losing a piece, running out of moves and
  the scoring are tested one by one.
- Both pages are tested end to end in every browser, and in the accessibility sweep in every colour
  scheme.
- The test lab's end-to-end check looks for its own toast rather than the newest one, so the "Ready
  to work offline" toast arriving at the same moment no longer fails the nightly run in Firefox.

## [0.12.1] - 2026-10-04

Sharper game review at every depth, a linked puzzle that says what it is, and React Router 8,
TypeScript 6 and vite-plugin-pwa 2.

### Fixed

- **Game review:** a move the first pass flags is now compared with the engine’s choice once more,
  both moves in one search at depth 14 or deeper, and judged by that search. A deep sacrifice is no
  longer marked down for what a shallow search cannot see — Morphy’s 15.Bxd7+ in the Opera Game was
  a “mistake” at the Fast depth — and a slip the second search finds worse is reported as worse.
- **Puzzles:** a puzzle opened from a link (the recent puzzles on Progress) is unrated practice, and
  the mode bar no longer shows Rated as chosen while it is on the board; the tab reads “Puzzle
  practice”.

### Changed

- **Dependencies:** React Router 8, TypeScript 6 (the deprecated `baseUrl` is gone from the
  TypeScript configs) and vite-plugin-pwa 2. React Router 8 needs Node 22.22 or newer, which is now
  the floor for working on the project.
- The visual snapshot job runs on Ubuntu 24.04, whose fonts the pixel baselines were rendered with,
  so the move of `ubuntu-latest` to Ubuntu 26 on 19 October does not break it.
- Dependabot leaves TypeScript 7 alone until typescript-eslint accepts it (its peer range stops at
  6.x, so TypeScript 7 cannot be installed beside it).
- The screenshots in the README show the current app.

### Testing

- The game review’s second look is tested both ways (a strong move cleared, a slip made worse) and
  at the review’s own depth when that is deeper than 14; a segmented control can show no option as
  chosen; a linked puzzle leaves the mode bar unchosen until a mode is picked.
- The board-style end-to-end check waits for the board’s styles instead of reading them once, so a
  board re-created when the engine becomes ready no longer fails it on slower machines.

## [0.12.0] - 2026-10-03

A full audit of every mode, and what it put right: safer backups, chess and PGN fixes, a sounder
coach and opening practice, analysis and review fixes, corrected lessons, puzzles that work offline
band by band, arcade fixes, accessibility, PWA and platform hardening, licence files, a Content
Security Policy, CI-gated deploys, reproducible builds and a start-up bundle 30 % smaller.

### Added

- **Data and backups**
  - **Backups include My games** (export format 7): the imported games and their reviews now move
    with you. With several profiles on a device, the file name carries the profile’s name.
  - **Importing a backup asks first, and can be undone.** Settings shows what the file holds, offers
    “Export current progress first” and, after the import, “Undo import”. A backup opened with the
    installed app gets the same question instead of being imported at once.
  - **Reset app data** on the crash page, behind a confirmation: when a damaged save keeps the app
    from starting, everything it stored in this browser can be cleared and the app starts afresh.
- **Single-key shortcuts** (_Settings → Play_): letter keys such as H for a hint can be turned off
  for speech input and switch devices (WCAG 2.1.4); Enter, Space and the arrow keys keep working.
- **Analyze:** move buttons right under the board on phones; an en passant square in the board
  editor; “Load the moves before it” when a PGN has an illegal move.
- **Learn:** a recall card on Learn and a recall link at the end of each lesson; “Back to course”
  and “Next in course”; glossary entries for Glicko-2, RD, DTZ, DTM, tablebase and Woodpecker, and
  glossary links to the exact lesson step.
- **Board and drills:** castling by dropping the king on its own rook; typed answers in the
  coordinates drill.
- **Arcade:** Analyze game and Copy PGN in every arcade engine game, opening from your side; focus
  mode in all of them; a board strip with Next under the Simul’s board on phones; the Daily Opening
  result through the share sheet where there is one.
- **App:** a monochrome manifest icon for themed launcher icons (Android 13+) and four screenshots
  for the richer install dialog, kept out of the precache (`npm run screenshots` renders them);
  reopening the installed app reuses its window.
- **Licensing:** the footer credits Stockfish (GPL-3.0), Chessground (GPL-3.0), the Classic pieces
  by Colin M.L. Burnett (CC BY-SA 3.0) and the Lichess puzzles and openings (CC0), and links to the
  licence and the third-party notices, now shipped as `licence.txt` and `notices.txt`.
- **Engineering, CI and docs**
  - **Content workflow:** the engine checks every lesson task and scripted reply, every study
    (unlisted moves included), every repertoire move and every drill position, in parallel jobs,
    when the content or its checks change, weekly and on demand; drill checks moved there from every
    CI run.
  - **`npm run repertoires:verify`:** all 2,624 moves of the 16 repertoires pass at depth 14 (within
    120 cp for the learner’s moves, 300 cp for the opponent’s).
  - A **production base path** job tests a `/chess-trainer/` build behind `scripts/serve-dist.mjs`
    (`npm run preview:pages`); **hidden source maps** stay off the site and are kept with each
    deploy for 90 days, and crash reports name the commit.

### Changed

- **Data and backups**
  - **Compatibility.** Backups of every earlier format still import, and saved data migrates by
    itself: settings to version 4, progress to version 7, and the repertoire, games and analysis
    stores now migrate instead of resetting.
  - The backup date, the welcome tour and the Lichess and chess.com usernames belong to each profile
    rather than the device; the unused puzzle-theme setting is gone.
  - The backup reminder waits until there is something worth keeping (lessons, repertoire cards,
    games or a run of rated puzzles), counts attempts, not “solved” puzzles, and “Later” snoozes it
    for a week.
  - Reviews due a day or more away come due at 04:00 local time on that day.
  - An imported analysis library replaces the current one within its 500-entry cap; seen puzzles
    keep the newest 20,000 and the review queue 500; the 200-game cap drops unreviewed games first
    and says how many went; the storage meter says “about”, or uses the limit the test lab measured.
- **Play and repertoires:** at most four engine threads on phones; grading a repertoire move also
  grades its transpositions; sharing a repertoire uses the share sheet where there is one.
- **Analyze and My games:** re-saving a library entry updates it, and the library warns near its
  500-entry cap; game review searches forced moves and the first opening plies less deeply; Insights
  show their sample sizes and grey out thin figures; games and repertoires are parsed once.
- **Learn and Home:** lesson steps are at most 130 words; the space and pawn breaks lesson joined
  the Club player course; locked course units keep full-contrast text; returning learners see
  “Today” first; the Arcade card lists all nine games.
- **Puzzles and drills**
  - **Puzzles load only what they need:** the chunks in memory first, then a few more per band,
    usually stopping after the first. The daily puzzle loads one chunk, and a puzzle opened from
    Progress searches only bands near its rating.
  - Puzzles from your own games accept any move the engine rates within 50 cp of the stored one.
  - Shared Woodpecker sets are checked against the bundled puzzles, even on a slow connection, and
    offered in a dialog; a link with under ten known puzzles is refused, and a missing puzzle is
    skipped, not counted as solved.
  - “Due” and “Redo missed puzzles” replace “Review”; each mode has its own tab title; an unknown
    mode opens the Puzzles page; the vision drills’ “Recall” is “Guess”; drills, studies and
    patterns show difficulty one way.
- **Arcade**
  - **Fairer scores:** Hand & Brain is accuracy × engine level × the share of a full game, with no
    score for resigning before 10 calls; Fortress is positions held × level; Blindfold is (result +
    peek bonus) × level, the bonus only for a win or a draw.
  - Who Stands Better? positions come with either side to move (all had White to move); the side to
    move is shown, and answers are scored in tenths of a pawn.
  - Daily Opening, Engine Says, Who Stands Better? and Hand & Brain follow the notation setting.
- **Settings, lab and sound**
  - The strength setting reads “Engine level for the next game”; in tap mode the magnifier and drag
    target are disabled with a hint; the sound-theme picker stays where the device can vibrate;
    vibration is “available in this browser”; Escape cancels a profile rename, and duplicate names
    are refused.
  - The test lab shows preferences such as reduced motion as information rather than failures,
    re-runs its checks when things change or on Refresh, and records the measured storage limit.
  - Sound mixes with other audio rather than interrupting it, and sleeps after a minute of silence.
- **Wording and consistency**
  - **One confirmation dialog**, Cancel first, for everything that cannot be undone, from resigning
    and giving up to deleting repertoire lines, library entries, puzzles or imported games and
    resetting the board or the rating; the browser’s confirm boxes are gone.
  - One name for each action (“Analyze position”, “Analyze game”, “Play it out”, “Copy link”,
    “Engine level”, “Show the board”, “Play again” beside “New game”); Elo figures are a rough guide
    everywhere; levels, colours and outcomes are shown as words.
  - British spelling: “Defence” and “Centre” in opening names, curly apostrophes, dates such as
    “3 Oct 2026”, the page language en-GB and “Practise” as the verb.
  - One tagline, from the site configuration; the More menu’s groups are Train, Games and Tools on
    every screen; the placement quiz highlights Learn; every not-found page looks the same.
- **App, PWA and platform**
  - **A smaller start.** The launch-file import, the lab clean-up, the audio warm-up and the
    repertoire due count load only when needed: start-up code is 36 KB gzipped (51.5 KB in 0.11.0),
    and its budget drops from 56 KB to 42 KB.
  - The service worker answers only the app’s own routes, so a root deploy on `user.github.io`
    leaves sibling sites alone, and it keeps the threaded-engine flag in memory.
  - The light theme colour and the manifest background match the page; supported browsers are Chrome
    and Edge 111+, Firefox 121+ and Safari 16.4+; `react-router` replaces `react-router-dom`.
- **Engineering, CI and docs**
  - **Deploys wait for CI:** the Pages deploy runs only after CI passes on `main`, and ships the
    commit CI tested.
  - **Reproducible builds:** the build date comes from `SOURCE_DATE_EPOCH` or the last commit, so a
    rebuild is byte-identical and prompts no update; builds record their commit.
  - CI skips the builds for documentation-only pull requests and caches the browsers and the
    engine; a local `npm run e2e` needs only Chromium.
  - Releases check `package.json` against the tag; the openings import reads a pinned commit; drill
    verification loads the drills through Vite; minor dependency updates leave `npm audit` clean.
  - DEPLOYMENT.md is rewritten, CONTRIBUTING.md says what CI runs, ARCHITECTURE.md has measured
    sizes and SECURITY.md matches FEATURES.md; the changelog’s 0.8.0 section is restored and its
    0.11.0 simul note corrected.

### Fixed

- **Data and backups**
  - **A damaged backup can no longer break the app.** Every field is checked first, a bad part is
    refused by name, damaged entries are dropped and all parts are replaced together or not at all;
    a PGN is told it is not a backup.
  - “Reset everything” also clears imported games and the threaded-engine flag, and lists what it
    keeps; the rating reset is a confirmed button that keeps the history.
  - Two tabs no longer overwrite each other; after a full disk every store saves again, with one
    warning; profiles survive a full disk and refuse duplicate names; an unreadable save is copied
    aside; newer data keeps its unknown fields; a broken rating or unknown setting is repaired; the
    best streak can pass 400 days; Android’s text-typed `.json` files can be picked.
- **Chess and PGN**
  - PGN with glued move numbers (`1.e4 e5`) imports; `[%clk]`, `[%eval]`, `[%csl]` and `[%cal]` are
    no longer shown as comments and survive export; a bad FEN header no longer crashes Analyze.
  - Castling rights and en passant squares are checked against the pieces, so no phantom castling;
    four-field FENs and EPDs are accepted; evaluation symbols and stray tokens no longer abort an
    import; header-less games stay separate; comments before the first move or a variation survive.
  - Typed moves accept `nf3`, `a8=q` and `B2c3`, and `e8` promotes to a queen when “Always promote
    to a queen” is on (Analyze included); otherwise the input asks for the piece.
- **Board:** boards no longer go dead after a cancelled promotion, nor the capture and check drills
  after one move; the click-to-answer board and the Home hero board have the right square colours;
  drawn arrows survive updates; the drag marker no longer sticks; the eval bar is blank until there
  is a score and holds it between searches; nested variations no longer shrink; clocked games stop
  re-rendering the board ten times a second.
- **Play and coach**
  - **The coach judges at full strength**, no longer calls checkmate a blunder and no longer
    misjudges quick moves with a search cut short.
  - Take back is disabled once the game is over (it recorded the game twice); alerts and the
    promotion picker close at game over and no longer stack.
  - **Handicap, arcade and Simul games no longer count as engine games** for the ladder, courses and
    Progress: each game records where it was played.
  - Arcade games leave the Play setup alone; keyboard entry keeps focus; blindfold pieces return at
    game over; analysis opens from your side; weak levels stay weak on a short clock; the engine no
    longer flags in long games; stale hints are dropped; a crashed engine offers Retry at the same
    level; unplayable start positions are refused; the ladder clears slips and keeps climbed rungs.
- **Opening practice and repertoires:** the book really favours the moves you know least; leaving it
  twice at one move alerts twice; both clocks stop during the alert; hints follow the repertoire; a
  forgotten move is no longer treated as new; misses are said to return in ten minutes; an
  unreadable saved repertoire can be copied or deleted instead of crashing its page.
- **Classics:** four hidden notes appear; wrong notes in the Evergreen Game, Steinitz–von Bardeleben
  and Bernstein–Capablanca are corrected; a restart mid-judgement no longer plays a stray move.
- **Analyze and game review**
  - **Missed and allowed mates are flagged** and discovered attacks recognised; a flagged move is
    searched again from the position before it, so Morphy’s 15.Bxd7+ is no longer an inaccuracy; the
    engine sees repetitions; searches cut short are retried, not trusted.
  - The tablebase’s “mate in N” counts moves, not half-moves, and its errors are in words; arrow
    keys on the evaluation graph move one ply; “Move up” drops an outdated review, and deleting a
    side variation keeps it; copied links keep the start position and variations, and long ones
    warn; stale engine lines no longer linger.
  - Variant games are skipped on import; the board editor keeps move counters and refuses impossible
    material; page keys ignore menus, dialogs and modifier keys; king safety reads the right side’s
    files; the explorer explains when it is offline and has a real switch; a loading engine and a
    disabled “Review game” are explained.
- **My games:** an engine failure stops “Review all” with one message, Stop stops the search and
  Retry is offered; filters restart paging; chess.com pages read at most six archives; the
  repertoire check handles uncovered Black games and transpositions.
- **Learn and courses**
  - **Three lessons taught losing lines** (“Trade the attacker”, “Trade the defender” and the
    Philidor “textbook draw”) and are rebuilt; about twenty more wrong statements and every material
    count that contradicted its diagram are corrected.
  - Endgame tasks accept moves that are just as good, and failure texts no longer call sound moves
    losing; two lessons that judged …Nh6 differently now agree.
  - **Recall:** “Show answer” counts as a miss, and “Hint” shows its arrows before grading.
  - Course checkpoints no longer re-lock; “Restart lesson” keeps the completion; the placement
    result is followed; skipped tasks end in “End of lesson” with “Go to step N”; progress is kept
    by step id; the placement quiz counts its questions right, matches its thresholds to their
    labels, and “Open the course” finishes onboarding.
- **Home and Progress:** puzzle figures cover your whole history, not the last 300 attempts; a weak
  theme must trail your own accuracy by 15 points over 20 attempts and never replaces the daily
  plan’s rated puzzles; the weekly summary covers seven days, not eight; strengths and weaknesses no
  longer overlap; glossary and FAQ text is formatted and corrected; Reference fits phones.
- **Puzzles**
  - **Puzzles work offline band by band:** each band is dealt across its chunks by rating, so the
    precached first chunk spans the whole band, and every mode plays from whatever has loaded.
  - H and S ignore typed squares and Ctrl/Cmd+S and work in either case; “Show solution” no longer
    auto-advances; a replayed daily puzzle keeps the first result; underpromotions ask for the
    piece; by-opening cards train every opening listed.
  - A correct rated solve never lowers the rating; Woodpecker misses stay out of the review queue;
    the day streak is current; Rush’s clock pauses during downloads and Enter starts a run; on
    phones the Rush timer and the coordinates prompt sit above the board; stopping the offline
    download is no failure, and leaving Settings no longer stops it.
  - The mode strip wraps on phones, theme links are bigger, and only rated mode asks for a rating.
- **Drills, patterns and studies:** a promotion counts once the piece is safe; hold and capture
  drills judge material after the reply; the two-rooks drill survives a lost rook; endgame drills
  start from a random position; the hook-mate diagram has one mate; study solutions wait for your
  move, and Replay starts clean.
- **Arcade**
  - **Odds Ladder** rungs are readable rows and draws count as played; **Engine Says** keeps the
    score after a full line and works with a screen reader.
  - **Simul:** leaving asks first and a reload resigns the boards in play; N keeps focus; a board
    ended by your move stays in view; resigned boards stop their search; replies are announced one
    by one; a stalled engine offers Retry.
  - **Daily Opening** tiles pass contrast in dark and black, with glyphs, spoken labels and a
    legend; answers match their entries; midnight no longer changes a game under way; played days
    stay played; broken streaks are not shown.
  - Hand & Brain’s status messages no longer swap; Fortress grades the last move before counting it
    and asks before “Give up”; Blindfold hides captured material.
- **Settings, lab and sound:** the lab’s storage fill is removed when you leave the lab and at the
  next start; the threaded-engine switch shows “Reload now” only when needed, reverts when it cannot
  be saved and tells a browser with no service worker so; no sound or vibration before your first
  tap; overlapping sounds no longer clip, and sound resumes after a call.
- **Accessibility**
  - **Visible focus:** an opaque outline replaces a ring below 3:1, focus and controls show in
    Windows High Contrast, and focused controls no longer hide under the header or the bottom bar.
  - **Toasts are announced**, show their tone and appear above dialogs; typed squares no longer fire
    page shortcuts; move announcements are right after jumps; boards explain their keys; view-only
    boards describe their position; the promotion picker is modal.
  - Dialogs have a close button, and a confirmation opened over one leaves it open; touch screen
    readers find switches where they are drawn; segmented controls are radio groups; the More menu
    is a disclosure; the click-to-answer board is one tab stop; lesson step dots are proper buttons;
    hints belong to their fields; progress bars speak words, not byte counts.
  - Text alternatives for captured material, hint arrows, ladder rungs, the weekly trend, Rush
    strikes and the Army Draft budget; engine lines are announced once; read-only move lists are
    text; the evaluation graph and the Who Stands Better? slider speak their values; drill results
    are announced, and focus is kept after Next, drills, lesson steps and mode changes; the keyboard
    cursor and the explorer bar have more contrast, and the eval bar is wider, with a border;
    bottom-bar labels and the eval-bar score are 12 px; reduced motion is respected; the not-found
    page has a heading.
- **App, PWA and platform**
  - **Pages open at the top** and Back restores your place; the skip link keeps share links intact.
  - Large phones held sideways get the landscape layout; the colour scheme no longer flashes at
    start; the layout respects iPhone safe areas and 320 px screens, where a button that does not
    fit beside its text moves to a line of its own instead of spilling out of its card; iOS no
    longer zooms text areas.
  - “Reload now” works on a first visit and reloads only its own tab; runtime caches check what they
    store and expire; the crash page confirms copying and explains an out-of-date app, and a crash
    inside a page keeps the navigation; “Not now” on the install banner lasts 30 days, and the
    installed app is recognised in every display mode; the shortcut list matches the pages; link
    previews have an absolute image address and Open Graph and Twitter tags.
- **Licensing and engineering:** `package.json` says GPL-3.0-or-later, not MIT; `setup-engine.mjs`
  keeps `version.json` current; the scripts’ engine runner is safe in parallel and never hangs;
  `npm run e2e:visual` runs on Windows.

### Security

- **Content Security Policy** in a meta tag on the built app: scripts only from the site,
  connections only to the site and four Lichess and chess.com services; the service worker adds
  `frame-ancestors 'none'`.
- Share links are bounded (1 MiB expanded, 200 Woodpecker puzzles, 80-character names); browsers
  without compression support are told they cannot open compressed links; source links from imports
  must be https links to lichess.org or chess.com; the chess.com import fetches only the player’s
  own archives; requests time out after 15 seconds and honour Retry-After; backups over 50 MB and
  PGN files over 20 MB are refused unread.
- GitHub Actions are pinned to commit SHAs and installs skip package scripts; SECURITY.md links
  private vulnerability reporting.

### Testing

- Unit tests for every state-machine hook (the endgame drill game and Hand & Brain included), the
  backup schema, the migrations, the PGN parser, the board, the service worker and the build
  scripts; CI enforces a coverage floor, and a nightly run fails on flaky tests.
- Nine end-to-end specs for this release, run on all four browser projects (Firefox and WebKit
  included); the accessibility sweep adds the black scheme, fourteen parameterised routes and the
  not-found page; the manifest’s icons and screenshots are checked at their stated sizes.
- The compatibility test covers every backup format from 2 to 7 and older saved stores.
- Lesson tests replay every quoted line and cap steps at 130 words, and no scripted reply may throw
  away more than 300 cp.
- End-to-end tests wait on the app’s own signals and on the board’s animations instead of fixed
  timeouts.

## [0.11.0] - 2026-10-02

A simul: several engines at once, each on its own board.

### Added

- **Simul**, the ninth arcade game: two to eight games against Stockfish at once, each on its own
  board, the way a simul giver walks the room. Choose the strength (or let it rise a level per
  board), your colour (White, Black or alternating) and the clocks.
- **A clock per board.** With clocks on, every board has its own clock for each side, as in a clock
  simul. Yours runs on every board where it is your move — even while you are playing another one —
  so each board you add makes your time go faster; the setup shows roughly how many seconds a move
  you will have. The engine's clock runs only while it is thinking, never while it waits its turn,
  and its thinking time is cut to fit what it has left. Untimed simuls stay an option.
- Small boards show every game, its state and your clock on it. Tap one to play it, or press **N**
  for the next board waiting for you; after each move the next waiting board comes up by itself
  (a switch turns that off). One engine answers the boards in the order they started waiting, and
  replies on a board you are not looking at are announced to screen readers.
- Every finished board is recorded in the engine game log on Progress (the last 50 games against
  the engine), not under My games. The summary lists each board's result with an Analyze button,
  and the score to beat counts each win by its board's level (1 to 8) and a draw by half.

### Fixed

- **A flag against a bare king is a draw.** In Play, running out of time when the opponent could not
  checkmate by any series of legal moves — a lone king, say — is now a draw rather than a loss, as
  the rules say.
- After the engine failed to start, **Retry** starts a fresh engine instead of showing the same
  error again.
- Analyze and My games no longer load the Play page's code just to hand a game to the analysis
  board.

### Testing

- Unit tests for the simul model (clocks that start at once, increments, the engine's clock only
  while it searches, flags and the bare-king draw, the engine's time budget, the order boards come
  up in, scoring, PGN headers), for the runner (the engine queue, replies and announcements, saving,
  clocks under fake timers, a failed engine coming back, promotions), for the flag rule and for the
  engine Retry. An end-to-end spec plays a two-board simul through moving on, **N**, resigning, the
  summary, the hand-off to Analyze and the hub score; checks that every board keeps its own clocks;
  sets up alternating colours with rising strength; and lets every flag fall — on all four browser
  projects. The accessibility sweep covers the simul page.

## [0.10.0] - 2026-10-01

Board and display preferences, after a look at what the Lichess app offers.

### Added

- **Move notation.** Moves are written with figurines by default — the piece drawn from whichever
  piece set is active, so ♘f3 looks like the knight on your board — in every move list, engine line,
  explorer and tablebase table, coach and review explanation, lesson and feedback text. _Settings →
  Appearance → Move notation_ switches to letters. The letter stays in the page for screen readers,
  searches and copying, and stored games, PGN and share links always use letters.
- **Black colour scheme.** The dark scheme on a pure black background, for OLED screens; the header
  toggle cycles through system, light, dark and black, and the browser chrome follows.
- **Two more piece sets**, both original: **Modern** (flat silhouettes with a single outline weight)
  and **Pixel** (an 8-bit set with crisp edges, a match for the Retro sounds). Sets are picked from
  strips showing every set on the current board colours.
- **Four more board colours:** purple, olive, ice and walnut.
- **Drag feel:** the dragged piece is magnified under the finger, a circle or square marks the square
  it is over, and pieces can be moved by tap, by drag, or either. Keyboard control works in every
  mode.
- **Board highlights** (last move and check) can be turned off.
- **Captured material** beside the player bars shows the difference only (an exchange of knights
  shows nothing), every capture, or nothing.
- **Focus mode** hides the header and navigation while a game against the engine is on; the setting
  is in _Play_, and a Focus button on the Play page toggles it mid-game. The chrome comes back when
  the game ends or the page is left.
- A **Board** card in Settings gathers the board colours, piece sets and board behaviour; Appearance
  keeps the colour scheme, notation and sounds.

### Changed

- The classic cburnett set is now served from the app's own stylesheet (generated from the
  Chessground package by `scripts/generate-pieces.mjs`, with the same selectors as every other set)
  so the picker can show it next to the rest.
- The bundle budget now limits the start-up code as a sum — the entry chunk plus what it imports
  statically — instead of the entry file alone, since the bundler moves code between those chunks
  from release to release (this release's start-up code is 51 KB gzipped, up 0.4 KB).

### Testing

- Unit tests for the notation parser and the figurine components, the material modes, the board
  settings (highlights, magnifier, drag target, move method, keyboard in drag-only mode), the colour
  schemes and the focus store; an end-to-end spec switches notation, scheme, piece set and palette
  and checks persistence, turns highlights off, drags with the magnifier and target, moves by tap
  only, and runs a game in focus mode — on all four browser projects.

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

### Changed

- While a page chunk loads, the loading screen is taller than the window, so the footer no longer
  appears at the bottom and jumps away (Lighthouse's layout shift went from 0.12 to 0).
- The install banner's "Not now" button no longer carries a label that contradicts its text.

## [0.8.0] - 2026-10-01

### Added

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
