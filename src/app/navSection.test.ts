import { describe, expect, it } from 'vitest';
import { navSection } from './navSection';

describe('navSection', () => {
  it('files a page under the nav entry it belongs to', () => {
    expect(navSection('/')).toBe('/');
    expect(navSection('/learn/forks')).toBe('/learn');
    expect(navSection('/puzzles/themes')).toBe('/puzzles');
    // The placement quiz is part of Learn, so Learn is highlighted while it runs.
    expect(navSection('/placement')).toBe('/learn');
    expect(navSection('/arcade/simul')).toBe('/arcade');
  });
});
