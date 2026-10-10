# Content guide: lessons, courses, drills, studies, repertoires and classic games

All chess content is plain data: lessons in `src/features/learn/lessons/*.ts` (one file per level and
batch — `beginner.ts`, `beginner2.ts`, `intermediate.ts` … `advanced6.ts` — listed in curriculum order in
`LESSON_FILES` (`lessonMetaFormat.ts`), `lessons/index.ts` and the loaders of `lessons/load.ts`), courses in `src/features/learn/courses.ts`, endgame drills in
`src/features/drills/endgameDrills.ts`, mating patterns in `src/features/patterns/matingPatterns.ts`,
endgame studies in `src/features/studies/studies.ts`, opening repertoires in
`src/features/openings/repertoires.ts`, classic games in `src/features/classics/games.ts`
(`games2.ts`, `games3.ts`) and the reference pages in `src/features/reference/content.ts`. No
React knowledge is needed to add any of it — but every position must be _right_, so this guide is
mostly about verification.

After adding or renaming a lesson, or changing its steps, run `npm run lessons:index`: it regenerates
`src/features/learn/lessonMeta.ts`, the small index (id, title, level, category, length, step keys and
the file that holds the lesson) that every page lists lessons from. The lesson text itself is loaded a
file at a time, when one of the file's lessons is opened, so keep each file to a handful of lessons (the
bundle check allows 40 KB gzipped per file). The build runs the index script automatically and a unit
test fails while the index is stale.

## Anatomy of a lesson

```ts
{
  id: 'forks',                      // URL slug, unique, kebab-case
  title: 'Forks',
  level: 'intermediate',            // beginner | intermediate | advanced
  category: 'Tactics',              // Rules | Basics | Tactics | Checkmates | Endgames | Strategy | Openings | Thinking
  summary: 'Attack two things at once — the most common tactic in chess.',
  minutes: 6,                       // rough reading + solving time
  practiceThemes: ['fork'],         // Lichess puzzle themes offered at the end
  practiceDrills: [                 // optional: drills offered at the end, by title and app path
    { title: 'What’s the threat?', to: '/drills/threats' },
  ],
  steps: [ /* see below */ ],
}
```

A lesson is a sequence of **steps**. Each step shows one position with what the coach says about it;
steps with a `task` ask the learner to play a move, and the step becomes a conversation: the coach asks,
the learner moves, the coach answers, the opponent replies, and the line goes on.

```ts
{
  id: 'two-targets',                // optional, stable key: see "Step ids" below
  title: 'One move, two targets',
  text: 'A **fork** is a single move that attacks two pieces at once. …',   // the coach's opening words
  fen: '4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1',
  orientation: 'white',             // optional; must match the side to move when there is a task
  shapes: ['e4f6', 'f6e8:red', 'd5'],   // arrows "e4f6" and circles "d5"; colour suffix optional
  task: {
    prompt: 'Which knight move attacks the king and the rook?',   // the question
    moves: ['Nf6+'],                // accepted answers in SAN; "+"/"#" suffixes are ignored when comparing
    acceptAnyMate: false,           // true: any checkmating move is also accepted
    hint: 'Which squares can the knight reach with check?',        // a nudge, never the move
    success: 'Check, and the rook on d5 is attacked too.',         // what the move does
    why: 'The king has to move first, so the rook cannot be saved. …',   // why it works, what to take from it
    wrong: {                        // the tempting wrong moves, each with its own answer
      'Nc5': { text: 'That attacks the rook, but it is not check: …', refute: 'Rxc5' },
      'Nd6+': 'Check, but the rook is not attacked from d6. …',    // a string is the answer alone
    },
    failure: 'Look for a knight move that gives check and attacks d5.',   // any other wrong move
    reply: 'Ke7',                   // optional scripted opponent reply, played when the learner goes on
    replyNote: 'The king steps out of check, and the rook is left alone.',  // the coach on the reply
    then: { prompt: 'Now collect.', moves: ['Nxd5+'], … },   // the line goes on: the next move
  },
}
```

