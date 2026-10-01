import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, LinkButton } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { crashIssueUrl, describeCrash } from '@/lib/diagnostics';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last line of defence: a crash anywhere in the page tree shows this
 * instead of a blank screen, with the details a bug report needs already
 * filled in. Progress is persisted on every change, so nothing is lost.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const details = describeCrash(error);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(details);
        toast('Crash details copied.');
      } catch {
        toast('Could not access the clipboard.', { tone: 'warning' });
      }
    };

    return (
      <div className="container" style={{ padding: '64px 16px' }} data-testid="crash-page">
        <h1>Something went wrong</h1>
        <p className="muted">
          The page hit an unexpected error. Your progress is saved locally and is not affected.
        </p>
        <pre className="alert alert--danger" style={{ overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
          {details}
        </pre>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <LinkButton to="/" reloadDocument>
            Go home
          </LinkButton>
          <Button onClick={() => void copy()}>Copy details</Button>
          <a
            className="btn btn--secondary"
            href={crashIssueUrl(error)}
            target="_blank"
            rel="noreferrer"
          >
            Report a bug
          </a>
        </div>
      </div>
    );
  }
}
