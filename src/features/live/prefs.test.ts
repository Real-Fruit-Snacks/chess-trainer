import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlayerName } from '../../../relay/src/live/shared.mjs';

const KEY = 'chess-trainer:live';

/** The store as a fresh start of the app finds it (the module loaded anew over today's storage). */
async function start() {
  vi.resetModules();
  return (await import('./prefs')).useLivePrefs;
}

const saved = () =>
  JSON.parse(localStorage.getItem(KEY) ?? 'null') as { state: Record<string, unknown> };

describe('live game preferences', () => {
  beforeEach(() => localStorage.clear());

  it('starts with a generated name, the rating shown, Lichess off and 10+0 at random', async () => {
    const prefs = await start();
    const state = prefs.getState();
    expect(isPlayerName(state.name)).toBe(true);
    expect(state).toMatchObject({
      showRating: true,
      lichess: false,
      lichessRated: false,
      color: 'random',
      tc: '10+0',
    });
    // The name made up is saved at once, so the next start shows the same one.
    expect(saved().state.name).toBe(state.name);
    const again = await start();
    expect(again.getState().name).toBe(state.name);
  });

  it('takes only choices that check out', async () => {
    const prefs = await start();
    const before = prefs.getState();
    prefs.getState().update({ name: 'Rude Words' });
    prefs.getState().update({ tc: '05+3' });
    prefs.getState().update({ color: 'green' as never });
    prefs.getState().update({ showRating: 'yes' as never });
    expect(prefs.getState()).toMatchObject({
      name: before.name,
      tc: '10+0',
      color: 'random',
      showRating: true,
    });
    // A patch with good and bad parts keeps the good ones.
    prefs.getState().update({
      name: 'Swift Knight',
      tc: '0+0',
      color: 'black',
      lichess: true,
      lichessRated: true,
      showRating: false,
    });
    expect(prefs.getState()).toMatchObject({
      name: 'Swift Knight',
      tc: '10+0',
      color: 'black',
      lichess: true,
      lichessRated: true,
      showRating: false,
    });
    prefs.getState().update({ tc: '180+180' });
    expect(prefs.getState().tc).toBe('180+180');
    expect(saved().state).toMatchObject({ name: 'Swift Knight', tc: '180+180', color: 'black' });
  });

  it('rolls a new name, never the same one', async () => {
    const prefs = await start();
    for (let i = 0; i < 20; i++) {
      const before = prefs.getState().name;
      prefs.getState().rollName();
      expect(prefs.getState().name).not.toBe(before);
      expect(isPlayerName(prefs.getState().name)).toBe(true);
    }
    expect(saved().state.name).toBe(prefs.getState().name);
  });

  it('repairs a save field by field and keeps what a newer version added', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          name: 'Hello There',
          showRating: false,
          lichess: 'maybe',
          color: 'white',
          tc: '3+2',
          fromTheFuture: [1, 2],
        },
        version: 1,
      }),
    );
    const prefs = await start();
    const state = prefs.getState() as unknown as Record<string, unknown>;
    expect(isPlayerName(state.name)).toBe(true);
    expect(state).toMatchObject({ showRating: false, lichess: false, color: 'white', tc: '3+2' });
    expect(state.fromTheFuture).toEqual([1, 2]);
    // The name had to be made up: it is saved straight away.
    expect(saved().state.name).toBe(state.name);
    expect(saved().state.fromTheFuture).toEqual([1, 2]);
  });

  it('sets aside a save it cannot read, and starts afresh', async () => {
    localStorage.setItem(KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const prefs = await start();
    expect(isPlayerName(prefs.getState().name)).toBe(true);
    const copies = Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}:corrupt-`));
    expect(copies).toHaveLength(1);
    expect(localStorage.getItem(copies[0]!)).toBe('{not json');
    expect(saved().state.name).toBe(prefs.getState().name);
    warn.mockRestore();
  });

  it('follows a change another tab saves', async () => {
    const prefs = await start();
    const other = { ...saved().state, name: 'Quiet Rook', tc: '5+3' };
    localStorage.setItem(KEY, JSON.stringify({ state: other, version: 1 }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(prefs.getState()).toMatchObject({ name: 'Quiet Rook', tc: '5+3' });
  });
});
