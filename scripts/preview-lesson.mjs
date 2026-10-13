#!/usr/bin/env node
/**
 * Shows what the coach says to every move of a lesson, for writing and reviewing
 * lessons: for every task of every step, the question, what the coach says to
 * the accepted moves and to the opponent's reply, and for every other legal
 * move what the learner would be told — the lesson's own answer (`wrong`), the
 * board's (a mate allowed, a stalemate, material left to be taken) and
 * `failure` — with the reply played on the board.
 *
 * With --engine every move is also scored by Stockfish against the best one, and
 * the report flags a move that is not accepted but scores as well as the answer
 * (a second solution, or a `failure` text that is not true of it) and a reply
 * shown to punish a wrong move that is not the opponent's best answer.
 *
 * Usage:  node scripts/preview-lesson.mjs <lesson-id> [<lesson-id> …] [--engine] [--depth 12] [--out report.md]
 */
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { withAppModules } from './lib/load-module.mjs';
import { NodeEngine } from './lib/node-engine.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const useEngine = args.includes('--engine');
const depth = Number(option('--depth', 12));
const outFile = option('--out', null);
const ids = args.filter(
  (a, i) => !a.startsWith('--') && !['--depth', '--out'].includes(args[i - 1] ?? ''),
);
/** A move not accepted but within this of the best accepted move is flagged. */
const ALSO_GOOD_CP = 80;
/** A punishing reply further than this from the opponent's best answer is flagged. */
const REFUTE_GAP_CP = 150;

if (ids.length === 0) {
  console.error(
    'Usage: node scripts/preview-lesson.mjs <lesson-id> [...] [--engine] [--depth 12] [--out file]',
  );
  process.exit(1);
}

const toCp = (s) =>
  s.type === 'mate' ? (s.value > 0 ? 10_000 - s.value : -10_000 - s.value) : s.value;
const pawns = (cp) =>
  Math.abs(cp) >= 9_000
    ? `${cp > 0 ? '+' : '-'}M${10_000 - Math.abs(cp)}`
    : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
