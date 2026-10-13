/**
 * The one placeholder for "no value yet" in stats, tables and labels (an em
 * dash). Every page uses this constant rather than its own dash so the
 * placeholders read the same everywhere.
 */
export const NONE = '—';

/** A count for display, with thousands separators ("24,128"), in the given locale. */
export function formatCount(count: number, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(count);
}
