/**
 * The games two people can play online, as the app names and describes them:
 * the waiting room's tiles and lists, the bar under the header, and the game
 * pages. No chess.js here (the bar imports this module too).
 */
import type { IconName } from '@/components/ui/Icon';
import {
  ARBITER_PACES,
  ARMY_BUDGETS,
  BLINDFOLD_PEEKS,
  DUEL_RULES,
  gameOptions,
  isDuel,
  RACE_FORMATS,
  RACE_LEVELS,
} from '../../../relay/src/live/shared.mjs';
import { describeTimeControl } from './liveView';
import type {
  ArbiterPace,
  ColorChoice,
  DuelKind,
  GameKind,
  GameOptions,
  RaceFormat,
} from './types';

export interface OnlineGame {
  kind: GameKind;
  name: string;
  /** One line under the name. */
  tagline: string;
  /** A few sentences: how it is played, and how it is won. */
  description: string;
  icon: IconName;
  /** A duel has rounds instead of a clock and colours: the poster's device hosts it. */
  duel: boolean;
  /** The arcade game it comes from, to practise alone. */
  arcade: string | null;
  /** The options a new post starts from. */
  defaults: GameOptions;
  /** About how long a game takes. */
  minutes: string;
}

/** The games beyond chess, in the order the waiting room shows them. */
export const ONLINE_GAMES: readonly OnlineGame[] = [
  {
    kind: 'race',
    name: 'Puzzle race',
    tagline: 'The same puzzle on both boards: the first clean solve takes the round.',
    description:
      'Both players get the same puzzles at the same moment. A wrong move is out of the round; the first to solve one cleanly takes it. Play first to two, share a round when both solve within 15 seconds, or race through as many as you can in three minutes. Or open a room for up to eight, and send its link.',
    icon: 'stopwatch',
    duel: true,
    arcade: '/puzzles/rush',
    defaults: { format: 'best3', level: 1500 },
    minutes: '2–5',
  },
  {
    kind: 'arbiter',
    name: 'Arbiter duel',
    tagline: 'The same replays for both: call the illegal move first.',
    description: `A classic game replays on both boards, and one move in each round breaks the rules. Call it before your opponent does; a call on a legal move is out of the round. First to ${DUEL_RULES.arbiter.target} rounds.`,
    icon: 'whistle',
    duel: true,
    arcade: '/arcade/arbiter',
    defaults: { pace: 'normal' },
    minutes: '3–6',
  },
  {
    kind: 'judge',
    name: 'Who Stands Better? duel',
    tagline: 'Judge the same positions: the closer call to the engine scores more.',
    description: `${DUEL_RULES.judge.rounds} quiet positions from the classic games. Say who is better and by how much; each judgement scores up to 100 points by how close it comes to the engine. The higher total wins.`,
    icon: 'scale',
    duel: true,
    arcade: '/arcade/who-stands-better',
    defaults: {},
    minutes: '3',
  },
  {
    kind: 'army',
    name: 'Army Draft',
    tagline: 'Buy an army in secret, then play the two armies.',
    description:
      'Each player spends the same budget on an army; neither sees the other’s until both are in. The game then starts from the two armies, with a clock as in any game.',
    icon: 'army',
    duel: false,
    arcade: '/arcade/army-draft',
    defaults: { budget: 30 },
    minutes: '10–30',
  },
  {
    kind: 'blindfold',
    name: 'Blindfold',
    tagline: `A real game with the pieces hidden: ${BLINDFOLD_PEEKS} peeks each.`,
    description: `Neither player sees the pieces: the move list is all you get, and you play by the squares. Each of you may peek ${BLINDFOLD_PEEKS} times, and each sees how often the other has.`,
    icon: 'eye-off',
    duel: false,
    arcade: '/arcade/blindfold',
    defaults: {},
    minutes: '10–30',
  },
  {
    kind: 'chess960',
    name: 'Chess960',
    tagline: 'Chess from one of 960 start positions: no opening theory to lean on.',
    description:
      'The pieces behind the pawns start in one of 960 orders, the same for both sides, drawn for each game; a rematch keeps it. To castle, move the king onto its own rook: both end on the squares they would in chess.',
    icon: 'shuffle',
    duel: false,
    arcade: '/play/computer?variant=chess960',
    defaults: {},
    minutes: '10–30',
  },
];

