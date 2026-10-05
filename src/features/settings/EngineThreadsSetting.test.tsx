import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import { useSettings } from '@/store/settings';
import type * as IsolationModule from '@/sw/isolation';

const isolation = vi.hoisted(() => {
  const state = {
    /** What the service worker would read: nothing stored means on. */
    stored: true,
    write: vi.fn((next: boolean) => {
      state.stored = next;
      return Promise.resolve(true);
    }),
    reset: vi.fn(() => {
      state.stored = true;
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
    resetIsolationFlag: isolation.reset,
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

/** A page the service worker isolated: the threaded engine is running. */
const THREADED = { isolated: true, sharedMemory: true, serviceWorker: true };

/** A browser with service workers, one of which controls the page. */
function withServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: {},
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    configurable: true,
  });
}

describe('EngineThreadsSetting', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  beforeEach(() => {
    withServiceWorker();
    useSettings.getState().reset();
    useToasts.setState({ toasts: [] });
    isolation.stored = true;
    isolation.write.mockClear();
    isolation.write.mockImplementation((next: boolean) => {
      isolation.stored = next;
      return Promise.resolve(true);
    });
    isolation.support = THREADED;
  });

  it('is on by default and says how many threads run', async () => {
    expect(useSettings.getState().engineThreads).toBe(true);
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
    try {
      render(<EngineThreadsSetting />);
      await flush();
      expect(screen.getByRole('switch', { name: /Multi-threaded engine/ })).toBeChecked();
      expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(
        'On — the engine is using 3 threads on this device.',
      );
      expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'hardwareConcurrency');
    }
  });

  it('records the choice for the service worker and asks for a reload', async () => {
    render(<EngineThreadsSetting />);
    await flush();
    const toggle = screen.getByRole('switch', { name: /Multi-threaded engine/ });
    fireEvent.click(toggle);
    await flush();
    expect(useSettings.getState().engineThreads).toBe(false);
    expect(isolation.write).toHaveBeenLastCalledWith(false);
    expect(useToasts.getState().toasts.at(-1)?.message).toBe(
      'Reload the app to go back to the single-threaded engine.',
    );
    // The page is still isolated, the flag no longer is: a reload changes something.
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();

    fireEvent.click(toggle);
    await flush();
    expect(useSettings.getState().engineThreads).toBe(true);
    expect(isolation.write).toHaveBeenLastCalledWith(true);
    expect(useToasts.getState().toasts.at(-1)?.message).toBe(
      'Reload the app to start the multi-threaded engine.',
    );
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
  });

  it('puts the switch back when the flag cannot be stored', async () => {
    isolation.write.mockImplementation(() => Promise.resolve(false));
    render(<EngineThreadsSetting />);
    await flush();
    fireEvent.click(screen.getByRole('switch', { name: /Multi-threaded engine/ }));
    await flush();
    expect(useSettings.getState().engineThreads).toBe(true);
    expect(screen.getByRole('switch', { name: /Multi-threaded engine/ })).toBeChecked();
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/left as it was/);
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
  });

  it('offers a reload only when the stored flag disagrees with the page', async () => {
    // The first load after the update: threads on, nothing stored yet, the page not
    // isolated because the worker took over only after it loaded.
    isolation.support = { isolated: false, sharedMemory: false, serviceWorker: true };
    let view = render(<EngineThreadsSetting />);
    await flush();
    expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(/On from the next load/);
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
    view.unmount();

    // Isolated by the host's own headers, flag off, setting off: no reload would change it.
    isolation.stored = false;
    useSettings.getState().update({ engineThreads: false });
    isolation.support = THREADED;
    view = render(<EngineThreadsSetting />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
    view.unmount();

    // Threads were switched off and the page reloaded; "Reset everything" puts the
    // default back (on) while the page stays unisolated: a reload is what fixes that.
    isolation.support = { isolated: false, sharedMemory: false, serviceWorker: true };
    render(<EngineThreadsSetting />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Reload now' })).not.toBeInTheDocument();
    act(() => {
      useSettings.getState().reset();
    });
    await flush();
    expect(isolation.reset).toHaveBeenCalled();
    expect(useSettings.getState().engineThreads).toBe(true);
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
  });

  it('switches freely where there are no service workers, and so no flag to keep', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    isolation.support = { isolated: false, sharedMemory: false, serviceWorker: false };
    isolation.write.mockImplementation(() => Promise.resolve(false));
    render(<EngineThreadsSetting />);
    await flush();
    fireEvent.click(screen.getByRole('switch', { name: /Multi-threaded engine/ }));
    await flush();
    expect(useSettings.getState().engineThreads).toBe(false);
    expect(isolation.write).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts).toEqual([]);
    expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(/^Off/);
  });

  it('tells a browser without service workers apart from one still waiting for its worker', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    isolation.support = { isolated: false, sharedMemory: false, serviceWorker: false };
    useSettings.getState().update({ engineThreads: true });
    // jsdom has no `navigator.serviceWorker` at all, like a browser without the API.
    expect('serviceWorker' in navigator).toBe(false);
    const { unmount } = render(<EngineThreadsSetting />);
    await flush();
    expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(/no service worker/);
    unmount();
    // With the API present but no controller yet (a first visit), a reload is the way on,
    // and the button is there from the start: nothing moves when the worker takes over.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener: () => undefined, removeEventListener: () => undefined },
      configurable: true,
    });
    try {
      render(<EngineThreadsSetting />);
      await flush();
      expect(screen.getByTestId('engine-threads-status')).toHaveTextContent(
        'On from the next load: reload the app to start the threaded engine.',
      );
      expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });
});
