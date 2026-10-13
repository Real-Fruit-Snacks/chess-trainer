import { beginLichessLogin, LICHESS_PLAY_SCOPE, testToken } from '@/lib/lichess/auth';
import { useLichess } from '@/store/lichess';

/**
 * Live games on Lichess, as the waiting room and the game page use them: the
 * check that the sign-in may play, the seek (`lichessSeek.ts`), and the
 * connection to a game (`lichessGame.ts`).
 */
export {
  abortLichessGame,
  lichessSeekAllowed,
  startLichessSeek,
  type LichessSeek,
  type LichessStart,
} from './lichessSeek';
export { createLichessGame } from './lichessGame';

/** Whether the Lichess sign-in can play: 'ok', or what stands in the way. */
export type LichessLiveCheck = 'ok' | 'needs-permission' | 'signed-out' | 'offline';

/** A token's answer is kept this long: its permissions seldom change. */
const CHECK_TTL_MS = 5 * 60_000;
const checks = new Map<string, { at: number; result: Promise<LichessLiveCheck> }>();

/** Forgets the answers kept (the tests start afresh). */
export function forgetLichessLiveChecks(): void {
  checks.clear();
}

/**
 * Asks Lichess what the sign-in may do. A refused token is 'signed-out'; one
 * without the permission to play (a sign-in from before live games) is
 * 'needs-permission'; no answer is 'offline', and is not kept.
 */
export function checkLichessLive(): Promise<LichessLiveCheck> {
  const account = useLichess.getState().account;
  if (!account) return Promise.resolve('signed-out');
  const kept = checks.get(account.token);
  if (kept && Date.now() - kept.at < CHECK_TTL_MS) return kept.result;
  const result = ask(account).catch((): LichessLiveCheck => {
    // No answer is not kept: the next check asks again.
    if (checks.get(account.token)?.result === result) checks.delete(account.token);
    return 'offline';
  });
  checks.set(account.token, { at: Date.now(), result });
  return result;
}

async function ask(account: { id: string; token: string }): Promise<LichessLiveCheck> {
  const info = await testToken(account.token);
  if (info?.userId !== account.id) return 'signed-out';
  return info.scopes.includes(LICHESS_PLAY_SCOPE) ? 'ok' : 'needs-permission';
}

/** Signs in to Lichess again, asking for the permission to play, and comes back to `returnTo`. */
export function reconnectLichessForLive(returnTo: string): Promise<void> {
  return beginLichessLogin({ returnTo });
}
