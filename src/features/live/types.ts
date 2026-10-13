/**
 * Live games: the shapes the waiting room, the game connections and the pages
 * share. A game is played through the relay (relay/src/live) or through
 * Lichess (its Board API); either way the page sees one `LiveGameView` and
 * acts through one `LiveGameSession`.
 */
import type { Army } from '../../../relay/src/live/army.mjs';
import type {
  ArbiterItem,
  DuelResult,
  JudgeItem,
  RacePuzzle,
  RaceResult,
} from '../../../relay/src/live/duelRules.mjs';
import type { Square } from 'chess.js';
import type { GameTree, TreeNode } from '@/chess/tree';
import type { Fen, MoveInput, Uci } from '@/chess/types';
import type { DrawShape } from '@/components/board/Board';
import type {
  AnalysisVariant,
  ArbiterPace,
  ColorChoice,
  DuelKind,
  GameKind,
  GameOptions,
  GroupKind,
  GroupOptions,
  PhraseId,
  RaceFormat,
  RaceRoomFormat,
  TimeControlSpec,
} from '../../../relay/src/live/shared.mjs';

export type {
  ArbiterItem,
  ArbiterPace,
  Army,
  ColorChoice,
  DuelKind,
  DuelResult,
  GameKind,
  GameOptions,
  JudgeItem,
  PhraseId,
  RaceFormat,
  RacePuzzle,
  TimeControlSpec,
};

/** The games played by the rules of chess: chess itself, blindfold, Army Draft and Chess960. */
export type ChessKind = Exclude<GameKind, DuelKind>;

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
  /** A correspondence invitation nobody took in time. */
  | 'expired'
  /** A draw Lichess does not explain further (repetition, fifty moves, agreement…). */
  | 'draw'
  /** Any other ending Lichess reports (a cheat detected, an unknown finish). */
  | 'other';

export type OfferKind = 'draw' | 'takeback' | 'rematch';
export type OfferOp = 'offer' | 'accept' | 'decline';

/** Army Draft's draft, as this device sees it. */
export interface LiveDraft {
  /** Points each side may spend. */
  budget: number;
  /** When the draft ends (`performance.now()`), while it is on: a random army for whoever has none. */
  deadline: number | null;
  /** Whose army is in. */
  ready: Record<Side, boolean>;
  /** The armies: only this device's own until both are in. */
  armies: Record<Side, Army | null>;
}

export interface LiveGameView {
  source: LiveSource;
  id: string;
  /** Chess, or a variant of it (always chess on Lichess). */
  game: ChessKind;
  opts: GameOptions;
  /**
   * The position the moves start from: Army Draft's armies, a Chess960 game's start; null for
   * the initial position.
   */
  startFen: string | null;
  /** Army Draft's draft (before the game and after it), or null. */
  draft: LiveDraft | null;
  /** A blindfold game's peeks so far, by side; null in a game that shows its pieces. */
  peeks: Record<Side, number> | null;
  /** The connection to the game: the board stays usable while it reconnects. */
  connection: 'connecting' | 'open' | 'reconnecting' | 'closed';
  /** No such game, or this device holds no seat in it: the page says so. */
  missing: boolean;
  /**
   * This device watches the game: it holds no seat, sends nothing, and sees the
   * game from White's side (`you` is then 'white').
   */
  watching: boolean;
  /** Which side this device plays (White when watching). */
  you: Side;
  white: LivePlayer;
  black: LivePlayer;
  /** The time control's id, "5+3". */
  tc: string;
  rated: boolean;
  /** The moves so far, in UCI ("e2e4", "e7e8q"), from `startFen` (or the initial position). */
  moves: string[];
  /**
   * The mover's time left after each move, in milliseconds, as the relay's room
   * keeps them for the record (games at once on the relay; none elsewhere).
   */
  clocks: number[];
  clock: LiveClock | null;
  /** Before both sides have moved: who must make a first move, and by when (performance.now()). */
  firstMove: { color: Side; deadline: number } | null;
  /** Army Draft's armies are being chosen; then the game is on, then over. */
  status: 'draft' | 'playing' | 'over';
  result: '1-0' | '0-1' | '1/2-1/2' | '*' | null;
  reason: LiveEndReason | null;
  /** The standing offer of each kind, by side. */
  offers: Record<OfferKind, Side | null>;
  /** Whether the opponent is connected to the game. */
  opponentPresent: boolean;
  /** Whether each player is connected to the game. */
  present: Record<Side, boolean>;
  /** How many watch the game (the relay's own games; 0 elsewhere). */
  watchers: number;
  /** A correspondence invitation's seat that nobody has taken yet. */
  open: Side | null;
  /** The seat this device has just taken, watching a correspondence invitation: its board is next. */
  joined: Side | null;
  /** When this device may claim the game against an opponent who left (performance.now()), or null. */
  claimAt: number | null;
  /** The phrases sent so far, oldest first, as text. */
  chat: { by: Side; text: string }[];
  /** A rematch to go to: the page of the next game. */
  next: { path: string } | null;
  /**
   * How many more rematches in a row the relay's room allows after this game, as its snapshot
   * says (`rematchesLeft`); at 0 the page offers a new game from Play instead. Null when not
   * known: on Lichess, or from a relay that does not say.
   */
  rematchesLeft: number | null;
  /**
   * The game's analysis room, once someone in the game asked for it (the relay's own games):
   * its id, and who asked (a player's side; null for someone watching).
   */
  analysis: { room: string; by: Side | null } | null;
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
  /** Army Draft: sends the army bought. */
  army(army: Army): void;
  /** Blindfold: counts a peek (the page shows the pieces for a moment). */
  peek(): void;
  /** Watching a correspondence invitation: takes its open seat, under this device's name. */
  join(): void;
  /**
   * Once the game is over: asks for its analysis room (the relay makes it, the same one for
   * everyone in the game). Resolves with the room's id; rejects with a sentence to show.
   */
  analyse(): Promise<string>;
  /** Ends the connection (the game itself goes on without this device). */
  close(): void;
}

