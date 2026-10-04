import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import { useSettings } from '@/store/settings';
import type * as IsolationModule from '@/sw/isolation';

const isolation = vi.hoisted(() => {
  const state = {
    stored: false,
    write: vi.fn((next: boolean) => {
      state.stored = next;
      return Promise.resolve(true);
    }),
    read: vi.fn(() => Promise.resolve(state.stored)),
    support: { isolated: false, sharedMemory: false, serviceWorker: true },
  };
  return state;
});
vi.mock('@/sw/isolation', async (importOriginal) => {
  const actual = await importOriginal<typeof IsolationModule>();
  return {
    ...actual,
    writeIsolationFlag: isolation.write,
    readIsolationFlag: isolation.read,
    detectIsolationSupport: () => isolation.support,
  };
});

import { EngineThreadsSetting } from './EngineThreadsSetting';

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe('EngineThreadsSetting', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useToasts.setState({ toasts: [] });
    isolation.stored = false;
    isolation.write.mockClear();
    isolation.write.mockImplementation((next: boolean) => {
      isolation.stored = next;
      return Promise.resolve(true);
    });
    isolation.support = { isolated: false, sharedMemory: false, serviceWorker: true };
  });

  it('records the choice for the service worker and asks for a reload', async () => {
    render(<EngineThreadsSetting />);
    await flush();
    fireEvent.click(screen.getByRole('switch', { name: /Multi-threaded engine/ }));
    await flush();
    expect(useSettings.getState().engineThreads).toBe(true);
    expect(isolation.write).toHaveBeenCalledWith(true);
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/Reload the app/);
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
  });

  it('puts the switch back when the flag cannot be stored', async () => {
    isolation.write.mockImplementation(() => Promise.resolve(false));
    render(<EngineThreadsSetting />);
    await flush();
    fireEvent.click(screen.getByRole('switch', { name: /Multi-threaded engine/ }));
    await flush();
    expect(useSettings.getState().engineThreads).toBe(false);
    expect(screen.getByRole('switch', { name: /Multi-threaded engine/ })).not.toBeChecked();
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/left as it was/);
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
  });

  it('offers a reload only when the stored flag disagrees with the page', async () => {
    // Isolated by the host's own headers, flag off, setting off: no reload would change it.
    isolation.support = { isolated: true, sharedMemory: true, serviceWorker: true };
    const { unmount } = render(<EngineThreadsSetting />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
    unmount();

    // Threads were on (flag stored, page isolated by the worker); "Reset everything"
    // turns the flag off while the page stays isolated: a reload is what fixes that.
    isolation.stored = true;
    useSettings.getState().update({ engineThreads: true });
    render(<EngineThreadsSetting />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
    // The reset writes the flag off (through the mocked writer) and clears the setting.
    act(() => {
      useSettings.getState().reset();
    });
    await flush();
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
  });

  it('tells a browser without service workers apart from one still waiting for its worker', async () => {
    isolation.support = { isolated: false, sharedMemory: false, serviceWorker: false };
    useSettings.getState().update({ engineThreads: true });
    // jsdom has no `navigator.serviceWorker` at all, like a browser without the API.
    expect('serviceWorker' in navigator).toBe(false);
    const { unmount } = render(<EngineThreadsSetting />);
    await flush();
    expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(/no service worker/);
    unmount();
    // With the API present but no controller yet, the page is still waiting for its worker.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener: () => undefined, removeEventListener: () => undefined },
      configurable: true,
    });
    try {
      render(<EngineThreadsSetting />);
      await flush();
      expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(/Waiting for/);
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });
});
