import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '@/lib/random';
import { useProgress } from '@/store/progress';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { callWindowMs, leadInMs, replayGame, stepMs } from './arbiter';
import { FALSE_ALARM_PAUSE_MS, useArbiter } from './useArbiter';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

const GAMES = CLASSIC_GAMES.map(replayGame);

function setup(seed = 1) {
  const random = seededRandom(seed);
  return renderHook(() => useArbiter(GAMES, 'normal', random));
}

type Hook = ReturnType<typeof setup>['result'];

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Lets the round play until its illegal move is on the board. */
function untilIllegal(result: Hook) {
  const round = result.current.round;
  advance(leadInMs(round, 'normal'));
  const lead = result.current.current?.lead.length ?? 0;
  for (let i = 1; i <= lead; i++) advance(stepMs(round, 'normal'));
  expect(result.current.shown).toBe(lead + 1);
}

describe('useArbiter', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the start position, then the real moves one by one, then the illegal one', () => {
    const { result } = setup();
    act(() => result.current.start());
    expect(result.current.phase).toBe('watching');
    const round = result.current.current;
    if (!round) throw new Error('no round');
    expect(result.current.fen).toBe(round.startFen);
    expect(result.current.move).toBeNull();
    advance(leadInMs(1, 'normal'));
    expect(result.current.shown).toBe(1);
    expect(result.current.fen).toBe(round.lead[0]?.fen);
    expect(result.current.move?.san).toBe(round.lead[0]?.san);
    for (let i = 2; i <= round.lead.length; i++) advance(stepMs(1, 'normal'));
    advance(stepMs(1, 'normal'));
    expect(result.current.fen).toBe(round.illegal.fen);
    expect(result.current.lastMove).toEqual([round.illegal.from, round.illegal.to]);
    expect(result.current.move?.san).toBe(round.illegal.san);
  });

  it('counts a call on the illegal move as a catch, with how long it took', () => {
    const { result } = setup();
    act(() => result.current.start());
    untilIllegal(result);
    advance(300);
    act(() => result.current.call());
    expect(result.current.phase).toBe('verdict');
    expect(result.current.verdict).toEqual({ outcome: 'caught', reactionMs: 300 });
    expect(result.current.caught).toBe(1);
    expect(result.current.strikes).toBe(0);
    expect(result.current.fastestMs).toBe(300);
    // A late second call changes nothing.
    act(() => result.current.call());
    expect(result.current.caught).toBe(1);
    act(() => result.current.next());
    expect(result.current.round).toBe(2);
    expect(result.current.phase).toBe('watching');
  });

  it('strikes once for an illegal move left to pass', () => {
    const { result } = setup();
    act(() => result.current.start());
    untilIllegal(result);
    advance(callWindowMs(1, 'normal'));
    expect(result.current.phase).toBe('verdict');
    expect(result.current.verdict).toEqual({ outcome: 'missed' });
    expect(result.current.strikes).toBe(1);
  });

  it('strikes once for a legal move called, however often, and plays on after a pause', () => {
    const { result } = setup();
    act(() => result.current.start());
    // Before the first move there is nothing to call.
    act(() => result.current.call());
    expect(result.current.strikes).toBe(0);
    advance(leadInMs(1, 'normal'));
    act(() => result.current.call());
    act(() => result.current.call());
    expect(result.current.strikes).toBe(1);
    expect(result.current.falseAlarm?.san).toBe(result.current.current?.lead[0]?.san);
    expect(result.current.phase).toBe('watching');
    // The replay holds still while the answer shows, then goes on.
    advance(FALSE_ALARM_PAUSE_MS - 1);
    expect(result.current.shown).toBe(1);
    advance(1);
    expect(result.current.shown).toBe(2);
    expect(result.current.falseAlarm).toBeNull();
  });

  it('ends the run on the third strike and records the catches', () => {
    const { result } = setup(4);
    act(() => result.current.start());
    untilIllegal(result);
    act(() => result.current.call());
    for (let strike = 1; strike <= 3; strike++) {
      act(() => result.current.next());
      untilIllegal(result);
      advance(callWindowMs(result.current.round, 'normal'));
      expect(result.current.strikes).toBe(strike);
    }
    expect(result.current.phase).toBe('verdict');
    act(() => result.current.next());
    expect(result.current.phase).toBe('over');
    expect(useProgress.getState().arcade.arbiter).toMatchObject({
      best: 1,
      plays: 1,
      detail: '1 illegal move caught',
    });
  });

  it('ends at once when the third strike is a legal move called', () => {
    const { result } = setup();
    act(() => result.current.start());
    for (let strike = 1; strike <= 2; strike++) {
      untilIllegal(result);
      advance(callWindowMs(result.current.round, 'normal'));
      act(() => result.current.next());
    }
    advance(leadInMs(3, 'normal'));
    act(() => result.current.call());
    expect(result.current.phase).toBe('verdict');
    expect(result.current.verdict?.outcome).toBe('false-alarm');
    expect(result.current.verdict?.called?.san).toBe(result.current.current?.lead[0]?.san);
    act(() => result.current.next());
    expect(result.current.phase).toBe('over');
    expect(useProgress.getState().arcade.arbiter?.best).toBe(0);
  });

  it('pauses when asked or when the page is hidden, and waits for Resume', () => {
    const { result } = setup();
    act(() => result.current.start());
    advance(leadInMs(1, 'normal'));
    act(() => result.current.pause());
    expect(result.current.paused).toBe(true);
    advance(60_000);
    expect(result.current.shown).toBe(1);
    // A call while paused does nothing.
    act(() => result.current.call());
    expect(result.current.strikes).toBe(0);
    act(() => result.current.resume());
    advance(stepMs(1, 'normal'));
    expect(result.current.shown).toBe(2);

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.paused).toBe(true);
    hidden.mockRestore();
    advance(60_000);
    expect(result.current.shown).toBe(2);
  });

  it('gives the illegal move a fresh window after a pause', () => {
    const { result } = setup();
    act(() => result.current.start());
    untilIllegal(result);
    advance(200);
    act(() => result.current.pause());
    act(() => result.current.resume());
    advance(callWindowMs(1, 'normal') - 1);
    expect(result.current.phase).toBe('watching');
    act(() => result.current.call());
    expect(result.current.verdict?.outcome).toBe('caught');
  });
});