/* ------------------------------------------------------------------ */
/* Duels                                                              */
/* ------------------------------------------------------------------ */

/** A timed race's progress of one player. */
export interface DuelProgress {
  /** The puzzle on now (the number done so far). */
  index: number;
  solved: number;
  strikes: number;
  done: boolean;
}

/** A round played: both results, who took it and the points. */
export interface DuelRound {
  round: number;
  results: Record<Side, DuelResult | null>;
  winner: Side | 'shared' | null;
  points: Record<Side, number>;
}

/** What a duel's rounds hold, by duel. */
export type DuelItems = RacePuzzle[] | ArbiterItem[] | JudgeItem[];

/**
 * A duel on the relay (relay/src/live/duel.mjs) from this device's seat: the
 * host (the poster, in the white seat) sends the rounds, the room runs them.
 */
export interface DuelView {
  id: string;
  connection: LiveGameView['connection'];
  missing: boolean;
  you: Side;
  /** This device sends the rounds. */
  host: boolean;
  white: LivePlayer;
  black: LivePlayer;
  game: DuelKind;
  opts: GameOptions;
  /** Waiting for the rounds and both players; then on; then over. */
  status: 'setup' | 'playing' | 'over';
  /** When the setup gives up (`performance.now()`), during it. */
  setupDeadline: number | null;
  items: DuelItems | null;
  /** The round on (in a timed race, the race itself: 0). */
  round: number;
  phase: 'countdown' | 'live' | 'reveal' | null;
  /** When the phase ends (`performance.now()`): the countdown's end, the round's, the result's. */
  phaseEnds: number | null;
  /** When the round went live (`performance.now()`), while it is. */
  liveSince: number | null;
  /** This device's result in the round on. */
  mine: DuelResult | null;
  /** The opponent's: a judgement shows only that it is in, until the round ends. */
  theirs: DuelResult | { locked: true } | null;
  rounds: DuelRound[];
  score: Record<Side, number>;
  /** A timed race's progress. */
  progress: Record<Side, DuelProgress> | null;
  result: LiveGameView['result'];
  reason: string | null;
  offers: { rematch: Side | null };
  opponentPresent: boolean;
  chat: LiveGameView['chat'];
  next: LiveGameView['next'];
  /** How many more rematches in a row the room allows after this duel (null: not known). */
  rematchesLeft: LiveGameView['rematchesLeft'];
  error: string | null;
  /** The host's device is getting the rounds ready. */
  preparing: boolean;
}

/** A report of this device's result: a round's, or one puzzle of a timed race. */
export type DuelReport =
  | { round: number; ok: boolean; ms: number }
  | { round: number; call: 'caught' | 'false' | 'missed'; ms: number }
  | { round: number; guess: number }
  | { index: number; ok: boolean; ms: number };

