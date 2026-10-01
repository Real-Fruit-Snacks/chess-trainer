import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Spinner, Icon, type IconName } from '@/components/ui';
import { Toasts } from '@/components/ui/toast';
import { siteConfig } from '@/site.config';
import { activeProfile, useProfiles } from '@/store/profiles';
import { useSettings } from '@/store/settings';
import { InstallButton } from './InstallPrompt';
import { PlatformHooks } from './PlatformHooks';
import { ShortcutsDialog } from './ShortcutsDialog';
import { UpdatePrompt } from './UpdatePrompt';
import { useColorScheme, usePieceSet } from './theme';
import { useShortcutsDialog } from './useShortcutsDialog';
import './shell.css';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Short explanation shown in the "More" menus. */
  blurb?: string;
}

/** Desktop header links. */
const DESKTOP_NAV: NavItem[] = [
  { to: '/learn', label: 'Learn', icon: 'learn' },
  { to: '/puzzles', label: 'Puzzles', icon: 'puzzles' },
  { to: '/drills', label: 'Drills', icon: 'drills' },
  { to: '/openings', label: 'Openings', icon: 'openings' },
  { to: '/play', label: 'Play', icon: 'play' },
  { to: '/analyze', label: 'Analyze', icon: 'analyze' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
];

/** A titled group of links in a "More" menu. */
interface NavGroup {
  title: string;
  items: NavItem[];
}

const ARCADE: NavItem = {
  to: '/arcade',
  label: 'Arcade',
  icon: 'gamepad',
  blurb: 'Eight games, not puzzles',
};
const MY_GAMES: NavItem = {
  to: '/games',
  label: 'My games',
  icon: 'games',
  blurb: 'Your games, reviewed',
};
const CLASSICS: NavItem = {
  to: '/classics',
  label: 'Classic games',
  icon: 'classics',
  blurb: 'Guess the move',
};
const STUDIES: NavItem = {
  to: '/studies',
  label: 'Endgame studies',
  icon: 'studies',
  blurb: 'Find the only move',
};
const PATTERNS: NavItem = {
  to: '/patterns',
  label: 'Mating patterns',
  icon: 'patterns',
  blurb: 'The named mates',
};
const REFERENCE: NavItem = {
  to: '/reference',
  label: 'Reference',
  icon: 'reference',
  blurb: 'Rules and glossary',
};
const SETTINGS: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: 'settings',
  blurb: 'Appearance, engine, backups',
};

/** Extra sections behind the desktop "More" menu, one column per group. */
const DESKTOP_MORE: NavGroup[] = [
  { title: 'Games', items: [ARCADE, MY_GAMES, CLASSICS] },
  { title: 'Train', items: [STUDIES, PATTERNS] },
  { title: 'App', items: [REFERENCE, SETTINGS] },
];

/** Mobile bottom bar. */
const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/learn', label: 'Learn', icon: 'learn' },
  { to: '/puzzles', label: 'Puzzles', icon: 'puzzles' },
  { to: '/play', label: 'Play', icon: 'play' },
];

/** Everything else, in the mobile "More" sheet. */
const MOBILE_MORE: NavGroup[] = [
  {
    title: 'Train',
    items: [
      { to: '/drills', label: 'Drills', icon: 'drills', blurb: 'Vision and endgames' },
      { to: '/openings', label: 'Openings', icon: 'openings', blurb: 'Repertoire trainer' },
      STUDIES,
      PATTERNS,
    ],
  },
  { title: 'Games', items: [ARCADE, MY_GAMES, CLASSICS] },
  {
    title: 'Tools',
    items: [
      { to: '/analyze', label: 'Analyze', icon: 'analyze', blurb: 'Engine analysis board' },
      { to: '/progress', label: 'Progress', icon: 'progress', blurb: 'Stats and records' },
      REFERENCE,
      SETTINGS,
    ],
  },
];

const MORE_PATHS = new Set(
  [...DESKTOP_MORE, ...MOBILE_MORE].flatMap((group) => group.items.map((i) => i.to)),
);

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

