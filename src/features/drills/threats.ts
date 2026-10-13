import { Chess } from 'chess.js';
import { parseUci, passMove, turnOf, uciToSan } from '@/chess/helpers';
import type { Fen, LongColor, San, Uci } from '@/chess/types';
import type { EngineClient } from '@/engine/EngineClient';
import { materialSwing } from '@/features/analyze/commentary';
import type { ReviewSummary } from '@/features/analyze/gameReview';
import { scoreCp } from '@/features/puzzles/ownPuzzles';
import { hashString, pickRandom } from '@/lib/random';

/**
 * "What's the threat?": the learner is to move, but first names what the
 * opponent threatens — the opponent's best move if it were their turn — and
 * then finds a move that meets it. Positions come from the bundled puzzles
 * (scripts/build-threats.mjs) and from the learner's own games, where a
 * review shows a threat that was missed. Pure helpers, shared by the drill,
 * the review and the progress store.
 */

export interface ThreatPosition {
  id: string;
  /** The position, the learner to move. */
  fen: Fen;
  /** The threat: the opponent's best move after a pass (in `passMove(fen)`), UCI. */
  threat: Uci;
  /** Other moves that carry the threat out as well: any of them is right. */
  also?: Uci[];
  /** The threat carried out, a few plies from `threat`, for describing what it wins. */
  line: Uci[];
  /** Moves that meet the threat; the engine is asked about any other move. */
  defences: Uci[];
  rating: number;
  kind: 'mate' | 'material';
  /** Puzzle tags of the tactic behind the threat (fork, pin…). */
  motifs?: string;
  /** Bundled positions: the move played in the game instead, which lost to the threat. */
  game?: Uci;
}

/** Where a threat from the learner's own game came from. */
export interface OwnThreatSource {
  /** "alice – bob, 2026-09-29" or the game's event. */
  title: string;
  /** 1-based half-move of the move that missed it. */
  ply: number;
  /** The move that was played instead of meeting it. */
  played: San;
  url?: string;
  /**
   * The move was the learner's: it was known which side they played. Otherwise
   * it may be either side's (a game whose players the app cannot tell apart).
   */
  byLearner?: boolean;
}

/** A threat the learner missed in one of their own games, kept for the drill. */
export interface OwnThreat extends ThreatPosition {
  source: OwnThreatSource;
  createdAt: number;
  /** Times named in the drill, and times missed. */
  found: number;
  missed: number;
  /** Times named in a row: at `OWN_THREAT_RETIRE_STREAK` it is learned. */
  streak: number;
}

export const OWN_THREAT_PREFIX = 'threat-';
/** An own threat named this many times in a row stops coming back. */
export const OWN_THREAT_RETIRE_STREAK = 2;
/** The engine checks a move the stored lists do not cover at this depth. */
export const THREAT_VERIFY_DEPTH = 12;
/** A named move within this much of the threat (centipawns) is the same threat. */
export const THREAT_EQUIVALENT_CP = 50;
/** A defence within this much of the best one holds. */
export const DEFENCE_EQUIVALENT_CP = 70;
/** Passing must cost at least this much (centipawns) for there to be a threat… */
export const MIN_THREAT_CP = 200;
/** …and with the best move the side to move may be at most this much worse (else it was lost anyway). */
export const MAX_DEFENDED_DEFICIT_CP = 150;

export function isOwnThreatId(id: string): boolean {
  return id.startsWith(OWN_THREAT_PREFIX);
}

/** Stable id: the same threat in the same position is one entry. */
export function ownThreatId(fen: Fen, threat: Uci): string {
  return `${OWN_THREAT_PREFIX}${hashString(`${fen}|${threat}`).toString(36)}`;
}

/** The side the learner plays (to move in the position). */
export function learnerSide(position: Pick<ThreatPosition, 'fen'>): LongColor {
  return turnOf(position.fen);
}

/** Own threats still to learn, the least practised first (then the newest). */
export function dueOwnThreats(own: Record<string, OwnThreat>): OwnThreat[] {
  return Object.values(own)
    .filter((t) => t.streak < OWN_THREAT_RETIRE_STREAK)
    .sort((a, b) => a.found + a.missed - (b.found + b.missed) || b.createdAt - a.createdAt);
}

