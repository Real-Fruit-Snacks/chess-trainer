import { describe, expect, it } from 'vitest';
import { buildThemeReport, splitThemeReport, themeBaseline } from './themeReport';

describe('buildThemeReport', () => {
  it('ranks practiceable themes by accuracy and ignores meta tags and thin data', () => {
    const rows = buildThemeReport({
      fork: { solved: 2, failed: 8 },
      pin: { solved: 9, failed: 1 },
      short: { solved: 50, failed: 50 }, // meta tag: excluded
      mateIn2: { solved: 2, failed: 1 }, // too few attempts
      unknownTag: { solved: 5, failed: 5 },
    });
    expect(rows.map((r) => r.tag)).toEqual(['fork', 'pin']);
    expect(rows[0]).toMatchObject({ accuracy: 20, attempts: 10 });
    expect(rows[1]).toMatchObject({ accuracy: 90 });
  });
});

describe('strengths and weaknesses', () => {
  it('measures themes against the learner’s own accuracy', () => {
    expect(themeBaseline({})).toBeNull();
    // Meta tags do not count; every practiceable attempt does, however thin.
    expect(
      themeBaseline({
        fork: { solved: 3, failed: 1 },
        pin: { solved: 1, failed: 3 },
        short: { solved: 0, failed: 50 },
      }),
    ).toBe(50);
  });

  it('never lists a theme under both headings, however few are ranked', () => {
    const stats = {
      fork: { solved: 2, failed: 8 },
      pin: { solved: 6, failed: 4 },
      skewer: { solved: 9, failed: 1 },
    };
    const rows = buildThemeReport(stats);
    const { weak, strong } = splitThemeReport(rows, themeBaseline(stats));
    // Baseline 57%: fork is below it; pin and skewer are at or above.
    expect(weak.map((r) => r.tag)).toEqual(['fork']);
    expect(strong.map((r) => r.tag)).toEqual(['skewer', 'pin']);
    const single = buildThemeReport({ fork: { solved: 4, failed: 4 } });
    const one = splitThemeReport(single, 50);
    expect(one.weak).toEqual([]);
    expect(one.strong.map((r) => r.tag)).toEqual(['fork']);
  });

  it('keeps five per list, weakest and strongest first', () => {
    const stats = Object.fromEntries(
      ['fork', 'pin', 'skewer', 'mateIn1', 'mateIn2', 'hangingPiece', 'discoveredAttack'].map(
        (tag, i) => [tag, { solved: i, failed: 6 - i }],
      ),
    );
    const rows = buildThemeReport(stats);
    const { weak, strong } = splitThemeReport(rows, 50, 2);
    expect(weak.map((r) => r.accuracy)).toEqual([0, 17]);
    expect(strong.map((r) => r.accuracy)).toEqual([100, 83]);
  });
});
