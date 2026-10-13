import { Chess, type Square } from 'chess.js';
import { tryMove, turnOf } from '@/chess/helpers';
import type { GameTree, TreeNode } from '@/chess/tree';
import type { Fen, LongColor, San } from '@/chess/types';
import type { ExplorerDatabase, ExplorerMove, ExplorerResult } from '@/lib/explorer';
import { positionKey } from './model';

/**
 * The repertoire gap finder's logic, without the network: which positions of a
 * repertoire to ask the opening explorer about, and — from its answers — the
 * replies the repertoire has no answer to, how often a game meets each, and
 * how much of the play the repertoire covers.
 *
 * A gap is a reply played in at least `GAP_MIN_SHARE` of the games in a
 * position where the learner's opponent is to move, and in at least
 * `GAP_MIN_GAMES` of them, after which the repertoire has no move of the
 * learner's. Positions are compared without move order (transpositions count),
 * and positions are only checked where the repertoire answers something: a
 * line that ends there has simply ended. Lines before the learner's first move
 * (1. e4 in a Black repertoire) are checked only when the repertoire answers
 * several first moves; otherwise it is a repertoire against that one move.
 */

/** A reply is a gap when it is played in at least this share of the games in its position… */
export const GAP_MIN_SHARE = 0.05;
/** …and in at least this many games (the masters database is far smaller). */
export const GAP_MIN_GAMES: Readonly<Record<ExplorerDatabase, number>> = {
  lichess: 50,
  masters: 10,
};
/** The depth limits offered, in moves. */
export const GAP_DEPTHS = [8, 12, 16, 20] as const;
export const DEFAULT_GAP_DEPTH = 12;

export interface GapOptions {
  database: ExplorerDatabase;
  /** Check replies up to this move (counted from the repertoire's start). */
  depth: number;
}

/** A position the gap finder asks the explorer about. */
export interface CheckPosition {
  key: string;
  fen: Fen;
  /** The moves that reach it first in the repertoire (fewest moves, main lines first). */
  line: San[];
}

export interface Gap {
  /** The position and the reply: stable across edits of the repertoire. */
  id: string;
  /** The moves that reach the position, from the repertoire's start. */
  line: San[];
  /** The position before the reply. */
  fen: Fen;
  /** The last move of `line`, as squares (for the board), or null at the start. */
  lastMove: [Square, Square] | null;
  reply: ExplorerMove;
  /** The reply's squares, for an arrow. */
  replyFrom: Square;
  replyTo: Square;
  /** The position after the reply. */
  fenAfter: Fen;
  /** Games that reach the position, whatever was played next. */
  games: number;
  /**
   * How often a game played with this repertoire meets this reply, 0–1: the
   * share of every reply on the way there, times this reply's (the order of the list).
   */
  frequency: number;
  /** The reply is in the repertoire, but the line stops there with no answer. */
  inRepertoire: boolean;
  /** Another of the learner's repertoires answers it (its name): listed apart, not a gap. */
  answeredIn: string | null;
}

export interface GapReport {
  /** The positions to check, in the order to ask about them. */
  positions: CheckPosition[];
  /** How many of them have the explorer's answer. */
  checked: number;
  /** Replies with no answer, most often met first. */
  gaps: Gap[];
  /** Replies only another of the learner's repertoires answers. */
  elsewhere: Gap[];
  /**
   * The share of games, 0–1, that find an answer at every position up to the
   * depth (or until the line ends), counting each reply as often as it is
   * played; null until every position is checked, or when no games reach them.
   */
  coverage: number | null;
  /** The moves before the learner's first, when only lines after them were checked. */
  onlyAfter: San[] | null;
}

