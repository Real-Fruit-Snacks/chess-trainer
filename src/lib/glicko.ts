/**
 * Glicko-2 (Glickman, 2013: "Example of the Glicko-2 system"), the rating
 * system Lichess uses for games and puzzles.
 *
 * A rating is three numbers: the rating itself, the **rating deviation** (RD,
 * how uncertain the rating is — a 95 % interval is roughly ±2 RD) and the
 * **volatility** (how erratic the results have been). Every puzzle attempt is
 * its own rating period, as on Lichess. Between attempts the deviation grows
 * with inactivity, so a rating that has not been tested for months becomes
 * provisional again and moves quickly once solving resumes.
 */

export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface Result {
  /** The opponent (here: the puzzle) rating and deviation. */
  rating: number;
  rd: number;
  /** 1 = win / solve, 0 = loss / fail, anything between for partial credit. */
  score: number;
}

/** Glicko-2 system constant: how much volatility can change per period. */
export const TAU = 0.5;
export const DEFAULT_VOLATILITY = 0.06;
/** A brand-new player. */
export const INITIAL_RD = 350;
/** The deviation never shrinks below this: a settled rating still moves ~±8 per puzzle. */
export const MIN_RD = 40;
export const MAX_RD = 350;
/** Ratings at or above this deviation are shown as provisional (Lichess uses the same cut). */
export const PROVISIONAL_RD = 110;
export const RATING_MIN = 100;
export const RATING_MAX = 3500;
/**
 * How many rating periods a day of inactivity is worth. Lichess' value: with
 * the default volatility a settled RD of 60 becomes provisional (110) after
 * about a year without playing.
 */
export const RATING_PERIODS_PER_DAY = 0.21436;

const SCALE = 173.7178;
const CONVERGENCE = 0.000001;

export const newRating = (rating: number, rd = INITIAL_RD): Rating => ({
  rating,
  rd,
  volatility: DEFAULT_VOLATILITY,
});

const toInternal = (r: Rating) => ({
  mu: (r.rating - 1500) / SCALE,
  phi: r.rd / SCALE,
  sigma: r.volatility,
});

const clampRating = (r: number) => Math.max(RATING_MIN, Math.min(RATING_MAX, r));
const clampRd = (rd: number) => Math.max(MIN_RD, Math.min(MAX_RD, rd));

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/** The probability of the player scoring against a puzzle (in rating units). */
export function expectedScore(player: Rating, puzzle: { rating: number; rd: number }): number {
  const p = toInternal(player);
  return expected(p.mu, (puzzle.rating - 1500) / SCALE, puzzle.rd / SCALE);
}

/** New volatility (step 5 of the paper): the Illinois algorithm on f(x). */
function nextVolatility(sigma: number, phi: number, v: number, delta: number, tau: number) {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (
      (ex * (delta2 - phi2 - v - ex)) / (2 * (phi2 + v + ex) * (phi2 + v + ex)) -
      (x - a) / (tau * tau)
    );
  };
  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > CONVERGENCE && guard < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }
  return Math.exp(A / 2);
}

/**
 * Rates one period: the player's results against any number of opponents.
 * With no results only the deviation changes (it grows by the volatility).
 */
export function rate(player: Rating, results: readonly Result[], tau = TAU): Rating {
  const { mu, phi, sigma } = toInternal(player);
  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...player, rd: clampRd(phiStar * SCALE) };
  }
  let v = 0;
  let sum = 0;
  for (const r of results) {
    const muJ = (r.rating - 1500) / SCALE;
    const phiJ = r.rd / SCALE;
    const gj = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    v += gj * gj * e * (1 - e);
    sum += gj * (r.score - e);
  }
  v = 1 / v;
  const delta = v * sum;
  const sigmaNext = nextVolatility(sigma, phi, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaNext * sigmaNext);
  const phiNext = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNext = mu + phiNext * phiNext * sum;
  return {
    rating: clampRating(muNext * SCALE + 1500),
    rd: clampRd(phiNext * SCALE),
    volatility: sigmaNext,
  };
}

/**
 * Grows the deviation for `days` without a rated attempt, so a rating that has
 * not been tested for a long time is treated as uncertain again.
 */
export function inflate(player: Rating, days: number): Rating {
  if (!(days > 0)) return player;
  const { phi, sigma } = toInternal(player);
  const periods = days * RATING_PERIODS_PER_DAY;
  const phiStar = Math.sqrt(phi * phi + sigma * sigma * periods);
  return { ...player, rd: clampRd(phiStar * SCALE) };
}

/**
 * Applies only a fraction of an update — used for a puzzle the player has
 * seen before, whose result says less about their strength.
 */
export function blend(before: Rating, after: Rating, weight: number): Rating {
  const w = Math.max(0, Math.min(1, weight));
  return {
    rating: before.rating + w * (after.rating - before.rating),
    rd: before.rd + w * (after.rd - before.rd),
    volatility: before.volatility + w * (after.volatility - before.volatility),
  };
}

export function isProvisional(rating: Pick<Rating, 'rd'>): boolean {
  return rating.rd >= PROVISIONAL_RD;
}

/** "1,420 ± 60" — the deviation rounded to whole points. */
export function formatRatingWithRd(rating: Rating, locale = 'en-US'): string {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return `${fmt.format(Math.round(rating.rating))} ± ${fmt.format(Math.round(rating.rd))}`;
}
