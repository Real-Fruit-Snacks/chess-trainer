import type { Uci } from '@/chess/types';

export interface Score {
  type: 'cp' | 'mate';
  /** Centipawns or moves-to-mate, from the point of view of the side to move. */
  value: number;
  /** Bound flags reported by the engine during aspiration windows. */
  bound?: 'lower' | 'upper';
}

export interface SearchInfo {
  depth: number;
  seldepth?: number;
  multipv: number;
  score: Score;
  nodes?: number;
  nps?: number;
  time?: number;
  hashfull?: number;
  pv: Uci[];
}

export interface BestMove {
  move: Uci | null;
  ponder?: Uci;
}

const INFO_NUMERIC = new Set([
  'depth',
  'seldepth',
  'multipv',
  'nodes',
  'nps',
  'time',
  'hashfull',
  'tbhits',
]);

/**
 * Parses a UCI `info` line. Returns null for lines that carry no principal
 * variation (e.g. `info string ...` or currmove progress lines).
 */
export function parseInfo(line: string): SearchInfo | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.trim().split(/\s+/);
  const out: Record<string, number> = { multipv: 1 };
  let score: Score | undefined;
  let pv: Uci[] | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;
    if (token === 'string') return null;
    if (INFO_NUMERIC.has(token)) {
      const value = Number(tokens[++i]);
      if (!Number.isNaN(value)) out[token] = value;
      continue;
    }
    if (token === 'score') {
      const type = tokens[++i];
      const value = Number(tokens[++i]);
      if ((type === 'cp' || type === 'mate') && !Number.isNaN(value)) {
        score = { type, value };
        const next = tokens[i + 1];
        if (next === 'lowerbound' || next === 'upperbound') {
          score.bound = next === 'lowerbound' ? 'lower' : 'upper';
          i++;
        }
      }
      continue;
    }
    if (token === 'pv') {
      pv = tokens.slice(i + 1);
      break;
    }
    if (
      token === 'currmove' ||
      token === 'currmovenumber' ||
      token === 'cpuload' ||
      token === 'refutation'
    ) {
      // progress-only lines; skip the argument and keep scanning
      i++;
    }
  }

  if (!score || !pv || pv.length === 0 || out.depth === undefined) return null;

  return {
    depth: out.depth,
    seldepth: out.seldepth,
    multipv: out.multipv ?? 1,
    score,
    nodes: out.nodes,
    nps: out.nps,
    time: out.time,
    hashfull: out.hashfull,
    pv,
  };
}

export function parseBestMove(line: string): BestMove | null {
  if (!line.startsWith('bestmove')) return null;
  const tokens = line.trim().split(/\s+/);
  const move = tokens[1];
  const result: BestMove = { move: move && move !== '(none)' ? move : null };
  const ponderIdx = tokens.indexOf('ponder');
  const ponder = ponderIdx >= 0 ? tokens[ponderIdx + 1] : undefined;
  if (ponder) result.ponder = ponder;
  return result;
}

/**
 * Converts a score from the mover's perspective to White's perspective, in
 * centipawns. Mates are mapped to ±(100000 - plies) so they sort above any
 * material evaluation while still preferring faster mates.
 */
export function scoreToWhiteCp(score: Score, moverIsWhite: boolean): number {
  const sign = moverIsWhite ? 1 : -1;
  if (score.type === 'mate') {
    if (score.value === 0) return sign * -100000;
    const magnitude = 100000 - Math.abs(score.value);
    return sign * Math.sign(score.value) * magnitude;
  }
  return sign * score.value;
}

/**
 * Win probability for White from a centipawn evaluation, using the logistic
 * model Lichess applies to Stockfish scores (k ≈ 0.00368).
 */
export function cpToWinProbability(whiteCp: number): number {
  const clamped = Math.max(-10000, Math.min(10000, whiteCp));
  return 1 / (1 + Math.exp(-0.00368208 * clamped));
}

/** Human-friendly evaluation text from White's perspective, e.g. "+1.3", "-0.4", "M5", "-M2". */
export function formatScore(score: Score, moverIsWhite: boolean): string {
  if (score.type === 'mate') {
    const whiteMate = moverIsWhite ? score.value : -score.value;
    if (whiteMate === 0) return moverIsWhite ? '0-1' : '1-0';
    return `${whiteMate > 0 ? '' : '-'}M${Math.abs(whiteMate)}`;
  }
  const whiteCp = moverIsWhite ? score.value : -score.value;
  const pawns = whiteCp / 100;
  const text = Math.abs(pawns) >= 10 ? pawns.toFixed(0) : pawns.toFixed(1);
  return pawns > 0 ? `+${text}` : pawns < 0 ? text : '0.0';
}
