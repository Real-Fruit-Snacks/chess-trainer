import { describe, expect, it } from 'vitest';
import { matchesAllWords, normalizeText } from './textMatch';

describe('text matching for lists', () => {
  it('reduces text to plain words', () => {
    expect(normalizeText('Queen’s Gambit: Accepted')).toBe('queens gambit accepted');
    expect(normalizeText('Réti & Nimzowitsch')).toBe('reti and nimzowitsch');
  });

  it('needs every word typed, anywhere in the texts', () => {
    expect(matchesAllWords('', 'anything')).toBe(true);
    expect(matchesAllWords('queens gam', 'Queen’s Gambit')).toBe(true);
    expect(matchesAllWords('gambit reti', 'Queen’s Gambit', 'Réti')).toBe(true);
    expect(matchesAllWords('sicilian', 'Queen’s Gambit')).toBe(false);
    expect(matchesAllWords('mate', null, undefined, 'Back-rank mate')).toBe(true);
  });
});
