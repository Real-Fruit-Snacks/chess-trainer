import { describe, expect, it } from 'vitest';
import { buildThemeReport } from './themeReport';

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
