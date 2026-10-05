import { ACTIVE_PROFILE_ID } from '@/store/profiles';
import { LICHESS_ORIGIN, LichessError, lichessJson, lichessSend } from './api';
import { codeChallenge, createCodeVerifier, randomToken } from './pkce';

/**
 * "Log in with Lichess": the authorization code flow with PKCE, which Lichess
 * offers to apps without a server ("unregistered and public clients"). The
 * page sends the learner to lichess.org with a challenge; Lichess sends them
 * back to `/settings/lichess` with a one-time code, which is exchanged here
 * for a token. The token stays on this device, in this profile's storage —
 * never in a backup — and Disconnect revokes it.
 */

/** What the sync needs: puzzle history and results, and private studies. */
export const LICHESS_SCOPES = ['puzzle:read', 'puzzle:write', 'study:read', 'study:write'] as const;

/**
 * Where the flow's secrets wait while the learner is on lichess.org. Local
 * storage, not this tab's: an installed app on Android finishes the sign-in
 * in a browser tab of its own, which shares local storage with it.
 */
export const PENDING_LOGIN_KEY = 'chess-trainer:lichess-login';
/** A login started longer ago than this is not finished. */
const LOGIN_TTL_MS = 30 * 60 * 1000;

export interface PendingLogin {
  verifier: string;
  state: string;
  profileId: string;
  startedAt: number;
}

export interface LichessPerf {
  rating: number;
  rd: number;
  games: number;
  /** Provisional: too few games for the rating to mean much. */
  prov: boolean;
}

/** The ratings the app uses: the puzzle rating, and game ratings for the human-like opponent. */
export interface LichessRatings {
  puzzle: LichessPerf | null;
  bullet: LichessPerf | null;
  blitz: LichessPerf | null;
  rapid: LichessPerf | null;
  classical: LichessPerf | null;
  at: number;
}

export interface ConnectedAccount {
  id: string;
  username: string;
  token: string;
  /** When Lichess says the token lapses (about a year), if it says. */
  expiresAt: number | null;
  ratings: LichessRatings;
}

export class LoginError extends Error {
  constructor(
    message: string,
    readonly kind: 'cancelled' | 'expired' | 'mismatch' | 'failed',
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

/** The address Lichess sends the learner back to (a page of this app). */
export function lichessRedirectUri(): string {
  return new URL(`${import.meta.env.BASE_URL}settings/lichess`, location.origin).href;
}

/** Any unique name will do (Lichess does not register apps): the site and its path. */
export function lichessClientId(): string {
  return `${location.host}${import.meta.env.BASE_URL}`.replace(/\/+$/, '');
}

function loginStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function savePending(pending: PendingLogin): void {
  const store = loginStore();
  if (!store) throw new LoginError('This browser does not allow the sign-in to be kept.', 'failed');
  store.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));
}

/** Takes the pending login (once: it is removed as it is read). */
export function takePendingLogin(now = Date.now()): PendingLogin | null {
  const store = loginStore();
  const raw = store?.getItem(PENDING_LOGIN_KEY) ?? null;
  store?.removeItem(PENDING_LOGIN_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingLogin>;
    if (
      typeof value.verifier !== 'string' ||
      typeof value.state !== 'string' ||
      typeof value.profileId !== 'string' ||
      typeof value.startedAt !== 'number' ||
      now - value.startedAt > LOGIN_TTL_MS
    ) {
      return null;
    }
    return value as PendingLogin;
  } catch {
    return null;
  }
}

/** The authorization address for a login (exported for the tests). */
export async function authorizationUrl(pending: Pick<PendingLogin, 'verifier' | 'state'>) {
  const url = new URL('/oauth', LICHESS_ORIGIN);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: lichessClientId(),
    redirect_uri: lichessRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(pending.verifier),
    scope: LICHESS_SCOPES.join(' '),
    state: pending.state,
  }).toString();
  return url.href;
}

/** Starts a login: remembers the secrets for this tab and goes to lichess.org. */
export async function beginLichessLogin(
  navigate: (url: string) => void = (url) => location.assign(url),
  now = Date.now(),
): Promise<void> {
  const pending: PendingLogin = {
    verifier: createCodeVerifier(),
    state: randomToken(24),
    profileId: ACTIVE_PROFILE_ID,
    startedAt: now,
  };
  savePending(pending);
  navigate(await authorizationUrl(pending));
}

function perfOf(value: unknown): LichessPerf | null {
  if (typeof value !== 'object' || value === null) return null;
  const perf = value as Record<string, unknown>;
  if (typeof perf.rating !== 'number' || !Number.isFinite(perf.rating)) return null;
  return {
    rating: Math.round(perf.rating),
    rd: typeof perf.rd === 'number' && Number.isFinite(perf.rd) ? Math.round(perf.rd) : 350,
    games: typeof perf.games === 'number' ? perf.games : 0,
    prov: perf.prov === true,
  };
}

/** The ratings in a `/api/account` or `/api/user/{name}` answer. */
export function ratingsFrom(account: unknown, now = Date.now()): LichessRatings {
  const perfs =
    typeof account === 'object' && account !== null
      ? ((account as { perfs?: Record<string, unknown> }).perfs ?? {})
      : {};
  return {
    puzzle: perfOf(perfs.puzzle),
    bullet: perfOf(perfs.bullet),
    blitz: perfOf(perfs.blitz),
    rapid: perfOf(perfs.rapid),
    classical: perfOf(perfs.classical),
    at: now,
  };
}

