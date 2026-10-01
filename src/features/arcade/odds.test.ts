import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { OddsLadderState } from '@/store/progress';
import { advanceOdds, describeRung, ODDS_RUNGS, oddsFen } from './odds';

describe('odds ladder', () => {
  it('builds a legal starting position for every rung', () => {
    for (const rung of ODDS_RUNGS) {
      const fen = oddsFen(rung);
      const chess = new Chess(fen);
      expect(chess.turn()).toBe('w');
      for (const square of rung.removed) expect(chess.get(square)).toBeFalsy();
      expect(chess.moves().length).toBeGreaterThan(0);
    }
  });

  it('drops the queenside castling right with the rook', () => {
    const rook = ODDS_RUNGS.find((r) => r.id === 'rook');
    expect(rook).toBeDefined();
    const fen = oddsFen(rook as (typeof ODDS_RUNGS)[number]);
    expect(fen.split(' ')[2]).toBe('KQk');
    const level = ODDS_RUNGS[ODDS_RUNGS.length - 1];
    expect(oddsFen(level as (typeof ODDS_RUNGS)[number]).split(' ')[2]).toBe('KQkq');
  });

  it('climbs on a win, stays on a loss or draw, and never falls', () => {
    let state: OddsLadderState = { rung: 0, best: 0, results: {} };
    state = advanceOdds(state, 0, 'loss');
    expect(state.rung).toBe(0);
    expect(state.results[0]).toEqual({ wins: 0, losses: 1 });
    state = advanceOdds(state, 0, 'win');
    expect(state.rung).toBe(1);
    expect(state.best).toBe(1);
    state = advanceOdds(state, 1, 'draw');
    expect(state.rung).toBe(1);
    expect(state.results[1]).toEqual({ wins: 0, losses: 0 });
    // Replaying the first rung does not move the ladder.
    state = advanceOdds(state, 0, 'win');
    expect(state.rung).toBe(1);
    expect(state.results[0]).toEqual({ wins: 2, losses: 1 });
    // The top rung is the last one.
    for (let i = 1; i < ODDS_RUNGS.length + 2; i++) state = advanceOdds(state, state.rung, 'win');
    expect(state.rung).toBe(ODDS_RUNGS.length - 1);
  });

  it('describes rungs by number and name', () => {
    expect(describeRung(0)).toBe('Rung 1 · Queen odds');
    expect(describeRung(99)).toBe('Rung 100 · Level game');
  });
});
