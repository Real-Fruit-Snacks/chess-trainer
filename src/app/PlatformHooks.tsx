import { useEffect } from 'react';
import { toast } from '@/components/ui/toastStore';
import { consumeLaunchFiles } from '@/lib/backup';
import { useProgress } from '@/store/progress';
import { useAppBadge } from './useAppBadge';
import { useDueCount } from './useDueCount';

/**
 * Integrations with the platform the app is installed on: the icon badge with
 * the number of due reviews, and backups opened from the file manager.
 */
export function PlatformHooks() {
  const due = useDueCount();
  useAppBadge(due.total);

  useEffect(() => {
    consumeLaunchFiles((file) => {
      file
        .text()
        .then((text) => {
          const parsed: unknown = JSON.parse(text);
          if (useProgress.getState().importState(parsed)) {
            toast('Progress imported from the backup file.', { tone: 'success' });
          } else {
            toast('That file is not a Chess Trainer backup.', { tone: 'warning' });
          }
        })
        .catch(() => toast('Could not read that file.', { tone: 'danger' }));
    });
  }, []);

  return null;
}
