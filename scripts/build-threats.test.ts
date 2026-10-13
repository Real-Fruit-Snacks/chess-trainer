// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cpOf, judgeCandidate, MIN_THREAT_CP, passMove } from './build-threats.mjs';

interface Score {
  type: 'cp' | 'mate';
  value: number;
}
const search = (...lines: [Score, string][]) => ({
  lines: new Map(lines.map(([score, move], i) => [i + 1, { score, pv: [move] }])),
});
const cp = (value: number): Score => ({ type: 'cp', value });
const mate = (value: number): Score => ({ type: 'mate', value });

/** The game went 1.Kg2??, and the puzzle is 1...Ra8 — after the pass, Black's threat. */
const PUZZLE = {
  id: 'abcde',
  fen: '6k1/8/8/8/8/8/6PP/r5K1 w - - 0 30',
  moves: 'g1g2 a1a8',
  rating: 1500,
  themes: 'fork middlegame short',
};

describe('build-threats', () => {
  it('scores mates near 10,000 from the side to move', () => {
    expect(cpOf(cp(-35))).toBe(-35);
    expect(cpOf(mate(2))).toBe(9_998);
    expect(cpOf(mate(-1))).toBe(-9_999);
    expect(cpOf(mate(0))).toBe(-10_000);
  });

  it('passes the move, unless the side to move is in check', () => {
    expect(passMove('4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1')).toBe('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    expect(passMove('4k3/8/8/8/8/8/8/r3K3 w - - 0 1')).toBeNull();
  });

  it('keeps a clear threat that can be met, with every defence and the tactic’s tags', () => {
    const verdict = judgeCandidate(
      PUZZLE,
      search([mate(1), 'a1a8'], [cp(20), 'a1a7']),
      search([cp(30), 'h2h3'], [cp(-10), 'g1f1'], [cp(-500), 'g1g2']),
    );
    expect(verdict).toEqual({
      entry: {
        id: 'abcde',
        fen: PUZZLE.fen,
        threat: 'a1a8',
        line: ['a1a8'],
        defences: ['h2h3', 'g1f1'],
        game: 'g1g2',
        rating: 1500,
        kind: 'mate',
        motifs: 'fork',
      },
    });
  });

  it('turns down threats that are not the game’s, not clear, too small or not to be met', () => {
    const normal = search([cp(30), 'h2h3'], [cp(-500), 'g1g2']);
    expect(judgeCandidate(PUZZLE, search([cp(400), 'a1b1'], [cp(100), 'a1a8']), normal)).toEqual({
      reject: 'not the game threat',
    });
    expect(judgeCandidate(PUZZLE, search([cp(400), 'a1a8'], [cp(330), 'a1a7']), normal)).toEqual({
      reject: 'threat not clear',
    });
    expect(
      judgeCandidate(PUZZLE, search([cp(MIN_THREAT_CP - 100), 'a1a8'], [cp(-200), 'a1a7']), normal),
    ).toEqual({ reject: 'threat too small' });
    expect(
      judgeCandidate(
        PUZZLE,
        search([mate(1), 'a1a8'], [cp(0), 'a1a7']),
        search([cp(-400), 'h2h3'], [cp(-900), 'g1g2']),
      ),
    ).toEqual({ reject: 'lost anyway' });
    expect(
      judgeCandidate(
        PUZZLE,
        search([mate(1), 'a1a8'], [cp(0), 'a1a7']),
        search([cp(30), 'h2h3'], [cp(0), 'g1g2']),
      ),
    ).toEqual({ reject: 'game move defends' });
  });

  it('counts moves just as strong as the threat as the same threat', () => {
    const verdict = judgeCandidate(
      PUZZLE,
      search([cp(600), 'a1a8'], [cp(580), 'a1a7'], [cp(100), 'a1b1']),
      search([cp(0), 'h2h3'], [cp(-700), 'g1g2']),
    );
    expect(verdict).toMatchObject({ entry: { threat: 'a1a8', also: ['a1a7'], kind: 'material' } });
  });
});
