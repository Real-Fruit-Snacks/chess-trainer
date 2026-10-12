import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chess960StartFen } from '@/chess/chess960';
import { START_FEN } from '@/chess/helpers';
import { GameTree } from '@/chess/tree';
import { type FakeLiveRelay, installFakeLiveRelay } from '@/test/fakeLiveHub';
import { ANALYSIS_ROOM, groupOptions } from '../../../relay/src/live/shared.mjs';
import { analysisOptionsFor, createAnalysisRoom } from './analysisRoom';
import { useLivePrefs } from './prefs';
import { makeGroupRoom } from './rooms';
import type { AnalysisRoomSession, AnalysisRoomState } from './types';

let relay: FakeLiveRelay;
const sessions: AnalysisRoomSession[] = [];

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  useLivePrefs.getState().update({ name: 'Patient Bishop', showRating: false });
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A room made on this device from `pgn`, its session open, and a friend in it. */
async function room(pgn = '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6') {
  const tree = GameTree.fromPgn(pgn);
  const made = makeGroupRoom('analysis', analysisOptionsFor(tree));
  await relay.settle();
  const id = await made;
  const session = createAnalysisRoom(id);
  sessions.push(session);
  await relay.settle();
  const friend = relay.groupClient(id);
  await friend.send({ t: 'hello' });
  await friend.send({ t: 'join', name: 'Swift Knight', rating: null });
  await relay.settle();
  return { id, session, friend, friendId: friend.last('joined')!.member as string };
}

const state = (session: AnalysisRoomSession) => session.getView().state as AnalysisRoomState;

/** The room's id of the node reached by `sans` from the start. */
function idOf(session: AnalysisRoomSession, sans: string[]): number {
  const s = state(session);
  let node = s.tree.root;
  for (const san of sans) {
    const next = node.children.find((child) => child.san === san);
    if (!next) throw new Error(`No ${san} after ${node.san || 'the start'}`);
    node = next;
  }
  return s.ids.get(node)!;
}

/** What this device sent to the room, its kind's messages only. */
const sent = (id: string) =>
  relay
    .openSockets(`/v1/rooms/${id}`)
    .flatMap((socket) => socket.sentMessages())
    .filter((m) => !['hello', 'join', 'say', 'leave'].includes(m.t as string));

describe('the options of a room made from the analysis board', () => {
  it('carry the game with its variations, and the players only by the app’s names', () => {
    const tree = GameTree.fromPgn(
      '[White "Calm Rook"]\n[Black "Garry Kasparov"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5 2. Nf3 (2. Nc3)) 2. Nf3 1-0',
    );
    expect(analysisOptionsFor(tree)).toEqual({
      variant: 'standard',
      fen: START_FEN,
      moves: 'e2e4 e7e5 ( c7c5 g1f3 ( b1c3 ) ) g1f3',
      result: '1-0',
      white: 'Calm Rook',
    });
    const fischer = GameTree.fromPgn(
      `[Variant "Chess960"]\n[FEN "${chess960StartFen(192)}"]\n\n1. Nf3 Nf6 2. O-O`,
    );
    expect(analysisOptionsFor(fischer)).toMatchObject({
      variant: 'chess960',
      moves: 'g1f3 g8f6 f1h1',
    });
  });

  it('keep the main line alone when the variations would not fit a room', () => {
    const tree = new GameTree();
    const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    for (let i = 0; i < ANALYSIS_ROOM.nodes / 4 + 1; i++) {
      for (const san of shuffle) tree.addMove(san);
    }
    tree.goStart();
    tree.addMove('e4');
    const opts = analysisOptionsFor(tree);
    expect(opts.moves).not.toContain('(');
    expect(opts.moves?.split(' ')).toHaveLength(ANALYSIS_ROOM.depth);
    expect(groupOptions('analysis', opts)).not.toBeNull();
  });
});

