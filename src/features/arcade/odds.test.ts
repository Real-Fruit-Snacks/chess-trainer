import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { OddsLadderState } from '@/store/progress';
import {
  advanceOdds,
  describeRung,
  describeRungResults,
  ODDS_RUNGS,
  oddsFen,
  oddsGamesPlayed,
  oddsStep,
} from './odds';

const TOP = ODDS_RUNGS.length - 1;

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
    const level = ODDS_RUNGS[TOP];
    expect(oddsFen(level as (typeof ODDS_RUNGS)[number]).split(' ')[2]).toBe('KQkq');
  });

  it('climbs on a win, stays on a loss or draw, and never falls', () => {
    let state: OddsLadderState = { rung: 0, best: 0, results: {} };
    state = advanceOdds(state, 0, 'loss');
    expect(state.rung).toBe(0);
    expect(state.results[0]).toEqual({ wins: 0, losses: 1, draws: 0 });
    state = advanceOdds(state, 0, 'win');
    expect(state.rung).toBe(1);
    expect(state.best).toBe(1);
    state = advanceOdds(state, 1, 'draw');
    expect(state.rung).toBe(1);
    // A draw is stored on its rung.
    expect(state.results[1]).toEqual({ wins: 0, losses: 0, draws: 1 });
    // Replaying the first rung does not move the ladder.
    state = advanceOdds(state, 0, 'win');
    expect(state.rung).toBe(1);
    expect(state.results[0]).toEqual({ wins: 2, losses: 1, draws: 0 });
    // The top rung is the last one.
    for (let i = 1; i < ODDS_RUNGS.length + 2; i++) state = advanceOdds(state, state.rung, 'win');
    expect(state.rung).toBe(TOP);
  });

  it('counts draws as played, including results saved before draws were stored', () => {
    const old: OddsLadderState = { rung: 0, best: 0, results: { 0: { wins: 0, losses: 0 } } };
    expect(oddsGamesPlayed(old)).toBe(0);
    const drawn = advanceOdds(old, 0, 'draw');
    expect(oddsGamesPlayed(drawn)).toBe(1);
    expect(oddsGamesPlayed({ rung: 2, best: 2, results: { 0: { wins: 1, losses: 2 } } })).toBe(3);
  });

  it('describes a rung’s games in words, only what happened', () => {
    expect(describeRungResults(undefined)).toBe('');
    expect(describeRungResults({ wins: 0, losses: 0 })).toBe('');
    expect(describeRungResults({ wins: 0, losses: 1 })).toBe('1 loss');
    expect(describeRungResults({ wins: 2, losses: 3, draws: 1 })).toBe(
      '2 wins · 1 draw · 3 losses',
    );
  });

  it('says what a game did to the ladder, judged before it moved', () => {
    const at = (rung: number): OddsLadderState => ({ rung, best: rung, results: {} });
    expect(oddsStep(at(0), 0, 'win')).toBe('climbed');
    expect(oddsStep(at(TOP - 1), TOP - 1, 'win')).toBe('reached-top');
    // A win on the top rung: nothing left to climb, and not "a lower rung" either.
    expect(oddsStep(at(TOP), TOP, 'win')).toBe('beat-top');
    expect(oddsStep(at(3), 1, 'win')).toBe('replayed');
    expect(oddsStep(at(2), 2, 'draw')).toBe('drew');
    expect(oddsStep(at(2), 2, 'loss')).toBe('lost');
  });

  it('describes rungs by number and name', () => {
    expect(describeRung(0)).toBe('Rung 1 · Queen odds');
    expect(describeRung(TOP)).toBe(`Rung ${TOP + 1} · Level game`);
    // Out of range: the nearest real rung.
    expect(describeRung(99)).toBe(`Rung ${TOP + 1} · Level game`);
  });
});
