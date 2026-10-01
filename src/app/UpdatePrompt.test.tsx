import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(),
  registration: { update: vi.fn(() => Promise.resolve()) },
  onRegistered: null as null | ((url: string, reg: unknown) => void),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: { onRegisteredSW?: (url: string, reg: unknown) => void }) => {
    sw.onRegistered = options.onRegisteredSW ?? null;
    const [needRefresh, setNeedRefresh] = useState(sw.needRefresh);
    const [offlineReady, setOfflineReady] = useState(false);
    return {
      needRefresh: [needRefresh, setNeedRefresh],
      offlineReady: [offlineReady, setOfflineReady],
      updateServiceWorker: sw.updateServiceWorker,
    };
  },
}));

import { UpdatePrompt } from './UpdatePrompt';

/** Each page renders a link-like button, so tests navigate the way a user would. */
function Page({ name, next }: { name: string; next: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(next)}>
      {name}
    </button>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <UpdatePrompt />
      <Routes>
        <Route path="/" element={<Page name="home" next="/puzzles" />} />
        <Route path="/puzzles" element={<Page name="puzzles" next="/" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    sw.needRefresh = false;
    sw.updateServiceWorker.mockClear();
    sw.registration.update.mockClear();
    useToasts.setState({ toasts: [] });
  });

  it('offers a reload when an update is ready and applies it at the next navigation', () => {
    sw.needRefresh = true;
    render(<App />);
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/new version is ready/);
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'home' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('does nothing at navigation while no update is waiting', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'home' }));
    expect(screen.getByRole('button', { name: 'puzzles' })).toBeInTheDocument();
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('checks for a newer build when the app comes back into view', () => {
    render(<App />);
    act(() => sw.onRegistered?.('/sw.js', sw.registration));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(sw.registration.update).toHaveBeenCalledTimes(1);
    // Not again straight away: the checks are throttled.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(sw.registration.update).toHaveBeenCalledTimes(1);
  });
});
