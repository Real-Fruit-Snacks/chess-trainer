import { siteConfig } from '@/site.config';

/**
 * Where live games reach the relay: the device-sync relay of this build
 * (`siteConfig.syncRelay`), whose WebSocket paths are /v1/lobby and
 * /v1/games/:id. Read at each call, not once, so a test can point it elsewhere.
 */

/** The relay's address without a trailing slash; '' when this build has no relay. */
export function relayBase(): string {
  return siteConfig.syncRelay.trim().replace(/\/+$/, '');
}

/** The WebSocket address of a path on the relay (http → ws, https → wss); null without a relay. */
export function liveSocketUrl(path: string): string | null {
  const base = relayBase();
  const match = /^(https?):\/\/(.+)$/i.exec(base);
  if (!match) return null;
  const scheme = (match[1] as string).toLowerCase() === 'https' ? 'wss' : 'ws';
  return `${scheme}://${match[2] as string}${path}`;
}

/** The relay's health check, which says whether it runs live games. */
export function relayHealthUrl(): string | null {
  const base = relayBase();
  return base ? `${base}/v1/health` : null;
}
