import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeLichess, type FakeLichessHandle } from '@/test/lichessFetch';
import { LichessError } from './api';
import {
  appPath,
  beginLichessLogin,
  connectWithToken,
  fetchAccount,
  finishLichessLogin,
  LICHESS_PLAY_SCOPE,
  LICHESS_REQUESTED_SCOPES,
  LICHESS_SCOPES,
  lichessClientId,
  lichessRedirectUri,
  LoginError,
  PENDING_LOGIN_KEY,
  pendingReturnTo,
  personalTokenUrl,
  ratingsFrom,
  revokeLichessToken,
  takePendingLogin,
} from './auth';

let lichess: FakeLichessHandle;
const NOW = Date.UTC(2026, 9, 1, 9);

beforeEach(() => {
  lichess = installFakeLichess();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Starts a login and follows it to lichess.org's approval page; returns where each choice leads. */
async function startLogin(now = NOW, returnTo?: string) {
  let target = '';
  const navigate = (url: string) => {
    target = url;
  };
  await (returnTo === undefined
    ? beginLichessLogin(navigate, now)
    : beginLichessLogin({ navigate, now, returnTo }));
  const page = await lichess.fake.handle({ method: 'GET', url: target, headers: {}, body: '' });
  const link = (id: string) => {
    const href = new RegExp(`id="${id}" href="([^"]+)"`).exec(page.body)?.[1] ?? '';
    return new URL(href.replace(/&amp;/g, '&'));
  };
  return { target: new URL(target), approve: link('approve'), deny: link('deny') };
}

describe('Log in with Lichess', () => {
  it('asks for the sync’s permissions and live play’s with a PKCE challenge, and comes back to Settings', async () => {
    const { target, approve } = await startLogin();
    expect(target.origin + target.pathname).toBe('https://lichess.org/oauth');
    const params = target.searchParams;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('scope')).toBe('puzzle:read puzzle:write study:read study:write board:play');
    expect(params.get('scope')).toBe(LICHESS_REQUESTED_SCOPES.join(' '));
    expect(params.get('client_id')).toBe(lichessClientId());
    expect(params.get('redirect_uri')).toBe(lichessRedirectUri());
    expect(lichessRedirectUri()).toBe(`${location.origin}/settings/lichess`);
    // The verifier itself never goes in the address.
    const pending = JSON.parse(localStorage.getItem(PENDING_LOGIN_KEY) ?? '{}') as {
      verifier: string;
    };
    expect(target.href).not.toContain(pending.verifier);
    expect(approve.pathname).toBe('/settings/lichess');
  });

  it('trades the code for a token and reads the account and its ratings', async () => {
    const { approve } = await startLogin();
    const account = await finishLichessLogin(approve.searchParams, NOW + 60_000);
    expect(account.username).toBe('Learner');
    expect(account.id).toBe('learner');
    expect(lichess.fake.tokens.has(account.token)).toBe(true);
    expect(account.expiresAt).toBe(NOW + 60_000 + 31_536_000_000);
    expect(account.ratings.puzzle).toEqual({ rating: 1720, rd: 70, games: 812, prov: false });
    expect(account.ratings.classical?.prov).toBe(true);
    expect(account.ratings.bullet).toBeNull();
    // Lichess grants what was asked, live play included; no return path means Settings.
    expect(lichess.fake.tokens.get(account.token)).toContain(LICHESS_PLAY_SCOPE);
    expect(account.returnTo).toBeNull();
    // The secrets are used once.
    expect(localStorage.getItem(PENDING_LOGIN_KEY)).toBeNull();
    await expect(finishLichessLogin(approve.searchParams, NOW)).rejects.toMatchObject({
      kind: 'expired',
    });
  });

  it('says when the learner cancelled on Lichess', async () => {
    const { deny } = await startLogin();
    const error = await finishLichessLogin(deny.searchParams, NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoginError);
    expect((error as LoginError).kind).toBe('cancelled');
  });

  it('refuses an answer for another login, a stale one, or one for another profile', async () => {
    const { approve } = await startLogin();
    const forged = new URLSearchParams(approve.searchParams);
    forged.set('state', 'someone-else');
    await expect(finishLichessLogin(forged, NOW)).rejects.toMatchObject({ kind: 'mismatch' });

    const late = await startLogin();
    await expect(
      finishLichessLogin(late.approve.searchParams, NOW + 31 * 60_000),
    ).rejects.toMatchObject({ kind: 'expired' });

    const other = await startLogin();
    const pending = JSON.parse(localStorage.getItem(PENDING_LOGIN_KEY) ?? '{}') as object;
    localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify({ ...pending, profileId: 'p-2' }));
    await expect(finishLichessLogin(other.approve.searchParams, NOW)).rejects.toMatchObject({
      kind: 'mismatch',
    });
  });

  it('fails the exchange when the verifier does not match the challenge', async () => {
    const { approve } = await startLogin();
    const pending = JSON.parse(localStorage.getItem(PENDING_LOGIN_KEY) ?? '{}') as object;
    localStorage.setItem(
      PENDING_LOGIN_KEY,
      JSON.stringify({ ...pending, verifier: 'x'.repeat(86) }),
    );
    const error = await finishLichessLogin(approve.searchParams, NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LichessError);
    expect((error as LichessError).kind).toBe('invalid');
    expect((error as LichessError).message).toContain('code_verifier');
  });

  it('ignores a damaged pending login', () => {
    localStorage.setItem(PENDING_LOGIN_KEY, '{nope');
    expect(takePendingLogin(NOW)).toBeNull();
    localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify({ verifier: 1 }));
    expect(takePendingLogin(NOW)).toBeNull();
  });

  it('withdraws a token on Lichess, quietly when that cannot be done', async () => {
    const token = lichess.fake.issueToken();
    await revokeLichessToken(token);
    expect(lichess.fake.tokens.has(token)).toBe(false);
    await expect(fetchAccount(token)).rejects.toMatchObject({ kind: 'auth' });
    lichess.offline = true;
    await expect(revokeLichessToken('lip_other')).resolves.toBeUndefined();
  });

  it('reads ratings from an account answer, skipping what is missing or odd', () => {
    expect(
      ratingsFrom(
        { perfs: { blitz: { rating: 1499.6, rd: 61.2, games: 3 }, rapid: { rating: 'x' } } },
        5,
      ),
    ).toEqual({
      puzzle: null,
      bullet: null,
      blitz: { rating: 1500, rd: 61, games: 3, prov: false },
      rapid: null,
      classical: null,
      at: 5,
    });
    expect(ratingsFrom(null, 1).puzzle).toBeNull();
  });

  it('connects with a personal token that allows what the sync needs', async () => {
    const url = new URL(personalTokenUrl());
    expect(url.origin + url.pathname).toBe('https://lichess.org/account/oauth/token/create');
    expect(url.searchParams.getAll('scopes[]')).toEqual([...LICHESS_SCOPES, 'board:play']);

    const token = lichess.fake.issueToken();
    const account = await connectWithToken(`  ${token} `, NOW);
    expect(account).toMatchObject({ username: 'Learner', token, expiresAt: null });
    expect(account.ratings.puzzle?.rating).toBe(1720);
  });

  it('takes a token without live play’s permission: only the sync’s are required', async () => {
    const token = lichess.fake.issueToken(LICHESS_SCOPES);
    const account = await connectWithToken(token, NOW);
    expect(account).toMatchObject({ username: 'Learner', token });
  });

  it('turns down a token that is malformed, unknown, or short of permissions', async () => {
    await expect(connectWithToken('not a token')).rejects.toMatchObject({ kind: 'failed' });
    await expect(connectWithToken('lip_unknown')).rejects.toThrow(/does not know this token/);
    const narrow = lichess.fake.issueToken(['puzzle:read', 'puzzle:write']);
    await expect(connectWithToken(narrow)).rejects.toThrow(/study:read, study:write/);
  });
});

