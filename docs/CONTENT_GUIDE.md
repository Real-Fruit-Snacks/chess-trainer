# Content guide: lessons, courses, drills, studies, repertoires and classic games

All chess content is plain data: lessons in `src/features/learn/lessons/*.ts` (one file per level and
batch — `beginner.ts`, `beginner2.ts`, `intermediate.ts` … `advanced4.ts` — registered in
`lessons/index.ts` in curriculum order), courses in `src/features/learn/courses.ts`, endgame drills in
`src/features/drills/endgameDrills.ts`, endgame studies in `src/features/studies/studies.ts`, opening
repertoires in `src/features/openings/repertoires.ts`, classic games in
`src/features/classics/games.ts` and the reference pages in `src/features/reference/content.ts`. No
React knowledge is needed to add any of it — but every position must be _right_, so this guide is
mostly about verification.

After adding or renaming a lesson, run `npm run lessons:index`: it regenerates
`src/features/learn/lessonMeta.ts`, the small index (id, title, level, category, length) that the Home,
Progress and course pages use so they do not have to load the lesson text. The build runs it
automatically and a unit test fails while the index is stale.

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
  steps: [ /* see below */ ],
}
```

A lesson is a sequence of **steps**. Each step shows one position with some text; steps with a
`task` ask the learner to play a move.

```ts
{
  title: 'One move, two targets',
  text: 'A **fork** is a single move that attacks two pieces at once. …',
  fen: '4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1',
  orientation: 'white',             // optional; must match the side to move when there is a task
  shapes: ['e4f6', 'f6e8:red', 'd5'],   // arrows "e4f6" and circles "d5"; colour suffix optional
  task: {
    prompt: 'Fork the king and the rook.',
    moves: ['Nf6+'],                // accepted answers in SAN; "+"/"#" suffixes are ignored when comparing
    acceptAnyMate: false,           // true: any checkmating move is also accepted
    reply: 'Ke7',                   // optional scripted opponent reply, played after a correct answer
    hint: 'Which knight move gives check?',
    success: 'Nf6+ — check and an attack on d5.',
    failure: 'Not quite. You want a check that also attacks d5.',
  },
}
```

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

## Rules for a good task

1. **Exactly the moves you list are correct** — and every other legal move is wrong or clearly
   inferior. If two moves are equally good, list both. If the engine prefers a different move that is
   _also_ good, either list it or reword the failure text to acknowledge it ("That also wins, but…").
2. **Balanced material.** Puzzles that win a piece should start from roughly equal material, otherwise
   the engine evaluation confuses learners who open the position in the analysis board.
3. **No loose ends.** If you claim "wins the rook", check that the rook is not defended, that no
   in-between move saves it, and that the winning piece is not immediately lost.
4. **Mates:** use `acceptAnyMate: true` and list _all_ mating moves — the test suite computes them and
   fails if the lists differ.
5. **Keep it short.** One idea per step, three to seven steps per lesson, at most ~120 words per step.

## Verifying positions

Structural checks run automatically:

```bash
npm test -- lessons
```

This confirms every FEN is legal (including that the side _not_ to move is not in check), every
accepted move and scripted reply is playable, mate lists are complete, and orientations match.

Chess claims need an engine. The whole lesson set is checked against Stockfish with

```bash
npm run lessons:verify          # add "-- --depth 22" for a deeper (slower) check
```

For every task, the accepted moves must be checkmate (for mate tasks), keep a decisive advantage when
the position is already won, or otherwise score within 80 centipawns of the engine's best move. Run it
after adding or changing a lesson; CI only runs the fast structural checks.

With the engine installed (`npm run engine:setup`) you can also analyse any position from Node:

```js
// scripts/analyse.mjs (example)
import { NodeEngine } from './lib/node-engine.mjs';
const engine = new NodeEngine();
await engine.init();
const { lines } = await engine.analyse('4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1', {
  depth: 22,
  multipv: 4,
});
for (const [i, line] of lines) console.log(i, line.score, line.pv.slice(0, 6).join(' '));
engine.quit();
```

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
learner plays, either fixed starting positions (one is picked at random) or `'random'` with the white
material to place (for the mating drills), a technique tip and a move limit. `npm run drills:verify`
confirms with Stockfish that every fixed position is won (for `mate`/`promote`/`capture`) or drawn (for
`hold`) for the learner's side. The unit tests check legality — including that no position starts with
a check to answer — and the random position generator.

Adjudication is automatic (`useDrillGame`): checkmate, promotion, stalemate, losing the mating material
or the pawn, the move limit, and the engine evaluation after each learner move (a drawn evaluation in a
winning drill, or a lost one in a holding drill, ends the attempt with an explanation).

The vision drills (`src/features/drills/vision.ts`) generate their own tasks; the blindfold option only
changes what the board shows (`VisionDrill.tsx`), so no content changes are needed for it. The "Guess the
position" drill takes its move sequences from the classic games (the first 6–12 plies of a random game),
so every classic game you add also feeds it; `trackPieces()` follows each piece through captures, castling
and en passant to produce the questions.

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

Two things the tests enforce: every accepted move and every reply must be legal, and the reply must be
legal **after each accepted alternative** (so a reply that only works after the main move is rejected —
either drop the alternative or split the line). `npm run studies:verify` then walks the line with
Stockfish: after every accepted move the goal must still hold (a win stays above +2.5, a draw stays above
−0.6 for the solver), and every legal move that is _not_ accepted must lose the goal, otherwise it is a
second solution and has to be listed. Use compositions that are in the public domain (Réti, Saavedra,
Troitzky, the classical only-move endings) or your own; keep the prose original.

## Courses

`COURSES` groups lessons, drills, puzzle targets, repertoire targets, engine games and classic games into
units. A unit unlocks when the previous one is done; an item is done when the lesson is completed, the
drill has been won, the puzzle/repertoire target has been reached, a game at the level has been played or
the classic game has been finished. Every lesson may appear in at most one course (a test checks it),
and every referenced lesson, drill and classic id must exist.

## Opening repertoires

Each built-in repertoire is a PGN string with variations and comments. Every branch becomes a line the
learner will be asked to recall; comments become tips shown after the move. The unit tests parse every
repertoire, require at least four lines of at least eight plies, and fail on any illegal move. Keep
lines about eight to twelve moves deep and prefer plans over sharp theory; the spaced-repetition
scheduler treats every learner move as a separate card, so a repertoire with 50–60 learner moves is a
comfortable size.

## Classic games

A classic game is a space-separated SAN move list plus notes keyed by the 1-based ply they describe.
`guessColor` is the side the learner guesses for and `guessFromPly` the number of half-moves replayed
first (it must land on the guesser's move). The tests replay every game, check the final position of
games that end in `#`, and require that every note belongs to the guessed side. Annotations should be
original prose in your own words. Game scores themselves are facts and not copyrightable; type them in
from a reliable source and replay them (the tests will catch an illegal move but not a wrong legal one, so
compare the final position with the source).

## Sourcing positions

- Constructed positions are fine for basic patterns and are easiest to keep clean.
- Real positions are more convincing for intermediate/advanced material. The bundled Lichess puzzles
  are CC0 — search `public/puzzles/*.json` by theme, use the FEN _after_ the setup move, and cite
  "From a Lichess puzzle" in the step text as the existing lessons do.
- Do not copy annotated positions from books or databases with restrictive licences.

## Style

- Explain _why_, not just _what_. A learner should be able to predict the move before playing it.
- Use full piece names in prose ("the knight") and SAN in bold for concrete moves (**Nf6+**).
- Beginner lessons avoid jargon or define it on first use. Advanced lessons can assume the vocabulary
  of the earlier ones.
- Prefer "you" and active voice. Keep the tone encouraging in `failure` texts: say what to look for,
  not just that the move was wrong.
