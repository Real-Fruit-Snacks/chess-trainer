/**
 * Live games: the shapes the waiting room, the game connections and the pages
 * share. A game is played through the relay (relay/src/live) or through
 * Lichess (its Board API); either way the page sees one `LiveGameView` and
 * acts through one `LiveGameSession`.
 */
import type { ColorChoice, PhraseId, TimeControlSpec } from '../../../relay/src/live/shared.mjs';

export type { ColorChoice, PhraseId, TimeControlSpec };

export type Side = 'white' | 'black';

/** Where a game is played: the app's own relay, or Lichess. */
export type LiveSource = 'relay' | 'lichess';

export interface LivePlayer {
  name: string;
  /** The rating shown beside the name: a puzzle rating in the app's own games, Lichess's on Lichess. */
  rating: number | null;
  /** A Lichess title (GM, IM…), when the player has one. */
  title?: string | null;
}

/**
 * Both clocks as they were when a message arrived: `at` is `performance.now()`
 * at that moment, and the `running` side's time counts down from then.
 */
export interface LiveClock {
  white: number;
  black: number;
  running: Side | null;
  at: number;
}

export type LiveEndReason =
  | 'checkmate'
  | 'resign'
  | 'time'
  | 'stalemate'
  | 'insufficient'
  | 'repetition'
  | 'fifty-moves'
  | 'agreement'
  /** The other player left and the game was claimed (a win, or a draw: see the result). */
  | 'abandoned'
  /** Aborted before both sides had moved. */
  | 'aborted'
  /** Nobody made the first move in time. */
  | 'no-start'
  /** A draw Lichess does not explain further (repetition, fifty moves, agreement…). */
  | 'draw'
  /** Any other ending Lichess reports (a cheat detected, an unknown finish). */
  | 'other';

export type OfferKind = 'draw' | 'takeback' | 'rematch';
export type OfferOp = 'offer' | 'accept' | 'decline';

export interface LiveGameView {
  source: LiveSource;
  id: string;
  /** The connection to the game: the board stays usable while it reconnects. */
  connection: 'connecting' | 'open' | 'reconnecting' | 'closed';
  /** No such game, or this device holds no seat in it: the page says so. */
  missing: boolean;
  /** Which side this device plays. */
  you: Side;
  white: LivePlayer;
  black: LivePlayer;
  /** The time control's id, "5+3". */
  tc: string;
  rated: boolean;
  /** The moves so far, in UCI ("e2e4", "e7e8q"), from the initial position. */
  moves: string[];
  clock: LiveClock | null;
  /** Before both sides have moved: who must make a first move, and by when (performance.now()). */
  firstMove: { color: Side; deadline: number } | null;
  status: 'playing' | 'over';
  result: '1-0' | '0-1' | '1/2-1/2' | '*' | null;
  reason: LiveEndReason | null;
  /** The standing offer of each kind, by side. */
  offers: Record<OfferKind, Side | null>;
  /** Whether the opponent is connected to the game. */
  opponentPresent: boolean;
  /** When this device may claim the game against an opponent who left (performance.now()), or null. */
  claimAt: number | null;
  /** The phrases sent so far, oldest first, as text. */
  chat: { by: Side; text: string }[];
  /** A rematch to go to: the page of the next game. */
  next: { path: string } | null;
  /** The last thing refused ("That move is not legal."), until the next change. */
  error: string | null;
  /** The game on Lichess, for Lichess games. */
  url: string | null;
  /** What the source offers: phrases and rematches are the relay's only. */
  capabilities: { phrases: boolean; rematch: boolean; takeback: boolean };
}

/**
 * One game's connection, shared by everything that shows it. React reads it
 * with `useSyncExternalStore(session.subscribe, session.getView)`: `getView`
 * returns the same object until something changes.
 */
export interface LiveGameSession {
  getView(): LiveGameView;
  subscribe(listener: () => void): () => void;
  /** Plays a move (UCI) at once on this board, and sends it. */
  move(uci: string): void;
  resign(): void;
  abort(): void;
  draw(op: OfferOp): void;
  takeback(op: OfferOp): void;
  rematch(op: OfferOp): void;
  claim(op: 'win' | 'draw'): void;
  say(phrase: PhraseId): void;
  /** Ends the connection (the game itself goes on without this device). */
  close(): void;
}

/* ------------------------------------------------------------------ */
/* The waiting room                                                   */
/* ------------------------------------------------------------------ */

export type LobbyConnection =
  /** Not connected: nothing needs the waiting room. */
  | 'idle'
  | 'connecting'
  | 'open'
  /** Lost: trying again after a pause. */
  | 'retrying'
  /** This build has no relay, or the relay has no live games. */
  | 'unavailable';

/** A game someone posted, as the waiting room lists it. */
export interface OpenGame {
  id: string;
  tc: string;
  color: ColorChoice;
  name: string;
  rating: number | null;
}

export type LichessSeekStatus =
  /** Not looking on Lichess. */
  | 'off'
  /** Checking that the Lichess sign-in may play. */
  | 'checking'
  | 'posting'
  | 'posted'
  /** The sign-in lacks the permission to play: connect Lichess again. */
  | 'needs-permission'
  /** Not signed in to Lichess (any more). */
  | 'signed-out'
  /** Lichess does not take this time control from apps (faster than rapid). */
  | 'not-allowed'
  | 'failed';

/** The game this device has posted. */
export interface MySeek {
  /** Stays the same across reconnections: the relay's seek and the share link use it. */
  id: string;
  tc: string;
  color: ColorChoice;
  private: boolean;
  /** When it was posted (Date.now()). */
  postedAt: number;
  /** In the app's own waiting room. */
  relay: 'posting' | 'posted' | 'failed';
  /** On Lichess as well. */
  lichess: { status: LichessSeekStatus; rated: boolean; message: string | null };
}

/** A game that has just been paired, until something takes this device to it. */
export interface Pairing {
  source: LiveSource;
  game: string;
  color: Side;
  tc: string;
  opponent: LivePlayer;
  /** Date.now() when it was paired. */
  at: number;
  /** The game's page. */
  path: string;
}

export interface PostOptions {
  tc: string;
  color: ColorChoice;
  private: boolean;
  /** Post it on Lichess too (when signed in and the time control allows it). */
  lichess: { rated: boolean } | null;
}

export interface LobbyState {
  connection: LobbyConnection;
  /** The public games waiting, oldest first (this device's own left out). */
  seeks: OpenGame[];
  /** Sockets in the waiting room, this one included. */
  players: number;
  mine: MySeek | null;
  pairing: Pairing | null;
  /** Something to tell the player once ("That game is no longer open."). */
  notice: string | null;
  /** The waiting room page is showing: stay connected while the returned function is not called. */
  watch(): () => void;
  /** Posts a game (replacing this device's posted one), or pairs with a matching one at once. */
  post(options: PostOptions): void;
  cancel(): void;
  /** Joins a posted game by its id (from the list, or from a shared link). */
  join(seekId: string): void;
  clearPairing(): void;
  clearNotice(): void;
}

/* ------------------------------------------------------------------ */
/* The player's choices                                               */
/* ------------------------------------------------------------------ */

export interface LivePrefs {
  /** The generated name this device plays under ("Patient Bishop"). */
  name: string;
  /** Show the puzzle rating beside the name. */
  showRating: boolean;
  /** Also look for an opponent on Lichess. */
  lichess: boolean;
  /** Lichess games rated (they are casual otherwise). */
  lichessRated: boolean;
  /** The colour asked for last. */
  color: ColorChoice;
  /** The time control posted last. */
  tc: string;
}
