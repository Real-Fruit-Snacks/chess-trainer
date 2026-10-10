import { describe, expect, it } from 'vitest';
import { isPlayerName, NAME_ADJECTIVES, NAME_NOUNS } from '../../../relay/src/live/shared.mjs';
import { differentName, randomName } from './names';

/** A `random` that gives these numbers in turn. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

describe('generated names', () => {
  it('takes one word from each list', () => {
    expect(randomName(sequence(0, 0))).toBe(`${NAME_ADJECTIVES[0]} ${NAME_NOUNS[0]}`);
    expect(randomName(sequence(0.999_999, 0.999_999))).toBe(
      `${NAME_ADJECTIVES.at(-1)} ${NAME_NOUNS.at(-1)}`,
    );
  });

  it('gives a name the relay takes whatever the random numbers are', () => {
    for (const value of [0, 0.5, 0.999_999, 1, -1, 2, Number.NaN, Infinity]) {
      expect(isPlayerName(randomName(() => value)), String(value)).toBe(true);
    }
    for (let i = 0; i < 200; i++) expect(isPlayerName(randomName())).toBe(true);
  });

  it('rolls a different name, even from a random that repeats itself', () => {
    const stuck = () => 0;
    const first = randomName(stuck);
    const next = differentName(first, stuck);
    expect(next).not.toBe(first);
    expect(isPlayerName(next)).toBe(true);
    expect(differentName('Patient Bishop')).not.toBe('Patient Bishop');
    // The last second word wraps round to the first.
    const last = `${NAME_ADJECTIVES[0]} ${NAME_NOUNS.at(-1)}`;
    expect(differentName(last, sequence(0, 0.999_999))).toBe(
      `${NAME_ADJECTIVES[0]} ${NAME_NOUNS[0]}`,
    );
  });
});