/** The signed-in account: who it is, and its ratings. */
export async function fetchAccount(
  token: string,
  now = Date.now(),
): Promise<{ id: string; username: string; ratings: LichessRatings }> {
  const account = await lichessJson<{ id?: unknown; username?: unknown }>('/api/account', {
    token,
  });
  if (!account || typeof account.username !== 'string' || typeof account.id !== 'string') {
    throw new LichessError('Lichess did not say who is signed in.', 'server');
  }
  return { id: account.id, username: account.username, ratings: ratingsFrom(account, now) };
}

/**
 * Finishes a login on the page Lichess sent the learner back to: checks the
 * answer against what this tab started, trades the code for a token and asks
 * whose it is.
 */
export async function finishLichessLogin(
  params: URLSearchParams,
  now = Date.now(),
): Promise<ConnectedAccount> {
  const pending = takePendingLogin(now);
  const error = params.get('error');
  if (error) {
    throw error === 'access_denied'
      ? new LoginError('The connection was cancelled on Lichess.', 'cancelled')
      : new LoginError(
          `Lichess refused the connection: ${params.get('error_description') ?? error}.`,
          'failed',
        );
  }
  if (!pending) {
    throw new LoginError(
      'This sign-in was not started in this browser, or it took too long. Start it again from Settings — or connect there with a personal token, which works anywhere (an app on the Home Screen of an iPhone or iPad needs one).',
      'expired',
    );
  }
  if (params.get('state') !== pending.state) {
    throw new LoginError(
      'This answer from Lichess does not match the sign-in started here.',
      'mismatch',
    );
  }
  if (pending.profileId !== ACTIVE_PROFILE_ID) {
    throw new LoginError(
      'The profile changed during the sign-in. Start it again from Settings.',
      'mismatch',
    );
  }
  const code = params.get('code');
  if (!code) throw new LoginError('Lichess sent no authorization code.', 'failed');

  const answer = await lichessJson<{ access_token?: unknown; expires_in?: unknown }>('/api/token', {
    form: {
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.verifier,
      redirect_uri: lichessRedirectUri(),
      client_id: lichessClientId(),
    },
  });
  const token = answer?.access_token;
  if (typeof token !== 'string' || !token) {
    throw new LoginError('Lichess did not hand over a token.', 'failed');
  }
  const expiresIn = typeof answer?.expires_in === 'number' ? answer.expires_in : null;
  const account = await fetchAccount(token, now);
  return {
    ...account,
    token,
    expiresAt: expiresIn !== null ? now + expiresIn * 1000 : null,
  };
}

/** Lichess's page for a personal token, the sync's permissions ticked. */
export function personalTokenUrl(): string {
  const url = new URL('/account/oauth/token/create', LICHESS_ORIGIN);
  for (const scope of LICHESS_SCOPES) url.searchParams.append('scopes[]', scope);
  url.searchParams.set('description', `Chess Trainer (${location.host})`);
  return url.href;
}

/** What Lichess says about a token: whose it is and what it may do; null when it is not valid. */
export async function testToken(
  token: string,
): Promise<{ userId: string; scopes: string[]; expires: number | null } | null> {
  const answer = await lichessJson<Record<string, unknown>>('/api/token/test', { text: token });
  const entry = answer?.[token];
  if (typeof entry !== 'object' || entry === null) return null;
  const { userId, scopes, expires } = entry as Record<string, unknown>;
  if (typeof userId !== 'string') return null;
  return {
    userId,
    scopes: typeof scopes === 'string' ? scopes.split(',').filter(Boolean) : [],
    expires: typeof expires === 'number' ? expires : null,
  };
}

/**
 * Connects with a personal token pasted from Lichess (the way in for a
 * window that cannot finish the sign-in itself): checks that Lichess knows
 * it and that it allows everything the sync does.
 */
export async function connectWithToken(raw: string, now = Date.now()): Promise<ConnectedAccount> {
  const token = raw.trim();
  if (!/^lip_[A-Za-z0-9_]+$/.test(token)) {
    throw new LoginError(
      'A Lichess token starts with “lip_”: copy the whole token from Lichess.',
      'failed',
    );
  }
  const info = await testToken(token);
  if (!info) {
    throw new LoginError(
      'Lichess does not know this token: it was deleted, or it has expired.',
      'failed',
    );
  }
  const missing = LICHESS_SCOPES.filter((scope) => !info.scopes.includes(scope));
  if (missing.length > 0) {
    throw new LoginError(
      `This token does not allow everything the sync needs (${missing.join(', ')}). Create one with the link above: it has them ticked.`,
      'failed',
    );
  }
  const account = await fetchAccount(token, now);
  return { ...account, token, expiresAt: info.expires };
}

/** Revokes a token on Lichess (best effort: a token Lichess no longer knows is fine). */
export async function revokeLichessToken(token: string): Promise<void> {
  try {
    await lichessSend('/api/token', { method: 'DELETE', token });
  } catch {
    // Offline, or already revoked: the device forgets it either way.
  }
}
