/**
 * Matching typed text against names and descriptions, forgivingly: both are reduced to plain
 * lower-case words — accents, apostrophes and punctuation dropped — and every word typed must
 * appear somewhere in the text ("queens gam" finds "Queen’s Gambit").
 */

/** The words of a text, in plain lower case: "Queen’s Gambit" → "queens gambit". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’ʼ`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Whether every word of `query` appears in one of `texts` (an empty query matches all). */
export function matchesAllWords(query: string, ...texts: (string | undefined | null)[]): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = ` ${normalizeText(texts.filter(Boolean).join(' '))}`;
  return words.every((word) => haystack.includes(word));
}
