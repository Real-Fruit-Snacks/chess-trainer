/**
 * A small, dependency-free PGN reader that keeps variations, comments and
 * NAGs. chess.js only follows the main line, which is not enough for opening
 * repertoires or an analysis board with branches.
 *
 * The output is a plain tree: every move may carry alternative lines that
 * start from the position *before* that move, mirroring PGN's `( … )` syntax.
 *
 * The reader is forgiving about the movetext it meets in the wild: move
 * numbers glued to moves (`1.e4`, `2...Nc6`), `[%clk …]`-style commands inside
 * comments (split out, so the prose stays clean), evaluation symbols such as
 * `+-` or `∞` (turned into NAGs), `%` escape lines and stray words (dropped).
 */

/** A `[%name args]` command found inside a comment, e.g. `[%clk 0:09:58.7]`. */
export interface PgnCommand {
  name: string;
  args: string;
}

export interface PgnMove {
  san: string;
  /** Comment written after the move, with any `[%…]` commands removed. */
  comment?: string;
  /** Comment written before the move — the text that opens a variation. */
  commentBefore?: string;
  /** `[%clk …]`, `[%eval …]`, `[%csl …]`, `[%cal …]` and other commands from the comments after the move. */
  commands: PgnCommand[];
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

/**
 * Thrown when PGN text cannot be read or replayed. `token` is the offending
 * text and `ply` the half-move it would have been (1 = the first move), so a
 * UI can say “Illegal move Nf7 after Qh5”.
 */
export class PgnParseError extends Error {
  readonly token: string;
  readonly ply: number;

  constructor(message: string, token: string, ply: number) {
    super(message);
    this.name = 'PgnParseError';
    this.token = token;
    this.ply = ply;
  }
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

/** Evaluation symbols written as bare tokens, and the standard NAG for each. */
const SYMBOL_NAGS: Record<string, number> = {
  '□': 7,
  '=': 10,
  '∞': 13,
  '⩲': 14,
  '+/=': 14,
  '+=': 14,
  '⩱': 15,
  '=/+': 15,
  '=+': 15,
  '±': 16,
  '+/-': 16,
  '+/−': 16,
  '∓': 17,
  '-/+': 17,
  '−/+': 17,
  '+-': 18,
  '+−': 18,
  '-+': 19,
  '−+': 19,
  N: 146,
};

type Token =
  | { type: 'move'; san: string }
  | { type: 'comment'; text: string; commands: PgnCommand[] }
  | { type: 'nag'; value: number }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'result'; value: string };

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const RESULT_ALIASES: Record<string, string> = { '½-½': '1/2-1/2', '1/2': '1/2-1/2' };
const MOVE_NUMBER = /^\d+[.…]*$/;
const GLUED_NUMBER = /^\d+[.…]+/;
/** Anything that could be a move: a piece or file letter followed by a square, or castling. */
const SAN_LIKE =
  /^(?:[KQRBNa-h][a-h1-8x=KQRBNqrbn]*[1-8][a-h1-8=KQRBNqrbn]*|[Oo0]-[Oo0](?:-[Oo0])?)[+#]*$/;
const COMMAND = /\[%([A-Za-z_][\w-]*)\s*([^\]]*)\]/g;

/** Separates `[%cmd …]` commands from the prose of a comment. */
function splitComment(raw: string): { text: string; commands: PgnCommand[] } {
  const commands: PgnCommand[] = [];
  const text = raw
    .replace(COMMAND, (_, name: string, args: string) => {
      commands.push({ name, args: args.trim() });
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, commands };
}

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
    // "%" at the start of a line is an escape: the rest of the line is not PGN.
    if (ch === '%' && (i === 0 || movetext[i - 1] === '\n')) {
      const end = movetext.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === '{') {
      const end = movetext.indexOf('}', i + 1);
      tokens.push({
        type: 'comment',
        ...splitComment(movetext.slice(i + 1, end === -1 ? n : end)),
      });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === ';') {
      const end = movetext.indexOf('\n', i);
      tokens.push({
        type: 'comment',
        ...splitComment(movetext.slice(i + 1, end === -1 ? n : end)),
      });
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
      if (j > i + 1) tokens.push({ type: 'nag', value: Number(movetext.slice(i + 1, j)) });
      i = j;
      continue;
    }
    // A bare word: move number, result, SAN (possibly with !/? suffixes), symbol or noise.
    let j = i;
    while (j < n && !/[\s{}();$]/.test(movetext[j] as string)) j++;
    const word = movetext.slice(i, j);
    i = j;
    tokens.push(...wordTokens(word));
  }
  return tokens;
}

