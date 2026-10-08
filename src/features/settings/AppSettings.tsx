import { InstallButton } from '@/app/InstallPrompt';
import {
  describeInstallUnavailable,
  installUnavailableReason,
  type OfferState,
  useInstall,
} from '@/app/pwa';
import { badgingSupported } from '@/app/useAppBadge';
import { Card, LinkButton, Switch } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { siteConfig } from '@/site.config';
import { useSettings } from '@/store/settings';
import { OfflinePuzzles } from './OfflinePuzzles';

/** What the installed-app row says; the browser menu route when there is no install prompt. */
function describeInstall(state: OfferState): string {
  const reason = installUnavailableReason(state);
  if (reason === null) return 'Install for offline use and a home-screen icon.';
  const base = describeInstallUnavailable(reason);
  return reason === 'no-prompt'
    ? `${base} Some browsers can still add it from their own menu (“Install app” or “Add to Home Screen”).`
    : base;
}

/** Settings → App: installing it, its icon badge, puzzles for offline use, the test lab, the version. */
export function AppSettings() {
  const appBadge = useSettings((s) => s.appBadge);
  const update = useSettings((s) => s.update);
  const install = useInstall();
  const installText = describeInstall(install);
  return (
    <div className="settings__grid settings__grid--single">
      <Card>
        <h2 style={{ fontSize: '1.15rem' }}>App</h2>
        <div className="settings__group">
          {install.isStandalone ? (
            <p className="small muted" style={{ margin: 0 }}>
              {installText}
            </p>
          ) : (
            <div className="settings__row" data-testid="install-row">
              <span className="small">{installText}</span>
              <InstallButton size="sm" />
            </div>
          )}
          <Switch
            checked={appBadge}
            onChange={(v) => update({ appBadge: v })}
            label="Badge on the app icon"
            description={
              badgingSupported()
                ? 'Show how many reviews are due on the installed app’s icon.'
                : 'Show how many reviews are due on the installed app’s icon (needs the installed app).'
            }
          />
          <OfflinePuzzles />
          <div className="settings__row">
            <span className="small">
              Try every sound, icon, control and platform check on one page — for checking a device
              by hand.
            </span>
            <LinkButton size="sm" to="/settings/lab" data-testid="open-lab">
              Open the test lab
            </LinkButton>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            {siteConfig.name} v{__APP_VERSION__} · built{' '}
            {formatDate(__BUILD_DATE__, siteConfig.locale)} ·{' '}
            <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer">
              Source code
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}
