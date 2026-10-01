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

/**
 * The ladder after a game on `rungIndex`: a win on the current rung climbs
 * (replaying a lower rung never moves it down), anything else stays.
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
    },
  };
  const top = ODDS_RUNGS.length - 1;
  const rung = verdict === 'win' ? Math.max(state.rung, Math.min(rungIndex + 1, top)) : state.rung;
  return { rung, best: Math.max(state.best, rung), results };
}

export function describeRung(index: number): string {
  const rung = ODDS_RUNGS[Math.min(Math.max(index, 0), ODDS_RUNGS.length - 1)];
  return rung ? `Rung ${index + 1} · ${rung.name}` : '';
}