/** Tokens for one whitespace-delimited word of movetext (none when it is noise). */
function wordTokens(word: string): Token[] {
  const alias = RESULT_ALIASES[word];
  if (alias) return [{ type: 'result', value: alias }];
  if (RESULT.test(word)) return [{ type: 'result', value: word }];
  if (MOVE_NUMBER.test(word)) return [];
  // "1.e4", "2...Nc6", "12.Nf3!?": the move number is glued to the move.
  const rest = word.replace(GLUED_NUMBER, '');
  if (!rest) return [];
  const symbol = SYMBOL_NAGS[rest];
  if (symbol) return [{ type: 'nag', value: symbol }];
  // Split trailing glyphs like "Nf3!?" into a move and a NAG.
  const glyph = /([!?]{1,2})$/.exec(rest);
  const body = glyph ? rest.slice(0, -glyph[0].length) : rest;
  const tokens: Token[] = [];
  const san = normaliseSan(body);
  if (san) tokens.push({ type: 'move', san });
  // A glyph with no move of its own ("12.!?") still annotates the previous move.
  const nag = glyph ? GLYPH_NAGS[glyph[0]] : undefined;
  if (nag) tokens.push({ type: 'nag', value: nag });
  return tokens;
}

/**
 * The move text to hand to chess.js, or null when the word cannot be a move
 * ("e.p.", "+-", "TN"). Words with a digit that merely look wrong ("Nf33") are
 * kept so the error names them.
 */
function normaliseSan(body: string): string | null {
  let san = body.replace(/e\.p\.?$/i, '').replace(/^([KQRBN]?[a-h][1-8])-([a-h][1-8])/, '$1$2');
  san = san
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
    .replace(/^[oO]-[oO]-[oO]/, 'O-O-O');
  san = san.replace(/^[oO]-[oO]/, 'O-O');
  if (!san) return null;
  if (SAN_LIKE.test(san)) return san;
  // Not a move shape: keep it only when it carries a square-like digit, so typos surface.
  return /^[A-Za-z]*[a-h]?[1-8]/.test(san) && /\d/.test(san) ? san : null;
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

function joinComments(a: string | undefined, b: string): string {
  if (!b) return a ?? '';
  return a ? `${a} ${b}` : b;
}

/** Parses one PGN game (headers optional). Throws a PgnParseError on unbalanced parentheses. */
export function parsePgn(pgn: string): PgnGame {
  const { headers, movetext } = parseHeaders(pgn);
  const tokens = tokenize(movetext);
  let pos = 0;
  let result = '*';
  let leadingComment: string | undefined;

  const parseLine = (depth: number, ply: number): PgnLine => {
    const line: PgnLine = [];
    // Annotations met before the first move of a variation belong to that move.
    let commentBefore: string | undefined;
    let nagsBefore: number[] = [];
    let currentPly = ply;
    while (pos < tokens.length) {
      const token = tokens[pos] as Token;
      if (token.type === 'close') return line;
      pos++;
      switch (token.type) {
        case 'move': {
          const move: PgnMove = { san: token.san, commands: [], nags: nagsBefore, variations: [] };
          if (commentBefore) move.commentBefore = commentBefore;
          commentBefore = undefined;
          nagsBefore = [];
          line.push(move);
          currentPly++;
          break;
        }
        case 'comment': {
          const last = line[line.length - 1];
          if (last) {
            if (token.text) last.comment = joinComments(last.comment, token.text);
            last.commands.push(...token.commands);
          } else if (depth === 0) {
            if (token.text) leadingComment = joinComments(leadingComment, token.text);
          } else if (token.text) {
            commentBefore = joinComments(commentBefore, token.text);
          }
          break;
        }
        case 'nag': {
          const last = line[line.length - 1];
          if (last) last.nags.push(token.value);
          else nagsBefore.push(token.value);
          break;
        }
        case 'open': {
          // The variation replaces the move just played, so it starts one ply earlier.
          const variation = parseLine(depth + 1, Math.max(ply, currentPly - 1));
          if (tokens[pos]?.type !== 'close') {
            throw new PgnParseError('Unbalanced "(" in PGN', '(', currentPly);
          }
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

  const moves = parseLine(0, 0);
  if (pos < tokens.length) throw new PgnParseError('Unbalanced ")" in PGN', ')', moves.length);
  if (headers.Result && RESULT.test(headers.Result)) result = headers.Result;
  const game: PgnGame = { headers, moves, result };
  if (leadingComment) game.comment = leadingComment;
  return game;
}

const HEADER_LINE = /^\[\w+\s+"/;
const ENDS_WITH_RESULT = /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|½-½|\*)\s*$/;
const FIRST_MOVE = /^1\.(?![.…])/;

/**
 * Splits a file with several games into individual PGN strings. Games are
 * separated by their header blocks; header-less games are told apart by a
 * result followed by a blank line, or by a move 1 that starts a line after a
 * blank line or a finished game.
 */
export function splitPgnGames(text: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let inMoves = false;
  let afterResult = false;
  let lastBlank = false;
  const flush = () => {
    const game = current.join('\n').trim();
    if (game) games.push(game);
    current = [];
    inMoves = false;
    afterResult = false;
  };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const isHeader = HEADER_LINE.test(trimmed);
    if (inMoves && trimmed) {
      const restart = FIRST_MOVE.test(trimmed) && (lastBlank || afterResult);
      if (isHeader || restart || (afterResult && lastBlank && !isHeader)) flush();
    }
    if (!isHeader && trimmed) {
      inMoves = true;
      afterResult = ENDS_WITH_RESULT.test(trimmed);
    }
    lastBlank = !trimmed;
    current.push(line);
  }
  flush();
  return games;
}
