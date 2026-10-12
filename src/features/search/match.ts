import { KIND_ORDER, KINDS, type SearchEntry, type SearchKind } from './searchIndex';

/**
 * Quick search's matching: forgiving rather than clever. The query and every entry are reduced
 * to plain lower-case words — accents, apostrophes and punctuation dropped — and every word of
 * the query must find a word it starts (or, from four letters, sits inside, or from five
 * letters, misses by one typo) in the entry's title, its keywords or its description. Titles
 * count most, and a title that is the query, or starts with it, comes first.
 */

/** The words of a text, in plain lower case: "Queen’s Gambit" → "queens gambit". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’ʼ`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words that may go unmatched when the query has others ("the", "of", "and"). */
const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'my']);

/** An entry with its words worked out once, ready to be scored against any query. */
export interface PreparedEntry {
  entry: SearchEntry;
  /** The whole title, normalised. */
  title: string;
  titleWords: string[];
  /** The title's words run together ("carokanndefence"): finds "carokann", "chess960". */
  compact: string;
  keywords: string[];
  /** The description and any hidden text: weak evidence only. */
  text: string[];
}

const words = (text: string | undefined): string[] =>
  text ? normalize(text).split(' ').filter(Boolean) : [];

export function prepareEntries(entries: readonly SearchEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    const titleWords = words(entry.title);
    return {
      entry,
      title: titleWords.join(' '),
      titleWords,
      compact: titleWords.join(''),
      keywords: [...new Set([...words(entry.keywords), ...words(KINDS[entry.kind].words)])],
      text: [...new Set([...words(entry.detail), ...words(entry.text)])],
    };
  });
}

/**
 * How `a` becomes `b` with one edit: a letter changed, two neighbours swapped, or one letter
 * added or dropped. 'same' for equal words; null when it takes more.
 */
export function oneEdit(a: string, b: string): 'same' | 'change' | 'swap' | 'gap' | null {
  if (a === b) return 'same';
  if (Math.abs(a.length - b.length) > 1) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return 'change';
    const swapped = a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    return swapped ? 'swap' : null;
  }
  // One letter more in the longer word.
  const gap = a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  return gap ? 'gap' : null;
}

/**
 * A typo away from the word, or from its start ("najdrof", "londn", "castle" for castling). The
 * first letter must be right, and a five-letter word may not have a letter changed ("blind" is
 * not "blund"): short words have too many neighbours.
 */
function nearMiss(token: string, word: string): boolean {
  if (token.length < 5 || !word.startsWith(token.charAt(0)) || word.length < token.length - 1) {
    return false;
  }
  return [token.length, token.length + 1, token.length - 1].some((length) => {
    const edit = oneEdit(token, word.slice(0, length));
    return edit !== null && (edit !== 'change' || token.length >= 6);
  });
}

/** Letters inside a word count from four of them, or with a digit ("960" in "chess960"). */
const findsInside = (token: string) => token.length >= 4 || /\d/.test(token);

/** How well one word of the query is found in an entry; 0 when it is not. */
function scoreToken(token: string, p: PreparedEntry): number {
  let best = 0;
  p.titleWords.forEach((word, index) => {
    let score = 0;
    if (word === token) score = 10;
    else if (word.startsWith(token)) score = 8;
    // A typo in a longer word ("castle" for castling) says more than letters inside one.
    else if (nearMiss(token, word)) score = 5;
    else if (findsInside(token) && word.includes(token)) score = 4;
    // The first word of a title says most about it.
    if (score > 0 && index === 0) score += 1;
    if (score > best) best = score;
  });
  if (best < 4 && token.length >= 4 && p.compact.includes(token)) best = 4;
  for (const word of p.keywords) {
    let score = 0;
    if (word === token) score = 6;
    else if (word.startsWith(token)) score = 5;
    else if (findsInside(token) && word.includes(token)) score = 2;
    else if (token.length >= 6 && nearMiss(token, word)) score = 2;
    if (score > best) best = score;
  }
  if (best > 0) return best;
  for (const word of p.text) {
    if (word === token) best = Math.max(best, 2);
    else if (token.length >= 3 && word.startsWith(token)) best = Math.max(best, 1.5);
  }
  return best;
}

