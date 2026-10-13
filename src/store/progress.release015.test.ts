import { beforeEach, describe, expect, it } from 'vitest';
import type { OwnThreat } from '@/features/drills/threats';
import { MAX_OWN_THREATS, MAX_RECENT_THREATS, MAX_SELF_REVIEWS, useProgress } from './progress';

const ownThreat = (n: number, extra: Partial<OwnThreat> = {}): OwnThreat => ({
  id: `threat-${n}`,
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  threat: 'h5f7',
  line: ['h5f7'],
  defences: ['g7g6'],
  rating: 1200,
  kind: 'mate',
  source: { title: 'Me – You', ply: 6, played: 'Nf6' },
  createdAt: 1_000 + n,
  found: 0,
  missed: 0,
  streak: 0,
  ...extra,
});

describe('progress store (0.15)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
    useProgress.setState({ puzzleRating: 1500 });
  });

  describe('blind puzzles', () => {
    it('start each depth below the rating and move it with the results', () => {
      const s = useProgress.getState();
      expect(s.recordBlind({ id: 'a', depth: 'long', outcome: 'solved', peeked: false })).toEqual({
        before: 1050,
        after: 1090,
      });
      expect(s.recordBlind({ id: 'b', depth: 'long', outcome: 'failed', peeked: false })).toEqual({
        before: 1090,
        after: 1030,
      });
      // A solve after peeking counts as a solve but does not raise the level.
      expect(s.recordBlind({ id: 'c', depth: 'short', outcome: 'solved', peeked: true })).toEqual({
        before: 1200,
        after: 1200,
      });
      const { blind, seen } = useProgress.getState();
      expect(blind).toMatchObject({
        levels: { long: 1030, short: 1200 },
        solved: 2,
        failed: 1,
        clean: 1,
        run: 0,
        bestRun: 1,
      });
      expect(blind.lastAt).toBeGreaterThan(0);
      // Seen blind is spoiled for rated solving.
      expect(seen).toMatchObject({ a: 'solved', b: 'failed', c: 'solved' });
    });

    it('count clean solves in a row and keep the best run as the drill record', () => {
      const s = useProgress.getState();
      for (const id of ['a', 'b', 'c']) {
        s.recordBlind({ id, depth: 'short', outcome: 'solved', peeked: false });
      }
      s.recordBlind({ id: 'd', depth: 'short', outcome: 'failed', peeked: false });
      const state = useProgress.getState();
      expect(state.blind.run).toBe(0);
      expect(state.blind.bestRun).toBe(3);
      expect(state.drills['blind-puzzles']).toMatchObject({ best: 3, attempts: 4 });
      expect(state.trainingDays.length).toBe(1);
    });
  });

  describe('the threat drill', () => {
    it('counts threats and defences, keeps the run and remembers bundled positions', () => {
      const s = useProgress.getState();
      s.recordThreat({ id: 'p1', found: true, defence: 'held' });
      s.recordThreat({ id: 'p2', found: true, defence: 'failed' });
      s.recordThreat({ id: 'p3', found: false, defence: null });
      s.recordThreat({ id: 'p1', found: true, defence: null });
      const { threatStats, drills } = useProgress.getState();
      expect(threatStats).toMatchObject({
        found: 3,
        missed: 1,
        defended: 1,
        defenceTried: 2,
        run: 1,
        bestRun: 2,
      });
      // Most recent last, without duplicates.
      expect(threatStats.recent).toEqual(['p2', 'p3', 'p1']);
      expect(drills.threats).toMatchObject({ best: 2, attempts: 4 });
    });

    it('keeps only the latest bundled positions', () => {
      const recent = Array.from({ length: MAX_RECENT_THREATS }, (_, i) => `old${i}`);
      useProgress.setState({ threatStats: { ...useProgress.getState().threatStats, recent } });
      useProgress.getState().recordThreat({ id: 'new', found: true, defence: null });
      const after = useProgress.getState().threatStats.recent;
      expect(after).toHaveLength(MAX_RECENT_THREATS);
      expect(after[0]).toBe('old1');
      expect(after.at(-1)).toBe('new');
    });

    it('stores own threats once and tracks each one until it is learned', () => {
      const s = useProgress.getState();
      expect(s.addOwnThreats([ownThreat(1), ownThreat(2)])).toBe(2);
      expect(s.addOwnThreats([ownThreat(1)])).toBe(0);
      s.recordThreat({ id: 'threat-1', found: false, defence: null });
      s.recordThreat({ id: 'threat-1', found: true, defence: 'held' });
      s.recordThreat({ id: 'threat-1', found: true, defence: null });
      const { ownThreats, threatStats } = useProgress.getState();
      expect(ownThreats['threat-1']).toMatchObject({ found: 2, missed: 1, streak: 2 });
      // Own threats are not bundled positions: they stay out of the recent list.
      expect(threatStats.recent).toEqual([]);
      useProgress.getState().removeOwnThreat('threat-2');
      expect(Object.keys(useProgress.getState().ownThreats)).toEqual(['threat-1']);
    });

    it('caps own threats, dropping learned ones before those still to learn', () => {
      const many = Array.from({ length: MAX_OWN_THREATS }, (_, i) =>
        ownThreat(i, { streak: i < 5 ? 2 : 0 }),
      );
      useProgress.getState().addOwnThreats(many);
      useProgress.getState().addOwnThreats([ownThreat(9999)]);
      const own = useProgress.getState().ownThreats;
      expect(Object.keys(own)).toHaveLength(MAX_OWN_THREATS);
      expect(own['threat-9999']).toBeDefined();
      // One learned threat made room; every one still being learned is kept.
      expect(Object.values(own).filter((t) => t.streak >= 2)).toHaveLength(4);
    });
  });

  describe('self-review and the blunder check', () => {
    it('adds up self-reviews and keeps a capped history', () => {
      const s = useProgress.getState();
      s.recordSelfReview({
        found: 2,
        total: 4,
        falseAlarms: 1,
        suggestions: 2,
        goodSuggestions: 1,
      });
      s.recordSelfReview({
        found: 3,
        total: 3,
        falseAlarms: 0,
        suggestions: 1,
        goodSuggestions: 1,
      });
      const { selfReview, drills } = useProgress.getState();
      expect(selfReview).toMatchObject({
        games: 2,
        found: 5,
        total: 7,
        falseAlarms: 1,
        suggestions: 3,
        goodSuggestions: 2,
      });
      expect(selfReview.history.map((h) => [h.found, h.total])).toEqual([
        [2, 4],
        [3, 3],
      ]);
      expect(drills['self-review']).toMatchObject({ best: 2, attempts: 2 });
      for (let i = 0; i < MAX_SELF_REVIEWS + 5; i++) {
        useProgress.getState().recordSelfReview({
          found: 0,
          total: 1,
          falseAlarms: 0,
          suggestions: 0,
          goodSuggestions: 0,
        });
      }
      expect(useProgress.getState().selfReview.history).toHaveLength(MAX_SELF_REVIEWS);
    });

    it('counts the moves the blunder check stopped and those played anyway', () => {
      const s = useProgress.getState();
      s.recordBlunderCheck('stopped');
      s.recordBlunderCheck('stopped');
      s.recordBlunderCheck('played-anyway');
      expect(useProgress.getState().blunderChecks).toEqual({ stopped: 2, playedAnyway: 1 });
    });

    it('start empty again after a reset', () => {
      const s = useProgress.getState();
      s.recordBlunderCheck('stopped');
      s.recordBlind({ id: 'a', depth: 'short', outcome: 'solved', peeked: false });
      s.addOwnThreats([ownThreat(1)]);
      s.resetAll();
      const after = useProgress.getState();
      expect(after.blunderChecks).toEqual({ stopped: 0, playedAnyway: 0 });
      expect(after.blind.levels).toEqual({});
      expect(after.ownThreats).toEqual({});
    });
  });
});
