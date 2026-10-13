/** Types for admission.mjs, for TypeScript callers: the relay's tests. */

/**
 * Makes way for a new socket among a room's sockets yet to say hello (oldest first, the new one
 * not among them): whether it comes in, and which one goes for it.
 */
export function makeWay<C extends { data: { address: string } }>(
  waiting: C[],
  address: string,
): { admit: boolean; evict: C | null };
