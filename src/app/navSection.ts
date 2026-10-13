/**
 * Pages that live under another section's nav entry without sharing its URL
 * prefix: the placement quiz is part of Learn.
 */
const SECTION_ALIASES: Record<string, string> = {
  '/placement': '/learn',
};

/** The nav entry a path belongs to: its first segment, or the section it is filed under. */
export function navSection(pathname: string): string {
  const section = `/${pathname.split('/')[1] ?? ''}`;
  return SECTION_ALIASES[section] ?? section;
}
