/**
 * The recovery phrase: twelve words that carry the 128 random bits every
 * device-sync key comes from (`vaultCrypto.ts`), as BIP-39 writes them — eleven bits
 * a word, the last four of 132 a checksum, so a mistyped word is caught.
 * Each word is known by its first four letters.
 */
import { BIP39_ENGLISH } from './bip39English';

export const PHRASE_WORDS = 12;
/** The secret's length in bytes (128 bits). */
export const SECRET_BYTES = 16;

const INDEX = new Map(BIP39_ENGLISH.map((word, i) => [word, i]));
const BY_PREFIX = new Map(BIP39_ENGLISH.map((word, i) => [word.slice(0, 4), i]));

/** A fresh random secret. */
export function newSecret(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

async function checksumBits(secret: Uint8Array<ArrayBuffer>): Promise<number> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', secret));
  // 128 bits of secret take a 4-bit checksum: the top four bits of the hash.
  return (digest[0] ?? 0) >> 4;
}

/** The twelve words for a 16-byte secret. */
export async function secretToPhrase(secret: Uint8Array<ArrayBuffer>): Promise<string[]> {
  if (secret.length !== SECRET_BYTES) throw new Error('A sync secret is 16 bytes.');
  const checksum = await checksumBits(secret);
  let bits = '';
  for (const byte of secret) bits += byte.toString(2).padStart(8, '0');
  bits += checksum.toString(2).padStart(4, '0');
  const words: string[] = [];
  for (let i = 0; i < PHRASE_WORDS; i++) {
    words.push(BIP39_ENGLISH[parseInt(bits.slice(i * 11, i * 11 + 11), 2)] ?? '');
  }
  return words;
}

export type PhraseCheck =
  | { ok: true; secret: Uint8Array<ArrayBuffer>; words: string[] }
  | { ok: false; reason: string; unknown: number[] };

/**
 * Splits typed text into lowercase words: spaces, line breaks, commas, dashes and
 * numbering ("1." or "1)") all separate, so a phrase pasted from anywhere reads.
 */
export function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\b\d+[.)]/g, ' ')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** The listed word a typed one stands for: the word itself, or its first four letters. */
export function resolveWord(typed: string): string | null {
  if (INDEX.has(typed)) return typed;
  if (typed.length >= 4) {
    const i = BY_PREFIX.get(typed.slice(0, 4));
    const word = i === undefined ? undefined : BIP39_ENGLISH[i];
    // Four letters are enough; more must still match the word.
    if (word?.startsWith(typed)) return word;
  }
  return null;
}

/** Reads a typed phrase back into its secret, saying what is wrong when it cannot. */
export async function phraseToSecret(text: string): Promise<PhraseCheck> {
  const typed = splitWords(text);
  const words = typed.map(resolveWord);
  const unknown = words.flatMap((w, i) => (w === null ? [i] : []));
  if (unknown.length > 0) {
    const listed = unknown.map((i) => `“${typed[i] ?? ''}”`).join(', ');
    return {
      ok: false,
      reason: `${unknown.length === 1 ? 'This word is' : 'These words are'} not in the list: ${listed}.`,
      unknown,
    };
  }
  if (words.length !== PHRASE_WORDS) {
    return {
      ok: false,
      reason: `A recovery phrase has ${PHRASE_WORDS} words; this has ${words.length}.`,
      unknown: [],
    };
  }
  let bits = '';
  for (const word of words) {
    bits += (INDEX.get(word ?? '') ?? 0).toString(2).padStart(11, '0');
  }
  const secret = new Uint8Array(SECRET_BYTES);
  for (let i = 0; i < SECRET_BYTES; i++) secret[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  if (parseInt(bits.slice(128), 2) !== (await checksumBits(secret))) {
    return {
      ok: false,
      reason: 'These words are not a recovery phrase: check each one, and their order.',
      unknown: [],
    };
  }
  return { ok: true, secret, words: words.filter((w): w is string => w !== null) };
}