export interface DuelSession {
  getView(): DuelView;
  subscribe(listener: () => void): () => void;
  report(result: DuelReport): void;
  abort(): void;
  resign(): void;
  rematch(op: OfferOp): void;
  say(phrase: PhraseId): void;
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
  game: GameKind;
  opts: GameOptions;
  /** The time control of a game of chess (or a variant); null for a duel. */
  tc: string | null;
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
  /**
   * Its secret's (`seekIdOf`), so it stays the same across reconnections: the relay's seek and
   * the share link use it.
   */
  id: string;
  game: GameKind;
  opts: GameOptions;
  /** Null for a duel. */
  tc: string | null;
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
  /** What is played: chess, a variant, or a duel. */
  kind: GameKind;
  opts: GameOptions;
  color: Side;
  /** Null for a duel. */
  tc: string | null;
  opponent: LivePlayer;
  /** Date.now() when it was paired. */
  at: number;
  /** The game's page. */
  path: string;
}

export interface PostOptions {
  /** Chess when not given. */
  game?: GameKind;
  opts?: GameOptions;
  /** The time control of a game of chess (or a variant); a duel has none. */
  tc: string | null;
  color: ColorChoice;
  private: boolean;
  /** Post it on Lichess too (when signed in and the time control allows it). */
  lichess: { rated: boolean } | null;
}

