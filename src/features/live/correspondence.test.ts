import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomId } from '../../../relay/src/live/shared.mjs';
import type { LiveGameView } from './types';

const DAY = 86_400_000;

function view(patch: Partial<LiveGameView> = {}): LiveGameView {
  return {
    source: 'relay',
    id: randomId(16),
    connection: 'open',
    missing: false,
    watching: false,
    you: 'white',
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: null },
    tc: '3d',
    rated: false,
    moves: ['e2e4', 'e7e5'],
    clocks: [],
    clock: { white: 2 * DAY, black: 3 * DAY, running: 'white', at: performance.now() },
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: false,
    present: { white: true, black: false },
    watchers: 0,
    open: null,
    joined: null,
    claimAt: null,
    chat: [],
    next: null,
    analysis: null,
    error: null,
    url: null,
    game: 'chess',
    opts: {},
    startFen: null,
    draft: null,
    peeks: null,
    capabilities: { phrases: true, rematch: true, takeback: true },
    ...patch,
  };
}

/** The module afresh, as a new start of the app reads it from storage. */
async function fresh() {
  vi.resetModules();
  return import('./correspondence');
}

beforeEach(() => {
  localStorage.clear();
});

describe('the list of correspondence games', () => {
  it('notes each game from its connection: whose move, by when, how it ended', async () => {
    const { noteCorrespondence, useCorrespondence, yourMove } = await fresh();
    const mine = view();
    noteCorrespondence(mine);
    const [game] = useCorrespondence.getState().games;
    expect(game).toMatchObject({
      id: mine.id,
      you: 'white',
      opponent: 'Swift Knight',
      tc: '3d',
      status: 'playing',
      turn: 'white',
      verdict: null,
      moves: 2,
    });
    expect(yourMove(game!)).toBe(true);
    expect(game!.deadline! - Date.now()).toBeGreaterThan(2 * DAY - 1000);
    expect(game!.deadline! - Date.now()).toBeLessThanOrEqual(2 * DAY);

    // An invitation nobody has taken: no opponent, nobody's move.
    const waiting = view({ open: 'black', moves: [], black: { name: '', rating: null } });
    noteCorrespondence(waiting);
    expect(useCorrespondence.getState().games.find((g) => g.id === waiting.id)).toMatchObject({
      status: 'waiting',
      opponent: '',
      turn: null,
      deadline: null,
    });

    // Over: how it went, from this side.
    noteCorrespondence({ ...mine, status: 'over', result: '0-1', reason: 'resign' });
    expect(useCorrespondence.getState().games.find((g) => g.id === mine.id)).toMatchObject({
      status: 'over',
      verdict: 'loss',
      turn: null,
      deadline: null,
    });
  });

  it('leaves out games watched, games played at once, and connections still waiting', async () => {
    const { noteCorrespondence, useCorrespondence } = await fresh();
    noteCorrespondence(view({ watching: true }));
    noteCorrespondence(view({ tc: '5+3' }));
    noteCorrespondence(view({ connection: 'connecting' }));
    noteCorrespondence(view({ missing: true }));
    expect(useCorrespondence.getState().games).toEqual([]);
  });

  it('lists your moves first, the nearest deadline first, then theirs, the invitations and the ended', async () => {
    const { noteCorrespondence, useCorrespondence } = await fresh();
    const at = performance.now();
    const theirs = view({ you: 'black', clock: { white: DAY, black: DAY, running: 'white', at } });
    const over = view({ status: 'over', result: '1-0', reason: 'checkmate' });
    const later = view({ clock: { white: 3 * DAY, black: DAY, running: 'white', at } });
    const sooner = view({ clock: { white: DAY / 2, black: DAY, running: 'white', at } });
    const invite = view({ open: 'black', moves: [] });
    for (const v of [theirs, over, later, invite, sooner]) noteCorrespondence(v);
    expect(useCorrespondence.getState().games.map((g) => g.id)).toEqual([
      sooner.id,
      later.id,
      theirs.id,
      invite.id,
      over.id,
    ]);
  });

  it('keeps the list on the device, and turns the bar on while it is your move', async () => {
    const first = await fresh();
    const mine = view();
    first.noteCorrespondence(mine);
    // The bar's switch of this start of the app (the modules were loaded afresh).
    const { useLiveBar } = await import('@/app/liveBar');
    expect(useLiveBar.getState().active).toBe(true);
    // A deadline seen again a moment later changes nothing.
    const games = first.useCorrespondence.getState().games;
    first.noteCorrespondence({ ...mine, clock: { ...mine.clock!, at: performance.now() - 5000 } });
    expect(first.useCorrespondence.getState().games).toBe(games);

    const again = await fresh();
    expect(again.useCorrespondence.getState().games.map((g) => g.id)).toEqual([mine.id]);
    again.forgetCorrespondence(mine.id);
    expect(again.useCorrespondence.getState().games).toEqual([]);
    const { useLiveBar: bar } = await import('@/app/liveBar');
    expect(bar.getState().active).toBe(false);
  });

  it('leaves the bar on as it loads at a start when a game may still be on', async () => {
    // A game at once kept from before the start: the bar comes on to check on it, and loading
    // the list (with nothing your move in it) must not take the bar away before it has.
    const seat = { seat: 'x'.repeat(43), color: 'white', at: Date.now() - 60_000 };
    localStorage.setItem('open-file:live-seats', JSON.stringify({ [randomId(16)]: seat }));
    await fresh();
    const { useLiveBar } = await import('@/app/liveBar');
    expect(useLiveBar.getState().active).toBe(true);
  });

  it('marks a Chess960 game, and reads one kept before the mark as chess', async () => {
    const { noteCorrespondence, useCorrespondence } = await fresh();
    const fischer = view({
      game: 'chess960',
      startFen: 'bbqnrknr/pppppppp/8/8/8/8/PPPPPPPP/BBQNRKNR w KQkq - 0 1',
      moves: ['g1h3', 'g8h6'],
    });
    noteCorrespondence(fischer);
    expect(useCorrespondence.getState().games[0]).toMatchObject({ id: fischer.id, chess960: true });

    const id = randomId(16);
    const kept = { id, you: 'black', opponent: 'Calm Rook', tc: '2d', status: 'playing' };
    localStorage.setItem('open-file:live-correspondence', JSON.stringify([kept]));
    expect((await fresh()).useCorrespondence.getState().games).toMatchObject([
      { id, chess960: false },
    ]);
  });

  it('keeps only the games this device still holds a seat in', async () => {
    const { keepCorrespondence, noteCorrespondence, useCorrespondence } = await fresh();
    const a = view();
    const b = view();
    noteCorrespondence(a);
    noteCorrespondence(b);
    keepCorrespondence(new Set([b.id]));
    expect(useCorrespondence.getState().games.map((g) => g.id)).toEqual([b.id]);
  });

  it('ignores what storage holds that is no game', async () => {
    localStorage.setItem(
      'open-file:live-correspondence',
      JSON.stringify([{ id: 'short', tc: '3d' }, { id: randomId(16), tc: '5+3' }, 42]),
    );
    expect((await fresh()).useCorrespondence.getState().games).toEqual([]);
    localStorage.setItem('open-file:live-correspondence', 'not json');
    expect((await fresh()).useCorrespondence.getState().games).toEqual([]);
  });
});