const plain = (san) => san.replace(/[+#]$/, '');

function sanOf(fen, uci) {
  if (!uci) return undefined;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      .san;
  } catch {
    return undefined;
  }
}

const after = (fen, san) => {
  const chess = new Chess(fen);
  chess.move(san);
  return chess;
};

const modules = await withAppModules(async (load) => ({
  ...(await load('/src/features/learn/lessons/index.ts')),
  ...(await load('/src/features/learn/explainWrongMove.ts')),
  ...(await load('/src/features/learn/taskCheck.ts')),
  ...(await load('/src/features/learn/lessons/quotedLines.ts')),
}));
const { lessons, explainWrongMove, judgeTaskMove, wrongMoveAnswer, linePositions } = modules;

const engine = useEngine ? new NodeEngine() : null;
if (engine) await engine.init({ hashMb: 64 });

/** Every legal move from `fen`, scored for the side to move, with the engine's answer to it. */
async function scoreMoves(fen) {
  const scores = new Map();
  if (!engine) return scores;
  const count = new Chess(fen).moves().length;
  const { lines } = await engine.analyse(fen, { depth, multipv: count });
  for (const line of lines.values()) {
    const san = sanOf(fen, line.pv[0]);
    if (!san) continue;
    const answer = line.pv[1] ? sanOf(after(fen, san).fen(), line.pv[1]) : undefined;
    scores.set(san, { score: toCp(line.score), answer });
  }
  return scores;
}

/** The opponent's best answer to `san`, and what `refute` scores (both from the opponent's view). */
async function judgeRefute(fen, san, refute) {
  if (!engine) return null;
  const chess = after(fen, san);
  if (chess.isGameOver()) return null;
  const position = chess.fen();
  const { lines } = await engine.analyse(position, { depth, multipv: chess.moves().length });
  let best = null;
  let mine = null;
  for (const line of lines.values()) {
    const reply = sanOf(position, line.pv[0]);
    const score = toCp(line.score);
    if (!best || score > best.score) best = { san: reply, score };
    if (reply && plain(reply) === plain(refute)) mine = score;
  }
  return best ? { best, refute: mine } : null;
}

const flagged = [];

async function taskReport(lesson, stepNo, task, fen, at) {
  const out = [];
  const chess = new Chess(fen);
  const side = chess.turn() === 'w' ? 'White' : 'Black';
  const where = `${lesson.id} step ${stepNo}${at > 0 ? ` move ${at + 1}` : ''}`;
  out.push(`### ${at === 0 ? 'Task' : `Move ${at + 1} of the line`} — ${side}: ${task.prompt}`, '');
  out.push(`FEN \`${fen}\``, '');
  if (task.hint) out.push(`- hint: ${task.hint}`);
  const scores = await scoreMoves(fen);
  const accepted = [];
  const others = [];
  let acceptedBest = -Infinity;
  for (const move of chess.moves({ verbose: true })) {
    if (judgeTaskMove(task, move, after(fen, move.san)) === 'correct') {
      accepted.push(move.san);
      acceptedBest = Math.max(acceptedBest, scores.get(move.san)?.score ?? -Infinity);
    } else {
      others.push(move.san);
    }
  }
  const scoreText = (san) => {
    const s = scores.get(san);
    return s ? ` (${pawns(s.score)})` : '';
  };
  out.push(`- accepted: ${accepted.map((san) => `**${san}**${scoreText(san)}`).join(', ')}`);
  out.push(`  - good: ${task.success ?? 'Exactly.'}`);
  out.push(`  - why: ${task.why ?? '(none)'}`);
  if (!task.why) flagged.push(`${where}: no "why"`);
  if (task.reply) {
    out.push(`  - reply: **${task.reply}**${task.replyNote ? ` — note: ${task.replyNote}` : ''}`);
  }
  out.push('- every other move (moves told the same thing are grouped):');
  /** What the learner is told, keyed by the words (moves with the same answer share a line). */
  const groups = new Map();
  for (const san of others) {
    const listed = wrongMoveAnswer(task, san);
    const seen = listed ? null : explainWrongMove(fen, san);
    const words = [];
    if (listed) words.push(`[listed] ${listed.text}`);
    if (seen) words.push(`[board] ${seen.text}`);
    if (!listed) {
      if (task.failure) words.push(`[${seen ? 'hint' : 'failure'}] ${task.failure}`);
      else if (!seen) words.push('[default] Not this one. Look at the position again.');
    }
    const refute = listed?.refute ?? seen?.refute ?? null;
    const flags = [];
    const own = scores.get(san)?.score;
    if (own !== undefined && acceptedBest > -Infinity && own >= acceptedBest - ALSO_GOOD_CP) {
      flags.push(`ALSO GOOD: ${pawns(own)} against ${pawns(acceptedBest)}`);
    }
    if (refute) {
      const judged = await judgeRefute(fen, san, refute);
      if (judged && judged.refute !== null && judged.best.score - judged.refute > REFUTE_GAP_CP) {
        flags.push(
          `REFUTE NOT BEST: ${refute} ${pawns(judged.refute)}, best ${judged.best.san} ${pawns(judged.best.score)}`,
        );
      }
    }
    for (const flag of flags) flagged.push(`${where}: ${san}: ${flag}`);
    const shown = refute ? ` → **${refute}**` : '';
    const answer = scores.get(san)?.answer ? ` [engine answer ${scores.get(san).answer}]` : '';
    const label = `${san}${scoreText(san)}${shown}${answer}${flags.length ? ` **${flags.join('; ')}**` : ''}`;
    const key = words.join(' ');
    groups.set(key, [...(groups.get(key) ?? []), label]);
  }
  for (const [words, moves] of groups) out.push(`  - ${moves.join(', ')}: ${words}`);
  out.push('');
  return out;
}

const report = [];
for (const id of ids) {
  const lesson = lessons.find((l) => l.id === id);
  if (!lesson) {
    console.error(`No lesson "${id}"`);
    process.exitCode = 1;
    continue;
  }
  report.push(`# ${lesson.id}: ${lesson.title}`, '', lesson.summary, '');
  for (const [index, step] of lesson.steps.entries()) {
    report.push(`## Step ${index + 1}${step.title ? `: ${step.title}` : ''}`, '');
    report.push(...step.text.split('\n').map((line) => `> ${line}`), '');
    for (const [at, { task, fen }] of linePositions(step).entries()) {
      report.push(...(await taskReport(lesson, index + 1, task, fen, at)));
    }
  }
}
engine?.quit();

if (flagged.length > 0) report.push('# Flags', '', ...flagged.map((f) => `- ${f}`), '');
const text = report.join('\n');
if (outFile) {
  writeFileSync(outFile, text);
  console.log(`Wrote ${outFile} (${flagged.length} flags)`);
} else {
  console.log(text);
}
