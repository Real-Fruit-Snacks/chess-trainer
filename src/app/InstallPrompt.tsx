import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { siteConfig } from '@/site.config';
import { canOfferInstall, useInstall } from './pwa';

/**
 * "Install app" button. On browsers that support the native prompt it triggers
 * it directly; on iOS it explains the Share → Add to Home Screen flow.
 */
export function InstallButton({
  variant = 'secondary',
  size = 'md',
  block = false,
}: {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}) {
  const state = useInstall();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (!canOfferInstall(state)) return null;

  const onClick = async () => {
    if (state.deferred) {
      const outcome = await state.promptInstall();
      if (outcome === 'accepted') {
        toast(`${siteConfig.name} was installed. Find it on your home screen or app list.`, {
          tone: 'success',
        });
      }
      return;
    }
    setShowIosHelp(true);
  };

  return (
    <>
      <Button variant={variant} size={size} block={block} onClick={onClick}>
        <span aria-hidden="true">⤓</span> Install app
      </Button>
      <Dialog
        open={showIosHelp}
        onClose={() => setShowIosHelp(false)}
        title="Install on iPhone or iPad"
      >
        <ol className="stack-sm" style={{ paddingLeft: '1.2em' }}>
          <li>
            Open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap the <strong>Share</strong> button (the square with an arrow).
          </li>
          <li>
            Scroll and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
        <p className="small muted">
          The app then opens full-screen, works offline and keeps your progress on this device.
        </p>
      </Dialog>
    </>
  );
}

/** A dismissible banner nudging first-time visitors to install. */
export function InstallBanner() {
  const state = useInstall();
  if (!canOfferInstall(state) || state.dismissed) return null;
  return (
    <div className="install-banner" role="region" aria-label="Install the app">
      <div>
        <strong>Install {siteConfig.name}</strong>
        <div className="small muted">
          Works offline, opens instantly, keeps your progress on this device.
        </div>
      </div>
      <div className="row">
        <InstallButton variant="primary" size="sm" />
        <Button
          size="sm"
          variant="ghost"
          onClick={state.dismiss}
          aria-label="Dismiss install banner"
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
