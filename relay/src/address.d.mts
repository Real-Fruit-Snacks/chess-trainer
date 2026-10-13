/** Types for address.mjs. */

/**
 * The key a limit per address counts under: an IPv4 address as it is, an IPv6
 * address as its /64 (`2001:db8:1:2::/64`), `unknown` for anything else.
 */
export function addressKey(ip: string | null | undefined): string;
