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
  /** ISO timestamp of the build. */
  const __BUILD_DATE__: string;
}
