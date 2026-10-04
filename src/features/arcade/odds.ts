import { Chess, type Square } from 'chess.js';
import { START_FEN } from '@/chess/helpers';
import type { Fen } from '@/chess/types';
import type { OddsLadderState } from '@/store/progress';

/**
 * The Odds Ladder: full-strength Stockfish plays Black and starts without
 * material. Each win climbs a rung; the last rung is a level game.
 */
export interface OddsRung {
  id: string;
  name: string;
  /** What the engine gives up, in words. */
  handicap: string;
  /** Black squares emptied before the game. */
  removed: Square[];
}

export const ODDS_RUNGS: readonly OddsRung[] = [
  {
    id: 'queen',
    name: 'Queen odds',
    handicap: 'The engine plays without its queen.',
    removed: ['d8'],
  },
  {
    id: 'rook',
    name: 'Rook odds',
    handicap: 'The engine plays without its queen’s rook.',
    removed: ['a8'],
  },
  {
    id: 'knight',
    name: 'Knight odds',
    handicap: 'The engine plays without its queen’s knight.',
    removed: ['b8'],
  },
  {
    id: 'bishop',
    name: 'Bishop odds',
    handicap: 'The engine plays without its queen’s bishop.',
    removed: ['c8'],
  },
  {
    id: 'pawn',
    name: 'Pawn odds',
    handicap: 'The engine plays without its f-pawn.',
    removed: ['f7'],
  },
  {
    id: 'level',
    name: 'Level game',
    handicap: 'No odds: the engine has every piece.',
    removed: [],
  },
];

/** The starting position of a rung: the initial position minus the engine's handicap. */
export function oddsFen(rung: OddsRung): Fen {
  const chess = new Chess(START_FEN);
  for (const square of rung.removed) chess.remove(square);
  let fen = chess.fen();
  // chess.js keeps castling rights for a removed rook; drop the queenside right then.
  if (rung.removed.includes('a8')) {
    const parts = fen.split(' ');
    parts[2] = (parts[2] ?? '-').replace('q', '') || '-';
    fen = parts.join(' ');
  }
  return fen;
}

export type OddsVerdict = 'win' | 'loss' | 'draw';

/** One rung's games so far (`draws` is missing in saves from before 0.12). */
export type RungResults = OddsLadderState['results'][number];

/**
 * The ladder after a game on `rungIndex`: a win on the current rung climbs
 * (replaying a lower rung never moves it down), anything else stays. Every
 * game is counted on its rung, draws included.
 */
export function advanceOdds(
  state: OddsLadderState,
  rungIndex: number,
  verdict: OddsVerdict,
): OddsLadderState {
  const current = state.results[rungIndex] ?? { wins: 0, losses: 0 };
  const results = {
    ...state.results,
    [rungIndex]: {
      wins: current.wins + (verdict === 'win' ? 1 : 0),
      losses: current.losses + (verdict === 'loss' ? 1 : 0),
      draws: (current.draws ?? 0) + (verdict === 'draw' ? 1 : 0),
    },
  };
  const top = ODDS_RUNGS.length - 1;
  const rung = verdict === 'win' ? Math.max(state.rung, Math.min(rungIndex + 1, top)) : state.rung;
  return { rung, best: Math.max(state.best, rung), results };
}

/** Games played on the whole ladder, draws included. */
export function oddsGamesPlayed(state: OddsLadderState): number {
  return Object.values(state.results).reduce((n, r) => n + r.wins + r.losses + (r.draws ?? 0), 0);
}

/** "2 wins · 1 draw · 3 losses" (only what happened; empty before the first game). */
export function describeRungResults(results: RungResults | undefined): string {
  if (!results) return '';
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (results.wins) parts.push(count(results.wins, 'win', 'wins'));
  if (results.draws) parts.push(count(results.draws, 'draw', 'draws'));
  if (results.losses) parts.push(count(results.losses, 'loss', 'losses'));
  return parts.join(' · ');
}

/**
 * What a finished game did to the ladder, judged from the ladder as it was
 * before the game: climbed a rung, climbed onto the level game, beat the
 * level game (the top: nothing left to climb), won a lower rung again, or
 * left it where it was (a draw or a loss).
 */
export type OddsStep = 'climbed' | 'reached-top' | 'beat-top' | 'replayed' | 'drew' | 'lost';

export function oddsStep(
  before: OddsLadderState,
  rungIndex: number,
  verdict: OddsVerdict,
): OddsStep {
  if (verdict === 'draw') return 'drew';
  if (verdict === 'loss') return 'lost';
  const top = ODDS_RUNGS.length - 1;
  if (rungIndex >= top) return 'beat-top';
  if (rungIndex < before.rung) return 'replayed';
  return rungIndex + 1 === top ? 'reached-top' : 'climbed';
}

export function describeRung(index: number): string {
  const clamped = Math.min(Math.max(index, 0), ODDS_RUNGS.length - 1);
  const rung = ODDS_RUNGS[clamped];
  return rung ? `Rung ${clamped + 1} · ${rung.name}` : '';
}