/** A little weight for the kinds that are destinations in their own right. */
const KIND_BOOST: Partial<Record<SearchKind, number>> = { page: 1.5 };

/** The score of an entry for the query's words, or null when one of them is not found. */
export function scoreEntry(p: PreparedEntry, tokens: readonly string[]): number | null {
  if (tokens.length === 0) return null;
  const meaningful = tokens.some((t) => !STOP_WORDS.has(t));
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(token, p);
    if (score === 0) {
      if (meaningful && STOP_WORDS.has(token)) continue;
      return null;
    }
    total += score;
  }
  const phrase = tokens.join(' ');
  if (p.title === phrase) total += 20;
  else if (p.title.startsWith(phrase)) total += 8;
  // The query's words together, starting a word of the title ("en passant" in "castling, en …").
  else if (phrase.length >= 3 && ` ${p.title}`.includes(` ${phrase}`)) total += 3;
  total += KIND_BOOST[p.entry.kind] ?? 0;
  // Between equals, the shorter title is the closer match.
  return total - p.title.length / 200;
}

/** The query as words, at most eight. */
export function tokenize(query: string): string[] {
  return [...new Set(normalize(query).split(' ').filter(Boolean))].slice(0, 8);
}

export interface SearchResult {
  entry: SearchEntry;
  score: number;
}

export interface ResultGroup {
  kind: SearchKind;
  results: SearchResult[];
}

export interface SearchOutcome {
  groups: ResultGroup[];
  /** Results shown. */
  shown: number;
  /** Entries that matched, shown or not. */
  matched: number;
}

export const MAX_PER_KIND = 8;
export const MAX_RESULTS = 30;

/**
 * The best matches, grouped by kind: at most eight of a kind and thirty in all, best first; the
 * groups in the order of their best match.
 */
export function search(
  prepared: readonly PreparedEntry[],
  query: string,
  limits: { perKind?: number; total?: number } = {},
): SearchOutcome {
  const perKind = limits.perKind ?? MAX_PER_KIND;
  const total = limits.total ?? MAX_RESULTS;
  const tokens = tokenize(query);
  const scored: SearchResult[] = [];
  for (const p of prepared) {
    const score = scoreEntry(p, tokens);
    if (score !== null) scored.push({ entry: p.entry, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_ORDER.indexOf(a.entry.kind) - KIND_ORDER.indexOf(b.entry.kind) ||
      a.entry.title.localeCompare(b.entry.title),
  );
  const byKind = new Map<SearchKind, SearchResult[]>();
  let shown = 0;
  for (const result of scored) {
    if (shown >= total) break;
    const list = byKind.get(result.entry.kind) ?? [];
    if (list.length >= perKind) continue;
    list.push(result);
    byKind.set(result.entry.kind, list);
    shown++;
  }
  // A Map keeps the order kinds were first met in: the order of their best match.
  const groups = [...byKind].map(([kind, results]) => ({ kind, results }));
  return { groups, shown, matched: scored.length };
}

/**
 * Where the query's words appear in a title, as [start, end) ranges of the title as written,
 * for highlighting: the start of a word a query word begins, or the run inside a word it was
 * found in. Typo matches are not marked.
 */
export function highlightRanges(title: string, tokens: readonly string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of title.matchAll(/[\p{L}\p{N}\p{M}'’ʼ]+/gu)) {
    const word = match[0];
    const start = match.index;
    // Which character of the word as written each normalised letter comes from.
    const origin: number[] = [];
    let plain = '';
    for (let i = 0; i < word.length; i++) {
      const piece = normalize(word.charAt(i)).replace(/ /g, '');
      origin.push(...new Array<number>(piece.length).fill(i));
      plain += piece;
    }
    let best: [number, number] | null = null;
    for (const token of tokens) {
      const at = plain.startsWith(token) ? 0 : token.length >= 3 ? plain.indexOf(token) : -1;
      if (at < 0 || token.length === 0) continue;
      const from = origin[at] ?? 0;
      const to = (origin[at + token.length - 1] ?? word.length - 1) + 1;
      if (!best || to - from > best[1] - best[0]) best = [from, to];
    }
    if (best) ranges.push([start + best[0], start + best[1]]);
  }
  return ranges;
}
