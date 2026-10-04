/// <reference types="vite/client" />

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** chessground's custom piece element, reused for piece icons. */
      piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

declare global {
  /** Injected at build time from package.json (see vite.config.ts). */
  const __APP_VERSION__: string;
  /** ISO timestamp of the build: the commit's date, so a rebuild changes nothing (vite.config.ts). */
  const __BUILD_DATE__: string;
  /** Abbreviated hash of the commit that was built ('' outside a git checkout). */
  const __BUILD_COMMIT__: string;
}
