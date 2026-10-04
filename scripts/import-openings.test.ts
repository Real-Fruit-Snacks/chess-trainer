// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATASET_REF } from './import-openings.mjs';

const table = JSON.parse(
  readFileSync(new URL('../public/openings/openings.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('opening data provenance', () => {
  it('records the pinned dataset commit and when it was generated', () => {
    expect(DATASET_REF).toMatch(/^[0-9a-f]{40}$/);
    expect(table.ref).toBe(DATASET_REF);
    expect(typeof table.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(table.generatedAt as string))).toBe(false);
  });

  it('keeps the provenance apart from the positions the app looks up', () => {
    const positions = Object.entries(table).filter(
      ([key]) => key !== 'ref' && key !== 'generatedAt',
    );
    expect(positions.length).toBeGreaterThan(3000);
    for (const [epd, value] of positions) {
      expect(epd.split(' ')).toHaveLength(4);
      expect(value).toEqual([expect.stringMatching(/^[A-E]\d\d$/), expect.any(String)]);
    }
    // The app looks positions up by EPD (src/lib/openings.ts): the extra keys are never one.
    for (const key of ['ref', 'generatedAt']) expect(key.split(' ')).toHaveLength(1);
    const italian = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -';
    expect(table[italian]).toEqual(['C50', expect.stringMatching(/^Italian Game/)]);
  });
});
