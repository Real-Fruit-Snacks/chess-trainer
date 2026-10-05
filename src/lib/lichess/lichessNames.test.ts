import { describe, expect, it } from 'vitest';
import { cutUnits, fullCleanUp, softCleanUp } from './lichessNames';
import { fitGroup, fitName, parseStudyName, studyName } from './studyModel';

describe('names as Lichess cleans them', () => {
  it('normalises as lila does, keeping its four exceptions (and writing ° as º)', () => {
    expect(fullCleanUp('Ellipsis…')).toBe('Ellipsis...');
    expect(softCleanUp('ﬁle ½ 90° ª')).toBe('file ½ 90º ª');
    expect(fullCleanUp('Chess Trainer · Repertoires')).toBe('Chess Trainer · Repertoires');
  });

  it('drops symbols and emoji from study names only', () => {
    expect(fullCleanUp('Openings ♟ 🎯')).toBe('Openings');
    expect(softCleanUp('Openings ♟ 🎯')).toBe('Openings ♟ 🎯');
    expect(fullCleanUp('a←b')).toBe('ab');
    expect(softCleanUp('a←b')).toBe('a←b');
  });

  it('drops invisible characters (a no-break space is a space by then)', () => {
    expect(softCleanUp('a\u00a0b\u200ec\u00ad')).toBe('a bc');
    expect(fullCleanUp('a\u00a0b\u200ec')).toBe('a bc');
    expect(softCleanUp('\tname\u0007')).toBe('name');
    // The joiners emoji are made of stay.
    expect(softCleanUp('👩\u200d💻')).toBe('👩\u200d💻');
  });

  it('cuts without splitting a character', () => {
    expect(cutUnits('ab😀', 3)).toBe('ab');
    expect(cutUnits('ab😀', 4)).toBe('ab😀');
    expect(cutUnits('abc', 5)).toBe('abc');
  });
});

const TRICKY = [
  '  Sicilian   Najdorf ',
  'Ellipsis… “curly” "straight" back\\slash',
  'Emoji 🎯♟ and no-break\u00a0space',
  '°ª½ ﬁ',
  'x'.repeat(120),
  `${'a'.repeat(79)}😀`,
  '\u200e\u200f',
  '♟♟',
  'Line\nbreak\ttab',
];

describe('names the app sends', () => {
  it.each(TRICKY)('the chapter name for %j is one Lichess keeps as it is', (name) => {
    const fitted = fitName(name);
    expect(fitted.length).toBeLessThanOrEqual(80);
    expect(cutUnits(softCleanUp(fitted), 80)).toBe(fitted);
    // Read back from Lichess, it is the same name.
    expect(fitName(fitted)).toBe(fitted);
    expect(fitted).not.toMatch(/["\\\n\t]/);
  });

  it.each(TRICKY)('the study for the collection %j is named as Lichess keeps it', (group) => {
    const fitted = fitGroup(group) || 'My analyses';
    for (const part of [1, 2, 64]) {
      const name = studyName('analysis', fitted, part);
      expect(name.length).toBeLessThanOrEqual(100);
      expect(cutUnits(fullCleanUp(name), 100)).toBe(name);
      expect(parseStudyName(name)).toEqual({ kind: 'analysis', group: fitted, part });
    }
  });
});