/** The number of the move about to be played in a position (the FEN's move counter). */
function moveNumber(fen: Fen): number {
  const number = Number(fen.split(' ')[5]);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

interface PositionInfo {
  key: string;
  /** The position as first reached (fewest moves). */
  fen: Fen;
  turn: LongColor;
  /** The repertoire's moves from here: the position each leads to, with its SAN. */
  next: Map<string, San>;
  line: San[];
  lastMove: [Square, Square] | null;
  /** Order of first appearance in a main-lines-first walk. */
  order: number;
  /** Every way here comes before the learner's first move (in practice: the root). */
  beforeLearner: boolean;
}

function squaresOf(uci: string): [Square, Square] | null {
  return uci.length >= 4 ? [uci.slice(0, 2) as Square, uci.slice(2, 4) as Square] : null;
}

/** Every position of the tree, once, with the repertoire's moves from it. */
function indexPositions(tree: GameTree, color: LongColor): Map<string, PositionInfo> {
  const byKey = new Map<string, PositionInfo>();
  let order = 0;
  const walk = (node: TreeNode, line: San[], learnerMoved: boolean) => {
    const key = positionKey(node.fen);
    let info = byKey.get(key);
    if (!info) {
      info = {
        key,
        fen: node.fen,
        turn: turnOf(node.fen),
        next: new Map(),
        line,
        lastMove: squaresOf(node.uci),
        order: order++,
        beforeLearner: !learnerMoved,
      };
      byKey.set(key, info);
    } else {
      if (line.length < info.line.length) {
        info.fen = node.fen;
        info.line = line;
        info.lastMove = squaresOf(node.uci);
      }
      if (learnerMoved) info.beforeLearner = false;
    }
    const learnerMoves = info.turn === color;
    for (const child of node.children) {
      const childKey = positionKey(child.fen);
      if (!info.next.has(childKey)) info.next.set(childKey, child.san);
      walk(child, [...line, child.san], learnerMoved || learnerMoves);
    }
  };
  walk(tree.root, [], false);
  return byKey;
}

/** The positions where a repertoire has a move for the learner (by position key). */
export function answeredPositions(tree: GameTree, color: LongColor): Set<string> {
  const keys = new Set<string>();
  for (const info of indexPositions(tree, color).values()) {
    if (info.turn === color && info.next.size > 0) keys.add(info.key);
  }
  return keys;
}

function plan(
  byKey: Map<string, PositionInfo>,
  tree: GameTree,
  color: LongColor,
  depth: number,
): { checks: PositionInfo[]; onlyAfter: San[] | null } {
  const first = moveNumber(tree.root.fen);
  const checks: PositionInfo[] = [];
  let onlyAfter: San[] | null = null;
  for (const info of byKey.values()) {
    if (info.turn === color || info.next.size === 0) continue;
    if (moveNumber(info.fen) - first + 1 > depth) continue;
    if (info.beforeLearner && info.next.size < 2) {
      const [only] = info.next.values();
      if (only !== undefined) onlyAfter ??= [...info.line, only];
      continue;
    }
    checks.push(info);
  }
  // Nearest the start first (the positions met most often), main lines before sidelines.
  checks.sort((a, b) => a.line.length - b.line.length || a.order - b.order);
  return { checks, onlyAfter };
}

/** The positions to ask the explorer about, in the order to ask. */
export function positionsToCheck(tree: GameTree, color: LongColor, depth: number): CheckPosition[] {
  return plan(indexPositions(tree, color), tree, color, depth).checks.map(toCheck);
}

function toCheck(info: PositionInfo): CheckPosition {
  return { key: info.key, fen: info.fen, line: info.line };
}

interface AfterMove {
  fen: Fen;
  key: string;
  from: Square;
  to: Square;
}

const afterCache = new Map<string, AfterMove | null>();

/** The position after a move given in SAN (the explorer's UCI writes castling its own way). */
function afterMove(fen: Fen, san: San): AfterMove | null {
  const id = `${fen}|${san}`;
  const known = afterCache.get(id);
  if (known !== undefined) return known;
  const chess = new Chess(fen);
  const move = tryMove(chess, san);
  const after = move
    ? { fen: chess.fen(), key: positionKey(chess.fen()), from: move.from, to: move.to }
    : null;
  if (afterCache.size > 5000) afterCache.clear();
  afterCache.set(id, after);
  return after;
}

/**
 * The gaps of a repertoire from the explorer's answers so far (`resultFor`
 * gives a position's answer, or null when it has none yet). `elsewhere` maps
 * positions the learner's other repertoires answer to their names.
 */
export function analyseGaps(
  tree: GameTree,
  color: LongColor,
  { database, depth }: GapOptions,
  resultFor: (fen: Fen) => ExplorerResult | null,
  elsewhere: ReadonlyMap<string, string> = new Map(),
): GapReport {
  const byKey = indexPositions(tree, color);
  const { checks, onlyAfter } = plan(byKey, tree, color, depth);
  const minGames = GAP_MIN_GAMES[database];
  const answered = (key: string) => {
    const info = byKey.get(key);
    return !!info && info.turn === color && info.next.size > 0;
  };

  const results = new Map<string, ExplorerResult>();
  for (const info of checks) {
    const result = resultFor(info.fen);
    if (result) results.set(info.key, result);
  }

  // How often a game played with the repertoire reaches each position: the
  // opponent's replies by their share, the learner's moves shared equally,
  // and the one first move of a repertoire against it taken as played.
  const reach = new Map<string, number>([[positionKey(tree.root.fen), 1]]);
  const ordered = [...byKey.values()].sort(
    (a, b) => a.line.length - b.line.length || a.order - b.order,
  );
  const checkedKeys = new Set(checks.map((info) => info.key));
  const flow = (from: PositionInfo, to: string, weight: number) => {
    const target = byKey.get(to);
    // Only forwards: a position reached again by a longer way (a repetition) adds nothing.
    if (!target || target.line.length <= from.line.length || weight <= 0) return;
    reach.set(to, (reach.get(to) ?? 0) + (reach.get(from.key) ?? 0) * weight);
  };
  for (const info of ordered) {
    if (!reach.get(info.key)) continue;
    if (info.turn === color) {
      for (const to of info.next.keys()) flow(info, to, 1 / info.next.size);
    } else if (!checkedKeys.has(info.key)) {
      if (info.beforeLearner && info.next.size === 1) {
        for (const to of info.next.keys()) flow(info, to, 1);
      }
    } else {
      const result = results.get(info.key);
      if (!result || result.total === 0) continue;
      for (const move of result.moves) {
        const after = afterMove(info.fen, move.san);
        if (after && answered(after.key)) flow(info, after.key, move.share);
      }
    }
  }

  const gaps: Gap[] = [];
  const others: Gap[] = [];
  /** Reach that met no answer, and reach that met positions no games reach. */
  let unanswered = 0;
  let unknown = 0;
  let anyGames = false;
  for (const info of checks) {
    const result = results.get(info.key);
    const here = reach.get(info.key) ?? 0;
    if (!result) continue;
    if (result.total === 0) {
      unknown += here;
      continue;
    }
    anyGames = true;
    let listed = 0;
    for (const move of result.moves) {
      listed += move.share;
      const after = afterMove(info.fen, move.san);
      if (!after || answered(after.key)) continue;
      const answeredIn = elsewhere.get(after.key) ?? null;
      if (answeredIn === null) unanswered += here * move.share;
      if (move.share < GAP_MIN_SHARE || move.total < minGames) continue;
      (answeredIn === null ? gaps : others).push({
        id: `${info.key}|${move.san}`,
        line: info.line,
        fen: info.fen,
        lastMove: info.lastMove,
        reply: move,
        replyFrom: after.from,
        replyTo: after.to,
        fenAfter: after.fen,
        games: result.total,
        frequency: here * move.share,
        inRepertoire: byKey.has(after.key),
        answeredIn,
      });
    }
    // Replies too rare for the explorer to list have no answer either.
    unanswered += here * Math.max(0, 1 - listed);
  }
  const byFrequency = (a: Gap, b: Gap) =>
    b.frequency - a.frequency || b.reply.total - a.reply.total || a.line.length - b.line.length;
  gaps.sort(byFrequency);
  others.sort(byFrequency);

  const known = 1 - unknown;
  const complete = results.size === checks.length;
  return {
    positions: checks.map(toCheck),
    checked: results.size,
    gaps,
    elsewhere: others,
    coverage:
      complete && anyGames && known > 1e-9
        ? Math.min(1, Math.max(0, (known - unanswered) / known))
        : null,
    onlyAfter,
  };
}

/**
 * The explorer's most successful answer for the side to move: the best score
 * among the moves played in enough games (as many as a gap needs, and the same
 * share); failing that, the most played move with enough games; else null.
 */
export function suggestAnswer(
  result: ExplorerResult | null,
  database: ExplorerDatabase,
): ExplorerMove | null {
  if (!result || result.total === 0) return null;
  const enough = result.moves.filter((m) => m.total >= GAP_MIN_GAMES[database]);
  const mainstream = enough.filter((m) => m.share >= GAP_MIN_SHARE);
  if (mainstream.length === 0) {
    return enough.reduce<ExplorerMove | null>(
      (best, m) => (best === null || m.total > best.total ? m : best),
      null,
    );
  }
  return mainstream.reduce((best, m) =>
    m.score > best.score + 1e-9 || (Math.abs(m.score - best.score) <= 1e-9 && m.total > best.total)
      ? m
      : best,
  );
}

/**
 * Plays a line and a reply from `startFen`: the positions either side of the
 * reply and its squares, or null when a move is not legal there.
 */
export function replayGap(
  startFen: Fen,
  line: readonly San[],
  reply: San,
): { fenBefore: Fen; fenAfter: Fen; reply: San; from: Square; to: Square } | null {
  const chess = new Chess(startFen);
  for (const san of line) if (!tryMove(chess, san)) return null;
  const fenBefore = chess.fen();
  const move = tryMove(chess, reply);
  if (!move) return null;
  return { fenBefore, fenAfter: chess.fen(), reply: move.san, from: move.from, to: move.to };
}

/** Moves with the numbers they are written with: "1." before White's, "1..." before a first Black move. */
export function numberMoves(startFen: Fen, sans: readonly San[]): { number: string; san: San }[] {
  let move = moveNumber(startFen);
  let white = turnOf(startFen) === 'white';
  return sans.map((san, i) => {
    const number = white ? `${move}.` : i === 0 ? `${move}...` : '';
    if (!white) move += 1;
    white = !white;
    return { number, san };
  });
}

/** "1. e4 e5 2. Nf3", or "2... Nc6" from a position with Black to move. */
export function lineText(startFen: Fen, sans: readonly San[]): string {
  return numberMoves(startFen, sans)
    .map(({ number, san }) => (number ? `${number} ${san}` : san))
    .join(' ');
}

/** About how many games it takes to meet something that comes in `frequency` of them. */
export function oneGameIn(frequency: number): number | null {
  if (!(frequency > 0)) return null;
  const n = 1 / frequency;
  if (n > 1000) return null;
  // Round to a figure that does not pretend to precision: 7, 40, 150, 600.
  const step = n < 10 ? 1 : n < 50 ? 5 : n < 200 ? 10 : 50;
  return Math.max(1, Math.round(n / step) * step);
}
