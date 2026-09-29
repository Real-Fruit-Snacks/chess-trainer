import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { siteConfig } from '@/site.config';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

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

    const issueUrl = `${siteConfig.repositoryUrl}/issues/new?template=bug_report.yml&title=${encodeURIComponent(
      `Crash: ${error.message.slice(0, 80)}`,
    )}`;

    return (
      <div className="container" style={{ padding: '64px 16px' }}>
        <h1>Something went wrong</h1>
        <p className="muted">
          The page hit an unexpected error. Your progress is saved locally and is not affected.
        </p>
        <pre className="alert alert--danger" style={{ overflowX: 'auto' }}>
          {error.message}
        </pre>
        <div className="row">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <a className="btn btn--secondary" href={issueUrl} target="_blank" rel="noreferrer">
            Report a bug
          </a>
        </div>
      </div>
    );
  }
}
