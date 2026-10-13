import { describe, expect, it } from 'vitest';
import {
  createClock,
  flagged,
  formatClock,
  getTimeControl,
  pauseClock,
  pressClock,
  remaining,
  startClock,
} from './clock';

describe('clock', () => {
  const control = getTimeControl('3+2');

  it('counts down only for the running side', () => {
    let state = createClock(control);
    state = startClock(state, 'white', 1000);
    expect(remaining(state, 'white', 6000)).toBe(180_000 - 5000);
    expect(remaining(state, 'black', 6000)).toBe(180_000);
  });

  it('adds the increment and switches sides on press', () => {
    let state = createClock(control);
    state = startClock(state, 'white', 0);
    state = pressClock(state, 'white', control, 4000);
    expect(state.white).toBe(180_000 - 4000 + 2000);
    expect(state.running).toBe('black');
    expect(remaining(state, 'black', 7000)).toBe(180_000 - 3000);
  });

  it('pauses and resumes without losing time', () => {
    let state = createClock(control);
    state = startClock(state, 'white', 0);
    state = pauseClock(state, 10_000);
    expect(state.running).toBeNull();
    expect(remaining(state, 'white', 50_000)).toBe(170_000);
    state = startClock(state, 'white', 50_000);
    expect(remaining(state, 'white', 51_000)).toBe(169_000);
  });

  it('detects a flag', () => {
    let state = createClock(getTimeControl('1+0'));
    state = startClock(state, 'black', 0);
    expect(flagged(state, 59_999)).toBeNull();
    expect(flagged(state, 60_000)).toBe('black');
    // No increment after flagging.
    const pressed = pressClock(state, 'black', getTimeControl('1+0'), 61_000);
    expect(pressed.black).toBe(0);
  });

  it('formats times', () => {
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(65_400)).toBe('1:06');
    expect(formatClock(9_400)).toBe('9.4');
    expect(formatClock(-5)).toBe('0.0');
  });

  it('falls back to no clock for unknown ids', () => {
    expect(getTimeControl('nope').id).toBe('none');
  });
});
