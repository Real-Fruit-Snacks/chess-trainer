import { useEffect, useState } from 'react';
import { Button, Switch } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { detectThreadEnvironment } from '@/engine/build';
import {
  detectIsolationSupport,
  readIsolationFlag,
  writeIsolationFlag,
  type IsolationSupport,
} from '@/sw/isolation';
import { useSettings } from '@/store/settings';
import { describeThreadsStatus, threadsStatus } from './threadsStatus';

/**
 * The experimental "use more CPU cores" switch. Turning it on records the
 * choice for the service worker (which adds the COOP/COEP headers on the next
 * navigation) and in settings (which picks the threaded build once the page
 * is isolated). Turning it off reverses both.
 */
export function EngineThreadsSetting() {
  const enabled = useSettings((s) => s.engineThreads);
  const update = useSettings((s) => s.update);
  const [support, setSupport] = useState<IsolationSupport>(() => detectIsolationSupport());
  const [flagStored, setFlagStored] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readIsolationFlag().then((stored) => {
      if (!cancelled) setFlagStored(stored);
    });
    // The controller can arrive shortly after load; re-check once it does.
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const onChange = () => setSupport(detectIsolationSupport());
    sw?.addEventListener('controllerchange', onChange);
    return () => {
      cancelled = true;
      sw?.removeEventListener('controllerchange', onChange);
    };
  }, []);

  const status = threadsStatus(enabled, support, detectThreadEnvironment().cores);
  const needsReload =
    (enabled && !support.isolated && support.serviceWorker) ||
    (!enabled && support.isolated) ||
    (flagStored !== null && flagStored !== enabled);

  const toggle = async (next: boolean) => {
    update({ engineThreads: next });
    const stored = await writeIsolationFlag(next);
    setFlagStored(next);
    if (!stored) {
      toast('Could not save the engine setting for the service worker in this browser.', {
        tone: 'danger',
      });
      return;
    }
    toast(
      next
        ? 'Reload the app to start the multi-threaded engine.'
        : 'Reload the app to go back to the single-threaded engine.',
      { tone: 'info', duration: 8000, actionLabel: 'Reload', onAction: () => location.reload() },
    );
  };

  return (
    <div className="settings__threads" data-testid="engine-threads">
      <Switch
        checked={enabled}
        onChange={(v) => void toggle(v)}
        label="Multi-threaded engine (experimental)"
        description="Use several CPU cores for analysis and stronger play. Needs a reload; some browsers do not support it."
      />
      <div className="settings__row" style={{ paddingLeft: 0 }}>
        <span className="small muted" data-testid="engine-threads-status">
          {describeThreadsStatus(status)}
        </span>
        {needsReload ? (
          <Button size="sm" onClick={() => location.reload()}>
            Reload now
          </Button>
        ) : null}
      </div>
    </div>
  );
}
