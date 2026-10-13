import { siteConfig } from '@/site.config';

/** What a bug report needs to be reproducible: the build, the browser and where it happened. */
export interface ReportContext {
  version: string;
  builtAt: string;
  /** The commit built, to find the source maps CI archived for it ('' or absent when unknown). */
  commit?: string;
  route: string;
  userAgent: string;
  standalone: boolean;
  viewport: string;
  language: string;
}

export function reportContext(): ReportContext {
  const hasWindow = typeof window !== 'undefined';
  const nav = hasWindow ? (navigator as Navigator & { standalone?: boolean }) : null;
  return {
    version: __APP_VERSION__,
    builtAt: __BUILD_DATE__,
    commit: __BUILD_COMMIT__,
    route: hasWindow ? window.location.pathname + window.location.search : '',
    userAgent: nav?.userAgent ?? '',
    standalone:
      hasWindow && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches || nav?.standalone === true
        : nav?.standalone === true,
    viewport: hasWindow ? `${window.innerWidth}×${window.innerHeight}` : '',
    language: nav?.language ?? '',
  };
}

/**
 * The crash details as plain text, for the clipboard or an issue. The stack is
 * minified; the commit names the source maps CI archived for this build.
 */
export function describeCrash(error: Error, context: ReportContext = reportContext()): string {
  const stack = (error.stack ?? '').split('\n').slice(0, 8).join('\n');
  const commit = context.commit ? `, commit ${context.commit}` : '';
  return [
    `${siteConfig.name} ${context.version} (built ${context.builtAt}${commit})`,
    `Route: ${context.route}`,
    `Browser: ${context.userAgent}${context.standalone ? ' (installed app)' : ''}`,
    `Viewport: ${context.viewport} · Language: ${context.language}`,
    '',
    `${error.name}: ${error.message}`,
    stack,
  ].join('\n');
}

/**
 * A "new issue" link whose form fields are already filled in with the crash
 * details (GitHub issue forms take their field ids as query parameters).
 */
export function crashIssueUrl(error: Error, context: ReportContext = reportContext()): string {
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: `Crash: ${error.message.slice(0, 80)}`,
    what: `The page crashed with "${error.message}".`,
    steps: `1. Open ${context.route || '/'}\n2. …`,
    browser: `${context.userAgent}${context.standalone ? ' (installed app)' : ''} · ${siteConfig.name} ${context.version}`,
    console: describeCrash(error, context),
  });
  return `${siteConfig.repositoryUrl}/issues/new?${params.toString()}`;
}
