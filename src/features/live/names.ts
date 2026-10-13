import { NAME_ADJECTIVES, NAME_NOUNS } from '../../../relay/src/live/shared.mjs';

/**
 * The names players go by in live games: one word from each list the relay
 * shares with the app, so the relay takes every one of them (`isPlayerName`)
 * and no player can type a name of their own.
 */

/** One word of `words` from one draw of `random`; whatever number it gives lands inside the list. */
function pick(words: readonly string[], random: () => number): string {
  const index = Math.floor(random() * words.length);
  const safe = Number.isFinite(index) ? Math.min(words.length - 1, Math.max(0, index)) : 0;
  return words[safe] as string;
}

/** A generated name ("Patient Bishop"): one word from each list in relay/src/live/shared.mjs. */
export function randomName(random: () => number = Math.random): string {
  return `${pick(NAME_ADJECTIVES, random)} ${pick(NAME_NOUNS, random)}`;
}

/**
 * A generated name other than `current`. A few draws nearly always find one;
 * should they not (a `random` that keeps giving the same number), the next
 * second word in the list makes the difference.
 */
export function differentName(current: string, random: () => number = Math.random): string {
  for (let i = 0; i < 8; i++) {
    const name = randomName(random);
    if (name !== current) return name;
  }
  const [first = '', second = ''] = current.split(' ');
  const adjective = NAME_ADJECTIVES.includes(first) ? first : pick(NAME_ADJECTIVES, random);
  const index = NAME_NOUNS.indexOf(second);
  return `${adjective} ${NAME_NOUNS[(index + 1) % NAME_NOUNS.length] as string}`;
}
