/**
 * Single source of truth for site-wide branding and metadata.
 *
 * Both the Vite build (manifest, <title>, meta tags — see the html transform
 * in vite.config.ts) and the running app import from here, so renaming the
 * project or changing its one tagline is a one-file change.
 */
export const siteConfig = {
  /** Full product name shown in the header, manifest and page titles. */
  name: 'Chess Trainer',
  /** Short name used on home screens where space is limited (≤ 12 chars). */
  shortName: 'Chess',
  /** The one tagline: the <title>, the social cards and the home page all use it. */
  tagline: 'Learn, practise and solve at any level',
  description:
    'A free, open-source chess trainer that runs entirely in your browser: interactive lessons, ' +
    'rating-aware puzzles, games against a scalable engine and a full analysis board. Works offline.',
  /** Where the app is published; absolute social-card URLs are built from it. */
  siteUrl: 'https://real-fruit-snacks.github.io/chess-trainer/',
  /** Public repository. Used for "Edit this lesson", bug reports and the footer link. */
  repositoryUrl: 'https://github.com/Real-Fruit-Snacks/chess-trainer',
  /**
   * The device-sync relay (relay/, deployed with `npm run relay:deploy`): where the encrypted
   * copy of each learner's data is kept between devices. Its origin joins the page's
   * connect-src. An empty string turns device sync off: Settings does not offer it.
   */
  syncRelay: 'https://chess-trainer-sync.real-fruit-snacks.workers.dev',
  /** Brand colour used for the manifest theme colour and accents. */
  themeColor: '#1f6f5b',
  /** The page background in each scheme: the browser UI colour follows the page, not the accent. */
  lightBackgroundColor: '#f6f4ef',
  backgroundColor: '#0f1512',
  blackBackgroundColor: '#000000',
  /** Locale used for dates and number formatting. */
  locale: 'en-GB',
} as const;

export type SiteConfig = typeof siteConfig;
