import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Toasts } from '@/components/ui/toast';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { InstallButton } from './InstallPrompt';
import { UpdatePrompt } from './UpdatePrompt';
import { useColorScheme } from './theme';
import './shell.css';

const NAV = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/learn', label: 'Learn', icon: '📖' },
  { to: '/puzzles', label: 'Puzzles', icon: '🧩' },
  { to: '/play', label: 'Play', icon: '♞' },
  { to: '/analyze', label: 'Analyze', icon: '🔍' },
  { to: '/progress', label: 'Progress', icon: '📈' },
] as const;

function Logo() {
  return (
    <svg viewBox="0 0 512 512" width="28" height="28" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="110" fill="var(--accent)" />
      <g fill="var(--accent-contrast)">
        <circle cx="256" cy="150" r="54" />
        <path d="M226 196h60c8 0 14 6 14 14s-6 14-14 14h-4c4 40 18 78 42 104h-136c24-26 38-64 42-104h-4c-8 0-14-6-14-14s6-14 14-14z" />
        <path d="M160 340h192c14 0 24 10 24 24v6c0 6-4 10-10 10H146c-6 0-10-4-10-10v-6c0-14 10-24 24-24z" />
        <path d="M132 392h248c10 0 16 8 16 16v6c0 8-6 14-14 14H130c-8 0-14-6-14-14v-6c0-8 6-16 16-16z" />
      </g>
    </svg>
  );
}

function ThemeToggle() {
  const scheme = useSettings((s) => s.colorScheme);
  const update = useSettings((s) => s.update);
  const next = scheme === 'system' ? 'light' : scheme === 'light' ? 'dark' : 'system';
  const label =
    scheme === 'system' ? 'Theme: system' : scheme === 'light' ? 'Theme: light' : 'Theme: dark';
  const icon = scheme === 'system' ? '◐' : scheme === 'light' ? '☀' : '☾';
  return (
    <button
      type="button"
      className="shell__iconbtn"
      onClick={() => update({ colorScheme: next })}
      aria-label={`${label}. Switch theme`}
      title={label}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

export function Shell() {
  useColorScheme();
  const location = useLocation();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell__header">
        <div className="container shell__header-inner">
          <NavLink to="/" className="shell__brand" aria-label={`${siteConfig.name} home`}>
            <Logo />
            <span>{siteConfig.name}</span>
          </NavLink>
          <nav className="shell__nav" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item && item.end}
                className={({ isActive }) => `shell__navlink${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="shell__actions">
            <div className="shell__install">
              <InstallButton size="sm" variant="ghost" />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="shell__main container" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="shell__loading">
              <Spinner label="Loading…" />
            </div>
          }
        >
          <Outlet key={location.pathname.split('/')[1]} />
        </Suspense>
      </main>

      <footer className="shell__footer">
        <div className="container shell__footer-inner">
          <span>
            {siteConfig.name} v{__APP_VERSION__} · Free and open source ·{' '}
            <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </span>
          <span className="faint">
            Engine: Stockfish · Board: Chessground · Puzzles: Lichess (CC0) · Runs entirely in your
            browser
          </span>
        </div>
      </footer>

      <nav className="shell__bottomnav" aria-label="Primary (mobile)">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item && item.end}
            className={({ isActive }) => `shell__bottomlink${isActive ? ' is-active' : ''}`}
          >
            <span className="shell__bottomicon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Toasts />
      {import.meta.env.PROD ? <UpdatePrompt /> : null}
    </div>
  );
}
