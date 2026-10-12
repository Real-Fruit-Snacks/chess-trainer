import { describe, expect, it } from 'vitest';
import {
  highlightRanges,
  MAX_PER_KIND,
  MAX_RESULTS,
  normalize,
  oneEdit,
  prepareEntries,
  search,
  tokenize,
} from './match';
import type { SearchEntry, SearchKind } from './searchIndex';

let next = 0;
const entry = (
  title: string,
  kind: SearchKind = 'lesson',
  extra: Partial<SearchEntry> = {},
): SearchEntry => ({ key: `${kind}:${next++}`, kind, title, icon: 'learn', to: '/', ...extra });

const titles = (entries: SearchEntry[], query: string) =>
  search(prepareEntries(entries), query).groups.flatMap((g) => g.results.map((r) => r.entry.title));

describe('normalize', () => {
  it('drops accents, apostrophes, case and punctuation', () => {
    expect(normalize('Réti’s king walk')).toBe('retis king walk');
    expect(normalize('Queen’s Gambit')).toBe('queens gambit');
    expect(normalize("Queen's  Gambit!")).toBe('queens gambit');
    expect(normalize('Caro-Kann Defence')).toBe('caro kann defence');
    expect(normalize('Hand & Brain')).toBe('hand and brain');
    expect(normalize('Vuković mate')).toBe('vukovic mate');
    expect(normalize('  1. e4 e5  ')).toBe('1 e4 e5');
  });

  it('turns a query into distinct words, at most eight', () => {
    expect(tokenize('  Fork  fork, PIN ')).toEqual(['fork', 'pin']);
    expect(tokenize('a b c d e f g h i j')).toHaveLength(8);
    expect(tokenize(' ’ ')).toEqual([]);
  });
});

describe('oneEdit', () => {
  it('names the one edit between two words, or none', () => {
    expect(oneEdit('fork', 'fork')).toBe('same');
    expect(oneEdit('defense', 'defence')).toBe('change');
    expect(oneEdit('najdrof', 'najdorf')).toBe('swap');
    expect(oneEdit('londn', 'london')).toBe('gap');
    expect(oneEdit('london', 'londn')).toBe('gap');
    expect(oneEdit('fork', 'pinned')).toBeNull();
    expect(oneEdit('sicilian', 'scilain')).toBeNull();
  });
});

