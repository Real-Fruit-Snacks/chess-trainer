/**
 * Single source of truth for site-wide branding and metadata.
 *
 * Both the Vite build (manifest, <title>, meta tags) and the running app import
 * from here, so renaming the project is a one-file change.
 */
export const siteConfig = {
  /** Full product name shown in the header, manifest and page titles. */
  name: 'Chess Trainer',
  /** Short name used on home screens where space is limited (≤ 12 chars). */
  shortName: 'Chess',
  tagline: 'Learn, practice and solve — at any level.',
  description:
    'A free, open-source chess trainer that runs entirely in your browser: interactive lessons, ' +
    'rating-aware puzzles, games against a scalable engine and a full analysis board. Works offline.',
  /** Public repository. Used for "Edit this lesson", bug reports and the footer link. */
  repositoryUrl: 'https://github.com/Real-Fruit-Snacks/chess-trainer',
  /** Brand colour used for the PWA theme colour and accents. */
  themeColor: '#1f6f5b',
  backgroundColor: '#0f1512',
  /** Locale used for dates and number formatting. */
  locale: 'en-US',
} as const;

export type SiteConfig = typeof siteConfig;
