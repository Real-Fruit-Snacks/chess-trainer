import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { gameNotice, gameNotices, pairingNotice } from './notify';
import type { LiveGameView } from './types';

const showNotice = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock('@/features/notifications/notices', () => ({ showNotice }));

const ID = 'abcdefABCDEF0123';

function view(patch: Partial<LiveGameView> = {}): LiveGameView {
  return {
    source: 'relay',
    id: ID,
    connection: 'open',
    missing: false,
    watching: false,
    you: 'white',
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: null },
    tc: '5+3',
    rated: false,
    moves: ['e2e4'],
    clocks: [],
    clock: null,
    firstMove: null,
    status: 'playing',
    result: null,
    reason: null,
    offers: { draw: null, takeback: null, rematch: null },
    opponentPresent: true,
    present: { white: true, black: true },
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

const seen = (v: LiveGameView) => ({ plies: v.moves.length, status: v.status, open: v.open });

beforeEach(() => {
  showNotice.mockClear();
  useSettings.setState({ ...DEFAULT_SETTINGS, notifyLive: true, notifyCorrespondence: true });
});

describe('a game’s notices', () => {
  it('tell of the opponent’s move, not your own', () => {
    const before = view();
    expect(gameNotice(seen(before), view({ moves: ['e2e4', 'g8f6'] }))).toEqual({
      title: 'Your move against Swift Knight',
      body: 'Swift Knight played Nf6.',
      url: `play/online/${ID}`,
      tag: ID,
    });
    expect(gameNotice(seen(view({ moves: [] })), before)).toBeNull();
    // Black, after a drafted start: whoever moved last is read from the position.
    const drafted = 'r3k3/pppp4/8/8/8/8/PPPP4/R3K3 w - - 0 1';
    expect(
      gameNotice(
        seen(view({ moves: [], startFen: drafted })),
        view({ moves: ['a2a4'], startFen: drafted, you: 'black', game: 'army' }),
      ),
    ).toMatchObject({
      title: 'Your move against Patient Bishop',
      body: 'Patient Bishop played a4.',
      url: `play/online/${ID}`,
    });
  });

  it('tell of the end, and of an invitation taken', () => {
    const over = view({
      moves: ['e2e4', 'e7e5'],
      status: 'over',
      result: '0-1',
      reason: 'resign',
    });
    expect(gameNotice(seen(view()), over)).toMatchObject({
      title: 'Game over against Swift Knight',
      body: 'You lost. You resigned.',
    });
    const waiting = view({ tc: '3d', moves: [], open: 'black', black: { name: '', rating: null } });
    expect(gameNotice(seen(waiting), view({ tc: '3d', moves: [] }))).toMatchObject({
      title: 'Swift Knight took your invitation',
      body: 'The game is on: your move.',
    });
    expect(
      gameNotice(
        seen(waiting),
        view({
          tc: '3d',
          moves: [],
          status: 'over',
          result: '*',
          reason: 'expired',
          open: 'black',
          black: { name: '', rating: null },
        }),
      ),
    ).toMatchObject({
      title: 'Your invitation',
      body: 'Game aborted. Nobody took the invitation in time.',
    });
  });

  it('say nothing of the game as it loads, nor while their switch is off', () => {
    const follow = gameNotices();
    follow(view({ connection: 'connecting', moves: [] }));
    follow(view({ moves: ['e2e4', 'e7e5'] }));
    expect(showNotice).not.toHaveBeenCalled();
    follow(view({ moves: ['e2e4', 'e7e5', 'g1f3'] }));
    expect(showNotice).not.toHaveBeenCalled();
    follow(view({ moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] }));
    expect(showNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Your move against Swift Knight',
        body: 'Swift Knight played Nc6.',
      }),
    );

    // Correspondence games follow their own switch.
    useSettings.setState({ notifyLive: true, notifyCorrespondence: false });
    showNotice.mockClear();
    const corr = gameNotices();
    corr(view({ tc: '3d' }));
    corr(view({ tc: '3d', moves: ['e2e4', 'e7e5'] }));
    expect(showNotice).not.toHaveBeenCalled();
    useSettings.setState({ notifyCorrespondence: true });
    corr(view({ tc: '3d', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] }));
    expect(showNotice).toHaveBeenCalledTimes(1);
  });

  it('tell the poster their game is on', () => {
    pairingNotice({
      source: 'relay',
      game: ID,
      kind: 'chess',
      opts: {},
      color: 'white',
      tc: '5+3',
      opponent: { name: 'Swift Knight', rating: null },
      at: Date.now(),
      path: `/play/online/${ID}`,
    });
    expect(showNotice).toHaveBeenCalledWith({
      title: 'Your game is on',
      body: 'Swift Knight took your game.',
      url: `play/online/${ID}`,
      tag: ID,
    });
    useSettings.setState({ notifyLive: false });
    pairingNotice({
      source: 'lichess',
      game: 'abcdefgh',
      kind: 'chess',
      opts: {},
      color: 'black',
      tc: '5+3',
      opponent: { name: 'someone', rating: 1800 },
      at: Date.now(),
      path: '/play/online/lichess/abcdefgh',
    });
    expect(showNotice).toHaveBeenCalledTimes(1);
  });
});
