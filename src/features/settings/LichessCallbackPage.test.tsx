import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SyncModule from '@/lib/lichess/sync';
import { beginLichessLogin } from '@/lib/lichess/auth';
import { useToasts } from '@/components/ui/toastStore';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';

const syncNow = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/lib/lichess/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof SyncModule>();
  return { ...actual, syncNow };
});

import LichessCallbackPage from './LichessCallbackPage';

let lichess: FakeLichessHandle;

/** Starts a login and returns the address lichess.org sends the learner back to. */
async function cameBackFrom(choice: 'approve' | 'deny'): Promise<string> {
  let target = '';
  await beginLichessLogin((url) => {
    target = url;
  });
  const page = await lichess.fake.handle({ method: 'GET', url: target, headers: {}, body: '' });
  const href = new RegExp(`id="${choice}" href="([^"]+)"`).exec(page.body)?.[1] ?? '';
  const back = new URL(href.replace(/&amp;/g, '&'));
  return `${back.pathname}${back.search}`;
}

function renderAt(path: string) {
  window.history.replaceState(null, '', path);
  const router = createMemoryRouter(
    [
      { path: '/settings/lichess', element: <LichessCallbackPage /> },
      { path: '/settings', element: <p>Settings page</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('coming back from lichess.org', () => {
  beforeEach(() => {
    localStorage.clear();
    syncNow.mockClear();
    lichess = installFakeLichess();
    useLichess.getState().forget();
    useProgress.getState().resetAll();
    useToasts.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('connects the account, starts syncing and goes back to Settings', async () => {
    const path = await cameBackFrom('approve');
    const router = renderAt(path);
    // The one-time code leaves the address bar at once.
    expect(window.location.search).toBe('');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(router.state.location.hash).toBe('#lichess');
    expect(useLichess.getState().account?.username).toBe('Learner');
    expect(useProgress.getState().lichessUsername).toBe('Learner');
    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(useToasts.getState().toasts[0]?.message).toBe('Connected to Lichess as Learner.');
  });

  it('says so when the learner cancelled, and offers to try again', async () => {
    const path = await cameBackFrom('deny');
    renderAt(path);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The connection was cancelled on Lichess.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(useLichess.getState().account).toBeNull();
  });

  it('refuses an answer this tab did not ask for', async () => {
    renderAt('/settings/lichess?code=forged&state=forged');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not started in this browser/);
    expect(useLichess.getState().account).toBeNull();
  });
});