describe('coming back to a page of the app', () => {
  it('keeps the page a login started from, and hands it back once connected', async () => {
    const { approve } = await startLogin(NOW, '/play/online');
    expect(pendingReturnTo(NOW)).toBe('/play/online');
    // Reading it leaves the login in place.
    expect(localStorage.getItem(PENDING_LOGIN_KEY)).not.toBeNull();
    const account = await finishLichessLogin(approve.searchParams, NOW);
    expect(account.returnTo).toBe('/play/online');
    expect(pendingReturnTo(NOW)).toBeNull();
  });

  it('never keeps a way out of the app', async () => {
    for (const bad of [
      '//elsewhere.example/play',
      '/\\elsewhere.example',
      'https://elsewhere.example/',
      'play/online',
      '/play online',
      '/play\nonline',
      '',
    ]) {
      expect(appPath(bad)).toBeNull();
      await startLogin(NOW, bad);
      expect(pendingReturnTo(NOW)).toBeNull();
    }
    expect(appPath('/play/online?join=abc#top')).toBe('/play/online?join=abc#top');
    expect(appPath(42)).toBeNull();
  });

  it('ignores a damaged return path in a stored login, and reads one saved without it', async () => {
    const { approve } = await startLogin(NOW, '/play/online');
    const pending = JSON.parse(localStorage.getItem(PENDING_LOGIN_KEY) ?? '{}') as object;
    localStorage.setItem(
      PENDING_LOGIN_KEY,
      JSON.stringify({ ...pending, returnTo: '//elsewhere.example' }),
    );
    expect(takePendingLogin(NOW)?.returnTo).toBeNull();

    // A login started before return paths existed finishes as before.
    const { returnTo: _dropped, ...older } = pending as { returnTo?: unknown };
    localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(older));
    const account = await finishLichessLogin(approve.searchParams, NOW);
    expect(account).toMatchObject({ username: 'Learner', returnTo: null });
  });
});
