/**
 * A small, dependency-free PGN reader that keeps variations, comments and
 * NAGs. chess.js only follows the main line, which is not enough for opening
 * repertoires or an analysis board with branches.
 *
 * The output is a plain tree: every move may carry alternative lines that
 * start from the position *before* that move, mirroring PGN's `( … )` syntax.
 */

export interface PgnMove {
  san: string;
  /** Comment written after the move. */
  comment?: string;
  /** Numeric Annotation Glyphs ($1 = !, $2 = ?, $3 = !!, $4 = ??, $5 = !?, $6 = ?!). */
  nags: number[];
  /** Alternatives to this move, each a full line starting from the same position. */
  variations: PgnLine[];
}

export type PgnLine = PgnMove[];

export interface PgnGame {
  headers: Record<string, string>;
  /** Comment before the first move, if any. */
  comment?: string;
  moves: PgnLine;
  result: string;
}

const GLYPH_NAGS: Record<string, number> = {
  '!': 1,
  '?': 2,
  '!!': 3,
  '??': 4,
  '!?': 5,
  '?!': 6,
};

export const NAG_GLYPHS: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
};

type Token =
  | { type: 'move'; san: string }
  | { type: 'comment'; text: string }
  | { type: 'nag'; value: number }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'result'; value: string };

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const MOVE_NUMBER = /^\d+\.*$/;

function tokenize(movetext: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = movetext.length;
  while (i < n) {
    const ch = movetext[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{') {
      const end = movetext.indexOf('}', i + 1);
      const text = movetext
        .slice(i + 1, end === -1 ? n : end)
        .replace(/\s+/g, ' ')
        .trim();
      tokens.push({ type: 'comment', text });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === ';') {
      const end = movetext.indexOf('\n', i);
      const text = movetext.slice(i + 1, end === -1 ? n : end).trim();
      tokens.push({ type: 'comment', text });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'open' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'close' });
      i++;
      continue;
    }
    if (ch === '$') {
      let j = i + 1;
      while (j < n && /\d/.test(movetext[j] as string)) j++;
      tokens.push({ type: 'nag', value: Number(movetext.slice(i + 1, j)) });
      i = j;
      continue;
    }
    // A bare word: move number, result, SAN (possibly with !/? suffixes)
    let j = i;
    while (j < n && !/[\s{}();]/.test(movetext[j] as string)) j++;
    const word = movetext.slice(i, j);
    i = j;
    if (MOVE_NUMBER.test(word)) continue;
    if (RESULT.test(word)) {
      tokens.push({ type: 'result', value: word });
      continue;
    }
    // Split trailing glyphs like "Nf3!?" into a move and a NAG.
    const glyph = /([!?]{1,2})$/.exec(word);
    const san = glyph ? word.slice(0, -glyph[0].length) : word;
    if (!san) continue;
    tokens.push({ type: 'move', san: san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O') });
    if (glyph) {
      const nag = GLYPH_NAGS[glyph[0]];
      if (nag) tokens.push({ type: 'nag', value: nag });
    }
  }
  return tokens;
}

function parseHeaders(pgn: string): { headers: Record<string, string>; movetext: string } {
  const headers: Record<string, string> = {};
  const lines = pgn.split(/\r?\n/);
  let index = 0;
  for (; index < lines.length; index++) {
    const line = (lines[index] as string).trim();
    if (!line) continue;
    const match = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]$/.exec(line);
    if (!match) break;
    headers[match[1] as string] = (match[2] as string).replace(/\\"/g, '"');
  }
  return { headers, movetext: lines.slice(index).join('\n') };
}

/** Parses one PGN game (headers optional). Throws on unbalanced parentheses. */
export function parsePgn(pgn: string): PgnGame {
  const { headers, movetext } = parseHeaders(pgn);
  const tokens = tokenize(movetext);
  let pos = 0;
  let result = '*';
  let leadingComment: string | undefined;

  const parseLine = (): PgnLine => {
    const line: PgnLine = [];
    while (pos < tokens.length) {
      const token = tokens[pos] as Token;
      if (token.type === 'close') return line;
      pos++;
      switch (token.type) {
        case 'move':
          line.push({ san: token.san, nags: [], variations: [] });
          break;
        case 'comment': {
          const last = line[line.length - 1];
          if (last) last.comment = last.comment ? `${last.comment} ${token.text}` : token.text;
          else if (line.length === 0 && leadingComment === undefined && pos === 1) {
            leadingComment = token.text;
          }
          break;
        }
        case 'nag': {
          const last = line[line.length - 1];
          if (last) last.nags.push(token.value);
          break;
        }
        case 'open': {
          const variation = parseLine();
          if (tokens[pos]?.type !== 'close') throw new Error('Unbalanced "(" in PGN');
          pos++; // consume ')'
          const last = line[line.length - 1];
          if (last) last.variations.push(variation);
          break;
        }
        case 'result':
          result = token.value;
          break;
      }
    }
    return line;
  };

  const moves = parseLine();
  if (pos < tokens.length) throw new Error('Unbalanced ")" in PGN');
  if (headers.Result && RESULT.test(headers.Result)) result = headers.Result;
  const game: PgnGame = { headers, moves, result };
  if (leadingComment) game.comment = leadingComment;
  return game;
}

/** Splits a file with several games into individual PGN strings. */
export function splitPgnGames(text: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let inMoves = false;
  for (const line of text.split(/\r?\n/)) {
    const isHeader = /^\s*\[\w+\s+"/.test(line);
    if (isHeader && inMoves) {
      games.push(current.join('\n').trim());
      current = [];
      inMoves = false;
    }
    if (!isHeader && line.trim()) inMoves = true;
    current.push(line);
  }
  if (current.join('').trim()) games.push(current.join('\n').trim());
  return games.filter((g) => g.length > 0);
}
