import { lazy, Suspense, useEffect, useState } from 'react';
import { FILLER_PREFIX, PROBE_KEY } from '@/features/lab/labKeys';
import { consumeLaunchFiles } from '@/lib/launchQueue';
import { removeFullEngine } from '@/engine/fullEngine';
import { useLichess } from '@/store/lichess';
import { useSettings } from '@/store/settings';
import { syncIsolationFlag } from '@/sw/isolation';
import { useAppBadge } from './useAppBadge';
import { useDueCount } from './useDueCount';

const LaunchImport = lazy(() => import('./LaunchImport'));

/** Whether the test lab left its storage filler (or probe) behind. */
function hasLabLeftovers(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === PROBE_KEY || key?.startsWith(FILLER_PREFIX)) return true;
    }
  } catch {
    // Storage that cannot be read holds no filler we could remove.
  }
  return false;
}

/**
 * Integrations with the platform the app is installed on: the icon badge with
 * the number of due reviews, and backups opened from the file manager — which
 * are checked and confirmed like any other import, never applied on their own.
 * Also tidies up after the test lab, whose storage filler must not outlive it,
 * keeps the service worker's isolation flag in step with the threads
 * setting, and clears away a full engine that is switched off. While a
 * Lichess account is connected, the account sync runs on its own. The import
 * dialog, the lab code and the sync load only when they are needed.
 */
export function PlatformHooks() {
  const due = useDueCount();
  useAppBadge(due.total);
  const [launchFile, setLaunchFile] = useState<File | null>(null);
  const engineThreads = useSettings((s) => s.engineThreads);
  const lichessConnected = useLichess((s) => s.account !== null && !s.needsReconnect);

  // The service worker reads the threads choice from its own flag: a save from before
  // threads were the default, or a change made in another tab, brings it in line.
  useEffect(() => {
    void syncIsolationFlag(engineThreads);
  }, [engineThreads]);

  // The full engine's files go with the switch. A download stopped half-way can still
  // land after the switch went off (the service worker finishes what it started), or a
  // reset may have switched it off: either way, they are removed at the next start.
  useEffect(() => {
    if (!useSettings.getState().engineFull) void removeFullEngine();
  }, []);

  useEffect(() => {
    if (!hasLabLeftovers()) return;
    void import('@/features/lab/storageTest')
      .then((lab) => lab.clearLabStorage())
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    consumeLaunchFiles((file) => setLaunchFile(file));
  }, []);

  useEffect(() => {
    if (!lichessConnected) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import('@/lib/lichess/sync')
      .then((sync) => {
        if (!cancelled) stop = sync.startLichessSync();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [lichessConnected]);

  if (!launchFile) return null;
  return (
    <Suspense fallback={null}>
      <LaunchImport file={launchFile} />
    </Suspense>
  );
}
