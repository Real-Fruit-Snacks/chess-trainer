import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, ConfirmDialog, LinkButton } from '@/components/ui';
import { crashIssueUrl, describeCrash } from '@/lib/diagnostics';
import { isChunkLoadError, normaliseError, resetAppData } from './crash';

interface Props {
  children: ReactNode;
  /**
   * A caught error is cleared when this changes (the route, for the boundary
   * around the page), so the next page starts afresh instead of inheriting the
   * crash of the one before.
   */
  resetKey?: string;
  /**
   * Rendered inside the shell: the header and the navigation stay, and the crash
   * page is a card in the main region. Only this boundary listens for chunk
   * loads that fail outside React (see `isChunkLoadError`).
   */
  inline?: boolean;
}

interface State {
  error: Error | null;
  /** The clipboard copy's feedback, shown inline: toasts may not be mounted here. */
  copied: 'idle' | 'copied' | 'failed';
  resetOpen: boolean;
}

/**
 * The last line of defence: a crash anywhere in the page tree shows this
 * instead of a blank screen, with the details a bug report needs already
 * filled in. Progress is persisted on every change, so nothing is lost.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: 'idle', resetOpen: false };
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError(thrown: unknown): Partial<State> {
    return { error: normaliseError(thrown), copied: 'idle' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, copied: 'idle' });
    }
  }

  componentDidMount(): void {
    if (!this.props.inline) return;
    window.addEventListener('unhandledrejection', this.onRejection);
    window.addEventListener('vite:preloadError', this.onPreloadError);
    window.addEventListener('error', this.onWindowError);
  }

  componentWillUnmount(): void {
    clearTimeout(this.copiedTimer);
    if (!this.props.inline) return;
    window.removeEventListener('unhandledrejection', this.onRejection);
    window.removeEventListener('vite:preloadError', this.onPreloadError);
    window.removeEventListener('error', this.onWindowError);
  }

  // Only a failed chunk load becomes a crash page: it leaves the page half
  // rendered with no way on, and a reload is the fix. Every other stray
  // rejection is logged by the browser as before.
  private readonly onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    if (!isChunkLoadError(reason)) return;
    event.preventDefault();
    this.setState({ error: normaliseError(reason), copied: 'idle' });
  };

  private readonly onPreloadError = (event: VitePreloadErrorEvent) => {
    event.preventDefault();
    this.setState({ error: normaliseError(event.payload), copied: 'idle' });
  };

  private readonly onWindowError = (event: ErrorEvent) => {
    const thrown: unknown = event.error ?? event.message;
    if (!isChunkLoadError(thrown)) return;
    this.setState({ error: normaliseError(thrown), copied: 'idle' });
  };

  private readonly copy = async (details: string) => {
    clearTimeout(this.copiedTimer);
    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: 'copied' });
    } catch {
      this.setState({ copied: 'failed' });
    }
    this.copiedTimer = setTimeout(() => this.setState({ copied: 'idle' }), 2500);
  };

  render(): ReactNode {
    const { error, copied, resetOpen } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);
    const details = describeCrash(error);
    const copyLabel =
      copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Could not copy' : 'Copy details';

    return (
      <div
        className={this.props.inline ? 'card crash crash--inline' : 'container crash'}
        data-testid="crash-page"
      >
        <h1>{stale ? 'A new version is ready' : 'Something went wrong'}</h1>
        <p className="muted">
          {stale
            ? 'Part of the page could not load because the app was updated while this tab was open. Reload to get the new version — your progress is saved locally and is not affected.'
            : 'The page hit an unexpected error. Your progress is saved locally and is not affected.'}
        </p>
        {stale ? null : <pre className="alert alert--danger crash__details">{details}</pre>}
        <div className="row crash__actions">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <LinkButton to="/" reloadDocument>
            Go home
          </LinkButton>
          {stale ? null : (
            <>
              <Button onClick={() => void this.copy(details)}>{copyLabel}</Button>
              <span className="sr-only" role="status">
                {copied === 'copied'
                  ? 'Crash details copied.'
                  : copied === 'failed'
                    ? 'Could not access the clipboard.'
                    : ''}
              </span>
              <a
                className="btn btn--secondary"
                href={crashIssueUrl(error)}
                target="_blank"
                rel="noreferrer"
              >
                Report a bug
              </a>
              <Button variant="ghost" onClick={() => this.setState({ resetOpen: true })}>
                Reset app data
              </Button>
            </>
          )}
        </div>
        <ConfirmDialog
          open={resetOpen}
          title="Reset app data?"
          confirmLabel="Reset and reload"
          danger
          onConfirm={() => {
            void resetAppData().then(() => {
              window.location.assign(import.meta.env.BASE_URL);
            });
          }}
          onClose={() => this.setState({ resetOpen: false })}
        >
          <p>
            This removes everything the app has stored in this browser — progress, settings,
            repertoires, saved analyses and imported games for every profile — and starts again from
            the home page. If the crash keeps you from reaching Settings, export a backup from
            another tab first if you can.
          </p>
        </ConfirmDialog>
      </div>
    );
  }
}