describe('an analysis room on this device', () => {
  it('shows the room’s tree and follows the shared position as the others move it', async () => {
    const { session, friend, friendId } = await room();
    const s = state(session);
    expect(s.tree.mainLine().map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(s.tree.root.children[0]?.children.map((n) => n.san)).toEqual(['e5', 'c5']);
    expect(session.getView()).toMatchObject({ follow: true, viewed: 0, pending: null });

    // The friend plays a new move from 1. e4: it joins the tree, and this board follows.
    await friend.send({ t: 'move', node: idOf(session, ['e4']), uci: 'e7e6' });
    await relay.settle();
    const e6 = idOf(session, ['e4', 'e6']);
    expect(session.getView()).toMatchObject({ viewed: e6 });
    expect(state(session).at).toBe(e6);
    expect(state(session).last).toMatchObject({ by: friendId, words: 'played 1… e6' });

    await friend.send({ t: 'at', node: 0 });
    await relay.settle();
    expect(session.getView().viewed).toBe(0);
    expect(state(session).last?.words).toBe('went back to the start');
  });

  it('plays this device’s moves at once, and moves everyone following with them', async () => {
    const { id, session, friend } = await room();
    expect(session.play({ from: 'd2', to: 'd4' })).toBe(true);
    expect(session.getView().pending).toMatchObject({ from: 0, uci: 'd2d4' });
    // An illegal move, or a second one before the first has landed, is not played.
    expect(session.play({ from: 'e7', to: 'e5' })).toBe(false);
    await relay.settle();
    const d4 = idOf(session, ['d4']);
    expect(session.getView()).toMatchObject({ pending: null, viewed: d4 });
    expect(sent(id)).toEqual([{ t: 'move', node: 0, uci: 'd2d4', go: true }]);
    expect(friend.last('added')).toMatchObject({ node: [d4, 0, 'd2d4'], at: true });

    // A move the tree has already is a step to it (sent once the room's limits allow).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    session.goTo(0);
    expect(session.play({ from: 'e2', to: 'e4' })).toBe(true);
    const e4 = idOf(session, ['e4']);
    expect(session.getView().viewed).toBe(e4);
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await relay.settle();
    expect(sent(id).slice(1)).toEqual([
      { t: 'at', node: 0 },
      { t: 'at', node: e4 },
    ]);
    expect(session.getView()).toMatchObject({ viewed: e4, pending: null });
  });

  it('sends a run of steps no faster than the room takes them, the last one always', async () => {
    const { id, session, friend } = await room();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const e4 = idOf(session, ['e4']);
    const e5 = idOf(session, ['e4', 'e5']);
    const nf3 = idOf(session, ['e4', 'e5', 'Nf3']);
    session.goTo(e4);
    session.goTo(e5);
    session.goTo(nf3);
    // This board is there at once; the room hears of the first step, then of the last.
    expect(session.getView().viewed).toBe(nf3);
    expect(sent(id)).toEqual([{ t: 'at', node: e4 }]);
    vi.advanceTimersByTime(300);
    expect(sent(id)).toEqual([
      { t: 'at', node: e4 },
      { t: 'at', node: nf3 },
    ]);
    vi.useRealTimers();
    await relay.settle();
    expect(friend.last('at')).toMatchObject({ node: nf3 });
    expect(session.getView().viewed).toBe(nf3);

    // Out and straight back before the room has heard: back is a step too, or the room stays out.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.advanceTimersByTime(1000);
    session.goTo(e4);
    session.goTo(nf3);
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await relay.settle();
    expect(sent(id).slice(-2)).toEqual([
      { t: 'at', node: e4 },
      { t: 'at', node: nf3 },
    ]);
    expect(friend.last('at')).toMatchObject({ node: nf3 });
  });

  it('browses alone, adding moves without moving the others, and comes back', async () => {
    const { id, session, friend } = await room();
    session.setFollow(false);
    session.goTo(idOf(session, ['e4', 'c5']));
    await relay.settle();
    expect(sent(id)).toEqual([]);
    expect(session.play({ from: 'b1', to: 'c3' })).toBe(true);
    await relay.settle();
    // The move went to the tree; the shared position stayed at the start.
    const nc3 = idOf(session, ['e4', 'c5', 'Nc3']);
    expect(sent(id)).toEqual([
      { t: 'move', node: idOf(session, ['e4', 'c5']), uci: 'b1c3', go: false },
    ]);
    expect(session.getView()).toMatchObject({ follow: false, viewed: nc3 });
    expect(state(session).at).toBe(0);

    // The others move on: this board stays where it is.
    await friend.send({ t: 'move', node: 0, uci: 'd2d4' });
    await relay.settle();
    expect(session.getView().viewed).toBe(nc3);

    // Someone deletes the line this board is on: it goes to what is left of it.
    await friend.send({ t: 'delete', node: idOf(session, ['e4', 'c5']) });
    await relay.settle();
    expect(session.getView().viewed).toBe(idOf(session, ['e4']));
    expect(state(session).last?.words).toBe('deleted 1… c5 and the moves after it');

    session.setFollow(true);
    expect(session.getView()).toMatchObject({ follow: true, viewed: idOf(session, ['d4']) });
  });

  it('draws for everyone, makes a line the main line, and shows a refusal', async () => {
    const { id, session, friend } = await room();
    const e4 = idOf(session, ['e4']);
    session.draw(e4, [
      { orig: 'g1', dest: 'f3', brush: 'green' },
      { orig: 'd5', brush: 'red' },
      // A brush the room does not keep is left out.
      { orig: 'a1', brush: 'paleBlue' },
    ]);
    await relay.settle();
    expect(friend.last('shapes')).toMatchObject({
      node: e4,
      shapes: [
        { orig: 'g1', dest: 'f3', brush: 'green' },
        { orig: 'd5', brush: 'red' },
      ],
    });
    expect(state(session).shapes.get(e4)).toHaveLength(2);
    await friend.send({ t: 'shapes', node: e4, shapes: [] });
    await relay.settle();
    expect(state(session).shapes.has(e4)).toBe(false);
    expect(state(session).last?.words).toBe('cleared the drawing on the position after 1. e4');

    session.promote(idOf(session, ['e4', 'c5', 'Nf3']));
    await relay.settle();
    expect(
      state(session)
        .tree.mainLine()
        .map((n) => n.san),
    ).toEqual(['e4', 'c5', 'Nf3']);

    // The friend deletes 1… c5 as this device asks for it to go: the room refuses, and says so.
    const c5 = idOf(session, ['e4', 'c5']);
    await friend.send({ t: 'delete', node: c5 });
    session.remove(c5);
    await relay.settle();
    expect(session.getView().error).toBe('That move is no longer in the analysis.');
    expect(sent(id).map((m) => m.t)).toEqual(['shapes', 'promote', 'delete']);
  });

  it('lets someone only looking browse, but not change, the analysis', async () => {
    const { id } = await room();
    localStorage.clear();
    const looking = createAnalysisRoom(id);
    sessions.push(looking);
    await relay.settle();
    expect(looking.getView().you).toBeNull();
    looking.goTo(idOf(looking, ['e4']));
    expect(looking.getView()).toMatchObject({ follow: false, viewed: idOf(looking, ['e4']) });
    expect(looking.play({ from: 'g8', to: 'f6' })).toBe(false);
    expect(looking.getView().error).toBe('Join the room to add moves.');
  });

  it('says so when the room has gone', async () => {
    const session = createAnalysisRoom('Q'.repeat(22));
    sessions.push(session);
    await relay.settle();
    expect(session.getView()).toMatchObject({ missing: true, state: null });
  });
});