/** The active profile's name, shown only once a second profile exists. */
function ProfileBadge() {
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  if (profiles.length < 2) return null;
  const current = activeProfile({ profiles, activeId });
  return (
    <Link
      to="/settings#profiles"
      className="shell__profile"
      title="Switch profile"
      data-testid="profile-badge"
    >
      {current.name}
    </Link>
  );
}

function ThemeToggle() {
  const scheme = useSettings((s) => s.colorScheme);
  const update = useSettings((s) => s.update);
  const next = scheme === 'system' ? 'light' : scheme === 'light' ? 'dark' : 'system';
  const label =
    scheme === 'system' ? 'Theme: system' : scheme === 'light' ? 'Theme: light' : 'Theme: dark';
  const icon: IconName = scheme === 'system' ? 'auto' : scheme === 'light' ? 'sun' : 'moon';
  return (
    <button
      type="button"
      className="shell__iconbtn"
      onClick={() => update({ colorScheme: next })}
      aria-label={`${label}. Switch theme`}
      title={label}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** A "More" button with a dropdown (desktop) or bottom sheet (mobile) of extra sections. */
function MoreMenu({
  groups,
  variant,
  active,
}: {
  groups: NavGroup[];
  variant: 'dropdown' | 'sheet';
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close on navigation, outside click and Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`more more--${variant}`} ref={ref}>
      <button
        type="button"
        className={
          variant === 'dropdown'
            ? `shell__navlink${active ? ' is-active' : ''}`
            : `shell__bottomlink${active ? ' is-active' : ''}`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {variant === 'sheet' ? (
          <span className="shell__bottomicon" aria-hidden="true">
            <Icon name="more" size={22} />
          </span>
        ) : null}
        <span>More</span>
        {variant === 'dropdown' ? <Icon name="chevron-down" size={14} /> : null}
      </button>
      {open ? (
        <div className="more__menu" role="menu" aria-label="More sections">
          {groups.map((group) => (
            <div key={group.title} className="more__group" role="group" aria-label={group.title}>
              <span className="more__heading" aria-hidden="true">
                {group.title}
              </span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={({ isActive }) => `more__item${isActive ? ' is-active' : ''}`}
                >
                  <span className="more__icon" aria-hidden="true">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <span className="more__text">
                    <span className="more__label">{item.label}</span>
                    {item.blurb ? <span className="more__blurb">{item.blurb}</span> : null}
                  </span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Shell() {
  useColorScheme();
  usePieceSet();
  const location = useLocation();
  const section = `/${location.pathname.split('/')[1] ?? ''}`;
  const inMore = MORE_PATHS.has(section);
  const shortcuts = useShortcutsDialog();
  const mainRef = useRef<HTMLElement>(null);

  // After in-app navigation, move keyboard focus (and the screen reader's
  // reading position) to the new page rather than leaving it on the old link.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="shell">
      <PlatformHooks />
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
            {DESKTOP_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `shell__navlink${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
            <MoreMenu
              groups={DESKTOP_MORE}
              variant="dropdown"
              active={DESKTOP_MORE.some((g) => g.items.some((i) => i.to === section))}
            />
          </nav>
          <div className="shell__actions">
            <div className="shell__install">
              <InstallButton size="sm" variant="ghost" />
            </div>
            <ProfileBadge />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="shell__main container" tabIndex={-1} ref={mainRef}>
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
            browser ·{' '}
            <button type="button" className="linklike" onClick={() => shortcuts.setOpen(true)}>
              Keyboard shortcuts
            </button>
          </span>
        </div>
      </footer>
      <ShortcutsDialog open={shortcuts.open} onClose={() => shortcuts.setOpen(false)} />

      <nav className="shell__bottomnav" aria-label="Primary (mobile)">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `shell__bottomlink${isActive ? ' is-active' : ''}`}
          >
            <span className="shell__bottomicon" aria-hidden="true">
              <Icon name={item.icon} size={22} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <MoreMenu groups={MOBILE_MORE} variant="sheet" active={inMore} />
      </nav>

      <Toasts />
      {import.meta.env.PROD ? <UpdatePrompt /> : null}
    </div>
  );
}