/** An invitation to a correspondence game, just made: its board is where to go. */
export interface Invitation {
  game: string;
  path: string;
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
  /**
   * Posts a game (replacing this device's posted one), or pairs with a matching one at once.
   * Done when it resolves: at once, unless the post's id (made ahead) is still being made.
   */
  post(options: PostOptions): Promise<void>;
  cancel(): void;
  /** Joins a posted game by its id (from the list, or from a shared link). */
  join(seekId: string): void;
  /**
   * Makes a correspondence game by invitation ("3d": days a move): its room, at once. A game
   * of chess unless `game` says Chess960.
   */
  invite(options: { game?: GameKind; tc: string; color: ColorChoice }): void;
  /** The invitation just made, until the page goes to its board. */
  invited: Invitation | null;
  clearPairing(): void;
  clearInvited(): void;
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

/* ------------------------------------------------------------------ */
/* Group rooms: a puzzle race for up to eight, a game analysed together */
/* ------------------------------------------------------------------ */

export type { AnalysisVariant, GroupKind, GroupOptions, RaceResult, RaceRoomFormat };

/** A member of a group room, as everyone in it sees them. */
export interface GroupMember {
  /** The room's own id for them (8 characters), the same for everyone. */
  id: string;
  name: string;
  rating: number | null;
  /** Whether they are connected to the room. */
  here: boolean;
}

/**
 * A group room on the relay (relay/src/live/group.mjs) from this device: who
 * is in it, and the state of what they do there (the room's kind, `S`).
 */
export interface GroupView<S> {
  id: string;
  kind: GroupKind;
  connection: LiveGameView['connection'];
  /** No such room (gone, or never made): the page says so. */
  missing: boolean;
  /** This device's member id; null while it only looks at the room (it may join). */
  you: string | null;
  /** The host's member id. */
  host: string | null;
  /** The members, in the order they joined. */
  members: GroupMember[];
  /** Members a room takes at most. */
  max: number;
  /** The phrases sent so far, oldest first, as text (members see them). */
  chat: { by: string; text: string }[];
  /** The kind's state, once the room has said. */
  state: S | null;
  /** This device has asked to join, and the room has not answered yet. */
  joining: boolean;
  /** The last thing refused ("This room is full."), until the next change. */
  error: string | null;
}

/** A race room's options: rounds or three minutes, and the puzzles' rating. */
export interface RaceRoomOptions {
  format: RaceRoomFormat;
  level: number;
}

export interface RaceRoomRacer {
  id: string;
  name: string;
  rating: number | null;
}

/** A round of a race room played: every racer's result, and the points they scored. */
export interface RaceRoomRound {
  round: number;
  results: Record<string, RaceResult>;
  points: Record<string, number>;
}

/** A race in a room: the one on, or the last one. */
export interface RaceRoomRace {
  /** The races started in the room so far, this one included. */
  number: number;
  format: RaceRoomFormat;
  level: number;
  status: 'playing' | 'over';
  /** Who races: the members here when it started. */
  racers: RaceRoomRacer[];
  /** The puzzles, the same for everyone (empty when this device missed them). */
  items: RacePuzzle[];
  /** The round on (the timed race is one long round: 0). */
  round: number;
  phase: 'countdown' | 'live' | 'reveal' | null;
  /** When the phase ends (`performance.now()`). */
  phaseEnds: number | null;
  /** When the round went live (`performance.now()`), while it is. */
  liveSince: number | null;
  /** The round on: the results in so far, by member. */
  results: Record<string, RaceResult>;
  rounds: RaceRoomRound[];
  /** Points so far, by member (rounds). */
  scores: Record<string, number>;
  /** Each racer's progress (timed). */
  progress: Record<string, DuelProgress> | null;
  /** At the end: the places, best first (racers who tie share one). */
  places: { id: string; place: number }[] | null;
}

export interface RaceRoomState {
  /** The next race's options (the race on has its own). */
  opts: RaceRoomOptions;
  /** The races started so far. */
  count: number;
  race: RaceRoomRace | null;
}

export interface RaceRoomView extends GroupView<RaceRoomState> {
  /** This device, the host's, is dealing the puzzles of a race about to start. */
  dealing: boolean;
}

/** A report of this device's result: a round's, or one puzzle of the timed race. */
export type RaceRoomReport =
  { round: number; ok: boolean; ms: number } | { index: number; ok: boolean; ms: number };

export interface RaceRoomSession {
  getView(): RaceRoomView;
  subscribe(listener: () => void): () => void;
  /** Takes a place in the room, under this device's name. */
  join(): void;
  /** Gives the place up for good. */
  leave(): void;
  say(phrase: PhraseId): void;
  /** The host: the next race's options, for everyone to see. */
  setOptions(opts: RaceRoomOptions): void;
  /** The host: deals the puzzles and starts a race with the members here. */
  start(): void;
  report(result: RaceRoomReport): void;
  close(): void;
}

/** A change someone else made in an analysis room, for the line that says so. */
export interface AnalysisEvent {
  /** Counts up with every change, so the same words said twice are news twice. */
  seq: number;
  /** The member who made it. */
  by: string;
  /** What they did, after their name: "played 12. Nf3", "went back to the start". */
  words: string;
  /** A move of theirs, for its sound: the position it was played in, and the move (UCI). */
  move: { fen: Fen; uci: Uci } | null;
}

/** A game analysed together, as the room keeps it. */
export interface AnalysisRoomState {
  variant: AnalysisVariant;
  /** The room's moves as a tree; it changes in place, and `version` with it. */
  tree: GameTree;
  version: number;
  /** Each position by the room's id for it (the start is 0), and back. */
  nodes: ReadonlyMap<number, TreeNode>;
  ids: ReadonlyMap<TreeNode, number>;
  /** The shared position: the room's id of the node the followers are on. */
  at: number;
  /** The arrows and circles on each position, by the room's id. */
  shapes: ReadonlyMap<number, DrawShape[]>;
  /** The players and the result, when the room was made from a game. */
  white: string | null;
  black: string | null;
  result: string;
  /** The last change someone else made. */
  last: AnalysisEvent | null;
}

/** A move this device has played, on its way to the room: the board shows it at once. */
export interface AnalysisPending {
  /** The room's id of the position it was played in. */
  from: number;
  uci: Uci;
  /** The position after it, and its squares. */
  fen: Fen;
  lastMove: [Square, Square];
}

export interface AnalysisRoomView extends GroupView<AnalysisRoomState> {
  /** This device follows the shared position (on unless the player browses alone). */
  follow: boolean;
  /** The room's id of the position this device shows: the shared one while it follows. */
  viewed: number;
  pending: AnalysisPending | null;
}

export interface AnalysisRoomSession {
  getView(): AnalysisRoomView;
  subscribe(listener: () => void): () => void;
  /** Takes a place in the room, under this device's name. */
  join(): void;
  /** Gives the place up for good. */
  leave(): void;
  say(phrase: PhraseId): void;
  /** Following the shared position, or browsing alone (back on: to the shared position). */
  setFollow(on: boolean): void;
  /** Shows a position: following, the shared position goes there for everyone. */
  goTo(node: number): void;
  /**
   * Plays a move from the position shown: into the room's tree (a new variation, or the move
   * there already), and to it. False when it is not legal there.
   */
  play(move: MoveInput): boolean;
  /** The host: deletes a move and everything after it (the room takes it from nobody else). */
  remove(node: number): void;
  /** Makes a move's line the main line. */
  promote(node: number): void;
  /** Sets a position's arrows and circles (none: clears them). */
  draw(node: number, shapes: DrawShape[]): void;
  close(): void;
}