export function onlineGame(kind: GameKind): OnlineGame | null {
  return ONLINE_GAMES.find((game) => game.kind === kind) ?? null;
}

/** "Puzzle race"; a game of chess is just "Chess". */
export function gameName(kind: GameKind): string {
  return onlineGame(kind)?.name ?? 'Chess';
}

/** Whether a game is a duel (rounds, no clock, the poster hosting). */
export function isDuelKind(kind: GameKind): kind is DuelKind {
  return isDuel(kind);
}

export const RACE_FORMAT_NAMES: Record<RaceFormat, string> = {
  best3: 'Best of three',
  window: 'Best of three, 15-second window',
  timed: 'Three-minute race',
};

export const RACE_FORMAT_HINTS: Record<RaceFormat, string> = {
  best3: 'The first clean solve takes each round; the first to two rounds wins.',
  window: `As best of three, but a clean solve within ${DUEL_RULES.race.windowMs / 1000} seconds of the first shares the round.`,
  timed: `The same puzzles, each at your own pace, getting harder: the most solved in three minutes wins. ${DUEL_RULES.race.strikes} wrong answers and you are out.`,
};

export const ARBITER_PACE_NAMES: Record<ArbiterPace, string> = {
  normal: 'Normal pace',
  slow: 'Slow pace',
};

export { ARBITER_PACES, ARMY_BUDGETS, RACE_FORMATS, RACE_LEVELS };

/** The options checked against the game (the relay's own check), or the game's defaults. */
export function optionsFor(kind: GameKind, opts: unknown): GameOptions {
  return gameOptions(kind, opts) ?? onlineGame(kind)?.defaults ?? {};
}

/** A game's options in words: "Best of three · 1500", "30 points", "Normal pace"; '' for none. */
export function describeOptions(kind: GameKind, opts: GameOptions): string {
  switch (kind) {
    case 'race':
      return opts.format
        ? `${RACE_FORMAT_NAMES[opts.format]}${opts.level ? ` · ${opts.level}` : ''}`
        : '';
    case 'army':
      return opts.budget ? `${opts.budget} points` : '';
    case 'arbiter':
      return opts.pace ? ARBITER_PACE_NAMES[opts.pace] : '';
    default:
      return '';
  }
}

/** The colour wanted, in an open game's line. */
function colorText(color: ColorChoice): string {
  return color === 'random' ? 'Random colour' : `Plays ${color}`;
}

/**
 * What a posted game is, in one line: "5+3 · Blitz · Random colour",
 * "Army Draft · 30 points · 5+3 · Plays white", "Chess960 · 5+3 · Plays white",
 * "Puzzle race · Best of three · 1500".
 */
export function describeSeek(seek: {
  game: GameKind;
  opts: GameOptions;
  tc: string | null;
  color: ColorChoice;
}): string {
  const parts: string[] = [];
  if (seek.game !== 'chess') parts.push(gameName(seek.game));
  const options = describeOptions(seek.game, seek.opts);
  if (options) parts.push(options);
  if (!isDuel(seek.game) && seek.tc) {
    parts.push(seek.game === 'chess' ? describeTimeControl(seek.tc) : seek.tc);
    parts.push(colorText(seek.color));
  }
  return parts.join(' · ');
}

/**
 * "a 5+3 game", "a puzzle race", "an Army Draft game", "a 5+3 Chess960 game": what was
 * posted, in a sentence.
 */
export function gameNoun(kind: GameKind, tc: string | null): string {
  switch (kind) {
    case 'chess':
      return tc ? `${tc} game` : 'game';
    case 'blindfold':
      return 'blindfold game';
    case 'army':
      return 'Army Draft game';
    case 'chess960':
      return tc ? `${tc} Chess960 game` : 'Chess960 game';
    case 'race':
      return 'puzzle race';
    case 'arbiter':
      return 'Arbiter duel';
    case 'judge':
      return 'Who Stands Better? duel';
  }
}
