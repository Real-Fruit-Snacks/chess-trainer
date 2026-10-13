import type { LongColor } from '@/chess/types';

export interface TimeControl {
  id: string;
  label: string;
  /** Starting time per side in milliseconds; 0 means no clock. */
  initialMs: number;
  /** Increment added after each move, in milliseconds. */
  incrementMs: number;
  category: 'none' | 'bullet' | 'blitz' | 'rapid' | 'classical';
}

const minutes = (m: number) => m * 60_000;

export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'none', label: 'No clock', initialMs: 0, incrementMs: 0, category: 'none' },
  { id: '1+0', label: '1 min', initialMs: minutes(1), incrementMs: 0, category: 'bullet' },
  { id: '2+1', label: '2 + 1', initialMs: minutes(2), incrementMs: 1000, category: 'bullet' },
  { id: '3+0', label: '3 min', initialMs: minutes(3), incrementMs: 0, category: 'blitz' },
  { id: '3+2', label: '3 + 2', initialMs: minutes(3), incrementMs: 2000, category: 'blitz' },
  { id: '5+0', label: '5 min', initialMs: minutes(5), incrementMs: 0, category: 'blitz' },
  { id: '5+3', label: '5 + 3', initialMs: minutes(5), incrementMs: 3000, category: 'blitz' },
  { id: '10+0', label: '10 min', initialMs: minutes(10), incrementMs: 0, category: 'rapid' },
  { id: '10+5', label: '10 + 5', initialMs: minutes(10), incrementMs: 5000, category: 'rapid' },
  { id: '15+10', label: '15 + 10', initialMs: minutes(15), incrementMs: 10_000, category: 'rapid' },
  { id: '30+0', label: '30 min', initialMs: minutes(30), incrementMs: 0, category: 'classical' },
];

export function getTimeControl(id: string): TimeControl {
  return TIME_CONTROLS.find((tc) => tc.id === id) ?? (TIME_CONTROLS[0] as TimeControl);
}

export interface ClockState {
  white: number;
  black: number;
  /** Side whose clock is counting down, if any. */
  running: LongColor | null;
  /** Timestamp of the last update, for the running side. */
  since: number;
}

export function createClock(control: TimeControl): ClockState {
  return { white: control.initialMs, black: control.initialMs, running: null, since: 0 };
}

/** Remaining time for a side at `now`, accounting for a running clock. */
export function remaining(state: ClockState, color: LongColor, now: number): number {
  const base = state[color];
  if (state.running !== color) return base;
  return Math.max(0, base - (now - state.since));
}

/** Starts `color`'s clock (used before the first move or after a pause). */
export function startClock(state: ClockState, color: LongColor, now: number): ClockState {
  return { ...state, running: color, since: now };
}

/**
 * Called when `mover` has completed a move: stops their clock, adds the
 * increment, and starts the opponent's clock.
 */
export function pressClock(
  state: ClockState,
  mover: LongColor,
  control: TimeControl,
  now: number,
): ClockState {
  const left = remaining(state, mover, now);
  const other: LongColor = mover === 'white' ? 'black' : 'white';
  const next: ClockState = {
    ...state,
    [mover]: left + (left > 0 ? control.incrementMs : 0),
    running: other,
    since: now,
  };
  return next;
}

export function pauseClock(state: ClockState, now: number): ClockState {
  if (!state.running) return state;
  return {
    ...state,
    [state.running]: remaining(state, state.running, now),
    running: null,
    since: 0,
  };
}

/** Whether a side has run out of time. */
export function flagged(state: ClockState, now: number): LongColor | null {
  if (remaining(state, 'white', now) <= 0 && state.running === 'white') return 'white';
  if (remaining(state, 'black', now) <= 0 && state.running === 'black') return 'black';
  return null;
}

/** "m:ss", with tenths under ten seconds ("9.4"). */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) return (clamped / 1000).toFixed(1);
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutesPart = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutesPart}:${String(seconds).padStart(2, '0')}`;
}
