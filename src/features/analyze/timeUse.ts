import { clockOf, elapsedOf, type PgnCommand } from '@/chess/pgn';
import { GameTree } from '@/chess/tree';
import type { Fen, LongColor, San } from '@/chess/types';
import type { MoveJudgement } from '@/components/chess/MoveList';
import type { ReviewSummary } from './gameReview';

/**
 * Time management: how long each move of a game took, worked out from the
 * clock readings the PGN carries after each move (`[%clk 0:09:58.7]`, the time
 * left) and its time control (the `TimeControl` header: "600+5", a bare "600",
 * or "-" and nothing when unknown). Lichess and chess.com both write them, and
 * so do games played online in the app. Everything here is pure: the review's
 * time chart, its reading and the time findings of My games build on it.
 */

export type TimeControlInfo =
  /** A clock for the game: the starting time (null when unknown) and the increment, in seconds. */
  | { kind: 'clock'; base: number | null; increment: number }
  /** Days (or seconds) per move, as in correspondence chess: no clock to manage. */
  | { kind: 'per-move' };

/** Reads a PGN `TimeControl` header. Anything unreadable is a clock of unknown length. */
export function parseTimeControl(header: string | undefined): TimeControlInfo {
  const text = header?.trim() ?? '';
  if (/^\d+\/\d+$/.test(text)) return { kind: 'per-move' };
  const match = /^(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/.exec(text);
  if (!match) return { kind: 'clock', base: null, increment: 0 };
  const base = Number(match[1]);
  return { kind: 'clock', base: base > 0 ? base : null, increment: Number(match[2] ?? 0) };
}

/**
 * The seconds below which a player is short of time: a tenth of the starting
 * time, from 10 seconds (bullet) to a minute (rapid and longer), as a round
 * figure; 30 seconds when the time control is unknown.
 */
export function timeTroubleSeconds(base: number | null): number {
  if (base === null) return 30;
  let pick = 10;
  for (const step of [10, 15, 20, 30, 45, 60]) if (step <= base / 10) pick = step;
  return pick;
}

export interface MoveTime {
  /** 1-based main-line ply. */
  ply: number;
  san: San;
  mover: LongColor;
  /** Seconds on the mover's clock when the move began; null when unknown. */
  before: number | null;
  /** Seconds left after the move (its `[%clk]`); null without a reading. */
  after: number | null;
  /** Seconds the move took; null when the readings cannot tell. */
  spent: number | null;
}

export interface GameTimes {
  moves: MoveTime[];
  /** Starting time in seconds, when the time control says. */
  base: number | null;
  /** Seconds added after each move. */
  increment: number;
  /** Seconds below which a player is short of time in this game (see `timeTroubleSeconds`). */
  trouble: number;
}

/** A game needs clock readings for most of its moves, and a few at least, to say anything. */
export const MIN_CLOCK_SHARE = 0.75;
export const MIN_CLOCKED_MOVES = 6;

const tenths = (seconds: number) => Math.round(seconds * 10) / 10;

/**
 * The time each main-line move took, from the clock readings and the time
 * control; null for correspondence games and for games without clock times
 * on most of their moves.
 */
export function gameTimes(
  nodes: readonly { san: San; commands?: readonly PgnCommand[] }[],
  headers: Record<string, string>,
  startFen: Fen,
): GameTimes | null {
  const control = parseTimeControl(headers.TimeControl);
  if (control.kind === 'per-move') return null;
  const clocked = nodes.filter(
    (n) => clockOf(n.commands) !== null || elapsedOf(n.commands) !== null,
  ).length;
  if (clocked < MIN_CLOCKED_MOVES || clocked < nodes.length * MIN_CLOCK_SHARE) return null;
  const { base, increment } = control;
  const whiteFirst = startFen.split(' ')[1] !== 'b';
  /** The mover's clock after their previous move: what they had when their next move began. */
  const left: Record<LongColor, number | null> = { white: base, black: base };
  const moved: Record<LongColor, boolean> = { white: false, black: false };
  const moves = nodes.map((node, index): MoveTime => {
    const firstSideToMove = index % 2 === 0;
    const mover: LongColor = firstSideToMove === whiteFirst ? 'white' : 'black';
    const before = left[mover];
    const after = clockOf(node.commands);
    let spent = elapsedOf(node.commands);
    if (spent === null && before !== null && after !== null) {
      // Lichess starts the clocks after both first moves: the reading is then the
      // starting time, with no time used and no increment yet.
      spent = !moved[mover] && after >= before ? 0 : Math.max(0, before - after + increment);
    }
    moved[mover] = true;
    // A missing reading leaves the next move's time unknown rather than lumping two moves together.
    left[mover] = after;
    return {
      ply: index + 1,
      san: node.san,
      mover,
      before: before === null ? null : tenths(before),
      after: after === null ? null : tenths(after),
      spent: spent === null ? null : tenths(spent),
    };
  });
  return { moves, base, increment, trouble: timeTroubleSeconds(base) };
}

/** `gameTimes` for a PGN; null when it does not parse or carries too few clock times. */
export function gameTimesOfPgn(pgn: string): GameTimes | null {
  try {
    const tree = GameTree.fromPgn(pgn);
    return gameTimes(tree.mainLine(), tree.headers, tree.startFen);
  } catch {
    return null;
  }
}

/** Whether the move was begun with less than the game's time-trouble margin on the clock. */
export function inTimeTrouble(move: MoveTime, times: GameTimes): boolean {
  return move.before !== null && move.before < times.trouble;
}

/* ------------------------------------------------------------------ */
/* Words and figures                                                  */
/* ------------------------------------------------------------------ */

/** Time spent, compactly: "0.4 s", "12 s", "1 min 20 s", "6 min", "1 h 5 min". */
export function formatSpent(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 10) return `${tenths(s)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const whole = Math.round(s);
  if (whole < 3600) {
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(whole / 3600);
  const minutes = Math.round((whole % 3600) / 60);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/** A clock reading: "9:41", "1:02:03", and tenths under ten seconds ("8.4"). */
export function formatClockReading(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 10) return tenths(s).toFixed(1);
  const whole = Math.floor(s);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * A duration in a sentence: "under a second", "45 seconds", "a minute",
 * "4 minutes 30 seconds" (to ten seconds under ten minutes), "16 minutes",
 * "1 hour 5 minutes".
 */
export function durationWords(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 1) return 'under a second';
  if (s === 60) return 'a minute';
  if (s < 120) {
    const whole = Math.round(s);
    return whole === 1 ? 'a second' : `${whole} seconds`;
  }
  if (s < 600) {
    const tens = Math.round(s / 10) * 10;
    const minutes = Math.floor(tens / 60);
    const rest = tens % 60;
    return rest ? `${minutes} minutes ${rest} seconds` : `${minutes} minutes`;
  }
  if (s < 3600) return `${Math.round(s / 60)} minutes`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.round((s % 3600) / 60);
  const hourWords = hours === 1 ? '1 hour' : `${hours} hours`;
  return minutes ? `${hourWords} ${minutes} minute${minutes === 1 ? '' : 's'}` : hourWords;
}

/** The full-move number of a ply ("move 14"). */
export function moveNumberOfPly(ply: number, startFen: Fen): number {
  const [, turn = 'w', , , , fullmove = '1'] = startFen.split(' ');
  return Number(fullmove) + Math.floor((ply - 1 + (turn === 'b' ? 1 : 0)) / 2);
}

/* ------------------------------------------------------------------ */
/* The chart                                                          */
/* ------------------------------------------------------------------ */

/** One side's move in the chart. */
export interface TimeBar {
  ply: number;
  san: San;
  spent: number | null;
  before: number | null;
  after: number | null;
  /** The review's verdict on the move, when it still describes this move. */
  judgement: MoveJudgement | null;
  /** Begun short of time. */
  trouble: boolean;
}

/** A full move: White's half above the line, Black's below. */
export interface TimeColumn {
  moveNumber: number;
  white: TimeBar | null;
  black: TimeBar | null;
}

/** The chart's columns, one per full move, with the review's verdicts on the moves. */
export function timeColumns(
  times: GameTimes,
  review: ReviewSummary | null,
  startFen: Fen,
): TimeColumn[] {
  const columns = new Map<number, TimeColumn>();
  for (const move of times.moves) {
    const moveNumber = moveNumberOfPly(move.ply, startFen);
    const column = columns.get(moveNumber) ?? { moveNumber, white: null, black: null };
    const reviewed = review?.moves[move.ply - 1];
    column[move.mover] = {
      ply: move.ply,
      san: move.san,
      spent: move.spent,
      before: move.before,
      after: move.after,
      judgement: reviewed?.san === move.san ? reviewed.judgement : null,
      trouble: inTimeTrouble(move, times),
    };
    columns.set(moveNumber, column);
  }
  return [...columns.values()];
}

const SCALE_STEPS = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200,
];

/**
 * What the chart shows, in a sentence for screen readers: each side's time
 * used and its longest think.
 */
export function describeTimes(times: GameTimes, startFen: Fen): string {
  const parts = (['white', 'black'] as const).map((side) => {
    const moves = times.moves.filter((m) => m.mover === side && m.spent !== null);
    if (moves.length === 0) return null;
    const used = moves.reduce((sum, m) => sum + (m.spent ?? 0), 0);
    const longest = moves.reduce((top, m) => ((m.spent ?? 0) > (top.spent ?? 0) ? m : top));
    const name = side === 'white' ? 'White' : 'Black';
    return `${name} used ${formatSpent(used)} over ${moves.length} move${moves.length === 1 ? '' : 's'}, the longest ${formatSpent(longest.spent ?? 0)} on move ${moveNumberOfPly(longest.ply, startFen)}`;
  });
  const text = parts.filter((p): p is string => p !== null).join('; ');
  return text ? `${text}.` : 'No move times.';
}

/** The top of the chart's scale: the first round figure at or above the longest move. */
export function timeScaleMax(longest: number): number {
  return SCALE_STEPS.find((step) => step >= longest) ?? Math.ceil(longest / 3600) * 3600;
}

/* ------------------------------------------------------------------ */
/* The reading                                                        */
/* ------------------------------------------------------------------ */

const isError = (judgement: MoveJudgement | null | undefined) =>
  judgement === 'mistake' || judgement === 'blunder';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "you" or "White", in a sentence. */
function subject(side: LongColor, learner: LongColor | null): string {
  return side === learner ? 'you' : side === 'white' ? 'White' : 'Black';
}

/** "your" or "White's". */
function possessive(side: LongColor, learner: LongColor | null): string {
  return side === learner ? 'your' : side === 'white' ? 'White’s' : 'Black’s';
}

/** "3 of your 4 mistakes", "both of White's mistakes", "your only mistake". */
function someOf(count: number, total: number, side: LongColor, learner: LongColor | null): string {
  const whose = possessive(side, learner);
  if (total === 1) return `${whose} only mistake`;
  if (count === total) {
    return total === 2 ? `both of ${whose} mistakes` : `all ${total} of ${whose} mistakes`;
  }
  return `${count} of ${whose} ${total} mistakes`;
}

/** The time a move took that is worth a remark: a tenth of the clock, at least 20 seconds. */
function notableThink(base: number | null): number {
  return base === null ? 60 : Math.max(20, base / 10);
}

/** Under this a move was played in a hurry (a fiftieth of the clock, 3 to 10 seconds). */
function hastyMove(base: number | null): number {
  return base === null ? 10 : Math.min(10, Math.max(3, Math.round(base / 50)));
}

export interface TimeReadingOptions {
  /** The learner's side, when known: the reading then speaks to them about their own moves. */
  learner: LongColor | null;
  startFen: Fen;
}

/**
 * A few plain sentences about how the time went: mistakes made short of
 * time ("3 of your 4 mistakes came with under 30 seconds left") or in a
 * hurry, the longest think ("Black spent 6 minutes on move 14, Nxe5"), and
 * how low a clock ran. The learner's own moves when their side is known, both
 * sides otherwise. Mistakes are the review's mistakes and blunders.
 */
export function readTimeUse(
  times: GameTimes,
  review: ReviewSummary | null,
  { learner, startFen }: TimeReadingOptions,
): string[] {
  const sides: LongColor[] = learner ? [learner] : ['white', 'black'];
  const lines: string[] = [];
  const spokenFor = new Set<LongColor>();
  const timeOf = (ply: number) => times.moves[ply - 1];
  const errorsOf = (side: LongColor) =>
    (review?.moves ?? []).filter(
      (m) => m.mover === side && isError(m.judgement) && timeOf(m.ply)?.san === m.san,
    );

  // Mistakes made short of time.
  for (const side of sides) {
    const errors = errorsOf(side);
    const late = errors.filter((m) => {
      const move = timeOf(m.ply);
      return move ? inTimeTrouble(move, times) : false;
    });
    if (late.length === 0) continue;
    spokenFor.add(side);
    lines.push(
      `${capitalise(someOf(late.length, errors.length, side, learner))} came with under ${durationWords(times.trouble)} left.`,
    );
  }

  // Otherwise, mistakes played in a hurry with time to think (not in bullet, where every move is quick).
  if (times.base === null || times.base >= 180) {
    const hasty = hastyMove(times.base);
    for (const side of sides) {
      if (spokenFor.has(side)) continue;
      const errors = errorsOf(side).filter((m) => timeOf(m.ply)?.spent != null);
      const quick = errors.filter((m) => (timeOf(m.ply)?.spent ?? Infinity) < hasty);
      if (quick.length === 0 || quick.length * 2 < errors.length) continue;
      spokenFor.add(side);
      const only = errors.length === 1 ? timeOf(quick[0]?.ply ?? 0) : undefined;
      lines.push(
        only?.spent != null && only.before !== null
          ? `${capitalise(possessive(side, learner))} only mistake took ${durationWords(only.spent)}, with ${durationWords(only.before)} on the clock.`
          : `${capitalise(someOf(quick.length, errors.length, side, learner))} took under ${durationWords(hasty)}, with time to spare.`,
      );
    }
  }

  // The longest think (the learner's own, when their side is known).
  const longest = times.moves
    .filter((m) => m.spent !== null && (!learner || m.mover === learner))
    .reduce<MoveTime | null>((top, m) => ((m.spent ?? 0) > (top?.spent ?? -1) ? m : top), null);
  if (longest?.spent != null && longest.spent >= notableThink(times.base)) {
    const reviewed = review?.moves[longest.ply - 1];
    const verdict =
      reviewed?.san === longest.san &&
      (reviewed.judgement === 'inaccuracy' || isError(reviewed.judgement))
        ? ` — ${reviewed.judgement === 'inaccuracy' ? 'an inaccuracy' : `a ${reviewed.judgement}`}`
        : '';
    lines.push(
      `${capitalise(subject(longest.mover, learner))} spent ${durationWords(longest.spent)} on move ${moveNumberOfPly(longest.ply, startFen)}, ${longest.san}${verdict}.`,
    );
  }

  // How low a clock ran, for a side that got short of time without it costing a mistake.
  for (const side of sides) {
    if (spokenFor.has(side)) continue;
    const lowest = times.moves
      .filter((m) => m.mover === side && m.after !== null)
      .reduce<MoveTime | null>(
        (low, m) => ((m.after ?? Infinity) < (low?.after ?? Infinity) ? m : low),
        null,
      );
    if (lowest?.after == null || lowest.after >= times.trouble) continue;
    const who = capitalise(subject(side, learner));
    lines.push(
      `${who} ${side === learner ? 'were' : 'was'} down to ${durationWords(lowest.after)} by move ${moveNumberOfPly(lowest.ply, startFen)}.`,
    );
  }

  return lines.slice(0, 3);
}