How a step plays: the coach's `text` opens it and the `prompt` waits for a move. A right move is
answered with `success` and then `why` (labelled "Why it works"); if there is a `reply`, the lesson
waits there until the learner presses _Continue_ (so `success` and `why` can be read at leisure), then
the opponent plays it, the coach adds `replyNote`, and the `then` task asks for the next move. A wrong move listed in
`wrong` gets its answer, and its `refute` is played on the board (with a red arrow) until the learner
takes the move back. Any other wrong move gets the board's own answer when there is a plain one — a mate
it allows, a stalemate it gives, a piece it leaves to be taken, followed through the captures that come
after — with the punishing reply on the board, then `failure` as a hint; otherwise `failure` alone, and
the move is taken back by itself. "Show answer" plays the first accepted move with `success` and `why`.

### Text formatting

`text` supports a tiny markdown subset: paragraphs separated by a blank line, `- ` bullet lists,
`1. ` numbered lists, `**bold**`, `*italic*` and `` `code` ``. Nothing else is interpreted, and no HTML
is ever injected.

### Positions

- Write FENs by hand for constructed positions, or derive them from moves with
  `fenAfter('1. e4 e5 2. Nf3 Nc6')` for opening positions — the moves are validated at load time.
- To continue a task with a follow-up, compute the next step's FEN from the previous one:
  `fenAfter('Qe8+ Rxe8', PREVIOUS_FEN)`.
- The side to move in the FEN is the side the learner plays. Set `orientation: 'black'` when Black is
  to move.

### Step ids

