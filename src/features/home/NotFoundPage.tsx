import { useEffect } from 'react';
import { Link } from 'react-router';
import { NotFound } from '@/components/ui';
import { siteConfig } from '@/site.config';

export default function NotFoundPage() {
  useEffect(() => {
    document.title = `Page not found · ${siteConfig.name}`;
  }, []);

  return (
    <NotFound>
      <p>
        The page you asked for does not exist. Check the address, or{' '}
        <Link to="/puzzles">solve a puzzle instead</Link>.
      </p>
    </NotFound>
  );
}
