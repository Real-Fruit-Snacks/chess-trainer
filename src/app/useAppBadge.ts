import { useEffect } from 'react';
import { useSettings } from '@/store/settings';

/**
 * Shows a count on the installed app's icon (Badging API) and clears it when
 * there is nothing due. Silently does nothing where the API is missing.
 */
export function badgingSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function';
}

export async function applyAppBadge(count: number): Promise<void> {
  if (!badgingSupported()) return;
  try {
    if (count > 0) await navigator.setAppBadge(count);
    else await navigator.clearAppBadge?.();
  } catch {
    // Badging can be denied or unavailable outside an installed app.
  }
}

export function useAppBadge(dueCount: number): void {
  const enabled = useSettings((s) => s.appBadge);
  useEffect(() => {
    void applyAppBadge(enabled ? dueCount : 0);
  }, [enabled, dueCount]);
}