describe('search', () => {
  const index = [
    entry('Italian Game', 'repertoire', { detail: 'White · 1. e4 e5 2. Nf3 Nc6 3. Bc4' }),
    entry('Najdorf Sicilian', 'repertoire'),
    entry('Plans in the Sicilian'),
    entry('Castling, en passant and promotion'),
    entry('Castling', 'puzzles'),
    entry('Attacking the uncastled king'),
    entry('Backups', 'setting', { keywords: 'backup export import' }),
    entry('Display', 'setting', { keywords: 'dark mode colour scheme' }),
    entry('Blind puzzles', 'puzzles'),
    entry('Blunder', 'reference'),
    entry('Play', 'page'),
    entry('Play settings', 'setting'),
    entry('Fork', 'puzzles'),
    entry('Forks and double attacks'),
    entry('Play the computer', 'play', { keywords: 'engine chess960' }),
  ];

  it('needs every word of the query, each the start of a word', () => {
    expect(titles(index, 'sicil')).toEqual(['Najdorf Sicilian', 'Plans in the Sicilian']);
    expect(titles(index, 'najdorf sicilian')).toEqual(['Najdorf Sicilian']);
    expect(titles(index, 'najdorf french')).toEqual([]);
    expect(titles(index, '')).toEqual([]);
  });

  it('ignores accents and apostrophes, and small words with nothing to match', () => {
    const rich = [entry('Réti’s king walk', 'study'), entry('Queen’s Gambit', 'repertoire')];
    expect(titles(rich, 'reti')).toEqual(['Réti’s king walk']);
    expect(titles(rich, 'RÉTI')).toEqual(['Réti’s king walk']);
    expect(titles(rich, 'queens gambit')).toEqual(['Queen’s Gambit']);
    expect(titles(rich, 'the queen’s gambit')).toEqual(['Queen’s Gambit']);
  });

  it('forgives one typo in a longer word, and only there', () => {
    expect(titles(index, 'najdrof')).toEqual(['Najdorf Sicilian']);
    expect(titles(index, 'scilian')).toEqual(['Najdorf Sicilian', 'Plans in the Sicilian']);
    // "castle" is a typo away from castling; letters inside "uncastled" count for less.
    expect(titles(index, 'castle').slice(0, 2)).toEqual([
      'Castling',
      'Castling, en passant and promotion',
    ]);
    expect(titles(index, 'castle').at(-1)).toBe('Attacking the uncastled king');
    // Five letters may not have one changed: "blind" is not "blunder".
    expect(titles(index, 'blind')).toEqual(['Blind puzzles']);
    // Nor may the first letter be wrong.
    expect(titles(index, 'dastling')).toEqual([]);
  });

  it('finds keywords and descriptions, ranked under titles', () => {
    expect(titles(index, 'dark mode')).toEqual(['Display']);
    expect(titles(index, 'backup')).toEqual(['Backups']);
    expect(titles(index, 'nf3')).toEqual(['Italian Game']);
    // Digits are found inside a word.
    expect(titles(index, '960')).toEqual(['Play the computer']);
  });

  it('puts the title that is the query first, then the titles that start with it', () => {
    expect(titles(index, 'fork')).toEqual(['Fork', 'Forks and double attacks']);
    const groups = search(prepareEntries(index), 'play').groups.map((group) => [
      group.kind,
      ...group.results.map((result) => result.entry.title),
    ]);
    expect(groups).toEqual([
      ['page', 'Play'],
      // "play" inside "display": found, but after the titles that start with it.
      ['setting', 'Play settings', 'Display'],
      ['play', 'Play the computer'],
    ]);
  });

  it('groups results by kind, the groups in the order of their best result', () => {
    const outcome = search(prepareEntries(index), 'castling');
    expect(outcome.groups.map((g) => g.kind)).toEqual(['puzzles', 'lesson']);
    expect(outcome.shown).toBe(2);
    expect(outcome.matched).toBe(2);
  });

  it('shows at most eight of a kind and thirty in all, and says how many matched', () => {
    const many = [
      ...Array.from({ length: 20 }, (_, i) => entry(`Rook ending ${i}`, 'drill')),
      ...Array.from({ length: 20 }, (_, i) => entry(`Rook lesson ${i}`, 'lesson')),
      ...Array.from({ length: 20 }, (_, i) => entry(`Rook study ${i}`, 'study')),
      ...Array.from({ length: 20 }, (_, i) => entry(`Rook trick ${i}`, 'reference')),
      ...Array.from({ length: 20 }, (_, i) => entry(`Rook puzzle ${i}`, 'puzzles')),
    ];
    const outcome = search(prepareEntries(many), 'rook');
    expect(outcome.matched).toBe(100);
    expect(outcome.shown).toBe(MAX_RESULTS);
    for (const group of outcome.groups) {
      expect(group.results.length).toBeLessThanOrEqual(MAX_PER_KIND);
    }
    expect(outcome.groups.reduce((sum, g) => sum + g.results.length, 0)).toBe(MAX_RESULTS);
    // Limits can be set.
    expect(search(prepareEntries(many), 'rook', { perKind: 2, total: 5 }).shown).toBe(5);
  });

  it('finds an entry by the name of its kind', () => {
    const kinds = [entry('Castling', 'lesson'), entry('Castling', 'puzzles')];
    expect(search(prepareEntries(kinds), 'castling lesson').groups.map((g) => g.kind)).toEqual([
      'lesson',
    ]);
  });
});

describe('highlightRanges', () => {
  const marked = (title: string, query: string) =>
    highlightRanges(title, tokenize(query)).map(([from, to]) => title.slice(from, to));

  it('marks the start of each word a query word begins', () => {
    expect(marked('Najdorf Sicilian', 'sic naj')).toEqual(['Naj', 'Sic']);
    expect(marked('Plans in the Sicilian', 'sicilian')).toEqual(['Sicilian']);
  });

  it('maps the plain letters back to the title as written', () => {
    expect(marked('Réti’s king walk', 'reti')).toEqual(['Réti']);
    expect(marked('Queen’s Gambit', 'queens')).toEqual(['Queen’s']);
    expect(marked('Play the computer: chess960', '960')).toEqual(['960']);
  });

  it('marks nothing for typos and words it does not contain', () => {
    expect(marked('Najdorf Sicilian', 'najdrof')).toEqual([]);
    expect(marked('Fork', 'pin')).toEqual([]);
  });
});
