import { afterEach, describe, expect, it, vi } from 'vitest';

/** The bar's switch as a fresh start reads it from storage. */
async function activeAtStart(): Promise<boolean> {
  vi.resetModules();
  const { useLiveBar } = await import('./liveBar');
  return useLiveBar.getState().active;
}

afterEach(() => {
  localStorage.clear();
});

describe('the live-games bar at start-up', () => {
  it('stays off with no live games kept', async () => {
    expect(await activeAtStart()).toBe(false);
    localStorage.setItem('chess-trainer:live-seats', 'not json');
    expect(await activeAtStart()).toBe(false);
  });

  it('comes on for a game that may still be on, and not for one over or too old', async () => {
    const recent = { seat: 'x'.repeat(43), color: 'white', at: Date.now() - 60_000 };
    localStorage.setItem('chess-trainer:live-seats', JSON.stringify({ a: recent }));
    expect(await activeAtStart()).toBe(true);
    localStorage.setItem(
      'chess-trainer:live-seats',
      JSON.stringify({ a: { ...recent, over: true } }),
    );
    expect(await activeAtStart()).toBe(false);
    const old = { ...recent, at: Date.now() - 7 * 60 * 60 * 1000 };
    localStorage.setItem('chess-trainer:live-seats', JSON.stringify({ a: old }));
    expect(await activeAtStart()).toBe(false);
    localStorage.setItem(
      'chess-trainer:live-lichess',
      JSON.stringify({ AbCd1234: { at: Date.now() - 1000 } }),
    );
    expect(await activeAtStart()).toBe(true);
  });
});
