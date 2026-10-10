import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Auth from '@/lib/lichess/auth';
import { LICHESS_SCOPES, ratingsFrom } from '@/lib/lichess/auth';
import { useLichess } from '@/store/lichess';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import {
  abortLichessGame,
  checkLichessLive,
  createLichessGame,
  forgetLichessLiveChecks,
  lichessSeekAllowed,
  reconnectLichessForLive,
  startLichessSeek,
} from './lichessLive';

const beginLichessLogin = vi.hoisted(() => vi.fn((_options?: unknown) => Promise.resolve()));
vi.mock('@/lib/lichess/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof Auth>()),
  beginLichessLogin,
}));

let lichess: FakeLichessHandle;

function signIn(scopes?: readonly string[], id = 'learner'): string {
  const token = lichess.fake.issueToken(scopes);
  useLichess
    .getState()
    .connect({ id, username: 'Learner', token, expiresAt: null }, ratingsFrom(null));
  return token;
}

const tests = () => lichess.fake.requests.filter((r) => r === 'POST /api/token/test');

beforeEach(() => {
  localStorage.clear();
  useLichess.getState().forget();
  forgetLichessLiveChecks();
  beginLichessLogin.mockClear();
  lichess = installFakeLichess();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('whether the Lichess sign-in may play', () => {
  it('is signed out without an account, or with a token Lichess no longer knows', async () => {
    await expect(checkLichessLive()).resolves.toBe('signed-out');
    expect(tests()).toEqual([]);
    const token = signIn();
    lichess.fake.tokens.delete(token);
    await expect(checkLichessLive()).resolves.toBe('signed-out');
  });

  it('needs the permission to play when the sign-in is older than live games', async () => {
    signIn(LICHESS_SCOPES);
    await expect(checkLichessLive()).resolves.toBe('needs-permission');
  });

  it('is ok with the permission, and asks Lichess once in a while only', async () => {
    signIn();
    await expect(checkLichessLive()).resolves.toBe('ok');
    await expect(checkLichessLive()).resolves.toBe('ok');
    expect(tests()).toHaveLength(1);
    // A new sign-in is a new question.
    signIn();
    await expect(checkLichessLive()).resolves.toBe('ok');
    expect(tests()).toHaveLength(2);
  });

  it('asks again after a while', async () => {
    const now = vi.spyOn(Date, 'now');
    try {
      signIn();
      await checkLichessLive();
      now.mockReturnValue(Date.now() + 6 * 60_000);
      await checkLichessLive();
      expect(tests()).toHaveLength(2);
    } finally {
      now.mockRestore();
    }
  });

  it('is offline when Lichess cannot be reached, and does not keep that answer', async () => {
    signIn();
    lichess.offline = true;
    await expect(checkLichessLive()).resolves.toBe('offline');
    lichess.offline = false;
    await expect(checkLichessLive()).resolves.toBe('ok');
  });

  it('is signed out when the token turns out to be another account’s', async () => {
    signIn(undefined, 'someone-else');
    await expect(checkLichessLive()).resolves.toBe('signed-out');
  });
});

describe('the live-game exports', () => {
  it('connects again asking for the permission to play, and comes back to the waiting room', async () => {
    await reconnectLichessForLive('/play/online');
    expect(beginLichessLogin).toHaveBeenCalledWith({ returnTo: '/play/online' });
  });

  it('offers the seek, the game and the abort from one place', () => {
    for (const fn of [
      abortLichessGame,
      createLichessGame,
      lichessSeekAllowed,
      startLichessSeek,
    ] as unknown[]) {
      expect(typeof fn).toBe('function');
    }
  });
});