/**
 * A bundled position near `rating`, not one of the `recent` ones: the window
 * widens until there are a few to choose from. Once every position near the
 * rating has been seen lately, recent ones come back rather than nothing.
 */
export function pickBundledThreat(
  all: readonly ThreatPosition[],
  options: {
    rating: number;
    recent: readonly string[];
    excludeId?: string | null;
    random?: () => number;
  },
): ThreatPosition | null {
  const recent = new Set(options.recent);
  const random = options.random ?? Math.random;
  for (const window of [150, 250, 400, 700, 4000]) {
    const near = all.filter(
      (p) => Math.abs(p.rating - options.rating) <= window && p.id !== options.excludeId,
    );
    const fresh = near.filter((p) => !recent.has(p.id));
    if (fresh.length >= 3 || (fresh.length > 0 && window >= 700)) {
      return pickRandom(fresh, random) ?? null;
    }
    if (window >= 4000 && near.length > 0) return pickRandom(near, random) ?? null;
  }
  return null;
}

/** Whether `uci` is the threat or one of the moves stored as just as strong. */
export function isStoredThreat(position: Pick<ThreatPosition, 'threat' | 'also'>, uci: Uci) {
  return uci === position.threat || (position.also ?? []).includes(uci);
}

/** Whether `uci` is one of the stored defences. */
export function isStoredDefence(position: Pick<ThreatPosition, 'defences'>, uci: Uci) {
  return position.defences.includes(uci);
}

export interface ThreatDescription {
  /** The threat in SAN, from the opponent's side ("Bxh7+"). */
  san: San;
  /** What it does: "mates in 2", "wins a piece"… */
  outcome: string;
}

const MATERIAL_WORDS: [number, string][] = [
  [8, 'wins the queen'],
  [5, 'wins a rook'],
  [3, 'wins a piece'],
  [2, 'wins the exchange'],
  [1, 'wins a pawn'],
];

/** The threat in words, from its line: what it mates or wins. */
export function describeThreat(
  position: Pick<ThreatPosition, 'fen' | 'threat' | 'line' | 'kind'>,
): ThreatDescription | null {
  const passed = passMove(position.fen);
  if (!passed) return null;
  const san = uciToSan(passed, position.threat);
  if (!san) return null;
  const line = position.line[0] === position.threat ? position.line : [position.threat];
  const chess = new Chess(passed);
  for (const [i, uci] of line.entries()) {
    try {
      chess.move(parseUci(uci));
    } catch {
      break;
    }
    if (chess.isCheckmate()) {
      const moves = Math.floor(i / 2) + 1;
      return { san, outcome: moves === 1 ? 'mates' : `mates in ${moves}` };
    }
  }
  if (position.kind === 'mate') return { san, outcome: 'leads to mate' };
  const won = materialSwing(passed, line, 6);
  const words = MATERIAL_WORDS.find(([value]) => won >= value)?.[1] ?? 'wins material';
  return { san, outcome: words };
}

type Searcher = Pick<EngineClient, 'search'>;

/** Scores of `moves` in `fen` from one search (side to move's view), by move. */
async function scoresOf(
  engine: Searcher,
  fen: Fen,
  moves: Uci[],
): Promise<{ scores: Map<Uci, number>; best: Uci | null } | null> {
  const result = await engine.search({
    fen,
    depth: THREAT_VERIFY_DEPTH,
    multipv: moves.length,
    searchmoves: moves,
  }).result;
  if (result.stopped) return null;
  const scores = new Map<Uci, number>();
  for (const line of result.lines.values()) {
    const first = line.pv[0];
    if (first) scores.set(first, scoreCp(line.score));
  }
  return { scores, best: result.bestmove.move };
}

/**
 * Asks the engine whether a move the lists do not name carries out the same
 * threat: searched against the stored threat after a pass, it must score
 * within `THREAT_EQUIVALENT_CP` of it.
 */
