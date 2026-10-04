import { lazy, Suspense, useEffect, useState } from 'react';
import { FILLER_PREFIX, PROBE_KEY } from '@/features/lab/labKeys';
import { consumeLaunchFiles } from '@/lib/launchQueue';
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
 * Also tidies up after the test lab, whose storage filler must not outlive it.
 * The import dialog and the lab code load only when they are needed.
 */
export function PlatformHooks() {
  const due = useDueCount();
  useAppBadge(due.total);
  const [launchFile, setLaunchFile] = useState<File | null>(null);

  useEffect(() => {
    if (!hasLabLeftovers()) return;
    void import('@/features/lab/storageTest')
      .then((lab) => lab.clearLabStorage())
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    consumeLaunchFiles((file) => setLaunchFile(file));
  }, []);

  if (!launchFile) return null;
  return (
    <Suspense fallback={null}>
      <LaunchImport file={launchFile} />
    </Suspense>
  );
}
