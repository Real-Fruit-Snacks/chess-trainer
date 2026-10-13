/**
 * How Lichess cleans the names it is given, so the names the app sends are
 * already what Lichess will keep (a name Lichess rewrote would look renamed
 * on Lichess at the next sync). A port of `fullCleanUp` (study names) and
 * `softCleanUp` (chapter names) from lila's string helpers (scalalib
 * `StringOps`), which also run in the stand-in Lichess of the tests. No
 * imports: the end-to-end tests load this file too.
 *
 * The rules are ported from scalalib, Copyright (c) Thibault Duplessis,
 * under the MIT licence (its full notice is in THIRD_PARTY_NOTICES.md).
 */

/** Lichess keeps these four through its Unicode normalisation (and writes ° as º). */
function normalize(text: string): string {
  return text
    .replace(/[º°ª½]/g, (c) => (c === 'ª' ? '\u0002' : c === '½' ? '\u0003' : '\u0001'))
    .normalize('NFKC')
    .replaceAll('\u0001', 'º')
    .replaceAll('\u0002', 'ª')
    .replaceAll('\u0003', '½');
}

const INVISIBLE = new Set([
  0x00a0, 0x2000, 0x2001, 0x2002, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028,
  0x205f, 0x3000, 0x2003, 0x25a0, 0x0009, 0x000c, 0x001c, 0x200b, 0x200c, 0x2060, 0x2061, 0x2062,
  0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180c, 0x180d, 0x180e, 0x200d,
  0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x202f, 0x2063, 0x2064, 0x2066, 0x2067,
  0x2068, 0x2069, 0x206a, 0x2800, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f, 0x3164, 0xfffc, 0xfeff,
  0xffa0, 0x2029, 0xfe00, 0xfe01, 0xfe02, 0xfe03, 0xfe04, 0xfe05, 0xfe06, 0xfe07, 0xfe08, 0xfe09,
  0xfe0a, 0xfe0b, 0xfe0c, 0xfe0d, 0xfe0e, 0xfe0f,
]);

const isOffensive = (c: number) => c === 0x534d || c === 0x5350;

/** Invisible characters, except the zero-width ones emoji are built with. */
const isStrippableInvisible = (c: number) =>
  (c < 0x200b || c > 0x200d) && (c < 0xfe00 || c > 0xfe0f) && INVISIBLE.has(c);

const isGarbage = (c: number) =>
  c >= 0x0250 &&
  (isOffensive(c) ||
    isStrippableInvisible(c) ||
    c === 0x200b ||
    (c >= 0x2100 && c <= 0x21ff) ||
    (c >= 0x2300 && c <= 0x2653) ||
    (c >= 0x2660 && c <= 0x2c5f) ||
    c === 0xa9c1 ||
    c === 0xa9c2 ||
    (c >= 0x06d6 && c <= 0x06ff) ||
    (c >= 0x1d00 && c <= 0x1d7f) ||
    (c >= 0x0250 && c < 0x0259) ||
    (c > 0x0259 && c <= 0x02af));

/** Drops the UTF-16 units `remove` picks (as lila filters a string's chars). */
function removeUnits(text: string, remove: (c: number) => boolean): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (!remove(c)) out += text[i];
  }
  return out;
}

/** Control characters but the newline, the musical symbols and the tag characters. */
const INVISIBLE_MULTIBYTE = /(?!\n)[\p{Cc}\u{1D100}-\u{1D1FF}\u{E0000}-\u{E007F}]/gu;
/** Those, symbols, emoji and pictographs, and hieroglyphs. */
const SYMBOLS =
  /(?!\n)[\p{So}\p{Cc}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{13000}-\u{1342F}\u{1D100}-\u{1D1FF}\u{E0000}-\u{E007F}]/gu;

/** Java's `trim`: only the characters up to the space go from either end. */
function javaTrim(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) start++;
  while (end > start && text.charCodeAt(end - 1) <= 0x20) end--;
  return text.slice(start, end);
}

/** What Lichess makes of a study name (before keeping its first 100 characters). */
export function fullCleanUp(text: string): string {
  return javaTrim(removeUnits(normalize(text), isGarbage).replace(SYMBOLS, ''));
}

/** What Lichess makes of a chapter name (before keeping its first 80 characters). */
export function softCleanUp(text: string): string {
  return javaTrim(
    removeUnits(normalize(text), (c) => isOffensive(c) || isStrippableInvisible(c)).replace(
      INVISIBLE_MULTIBYTE,
      '',
    ),
  );
}

/** The first `max` UTF-16 units, never half a character. */
export function cutUnits(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
