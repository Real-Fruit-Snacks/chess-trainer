import type { ThreatPosition } from './threats';

let positions: Promise<readonly ThreatPosition[]> | null = null;

/**
 * The bundled positions of the threat drill (scripts/build-threats.mjs), in a
 * chunk of their own that loads with the drill. A failed load (offline before
 * the app was cached) is retried on the next call.
 */
export function loadThreatPositions(): Promise<readonly ThreatPosition[]> {
  positions ??= import('./threat-positions.json').then(
    (module) => module.default as readonly ThreatPosition[],
    (err: unknown) => {
      positions = null;
      throw err;
    },
  );
  return positions;
}
