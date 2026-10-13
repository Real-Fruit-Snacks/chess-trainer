import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SyncModule from '@/lib/lichess/sync';
import { useLichess } from '@/store/lichess';
import { useProgress } from '@/store/progress';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';

const syncNow = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/lib/lichess/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof SyncModule>();
  return { ...actual, syncNow };
});

import { LichessTokenConnect } from './LichessTokenConnect';

let lichess: FakeLichessHandle;

describe('connecting with a personal token', () => {
  beforeEach(() => {
    localStorage.clear();
    syncNow.mockClear();
    lichess = installFakeLichess();
    useLichess.getState().forget();
    useProgress.getState().resetAll();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('links to a token with the permissions ticked, and connects with it', async () => {
    render(<LichessTokenConnect open />);
    const link = screen.getByRole('link', { name: 'Create a token on Lichess' });
    expect(link.getAttribute('href')).toContain('scopes%5B%5D=study%3Awrite');
    const input = screen.getByLabelText('Personal token');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: lichess.fake.issueToken() } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(useLichess.getState().account?.username).toBe('Learner'));
    expect(useProgress.getState().lichessUsername).toBe('Learner');
    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(input).toHaveValue('');
  });

  it('says why a token is turned down', async () => {
    render(<LichessTokenConnect open />);
    fireEvent.change(screen.getByLabelText('Personal token'), {
      target: { value: lichess.fake.issueToken(['puzzle:read']) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not allow everything/);
    expect(useLichess.getState().account).toBeNull();
  });
});
