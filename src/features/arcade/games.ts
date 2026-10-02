import type { IconName } from '@/components/ui/Icon';
import type { ArcadeResult, DailyOpeningState, OddsLadderState } from '@/store/progress';
import { ODDS_RUNGS } from './odds';

export type ArcadeGameId =
  | 'hand-and-brain'
  | 'daily-opening'
  | 'who-stands-better'
  | 'odds-ladder'
  | 'army-draft'
  | 'fortress'
  | 'engine-says'
  | 'blindfold'
  | 'simul';

export interface ArcadeGame {
  id: ArcadeGameId;
  name: string;
  /** One line under the name. */
  tagline: string;
  description: string;
  /** What the game trains, in a few words. */
  trains: string;
  icon: IconName;
  /** Needs the engine (so it loads a few seconds longer the first time). */
  engine: boolean;
  /** Typical time for one round. */
  minutes: string;
}

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  {
    id: 'hand-and-brain',
    name: 'Hand & Brain',
    tagline: 'Stockfish is your partner; you only say which piece.',
    description:
      'As the Brain you call a piece type and your engine partner plays the best move with it. As the Hand the partner calls the piece and you find the move. Every call is scored against the engine’s real best.',
    trains: 'Planning and calculation, separately',
    icon: 'brain',
    engine: true,
    minutes: '10–20',
  },
  {
    id: 'daily-opening',
    name: 'Daily Opening',
    tagline: 'Guess the opening of the day in six tries.',
    description:
      'One opening a day from the book of 3,800 lines. Each guess shows which moves are in the right place, which appear elsewhere in the line and which do not appear at all.',
    trains: 'Opening names and move orders',
    icon: 'calendar',
    engine: false,
    minutes: '2–5',
  },
  {
    id: 'who-stands-better',
    name: 'Who Stands Better?',
    tagline: 'Set the evaluation, then see what the engine says.',
    description:
      'Ten quiet positions from the classic games. Say who is better and by how much, then the engine shows the truth. Closeness scores points; a streak of good calls scores more.',
    trains: 'Positional judgement',
    icon: 'scale',
    engine: false,
    minutes: '5–10',
  },
  {
    id: 'odds-ladder',
    name: 'Odds Ladder',
    tagline: 'Beat full-strength Stockfish — with a head start.',
    description: `The engine starts without a queen. Win and it only gives a rook next time, then a knight, a bishop, a pawn, and finally nothing at all. ${ODDS_RUNGS.length} rungs.`,
    trains: 'Converting an advantage against the strongest resistance',
    icon: 'ladder',
    engine: true,
    minutes: '15–40',
  },
  {
    id: 'army-draft',
    name: 'Army Draft',
    tagline: 'Buy your pieces, then fight with them.',
    description:
      'Both sides build an army from a points budget and place it on their first two ranks; the engine drafts its own. Three knights and eight pawns against two rooks? Play it out and find out.',
    trains: 'Piece values and coordination',
    icon: 'army',
    engine: true,
    minutes: '10–30',
  },
  {
    id: 'fortress',
    name: 'Fortress',
    tagline: 'Hold a worse position for twenty moves.',
    description:
      'You start clearly worse and the engine presses. The evaluation is your health bar: hold it above the line for twenty moves and the position counts as held. Three lives; each position is harder than the last.',
    trains: 'Defence and resourcefulness',
    icon: 'shield',
    engine: true,
    minutes: '10–20',
  },
  {
    id: 'engine-says',
    name: 'Engine Says',
    tagline: 'Watch the moves, then play them back from memory.',
    description:
      'The engine plays a few moves of a real opening line, the board resets, and you replay them in order. Every round adds a move. How long a sequence can you hold?',
    trains: 'Visualisation and move memory',
    icon: 'repeat',
    engine: false,
    minutes: '2–5',
  },
  {
    id: 'blindfold',
    name: 'Blindfold',
    tagline: 'A full game with the pieces hidden. Three peeks.',
    description:
      'Play the engine at any level without seeing the pieces; the move list is all you get. You may peek three times. A win with peeks to spare is the top score.',
    trains: 'Visualisation under pressure',
    icon: 'eye-off',
    engine: true,
    minutes: '10–30',
  },
  {
    id: 'simul',
    name: 'Simul',
    tagline: 'Play several engines at once, each on its own board.',
    description:
      'Two to eight boards against Stockfish, all at one level or rising board by board. Move, move on, come back — and with clocks on, every board has its own clock, and yours runs wherever it is your move.',
    trains: 'Quick decisions and switching between positions',
    icon: 'boards',
    engine: true,
    minutes: '10–40',
  },
];

export function getArcadeGame(id: string): ArcadeGame | undefined {
  return ARCADE_GAMES.find((g) => g.id === id);
}

/** One line for the hub card: the best result so far, or null when never played. */
export function describeArcadeBest(
  game: ArcadeGame,
  state: {
    arcade: Record<string, ArcadeResult>;
    dailyOpening: DailyOpeningState | null;
    oddsLadder: OddsLadderState;
  },
): string | null {
  switch (game.id) {
    case 'daily-opening': {
      const daily = state.dailyOpening;
      if (!daily) return null;
      const played = Object.keys(daily.history).length;
      return `Streak ${daily.streak} · best ${daily.bestStreak} · ${played} day${played === 1 ? '' : 's'} played`;
    }
    case 'odds-ladder': {
      const ladder = state.oddsLadder;
      const played = Object.values(ladder.results).reduce((n, r) => n + r.wins + r.losses, 0);
      if (played === 0) return null;
      const rung = ODDS_RUNGS[Math.min(ladder.rung, ODDS_RUNGS.length - 1)];
      return `Rung ${ladder.rung + 1} of ${ODDS_RUNGS.length}: ${rung?.name ?? ''}`;
    }
    default: {
      const result = state.arcade[game.id];
      if (!result) return null;
      return `${result.detail ?? `Best ${result.best}`} · ${result.plays} play${result.plays === 1 ? '' : 's'}`;
    }
  }
}
