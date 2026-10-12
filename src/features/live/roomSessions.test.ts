import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveBar } from '@/app/liveBar';
import { type FakeLiveRelay, installFakeLiveRelay } from '@/test/fakeLiveHub';
import { DUEL_RULES } from '../../../relay/src/live/shared.mjs';
import { useLivePrefs } from './prefs';
import {
  checkOnRooms,
  closeRooms,
  getAnalysisRoom,
  getRaceRoom,
  useActiveRooms,
  VISIT_LINGER_MS,
} from './roomSessions';
import { makeGroupRoom, membershipOf, rememberMembership } from './rooms';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let relay: FakeLiveRelay;

beforeEach(() => {
  localStorage.clear();
  relay = installFakeLiveRelay();
  useLivePrefs.getState().update({ name: 'Patient Bishop', showRating: false });
});

afterEach(() => {
  closeRooms();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function makeRoom(): Promise<string> {
  const made = makeGroupRoom('race', { format: 'rounds', level: 1500 });
  await relay.settle();
  return made;
}

describe('the group rooms’ connections', () => {
  it('are one per room, and lead the bar back to a room this device is in', async () => {
    expect(getRaceRoom('not a room')).toBeNull();
    const id = await makeRoom();
    const session = getRaceRoom(id)!;
    expect(getRaceRoom(id)).toBe(session);
    await relay.settle();
    expect(useActiveRooms.getState().rooms).toEqual([
      { id, kind: 'race', path: `/play/race/${id}`, racing: false },
    ]);
    expect(useLiveBar.getState().active).toBe(true);

    // A race on with this device in it: the bar says so.
    const guest = relay.groupClient(id);
    await guest.send({ t: 'hello' });
    await guest.send({ t: 'join', name: 'Swift Knight', rating: null });
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `pz${i}00`,
      fen: START,
      moves: 'e2e4 e7e5 g1f3 b8c6',
      rating: 1500,
    }));
    relay
      .openSockets(`/v1/rooms/${id}`)[0]!
      .send(JSON.stringify({ t: 'start', opts: { format: 'rounds', level: 1500 }, items }));
    await relay.settle();
    expect(useActiveRooms.getState().rooms[0]?.racing).toBe(true);
    await relay.advance(DUEL_RULES.countdownMs);

    // Leaving: no room to lead back to.
    session.leave();
    await relay.settle();
    expect(useActiveRooms.getState().rooms).toEqual([]);
    expect(useLiveBar.getState().active).toBe(false);
    expect(membershipOf(id)).toBeNull();
  });

  it('lets a room only looked at go a minute after nothing shows it', async () => {
    const id = await makeRoom();
    localStorage.clear();
    const session = getRaceRoom(id)!;
    const off = session.subscribe(() => undefined);
    await relay.settle();
    expect(session.getView().you).toBeNull();
    expect(useActiveRooms.getState().rooms).toEqual([]);
    vi.useFakeTimers();
    off();
    vi.advanceTimersByTime(VISIT_LINGER_MS);
    expect(getRaceRoom(id)).not.toBe(session);
  });

  it('finds the rooms this device is in after a restart, and forgets those gone', async () => {
    const id = await makeRoom();
    const made = makeGroupRoom('analysis', { fen: START, moves: 'e2e4' });
    await relay.settle();
    const analysis = await made;
    const gone = 'G'.repeat(22);
    rememberMembership(gone, 'x'.repeat(43), 'race');
    checkOnRooms();
    await relay.settle();
    expect(useActiveRooms.getState().rooms).toEqual([
      { id, kind: 'race', path: `/play/race/${id}`, racing: false },
      { id: analysis, kind: 'analysis', path: `/analyze/together/${analysis}`, racing: false },
    ]);
    expect(
      getAnalysisRoom(analysis)
        ?.getView()
        .state?.tree.mainLine()
        .map((n) => n.san),
    ).toEqual(['e4']);
    expect(membershipOf(gone)).toBeNull();
    expect(membershipOf(id)).not.toBeNull();
  });
});
