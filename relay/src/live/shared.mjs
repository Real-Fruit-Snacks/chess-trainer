/**
 * What the relay's live games and the app agree on: the time controls, the
 * names players go by, the phrases they can send, and the limits. The app
 * imports this file too (see shared.d.mts), so the two can never disagree.
 *
 * Names are made of two words from the lists below, and the only messages are
 * the phrases below: nothing a stranger types ever reaches another player.
 */

/** The time controls offered at a tap, Lichess's quick pairing grid (minutes + seconds). */
export const QUICK_TIME_CONTROLS = Object.freeze([
  '1+0',
  '2+1',
  '3+0',
  '3+2',
  '5+0',
  '5+3',
  '10+0',
  '10+5',
  '15+10',
  '30+0',
  '30+20',
]);

/** A custom time control's limits: whole minutes and seconds, as Lichess allows. */
export const MAX_MINUTES = 180;
export const MAX_INCREMENT_SECONDS = 180;

/**
 * A time control from its id ("5+3": five minutes, three seconds a move); null
 * for anything else. Ids are normalised ("05+3" is not one).
 * @param {unknown} id
 * @returns {{ id: string, initialMs: number, incrementMs: number } | null}
 */
export function parseTimeControl(id) {
  if (typeof id !== 'string') return null;
  const match = /^([1-9]\d{0,2})\+(0|[1-9]\d{0,2})$/.exec(id);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (minutes > MAX_MINUTES || seconds > MAX_INCREMENT_SECONDS) return null;
  return { id, initialMs: minutes * 60_000, incrementMs: seconds * 1000 };
}

/**
 * Lichess's speed of a time control, from its estimated length (the initial
 * time plus forty increments): the Board API posts rapid and slower games only.
 * @param {{ initialMs: number, incrementMs: number }} tc
 * @returns {'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical'}
 */
export function speedOf(tc) {
  const seconds = (tc.initialMs + 40 * tc.incrementMs) / 1000;
  if (seconds < 30) return 'ultraBullet';
  if (seconds < 180) return 'bullet';
  if (seconds < 480) return 'blitz';
  if (seconds < 1500) return 'rapid';
  return 'classical';
}

/** First words of a player's name. */
export const NAME_ADJECTIVES = Object.freeze([
  'Amber',
  'Azure',
  'Bold',
  'Brave',
  'Bright',
  'Calm',
  'Careful',
  'Cheerful',
  'Clever',
  'Cosmic',
  'Curious',
  'Daring',
  'Eager',
  'Fearless',
  'Friendly',
  'Gentle',
  'Golden',
  'Hidden',
  'Humble',
  'Jolly',
  'Keen',
  'Kind',
  'Lively',
  'Loyal',
  'Lucky',
  'Merry',
  'Misty',
  'Modest',
  'Nimble',
  'Noble',
  'Patient',
  'Plucky',
  'Polite',
  'Quiet',
  'Rapid',
  'Royal',
  'Rustic',
  'Sharp',
  'Silent',
  'Silver',
  'Sleepy',
  'Spry',
  'Steady',
  'Sunny',
  'Swift',
  'Thoughtful',
  'Tireless',
  'Valiant',
  'Vivid',
  'Wandering',
  'Wise',
  'Witty',
]);

/** Second words of a player's name. */
export const NAME_NOUNS = Object.freeze([
  'Bishop',
  'Board',
  'Castle',
  'Clock',
  'Diagonal',
  'Endgame',
  'File',
  'Fork',
  'Fortress',
  'Gambit',
  'King',
  'Knight',
  'Opening',
  'Outpost',
  'Pawn',
  'Pin',
  'Plan',
  'Queen',
  'Rank',
  'Rook',
  'Skewer',
  'Square',
  'Tactic',
  'Tempo',
]);

/**
 * Whether `name` is one of the names the app gives out: one first word and one
 * second word from the lists, with one space between.
 * @param {unknown} name
 */
export function isPlayerName(name) {
  if (typeof name !== 'string') return false;
  const words = name.split(' ');
  return (
    words.length === 2 &&
    NAME_ADJECTIVES.includes(/** @type {string} */ (words[0])) &&
    NAME_NOUNS.includes(/** @type {string} */ (words[1]))
  );
}

/** The phrases a player can send, by id. */
export const PHRASES = Object.freeze({
  hello: 'Hello',
  luck: 'Good luck',
  fun: 'Have fun',
  played: 'Well played',
  game: 'Good game',
  thanks: 'Thank you',
  oops: 'Oops',
});

/** @param {unknown} id */
export function isPhrase(id) {
  return typeof id === 'string' && Object.hasOwn(PHRASES, id);
}

/** A rating shown beside a name: a whole number in this range, or none. */
export const MIN_RATING = 100;
export const MAX_RATING = 3500;

/** @param {unknown} rating */
export function isRating(rating) {
  return (
    rating === null ||
    (typeof rating === 'number' &&
      Number.isInteger(rating) &&
      rating >= MIN_RATING &&
      rating <= MAX_RATING)
  );
}

/** The colour a player asks for when posting a game. */
export const COLOR_CHOICES = Object.freeze(['random', 'white', 'black']);

/** Limits, the same on every platform. */
export const LIMITS = Object.freeze({
  /** The largest message accepted, in bytes. */
  messageBytes: 2048,
  /** Messages per socket in any `rateWindowMs`, beyond which the socket is closed. */
  rateMessages: 20,
  rateWindowMs: 10_000,
  /** Open games in the waiting room at once (public and private). */
  seeks: 100,
  /** Sockets in the waiting room at once, and from one address. */
  lobbySockets: 2000,
  socketsPerAddress: 10,
  /** Public games listed (the oldest first). */
  listed: 100,
  /** White's first move must come this long after the game is made, Black's after White's. */
  firstMoveMs: 45_000,
  /** A player whose connection has been gone this long may be claimed against. */
  goneClaimMs: 30_000,
  /** A finished game is kept this long, for a rematch and late reconnections. */
  keepAfterEndMs: 10 * 60_000,
  /** No game room lives longer than this. */
  roomAgeMs: 6 * 60 * 60_000,
  /** A socket must say which seat it is within this long. */
  helloMs: 10_000,
  /** One phrase per player in this time. */
  phraseMs: 2000,
  /** Phrases kept for a player who reconnects. */
  phrasesKept: 20,
});

/** WebSocket close codes the relay uses (4000–4999 are free for applications). */
export const CLOSE = Object.freeze({
  /** Too many messages, or one too big: RFC 6455's policy violation. */
  policy: 1008,
  tooBig: 1009,
  /** No such game, or not a seat in it. */
  noGame: 4004,
  /** The socket did not say which seat it is in time. */
  noHello: 4008,
  /** The waiting room or the address has too many sockets. */
  full: 4029,
  /** The game was deleted (long over). */
  closed: 4010,
});

/**
 * `bytes` random bytes in unpadded base64url: game, seek and seat ids.
 * @param {number} bytes
 */
export function randomId(bytes) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let text = '';
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Game ids and seek ids: 16 random bytes (22 characters). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** Seat tokens: 32 random bytes (43 characters). */
export const SEAT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
