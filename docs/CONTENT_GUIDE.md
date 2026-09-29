# Content guide: writing lessons

Lessons are plain data in `src/features/learn/lessons/{beginner,intermediate,advanced}.ts`. No React
knowledge is needed to add one — but every position must be _right_, so this guide is mostly about
verification.

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

Chess claims need an engine. With the engine installed (`npm run engine:setup`) you can analyse any
position from Node:

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
