/**
 * Live games: the words and the clock maths the waiting room, the game page
 * and the bar share. No chess.js here (see liveViewBoard.ts): the bar under the
 * shell's header imports this module too, and should stay small.
 */
import { parseTimeControl, speedOf, type LichessSpeed } from '../../../relay/src/live/shared.mjs';
import type { ColorChoice, LiveClock, LiveGameView, LivePlayer, MySeek, Side } from './types';

const SPEED_NAMES: Record<LichessSpeed, string> = {
  ultraBullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};

/** Lichess's name for the speed of a time control ("Blitz" for "5+3"); null for anything else. */
export function speedName(tc: string): string | null {
  const spec = parseTimeControl(tc);
  return spec ? SPEED_NAMES[speedOf(spec)] : null;
}

/** "5+3 · Blitz". */
export function describeTimeControl(tc: string): string {
  const speed = speedName(tc);
  return speed ? `${tc} · ${speed}` : tc;
}

export function sideName(side: Side): string {
  return side === 'white' ? 'White' : 'Black';
}

/** The colour the poster of an open game takes. */
export function posterColorText(color: ColorChoice): string {
  return color === 'random' ? 'Random colour' : `Plays ${color}`;
}

/** The colour this device asked for. */
export function myColorText(color: ColorChoice): string {
  return color === 'random' ? 'Random colour' : `You play ${color}`;
}

/** The waiting room's head count, leaving this device out. */
export function othersHere(players: number): string {
  const others = Math.max(0, players - 1);
  if (others === 0) return 'Nobody else is here right now';
  return others === 1 ? '1 other player here' : `${others} other players here`;
}