A learner's progress (`stepsDone`) and the lesson recall cards (`lessonId:key`) are keyed by each
step's `id` when it has one, and by its position in the lesson otherwise. Positions shift when a step
is inserted or removed above them, so **give the steps around the change an `id` before you insert,
remove or reorder steps** in a lesson that has shipped — then progress and recall cards follow the step,
not the slot. Ids are kebab-case words (never a bare number), unique within the lesson, and never
change once shipped. Progress saved under the old position is not carried over to a step that gains an
id (the lesson's completion is kept), and a lesson counts as complete only when every one of its
current steps is done, so a shortened lesson is never completed by the keys of steps it no longer has.

## Rules for a good task

1. **Exactly the moves you list are correct** — and every other legal move is wrong or clearly
   inferior. If two moves are equally good, list both. If the engine prefers a different move that is
   _also_ good, either list it or answer it in `wrong` ("That also wins, but…").
2. **Balanced material.** Puzzles that win a piece should start from roughly equal material, otherwise
   the engine evaluation confuses learners who open the position in the analysis board.
3. **No loose ends.** If you claim "wins the rook", check that the rook is not defended, that no
   in-between move saves it, and that the winning piece is not immediately lost.
4. **Mates:** use `acceptAnyMate: true` and list _all_ mating moves — the test suite computes them and
   fails if the lists differ.
5. **Keep it short.** One idea per step, three to seven steps per lesson, at most ~120 words of `text`
   per step (the tests fail above 130), and the word limits below for everything around a task.
6. **The failure text must be true of every wrong move** you did not list. It is shown for any of them,
   so never claim "that loses" in a drawn ending where other moves hold as well — list those in `wrong`
   or say "That also holds, but…". It is also shown as the hint after the board's own answer ("The rook
   is unprotected on d8: Black simply takes it with Kxd8."), so write it as a pointer toward the idea,
   not as a verdict on the move.
7. **A scripted reply is a fair defence.** It may not lose more than 3 pawns against the opponent's
   best answer (once the best defence is lost anyway, it only may not walk into a forced mate); when
   a lesson deliberately follows a weaker but natural reply (the classic line of a pattern), say so
   in the `replyNote` and add the step to `REPLY_ALLOW_LIST` in `lessons.engine.test.ts` with the
   reason.
8. **A refutation is the real punishment.** A `refute` must be the opponent's best answer to the wrong
   move, or within 1.5 pawns of it, and leave the learner at least a pawn worse off than the task's own
   move. Answer the tempting moves only: the one or two (at most three or four) mistakes a learner at
   this level really plays — the greedy capture, the natural-looking check, the move that walks into
   the pattern the lesson is about. Moves that just hang a piece are answered by the board already;
   list them only when you have something better to say.
9. **Count before you claim.** "A piece up", "two pawns down", "material is level": count the diagram
   (and the position after the quoted line) before writing it.
10. **Lines.** When an idea takes more than one move (a combination, a mating net, a technique, an
    opening plan), make it a line with `reply` and `then` rather than a chain of steps: each move of the
    line gets its own `prompt`, `success` and `why`, and the opponent's replies their `replyNote`.
    Keep lines to two to four learner moves. Every task of the line is checked like a step's first task
    (legal moves, mates listed, engine score), at the position after the previous moves and replies.

## The coach's voice

Lessons are written as a strong player sitting next to the learner, talking them through the position.
The test: read the step aloud. It should sound like a person explaining a position they care about, not
like a rule book or a puzzle caption.

- **Talk to the learner.** "You" and "your", and "I" or "let's" now and then ("I asked for e5", "Let's
  climb"). Plain words, short sentences, active voice.
- **Point at the board.** Name pieces and squares: "the knight on f3 attacks e5", not "the knight is
  active". The learner should be able to check every sentence by looking at the diagram.
- **Explain why, every time.** What the move does, what it stops, what would happen otherwise, and the
  habit or principle to take away from it ("Before every capture, ask what can take back.").
- **Share how a strong player thinks.** The question they ask themselves, the move they look at first,
  the mistake most people make here. That is what makes a lesson feel personal.
- **Be honest about alternatives.** When a wrong move is a real opening or a decent move, say so ("**c4**
  is a good move too — the English Opening — but this step is about…"). Never call a good move bad.
- **No cheerleading.** Praise by explaining, not by exclaiming: no "Great job!", no exclamation marks in
  a row, no emojis. Encouraging, yes; gushing, no.
- **One idea per step**, and the vocabulary of the learner's level: beginner lessons define every term on
  first use; advanced lessons can assume the earlier ones.
- **Moves in prose:** SAN in bold for a concrete move (**Nf6+**), "1. e4 e5 2. Nf3" for a line (the
  tests replay every line they find), full piece names otherwise.

What each field is for, and its word limit (the tests fail above it):

| Field       | Words   | What the coach says                                                                                                                                                                         |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`      | 130     | Opens the step: what has happened, what to look at, the idea. Do not end with the instruction the prompt repeats; end with the setup ("You can take first.").                               |
| `prompt`    | 20      | The question, as a coach asks it: "Which capture wins more?", "Where does the other rook check?" Shown as "White to move — …".                                                              |
| `hint`      | 40      | A thinking nudge that does not give the move away: a question or something to look at ("Is anything guarding d8?").                                                                         |
| `success`   | 40      | What the move does, concretely. It is shown when the move is found _and_ when the answer is shown, so describe the move ("Check, and the rook on d5 is attacked too."), never congratulate. |
| `why`       | 80      | The heart of the lesson: why it works, why the natural alternative fails, and what to take into your own games. Every task has one.                                                         |
| `wrong`     | 50 each | The answer to one tempting wrong move: what it allows or misses, with the `refute` the opponent plays.                                                                                      |
| `failure`   | 45      | The answer to every other wrong move: a pointer toward the idea, true of all of them.                                                                                                       |
| `replyNote` | 45      | Why the opponent played the reply, and what it changes: "Black’s only move. The king steps to g8, and now…"                                                                                 |

`src/features/learn/lessons/beginner.ts` is the model to follow: every task in it has a `why`, the
tempting mistakes are answered in `wrong` (with refutations where the opponent can punish them), and the
ladder mate, the queen mate and the Scandinavian step show lines.

## Verifying positions

Structural checks run automatically:

```bash
npm test -- lessons
```

This confirms every FEN is legal (including that the side _not_ to move is not in check), every
accepted move and scripted reply is playable at every move of a line, mate lists are complete,
orientations match, a line goes on only after a reply, every `wrong` move is legal and not an accepted
one (nor a mate in a mate task) and its `refute` is legal after it, and the coach's words keep to their
word limits. It also finds the move sequences quoted in a step's text and in everything the coach says
around its tasks ("Nxf6+ gxf6 Qxh7") and replays them: a run of two or more moves must be legal from the
diagram (either side to move), from any position of the line (after an accepted move — also with the
same side to move again, for threats — after the reply, after a wrong move and its refutation), from the
previous step's diagram or from the initial position; and a move followed by "mate" (or written with
`#`) must be checkmate. Move pairs that describe a plan rather than
a line ("the minority attack ends in bxc6 bxc6") go in `PROSE_ALLOW_LIST` in
`src/features/learn/lessons/quotedLines.ts` — keep it short and prefer fixing the prose. Every lesson
must also sit in the course of its own level, and step ids must be unique kebab-case words.

Chess claims need an engine. The whole lesson set is checked against Stockfish with

```bash
npm run lessons:verify          # add "-- --depth 22" for a deeper (slower) check,
                                # "-- --shard 1/6" for every sixth lesson
```

For every task — every move of a line — the accepted moves must be checkmate (for mate tasks), keep a
decisive advantage when the position is already won, or otherwise score within 80 centipawns of the
engine's best move; a scripted reply may not lose more than 300 centipawns against the best defence, or
walk into a forced mate when the best defence is lost anyway (see rule 7); a `refute` must be within 150
centipawns of the opponent's best answer and leave the learner at least 100 centipawns worse than the
task's move (rule 8); and the board's own answers to the moves you did not list must hold up: the reply
it plays must be near the opponent's best, or at least clearly better for the opponent than the task's
move. When one does not, answer that move in `wrong`. Run it after adding or changing a lesson; while
writing one, check just that lesson:

```bash
VERIFY_ENGINE=1 npx vitest run src/features/learn/lessons/lessons.engine.test.ts -t "forks step"
```

To see the conversation a lesson makes — for every task, what the coach says to the right move and to
**every** other legal move, with the reply played on the board — run the preview:

```bash
npm run lessons:preview -- forks                 # one or more lesson ids
npm run lessons:preview -- forks --engine        # also scores every move with Stockfish
```

With `--engine` the report flags each move that is not accepted but scores as well as the answer (a
second solution, or a `failure` text that is not true of it) and each punishing reply that is not the
opponent's best. Read it before you call a lesson done: it is the quickest way to find a failure text
that does not fit a move, or a tempting move that deserves its own answer. CI runs the structural checks on every pull request, and the
**Content** workflow (`.github/workflows/content.yml`) runs this check — with the study, repertoire and
drill checks below — on every pull request that touches the content, and weekly.

With the engine installed (`npm run engine:setup`) you can analyse any position from the command line —
the quickest way to check a claim before you write it:

```bash
npm run engine:analyse -- "4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1" --depth 22 --multipv 4
npm run engine:analyse -- start --moves "1. e4 e5 2. Nf3 Nc6" --multipv 3
```

It prints the engine's best lines in SAN, scores from the side to move's point of view (`M3` is a mate
in three). For anything more, `scripts/lib/node-engine.mjs` drives the same engine from a script.

Compare the top lines with the moves you accept. For endgames use depth 28–30; for tactics 20–24 is
plenty. The analysis board in the app (`/analyze?fen=…`) works too.

Two practical warnings from experience:

- Never analyse a position where the side _not_ to move is in check: Stockfish prints "Unsupported
  position" and never answers, so a script hangs. The structural tests reject such FENs; check them
  first when probing hand-made positions.
- Stockfish keeps a small material bias in known fortresses (a wrong-bishop ending still shows −1 or so
  even at depth 28). Drill verification therefore treats anything within 160 cp as a hold; for lessons,
  design the task so the accepted move is clearly best rather than relying on a "0.00".

## Endgame drills

`ENDGAME_DRILLS` describes each drill: the goal (`mate`, `promote`, `hold` or `capture` — win the
opponent's last piece, after which the rest is elementary), the group it is listed under, the colour the
learner plays, either fixed starting positions (one is picked at random; `?pos=N` on the drill's URL
starts from the N-th, for links from lessons and tests) or `'random'` with the white
material to place (for the mating drills), a technique tip and a move limit. `npm run drills:verify`
confirms with Stockfish that every fixed position is won (for `mate`/`promote`/`capture`) or drawn (for
`hold`) for the learner's side; it reads `ENDGAME_DRILLS` as the app does and fails unless every drill
has fixed positions or `'random'`. The unit tests check legality — including that no position starts
with a check to answer — and the random position generator.

Adjudication is automatic (`adjudicatePosition` in `useDrillGame.ts`, a pure function with unit
tests): checkmate, stalemate, a promotion once the new piece is safe (at once when nothing can take it,
otherwise after the reply has left it standing), losing the last pawn of a promotion drill, losing a
piece in a mating drill only when the rest can no longer mate (two rooks down to one still can), the
move limit, and the engine evaluation after each learner move (a drawn evaluation in a winning drill, or
a lost one in a holding drill, ends the attempt with an explanation). In capture and holding drills,
won material counts once it is kept: the balance of pieces and pawns against the start, so a promotion
or a trade changes nothing and a capture that is taken straight back is no win. Material is counted
from the learner's side, so a drill can have the learner play either colour, hold with pawns of its own
(Réti) or give up material deliberately (the outside passed pawn).

Every drill is a rung of the **endgame ladder** (`endgameLadder.ts`): rungs are ordered by `difficulty`
(1–4) and then by group, so give a new drill the difficulty that matches where a learner should meet
it. Set `lessonId` to the lesson that teaches the theory; the drill page links to it. Holding drills
whose "draw" the engine does not recognise (a knight and rook pawn on the seventh, say) cannot be used:
`drills:verify` would fail and the in-game adjudication would end the attempt at once.

The vision drills (`src/features/drills/vision.ts`) generate their own tasks; the blindfold option only
changes what the board shows (`VisionDrill.tsx`), so no content changes are needed for it. The "Guess the
position" drill takes its move sequences from the classic games (the first 6–12 plies of a random game),
so every classic game you add also feeds it; `trackPieces()` follows each piece through captures, castling
and en passant to produce the questions.

## Mating patterns

`src/features/patterns/matingPatterns.ts` holds the nineteen named mates that the puzzle library tags
(one entry per `…Mate` theme in `themes.ts`). Each is a `before` position with the defender to move, the
`setup` move that leads to the diagram, and the mating `line` from the diagram, plus the explanation and
a "spot it" paragraph. The tests require the setup move and the line to be legal, the line to end in mate,
the mate to be forced in that many moves (a small exhaustive search), a mate-in-one diagram to have
exactly one mating move (the named one — the hook mate's g7 pawn exists to rule out Nf6#), and the set
of ids to match the themes exactly — add a theme to `themes.ts` and a pattern together. Keep diagrams minimal: only the pieces
the pattern needs, plus whatever blocks the king's escape.

## Endgame studies

A study (`src/features/studies/studies.ts`) is a position, a goal (`win` or `draw`) and a scripted
`line`: one entry per solver move with the accepted moves (the first is the main line; list alternatives
that are equally good), the scripted reply and a note shown after the move. The last entry has no reply.

```ts
{
  id: 'reti-1921',
  title: 'Réti’s king walk',
  composer: 'Richard Réti', year: 1921, source: 'Kagans Neueste Schachnachrichten',
  fen: '7K/8/k1P5/7p/8/8/8/8 w - - 0 1',
  goal: 'draw', difficulty: 2, themes: ['king activity', 'the square'],
  intro: '…', outro: '…',
  line: [
    { moves: ['Kg7'], reply: 'h4', note: '…' },
    { moves: ['Kf6'], reply: 'Kb6', note: '…' },
    { moves: ['Ke5'], note: '…' },
  ],
}
```

The tests enforce that every accepted move and every reply is legal, that the reply is legal **after
each accepted alternative**, and that the next main-line move (the one a hint shows) is legal after it
too — alternatives have to converge on the line, or the solver gets stuck; either drop the alternative
or end the study at that move. `npm run studies:verify` then walks the line with Stockfish: after every
accepted move the goal must still hold (a win stays above +2.5, a draw stays above −0.6 for the solver),
and every legal move that is _not_ accepted must lose the goal (checked at depth 16,
`VERIFY_DUAL_DEPTH`), otherwise it is a second solution and has to be listed. A move that only shuffles
back into the study's own line — a main-line position reached again within two moves, or the engine's
best play returning to one — is a repetition, not a second solution. Use compositions that are in the public domain (Réti, Saavedra,
Troitzky, the classical only-move endings) or your own; keep the prose original.

## Courses

`COURSES` groups lessons, drills, puzzle targets, repertoire targets, engine games and classic games into
units. A unit unlocks when the previous one is done; an item is done when the lesson is completed, the
drill has been won, the puzzle/repertoire target has been reached (puzzle solves are counted from the
lifetime per-theme counters, so a checkpoint never comes undone when old attempts age out of the list),
an ordinary game at the level has been played (not an arcade, simul or drill game) or the classic game
has been finished. Three drill items stand for skills rather than drills — `threats` (a threat named
in the threat drill), `blind-puzzles` (a blind puzzle solved without a peek) and `self-review` (a
game analyzed before the engine) — and carry a `goal` that says so in place of "Win it once". Every lesson appears in exactly one course, the one of its own level (tests check
both), and every referenced lesson, drill and classic id must exist. Lessons opened from a course carry
`?course=<id>`, which gives them "Back to course" and "Next in course".

## Opening repertoires

Each built-in repertoire is a PGN string with variations and comments. Every branch becomes a line the
learner will be asked to recall; comments become tips shown after the move. The unit tests parse every
repertoire, require at least four lines of at least eight plies, and fail on any illegal move. Keep
lines about eight to fifteen moves deep and prefer plans over sharp theory; the spaced-repetition
scheduler treats every learner move as a separate card, so a repertoire with 50–90 learner moves is a
comfortable size. Cards are keyed by the move path; where two move orders transpose, the same move from
the same position is graded together in both lines, so a transposition costs no extra reviews.

Legality is not soundness: no learner move may lose more than about a pawn compared with the engine's
choice (opponent moves may be inaccurate — they are what people play — but not outright blunders).
`npm run repertoires:verify` checks exactly that: it reads every built-in repertoire into the app's
move tree and scores every move at depth 14 against the engine's best in the same position (the move's
own score from a search restricted to it), and fails on a learner move that gives away more than 120
centipawns or an opponent move that gives away more than 300, naming the line. All sixteen repertoires
pass (2,624 moves); run it after changing one — the Content workflow runs it too.

Learners can also build repertoires in the app: **Add line to repertoire** on the analysis board merges
the current line into a custom repertoire (`mergeLine.ts`), and a custom repertoire's **Edit lines** mode
adds moves from the board or the opening explorer, stores per-move notes and deletes branches.

## Classic games

A classic game is a space-separated SAN move list plus notes keyed by the 1-based ply they describe.
`guessColor` is the side the learner guesses for and `guessFromPly` the number of half-moves replayed
first (it must land on the guesser's move). The tests replay every game, check the final position of
games that end in `#`, and require that every note belongs to the guessed side and sits after
`guessFromPly` (a note on a replayed move is never shown — fold it into the `intro` instead). A note
that opens with a move ("Rad1!! — …") must name the move actually played at that ply, and a variation
introduced with "after" or "with" must be legal from the position after the noted move; the tests check
both. A note that claims something about a position (a mate, which piece covers which square, what a
capture runs into) is worth a chess.js assertion of its own, as `games.test.ts` does for the corrected
Evergreen, Steinitz–Bardeleben and Bernstein–Capablanca notes. Annotations should be original prose in
your own words. Game scores themselves are facts and not copyrightable; type them in
from a reliable source and replay them (the tests will catch an illegal move but not a wrong legal one, so
compare the final position with the source). The Classic games page groups games into eras by `year`
(`eras.ts`: Romantic to 1880, Classical to 1945, Modern to 1990, Contemporary after) and filters by
`difficulty`, so both fields matter for where a game shows up.

Two arcade games draw on the classic games: Who Stands Better? uses their quiet middlegame positions
and Fortress the ones where the side to move is clearly worse. After adding or changing games, run
`npm run arcade:positions` (slow: one engine search per position) to regenerate
`src/features/arcade/positions.json`; the script samples both sides to move (every other game starts
a ply later), and `fortress.test.ts` checks that both pools stay large enough and hold positions with
either side to move.
The Daily Opening and Engine Says games read `public/openings/lines.json`, which
`npm run openings:import` writes next to the ECO table.

## Sourcing positions

- Constructed positions are fine for basic patterns and are easiest to keep clean — but probe them with
  the engine before writing the prose. A quick script over `scripts/lib/node-engine.mjs` that prints the
  top four moves (MultiPV) and the score of the intended answer catches hanging pieces, side-to-move
  mistakes and "obvious" moves that are not best. For endgame tasks with a unique winning or drawing
  move, a random search over a small family of positions (king + rook vs king + pawn, say) filtered for
  "best move wins, second best draws" produces crisp, teachable positions in minutes.
- Real positions are more convincing for intermediate/advanced material. The bundled Lichess puzzles
  are CC0 — search `public/puzzles/*.json` by theme, use the FEN _after_ the setup move, and cite
  "From a Lichess game" in the step text as the existing lessons do. Themes such as `intermezzo`,
  `quietMove`, `advancedPawn`, `trappedPiece` and `defensiveMove` map well onto lesson topics, and a
  puzzle's follow-up moves make natural two-step tasks (the first move with a scripted reply, then the
  finish).
- Do not copy annotated positions from books or databases with restrictive licences.
