import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BuildModule from '@/engine/build';
import type * as FullEngineModule from '@/engine/fullEngine';
import type * as IsolationModule from '@/sw/isolation';
import { useSettings } from '@/store/settings';

const device = vi.hoisted(() => ({ stored: false }));
vi.mock('@/engine/build', async (importOriginal) => ({
  ...(await importOriginal<typeof BuildModule>()),
  detectThreadEnvironment: () => ({ isolated: true, sharedMemory: true, cores: 8, mobile: false }),
}));
const isBuildAvailable = vi.hoisted(() => vi.fn(() => Promise.resolve(device.stored)));
vi.mock('@/engine/fullEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof FullEngineModule>()),
  isBuildAvailable,
}));
vi.mock('@/sw/isolation', async (importOriginal) => ({
  ...(await importOriginal<typeof IsolationModule>()),
  readIsolationFlag: () => Promise.resolve(true),
}));

import { EngineDiagnostics } from './EngineDiagnostics';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

/** The value shown for a row of the panel. */
const row = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('EngineDiagnostics', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    device.stored = false;
    isBuildAvailable.mockClear();
  });

  it('shows the threaded lite engine by default, without asking about the full one', async () => {
    render(<EngineDiagnostics />);
    await flush();
    expect(row('Build selected')).toBe('Stockfish 19 lite · 7 threads');
    expect(row('Full engine')).toBe('Off');
    expect(row('Isolation flag saved')).toBe('On');
    expect(isBuildAvailable).not.toHaveBeenCalled();
  });

  it('asks again whether the full engine is here when the panel opens', async () => {
    useSettings.getState().update({ engineFull: true });
    render(<EngineDiagnostics />);
    await flush();
    expect(isBuildAvailable).toHaveBeenLastCalledWith('full-multi');
    expect(row('Full engine')).toBe('On — not downloaded, so the lite engine runs');
    expect(row('Build selected')).toBe('Stockfish 19 lite · 7 threads');

    // Downloaded meanwhile (from the switch above the panel): opening the panel looks again.
    device.stored = true;
    const panel = screen.getByTestId('engine-diagnostics');
    (panel as HTMLDetailsElement).open = true;
    fireEvent(panel, new Event('toggle'));
    await flush();
    expect(row('Full engine')).toBe('On — downloaded');
    expect(row('Build selected')).toBe('Stockfish 19 · 7 threads');
  });
});