function clockText(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Time gone by, "2:13" (whole seconds, rounded down: it counts up). */
export function formatElapsed(ms: number): string {
  return clockText(Math.floor(Math.max(0, ms) / 1000));
}

/** Time left, "0:42" (whole seconds, rounded up: it reads 0:00 only once the time is up). */
export function formatCountdown(ms: number): string {
  return clockText(Math.ceil(Math.max(0, ms) / 1000));
}

/**
 * The live clocks' time line. The pages read it while they render a running
 * clock, which a ticker re-renders five times a second: the time shown is the
 * time at that render, as it should be.
 */
export function monotonicNow(): number {
  return performance.now();
}

/** One side's time at `now` (performance.now()): the running side's counts down, never below zero. */
export function clockRemaining(clock: LiveClock, side: Side, now: number): number {
  const value = clock[side];
  if (clock.running !== side) return Math.max(0, value);
  return Math.max(0, value - Math.max(0, now - clock.at));
}

/** The link that joins this device's posted game: the waiting room with `?join=`. */
export function joinLink(seekId: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}play/online?join=${encodeURIComponent(seekId)}`;
}

/* ------------------------------------------------------------------ */
/* The waiting room's statuses                                        */
/* ------------------------------------------------------------------ */

export type PlaceTone = 'done' | 'busy' | 'problem';

/** One line of the posted game's statuses: where it is posted, and how that went. */
export interface PlaceStatus {
  text: string;
  tone: PlaceTone;
}

/** A sentence from a store or Lichess, without the full stop the line adds itself. */
function clause(message: string): string {
  return message.trim().replace(/\.+$/, '');
}

export function relayStatus(status: MySeek['relay']): PlaceStatus {
  if (status === 'posted') return { text: 'Here: posted', tone: 'done' };
  if (status === 'posting') return { text: 'Here: posting…', tone: 'busy' };
  return { text: 'Here: failed', tone: 'problem' };
}

/** The Lichess line, or null when the game is not posted there. */
export function lichessStatus(lichess: MySeek['lichess']): PlaceStatus | null {
  const { status, message } = lichess;
  switch (status) {
    case 'off':
      return null;
    case 'posted':
      return { text: 'On Lichess: posted', tone: 'done' };
    case 'checking':
      return { text: 'On Lichess: checking…', tone: 'busy' };
    case 'posting':
      return { text: 'On Lichess: posting…', tone: 'busy' };
    case 'failed':
      return {
        text: message ? `On Lichess: failed: ${clause(message)}.` : 'On Lichess: failed',
        tone: 'problem',
      };
    case 'needs-permission':
      return {
        text: `On Lichess: ${message ?? 'your sign-in has no permission to play games yet.'}`,
        tone: 'problem',
      };
    case 'signed-out':
      return { text: `On Lichess: ${message ?? 'not signed in.'}`, tone: 'problem' };
    case 'not-allowed':
      return {
        text: `On Lichess: ${message ?? 'apps may post rapid and slower games only.'}`,
        tone: 'problem',
      };
  }
}

/* ------------------------------------------------------------------ */
/* The game                                                           */
/* ------------------------------------------------------------------ */

export function opponentOf(view: Pick<LiveGameView, 'you' | 'white' | 'black'>): LivePlayer {
  return view.you === 'white' ? view.black : view.white;
}

/**
 * Whether asking to take a move back can be granted: there is a move of yours
 * to undo (the last one, or the one before the opponent's reply), and on the
 * relay the game keeps its first two moves (relay/src/live/room.mjs).
 */
export function canAskTakeback(view: Pick<LiveGameView, 'moves' | 'you' | 'source'>): boolean {
  const plies = view.moves.length;
  const lastMover: Side = plies % 2 === 1 ? 'white' : 'black';
  const undo = lastMover === view.you ? 1 : 2;
  return plies - undo >= (view.source === 'relay' ? 2 : 0);
}

/** How the game ended for this device. */
export type Verdict = 'win' | 'loss' | 'draw' | 'aborted' | 'unknown';

export function verdictOf(view: Pick<LiveGameView, 'result' | 'reason' | 'you'>): Verdict {
  if (view.reason === 'aborted' || view.reason === 'no-start') return 'aborted';
  if (view.result === '1/2-1/2') return 'draw';
  if (view.result === '1-0') return view.you === 'white' ? 'win' : 'loss';
  if (view.result === '0-1') return view.you === 'black' ? 'win' : 'loss';
  return 'unknown';
}

/** The end dialog's title. */
export function endTitle(verdict: Verdict): string {
  switch (verdict) {
    case 'win':
      return 'You won!';
    case 'loss':
      return 'You lost';
    case 'draw':
      return 'Draw';
    case 'aborted':
      return 'Game aborted';
    case 'unknown':
      return 'Game over';
  }
}

/** How the game ended, seen from this device's side, as a sentence. */
export function endSentence(
  view: Pick<LiveGameView, 'result' | 'reason' | 'you'>,
  opponentName: string,
): string {
  const verdict = verdictOf(view);
  switch (view.reason) {
    case 'checkmate':
      return 'By checkmate.';
    case 'time':
      // A flag against a side that cannot mate is a draw (lila's rule, kept by the relay).
      return verdict === 'draw'
        ? 'Drawn on time: the side with time left could not have mated.'
        : 'On time.';
    case 'resign':
      return verdict === 'loss' ? 'You resigned.' : `${opponentName} resigned.`;
    case 'agreement':
      return 'By agreement.';
    case 'abandoned':
      if (verdict === 'loss') return 'You left the game.';
      return verdict === 'draw'
        ? `Drawn: ${opponentName} left the game.`
        : `${opponentName} left the game.`;
    case 'aborted':
      return 'Aborted before both sides had moved.';
    case 'no-start':
      return 'Nobody moved in time.';
    case 'repetition':
      return 'By threefold repetition.';
    case 'fifty-moves':
      return 'By the fifty-move rule.';
    case 'insufficient':
      return 'Insufficient material.';
    case 'stalemate':
      return 'Stalemate.';
    case 'draw':
      return 'The game was drawn.';
    case 'other':
    case null:
      return 'The game has ended.';
  }
}

/** The end in one line for the game's status ("You won. By checkmate."). */
export function endSummary(
  view: Pick<LiveGameView, 'result' | 'reason' | 'you'>,
  opponentName: string,
): string {
  const verdict = verdictOf(view);
  const lead = verdict === 'win' ? 'You won' : endTitle(verdict);
  return `${lead}. ${endSentence(view, opponentName)}`;
}