export async function verifyThreatGuess(
  engine: Searcher,
  position: Pick<ThreatPosition, 'fen' | 'threat'>,
  guess: Uci,
): Promise<boolean> {
  const passed = passMove(position.fen);
  if (!passed || guess === position.threat) return guess === position.threat;
  const found = await scoresOf(engine, passed, [position.threat, guess]);
  if (!found) return false;
  const threat = found.scores.get(position.threat);
  const named = found.scores.get(guess);
  if (named === undefined) return false;
  if (threat === undefined) return found.best === guess;
  return named >= threat - THREAT_EQUIVALENT_CP;
}

/**
 * Asks the engine whether a defence the list does not name holds: searched
 * against the best stored defence, it must score within
 * `DEFENCE_EQUIVALENT_CP` of it.
 */
export async function verifyDefence(
  engine: Searcher,
  position: Pick<ThreatPosition, 'fen' | 'defences'>,
  played: Uci,
): Promise<boolean> {
  const best = position.defences[0];
  if (!best) return false;
  if (best === played) return true;
  const found = await scoresOf(engine, position.fen, [best, played]);
  if (!found) return false;
  const bestCp = found.scores.get(best);
  const playedCp = found.scores.get(played);
  if (playedCp === undefined) return false;
  if (bestCp === undefined) return found.best === played;
  return playedCp >= bestCp - DEFENCE_EQUIVALENT_CP;
}

export interface OwnThreatMeta {
  /** "alice – bob, 2026-09-29". */
  title: string;
  url?: string;
  /** The learner's puzzle rating when the threat was saved. */
  rating: number;
}

/**
 * How missed threats are counted under a review: as the learner's own moves
 * when every one is known to be theirs, otherwise as moves in this game (on
 * the analysis board) or in their games (My games).
 */
export function missedThreatsNote(
  threats: readonly Pick<OwnThreat, 'source'>[],
  scope: 'game' | 'games',
): string {
  const n = threats.length;
  const where = scope === 'game' ? 'this game' : 'your games';
  const subject = threats.every((t) => t.source.byLearner)
    ? n === 1
      ? 'One of your moves'
      : `${n} of your moves`
    : n === 1
      ? `One move in ${where}`
      : `${n} moves in ${where}`;
  return `${subject} ignored a threat that was already on the board.`;
}

/**
 * The threats a reviewed game shows were missed: mistakes and blunders whose
 * punishment — the opponent's best answer — was already threatened before the
 * move (it is the opponent's best move after a pass), in a position that could
 * still be held. `side`, the side the learner played, keeps their own moves
 * only (and marks them as theirs); 'both' when it is not known. The defence
 * stored is the engine's move in that position; the drill asks the engine
 * about any other.
 */
export function ownThreatsFromReview(
  review: ReviewSummary,
  meta: OwnThreatMeta,
  side: LongColor | 'both' = 'both',
  now = Date.now(),
): OwnThreat[] {
  const out: OwnThreat[] = [];
  for (const move of review.moves) {
    if (side !== 'both' && move.mover !== side) continue;
    if (move.judgement !== 'mistake' && move.judgement !== 'blunder') continue;
    const pass = move.passThreat;
    if (!pass || !move.scoreBefore || !move.bestUci || !move.replyUci) continue;
    // The game itself shows the threat: the answer to the move played carried it out.
    if (move.replyUci !== pass.uci && !pass.also.includes(move.replyUci)) continue;
    const held = scoreCp(move.scoreBefore);
    if (held < -MAX_DEFENDED_DEFICIT_CP) continue;
    const mate = pass.score.type === 'mate' && pass.score.value > 0;
    if (!mate && scoreCp(pass.score) + held < MIN_THREAT_CP) continue;
    out.push({
      id: ownThreatId(move.fen, pass.uci),
      fen: move.fen,
      threat: pass.uci,
      ...(pass.also.length ? { also: pass.also } : {}),
      line: pass.pv.length ? pass.pv : [pass.uci],
      defences: [move.bestUci],
      rating: Math.round(meta.rating),
      kind: mate ? 'mate' : 'material',
      source: {
        title: meta.title,
        ply: move.ply,
        played: move.san,
        ...(meta.url ? { url: meta.url } : {}),
        ...(side === 'both' ? {} : { byLearner: true }),
      },
      createdAt: now,
      found: 0,
      missed: 0,
      streak: 0,
    });
  }
  return out;
}
