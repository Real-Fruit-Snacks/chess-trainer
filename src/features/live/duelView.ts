/**
 * Duels in words: what a result was, how a duel stands and how it ended (the
 * duel page's, and its tests').
 */
import { describeScale } from '@/features/arcade/whoStandsBetter';
import { DUEL_RULES } from '../../../relay/src/live/shared.mjs';
import { gameName } from './onlineGames';
import type { DuelResult, DuelRound, DuelView, Side } from './types';

export type DuelVerdict = 'win' | 'loss' | 'draw' | 'aborted' | 'unknown';

const other = (side: Side): Side => (side === 'white' ? 'black' : 'white');

/** "0.62 s": a solve's or a call's time. */
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(2)} s`;
}

/** Points with a half as a fraction: 1.5 → "1½". */
export function points(value: number): string {
  const whole = Math.floor(value);
  const half = value - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

/** How the duel ended for this device. */
export function duelVerdict(view: Pick<DuelView, 'result' | 'reason' | 'you'>): DuelVerdict {
  if (view.reason === 'aborted' || view.reason === 'no-start') return 'aborted';
  if (view.result === '1/2-1/2') return 'draw';
  if (view.result === '1-0') return view.you === 'white' ? 'win' : 'loss';
  if (view.result === '0-1') return view.you === 'black' ? 'win' : 'loss';
  return 'unknown';
}

export function duelEndTitle(verdict: DuelVerdict): string {
  switch (verdict) {
    case 'win':
      return 'You won!';
    case 'loss':
      return 'You lost';
    case 'draw':
      return 'A draw';
    case 'aborted':
      return 'Called off';
    case 'unknown':
      return 'Over';
  }
}

/** This device's score and the opponent's, as the duel counts them. */
export function scores(view: Pick<DuelView, 'game' | 'opts' | 'score' | 'progress' | 'you'>): {
  mine: string;
  theirs: string;
} {
  const them = other(view.you);
  if (view.game === 'race' && view.opts.format === 'timed') {
    return {
      mine: String(view.progress?.[view.you].solved ?? 0),
      theirs: String(view.progress?.[them].solved ?? 0),
    };
  }
  return { mine: points(view.score[view.you]), theirs: points(view.score[them]) };
}

/** What the score counts: "rounds", "puzzles solved", "points". */
export function scoreUnit(view: Pick<DuelView, 'game' | 'opts'>): string {
  if (view.game === 'judge') return 'points';
  if (view.game === 'race' && view.opts.format === 'timed') return 'solved';
  return 'rounds';
}

/** What wins: "First to two rounds", "The most solved in three minutes". */
export function duelGoal(view: Pick<DuelView, 'game' | 'opts'>): string {
  if (view.game === 'race') {
    if (view.opts.format === 'timed') return 'The most puzzles solved in three minutes';
    return view.opts.format === 'window'
      ? `First to ${DUEL_RULES.race.target} rounds; solves within ${DUEL_RULES.race.windowMs / 1000} s share a round`
      : `First to ${DUEL_RULES.race.target} rounds`;
  }
  if (view.game === 'arbiter') return `First to ${DUEL_RULES.arbiter.target} rounds`;
  return `The higher total after ${DUEL_RULES.judge.rounds} positions`;
}

/** A result in a few words: "Solved in 7.95 s", "Called a legal move", "White is better (1.2)". */
export function resultWords(result: DuelResult | { locked: true } | null): string {
  if (!result) return 'Nothing yet';
  if ('locked' in result) return 'Locked in';
  if ('ok' in result) return result.ok ? `Solved in ${seconds(result.ms)}` : 'Missed';
  if ('call' in result) {
    if (result.call === 'caught') return `Called in ${seconds(result.ms)}`;
    return result.call === 'false' ? 'Called a legal move' : 'Missed it';
  }
  return describeScale(result.guess);
}

/** "Round 2", or "Position 2 of 5" in Who Stands Better? (whose positions are all played). */
export function roundLabel(view: Pick<DuelView, 'game'>, round: number): string {
  return view.game === 'judge'
    ? `Position ${round + 1} of ${DUEL_RULES.judge.rounds}`
    : `Round ${round + 1}`;
}

/** A side's result in a round played: a judgement with the points it scored. */
export function roundWords(view: Pick<DuelView, 'game'>, round: DuelRound, side: Side): string {
  const words = resultWords(round.results[side]);
  return view.game === 'judge' ? `${words}, ${round.points[side]} points` : words;
}

/** How the duel ended, in one line for its status ("You won. 2 rounds to 1."). */
export function duelEndSummary(view: DuelView, opponentName: string): string {
  const verdict = duelVerdict(view);
  const lead =
    verdict === 'win'
      ? 'You won'
      : verdict === 'loss'
        ? 'You lost'
        : verdict === 'draw'
          ? 'A draw'
          : verdict === 'aborted'
            ? 'Called off'
            : 'Over';
  return `${lead}. ${duelEndSentence(view, opponentName)}`;
}

/** How the duel ended, from this device's side, in a sentence. */
export function duelEndSentence(view: DuelView, opponentName: string): string {
  const verdict = duelVerdict(view);
  switch (view.reason) {
    case 'resign':
      return verdict === 'loss' ? 'You resigned.' : `${opponentName} resigned.`;
    case 'aborted':
      return 'Called off before it started.';
    case 'no-start':
      return 'The rounds never started: one of you did not arrive in time.';
    case 'score': {
      const { mine, theirs } = scores(view);
      const unit = scoreUnit(view);
      return `${mine} ${unit} to ${theirs}.`;
    }
    default:
      return `The ${gameName(view.game)} has ended.`;
  }
}

/** Who took a round, from this device's side. */
export function roundWinnerWords(
  winner: Side | 'shared' | null,
  you: Side,
  opponentName: string,
): string {
  if (winner === null) return 'Nobody';
  if (winner === 'shared') return 'Shared';
  return winner === you ? 'You' : opponentName;
}
