/**
 * Which socket yet to say hello makes way for a new one in a room (a game's,
 * room.mjs, or a group's, group.mjs): the rooms keep few of those, so that
 * sockets held open without a word cannot fill a room, and so that they
 * cannot keep a player out of their own game either.
 *
 * One address keeps `ABUSE_LIMITS.unsaidPerAddress` of them in a room: a new
 * one from it sends its own oldest away. A room keeps `ABUSE_LIMITS.unsaid`
 * of them in all: when it has as many, the address holding the most gives
 * way (its oldest goes; of addresses holding as many, the one heard from
 * last), unless the new socket's own address holds as many, when the new
 * socket is refused. A player whose address has nothing waiting in the room
 * is never refused, whoever else is flooding it, and nobody can send away a
 * socket of theirs without holding more than they do.
 *
 * A socket of no known address ('', the Node server's own machine) is not
 * held to the limit per address, and counts as one address in the room's.
 */
import { ABUSE_LIMITS } from './shared.mjs';

/**
 * Makes way for a new socket among those yet to say hello.
 * @template {{ data: { address: string } }} C
 * @param {C[]} waiting the room's sockets yet to say hello, oldest first, the new one not among them
 * @param {string} address the new socket's address ('' when not known)
 * @returns {{ admit: boolean, evict: C | null }} whether the new socket comes in, and
 *   which one goes for it (as if its time to say hello were up)
 */
export function makeWay(waiting, address) {
  const mine = address ? waiting.filter((c) => c.data.address === address) : [];
  if (mine.length >= ABUSE_LIMITS.unsaidPerAddress) return { admit: true, evict: mine[0] ?? null };
  if (waiting.length < ABUSE_LIMITS.unsaid) return { admit: true, evict: null };
  /** Each address's sockets waiting, and when it was last heard from (its newest's place). */
  /** @type {Map<string, { count: number, last: number }>} */
  const held = new Map();
  waiting.forEach((c, i) => {
    const known = held.get(c.data.address);
    held.set(c.data.address, { count: (known?.count ?? 0) + 1, last: i });
  });
  /** @type {string | null} */
  let most = null;
  for (const [key, h] of held) {
    const top = most === null ? null : held.get(most);
    if (!top || h.count > top.count || (h.count === top.count && h.last > top.last)) most = key;
  }
  const own = held.get(address)?.count ?? 0;
  const top = most === null ? 0 : (held.get(most)?.count ?? 0);
  if (most === null || own >= top) return { admit: false, evict: null };
  return { admit: true, evict: waiting.find((c) => c.data.address === most) ?? null };
}
