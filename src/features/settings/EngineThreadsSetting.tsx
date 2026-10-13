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

/** Whether the browser has service workers at all (not whether one controls the page). */
function serviceWorkerApi(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * The "use several CPU cores" switch, on by default. Its state is recorded for
 * the service worker (which adds the COOP/COEP headers from the next
 * navigation) and in settings (which picks the threaded build once the page
 * is isolated); switching it off reverses both. When the flag cannot be
 * stored the switch goes back, so the setting never says one thing and the
 * service worker another — unless the browser has no service workers at all,
 * where there is no flag to keep.
 */
export function EngineThreadsSetting() {
  const enabled = useSettings((s) => s.engineThreads);
  const update = useSettings((s) => s.update);
  const [support, setSupport] = useState<IsolationSupport>(() => detectIsolationSupport());
  const [flagStored, setFlagStored] = useState<boolean | null>(null);
  /**
   * The page was isolated at load although the flag was off: the headers come
   * from the host, not the service worker, so a reload changes nothing.
   */
  const [hostIsolated, setHostIsolated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let first = true;
    const readFlag = () =>
      readIsolationFlag().then((stored) => {
        if (cancelled) return;
        if (first) {
          first = false;
          setHostIsolated(!stored && detectIsolationSupport().isolated);
        }
        setFlagStored(stored);
      });
    void readFlag();
    // The controller can arrive shortly after load; re-check once it does.
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const onChange = () => setSupport(detectIsolationSupport());
    sw?.addEventListener('controllerchange', onChange);
    return () => {
      cancelled = true;
      sw?.removeEventListener('controllerchange', onChange);
    };
  }, []);

  // "Reset everything" switches the flag off from outside this component: re-read it.
  useEffect(() => {
    let cancelled = false;
    void readIsolationFlag().then((stored) => {
      if (!cancelled) setFlagStored(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const status = threadsStatus(
    enabled,
    support,
    detectThreadEnvironment().cores,
    serviceWorkerApi(),
  );
  // A reload changes something only when the stored flag (what the service worker
  // will apply next time) disagrees with what the page is now — and not when the
  // page is isolated by the host's own headers, which no reload will undo. On a
  // first visit the worker may not control the page yet; a reload is still the way
  // on, so the button does not wait for it (and the page does not shift when it comes).
  const needsReload =
    serviceWorkerApi() &&
    flagStored !== null &&
    flagStored !== support.isolated &&
    !(hostIsolated && !flagStored);

  const toggle = async (next: boolean) => {
    const previous = useSettings.getState().engineThreads;
    update({ engineThreads: next });
    // Without service workers nothing adds the headers, so there is no flag to keep in step
    // (and threads cannot run here either way).
    if (!serviceWorkerApi()) return;
    const stored = await writeIsolationFlag(next);
    if (!stored) {
      update({ engineThreads: previous });
      toast(
        'Could not save the engine setting for the service worker in this browser, so it was left as it was.',
        { tone: 'danger' },
      );
      return;
    }
    setFlagStored(next);
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
        label="Multi-threaded engine"
        description="Uses several CPU cores, so analysis goes deeper and the engine plays stronger. A change takes effect after a reload; where a browser cannot run threads, one core is used."
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
