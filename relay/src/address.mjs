/**
 * The address the relay's limits count by, from the client's IP as Cloudflare
 * (or the Node server) reports it. An IPv4 address stands for itself; an IPv6
 * address is reduced to its /64, the block one home or phone is given, so one
 * connection cannot pass for millions of addresses by changing the low bits.
 * An IPv4 address written as IPv6 (`::ffff:192.0.2.1`) is the IPv4 address.
 * Anything unreadable is `unknown`, which shares one allowance.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** An IPv4 address's four bytes, or null. @param {string} text */
function ipv4Bytes(text) {
  const match = IPV4.exec(text);
  if (!match) return null;
  const bytes = match.slice(1).map(Number);
  return bytes.every((b) => b <= 255) ? bytes : null;
}

/** An IPv6 address's eight groups, lowercase and unpadded, or null. @param {string} text */
function ipv6Groups(text) {
  let address = text.replace(/%.*$/, '');
  // A dotted IPv4 address at the end stands for the last two groups.
  const dotted = /^(.*:)([^:]*\.[^:]*)$/.exec(address);
  if (dotted) {
    const bytes = ipv4Bytes(dotted[2] ?? '');
    if (!bytes) return null;
    const [a = 0, b = 0, c = 0, d = 0] = bytes;
    address = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const split = (/** @type {string} */ s) => (s === '' ? [] : s.split(':'));
  const head = split(halves[0] ?? '');
  const tail = halves.length === 2 ? split(halves[1] ?? '') : [];
  const given = head.length + tail.length;
  if (halves.length === 1 ? given !== 8 : given > 7) return null;
  const groups = [...head, ...Array(8 - given).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
}

/**
 * The key a limit per address counts under: `192.0.2.1`, or `2001:db8:1:2::/64`.
 * @param {string | null | undefined} ip
 */
export function addressKey(ip) {
  const text = (ip ?? '').trim();
  const v4 = ipv4Bytes(text);
  if (v4) return v4.join('.');
  const groups = text.includes(':') ? ipv6Groups(text) : null;
  if (!groups) return 'unknown';
  if (groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') {
    const hi = parseInt(groups[6] ?? '0', 16);
    const lo = parseInt(groups[7] ?? '0', 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}
