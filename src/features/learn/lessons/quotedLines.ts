/**
 * Finds the move sequences quoted in lesson prose ("Rb1! Now Kd6 Rd1+ Ke5 …") so the
 * tests can replay them for legality and check mate claims. Used by the structural and
 * engine tests only; not shipped in the app bundle.
 */
import { Chess } from 'chess.js';
import { type LessonStep, type LessonTask, taskLine } from '../model';

const SAN =
  /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=?[QRBN])?)[+#]?$/;
const MOVE_NUMBER = /^\d+\.(?:\.\.)?$/;
const START_FEN = new Chess().fen();
const MATE_WORDS = new Set(['mate', 'checkmate', 'mate.', 'mate,', 'mate!', 'mate;', 'mate:']);

export interface QuotedLine {
  /** Field the line was found in (`wrong` for the coach's answers to wrong moves). */
  field: 'text' | 'success' | 'failure' | 'hint' | 'prompt' | 'why' | 'replyNote' | 'wrong';
  /** SAN tokens, annotations stripped. */
  moves: string[];
  /** Index of the move the prose calls mate (token with `#` or followed by "mate"), or -1. */
  mateAt: number;
  /** The run as it appears in the prose, for allow-lists and messages. */
  raw: string;
}

/** Strips annotation and sentence punctuation from a token; returns the SAN or null. */
function sanOf(word: string): string | null {
  let w = word.replace(/^[([“"'…]+|[)\]”"',.;:]+$/g, '');
  w = w.replace(/^\d+\.(?:\.\.)?/, '').replace(/^\.\.\./, '');
  w = w.replace(/[!?]+$/, '');
  if (!w) return null;
  return SAN.test(w) ? w : null;
}

/** The prose of a step, field by field: its text, then every task of its line. */
function proseOf(step: LessonStep): { field: QuotedLine['field']; source: string }[] {
  const out: { field: QuotedLine['field']; source: string }[] = [
    { field: 'text', source: step.text },
  ];
  for (const task of taskLine(step.task)) {
    for (const field of ['success', 'failure', 'hint', 'prompt', 'why', 'replyNote'] as const) {
      const source = task[field];
      if (source) out.push({ field, source });
    }
    for (const answer of Object.values(task.wrong ?? {})) {
      out.push({ field: 'wrong', source: typeof answer === 'string' ? answer : answer.text });
    }
  }
  return out;
}

export function quotedLines(step: LessonStep): QuotedLine[] {
  const out: QuotedLine[] = [];
  for (const { field, source } of proseOf(step)) {
    const words = source.replace(/\*\*|__|`/g, '').split(/\s+/);
    let run: string[] = [];
    let raw: string[] = [];
    let mateAt = -1;
    const flush = () => {
      if (run.length > 0) out.push({ field, moves: run, mateAt, raw: raw.join(' ') });
      run = [];
      raw = [];
      mateAt = -1;
    };
    for (let i = 0; i < words.length; i++) {
      const word = words[i] as string;
      if (MOVE_NUMBER.test(word)) continue;
      const san = sanOf(word);
      if (!san) {
        flush();
        continue;
      }
      const closes = /[)\]]+[.,;:!?]*$/.test(word);
      if (word.startsWith('(') && run.length > 0) flush();
      run.push(san);
      raw.push(word);
      const next = words[i + 1]?.toLowerCase() ?? '';
      if (san.endsWith('#') || MATE_WORDS.has(next)) mateAt = run.length - 1;
      // A comma, full stop or closing bracket ends the line (comma-separated moves are a list).
      if (closes || /[.,;:](?:\*\*)?$/.test(word)) flush();
    }
    flush();
  }
  return out;
}

/** The same position with the other side to move (for "threatens Qxg2 mate"), when legal. */
function flipped(fen: string): string | null {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const chess = new Chess(parts.join(' '));
    return chess.isCheck() ? null : chess.fen();
  } catch {
    return null;
  }
}

/**
 * The position of each task of a step's line: the diagram for the first, then
 * the position after the first accepted move and the reply for each next one.
 */
export function linePositions(step: LessonStep): { task: LessonTask; fen: string }[] {
  const out: { task: LessonTask; fen: string }[] = [];
  let fen = step.fen;
  for (const task of taskLine(step.task)) {
    out.push({ task, fen });
    const chess = new Chess(fen);
    try {
      chess.move(task.moves[0] ?? '');
      if (task.reply) chess.move(task.reply);
    } catch {
      break; // reported by the legality tests
    }
    fen = chess.fen();
  }
  return out;
}

/** The position after `moves` from `fen`, or null when one of them is illegal. */
function after(fen: string, ...moves: string[]): string | null {
  const chess = new Chess(fen);
  try {
    for (const san of moves) chess.move(san);
  } catch {
    return null;
  }
  return chess.fen();
}

/**
 * Positions a quoted line may start from: the diagram (either side to move), the
 * initial position, the previous step's diagram (prose often recaps it) and, for
 * every task of the step's line, its position, the positions after each accepted
 * move — also with the mover to move again, for the threat it makes ("Qh5
 * threatens Qh7#") — and after the scripted reply, and after each wrong move the
 * coach answers and the reply that refutes it.
 */
export function candidateStarts(step: LessonStep, previous?: LessonStep): string[] {
  const starts = [step.fen];
  for (const { task, fen } of linePositions(step)) {
    starts.push(fen);
    for (const san of task.moves) {
      const played = after(fen, san);
      if (!played) continue;
      starts.push(played);
      const threat = flipped(played);
      if (threat) starts.push(threat);
      const replied = task.reply ? after(played, task.reply) : null;
      if (replied) starts.push(replied);
    }
    for (const [san, answer] of Object.entries(task.wrong ?? {})) {
      const played = after(fen, san);
      if (!played) continue;
      starts.push(played);
      const refute = typeof answer === 'string' ? undefined : answer.refute;
      const refuted = refute ? after(played, refute) : null;
      if (refuted) starts.push(refuted);
    }
  }
  const other = flipped(step.fen);
  if (other) starts.push(other);
  if (previous) starts.push(...candidateStarts(previous));
  starts.push(START_FEN);
  return [...new Set(starts.filter((s): s is string => s !== null))];
}

/** Replays `moves` from `fen`; returns the position after each move, or null when one is illegal. */
export function replay(fen: string, moves: string[]): Chess[] | null {
  const chess = new Chess(fen);
  const positions: Chess[] = [];
  for (const san of moves) {
    try {
      chess.move(san.replace(/[+#]$/, ''));
    } catch {
      return null;
    }
    positions.push(new Chess(chess.fen()));
  }
  return positions;
}

/** Tries each start position; returns the first that replays the whole line. */
export function replayFromAny(
  starts: string[],
  moves: string[],
): { start: string; positions: Chess[] } | null {
  for (const start of starts) {
    const positions = replay(start, moves);
    if (positions) return { start, positions };
  }
  return null;
}

/**
 * Not actually lines, or lines about a position the lesson does not show: keyed
 * "lessonId|run as written". Keep it short — fix the prose when you can.
 */
export const PROSE_ALLOW_LIST = new Set<string>([]);
