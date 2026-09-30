/**
 * Rough conversions from the puzzle rating to the game ratings people know.
 *
 * Puzzle ratings measure tactics (and the speed of seeing them), not whole
 * games, so any mapping is approximate. The anchors below follow the widely
 * published comparisons between Lichess puzzle and blitz ratings, between
 * Lichess and chess.com, and between online and FIDE ratings for club
 * players. They are interpolated linearly and reported as ranges.
 */

export interface RatingRange {
  low: number;
  high: number;
  centre: number;
}

export interface GameRatingEstimates {
  /** Lichess blitz / rapid. */
  lichess: RatingRange;
  /** chess.com rapid. */
  chesscom: RatingRange;
  /** FIDE standard; null when the estimate falls below the FIDE floor. */
  fide: RatingRange | null;
}

/** Half-width of every range: the mapping is not more precise than this. */
export const ESTIMATE_SPREAD = 150;
export const FIDE_FLOOR = 1000;

/** [puzzle rating, Lichess game rating] anchors. */
const LICHESS_ANCHORS: readonly [number, number][] = [
  [400, 400],
  [600, 500],
  [900, 700],
  [1200, 950],
  [1500, 1200],
  [1800, 1500],
  [2100, 1800],
  [2400, 2150],
  [2700, 2500],
  [3000, 2800],
];

/** [Lichess game rating, chess.com rapid rating] anchors. */
const CHESSCOM_ANCHORS: readonly [number, number][] = [
  [400, 300],
  [700, 450],
  [950, 700],
  [1200, 950],
  [1500, 1250],
  [1800, 1600],
  [2150, 2000],
  [2500, 2400],
  [2800, 2750],
];

/** [chess.com rapid rating, FIDE standard rating] anchors. */
const FIDE_ANCHORS: readonly [number, number][] = [
  [1100, 1000],
  [1250, 1150],
  [1600, 1500],
  [2000, 1900],
  [2350, 2250],
  [2650, 2550],
];

function interpolate(anchors: readonly [number, number][], x: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) return x;
  if (x <= first[0]) return first[1] + (x - first[0]) * slope(anchors, 0);
  if (x >= last[0]) return last[1] + (x - last[0]) * slope(anchors, anchors.length - 2);
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (!a || !b) continue;
    if (x >= a[0] && x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return last[1];
}

function slope(anchors: readonly [number, number][], index: number): number {
  const a = anchors[index];
  const b = anchors[index + 1];
  if (!a || !b) return 1;
  return (b[1] - a[1]) / (b[0] - a[0]);
}

const round50 = (n: number) => Math.round(n / 50) * 50;

function range(centre: number): RatingRange {
  const c = round50(centre);
  return { low: Math.max(0, c - ESTIMATE_SPREAD), high: c + ESTIMATE_SPREAD, centre: c };
}

export function approximateGameRatings(puzzleRating: number): GameRatingEstimates {
  const lichess = interpolate(LICHESS_ANCHORS, puzzleRating);
  const chesscom = interpolate(CHESSCOM_ANCHORS, lichess);
  const fide = interpolate(FIDE_ANCHORS, chesscom);
  return {
    lichess: range(lichess),
    chesscom: range(chesscom),
    fide: round50(fide) >= FIDE_FLOOR ? range(fide) : null,
  };
}

export function formatRange(r: RatingRange, locale = 'en-US'): string {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return `${fmt.format(r.low)}–${fmt.format(r.high)}`;
}
