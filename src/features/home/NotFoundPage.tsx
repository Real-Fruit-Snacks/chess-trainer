import { useEffect } from 'react';
import { EmptyState, LinkButton } from '@/components/ui';
import { siteConfig } from '@/site.config';

export default function NotFoundPage() {
  useEffect(() => {
    document.title = `Page not found · ${siteConfig.name}`;
  }, []);

  return (
    <EmptyState icon="♞" title="That square is off the board">
      <p>The page you asked for does not exist.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <LinkButton variant="primary" to="/">
          Go home
        </LinkButton>
        <LinkButton to="/puzzles">Solve a puzzle instead</LinkButton>
      </div>
    </EmptyState>
  );
}
