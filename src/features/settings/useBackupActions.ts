import { useState } from 'react';
import { toast } from '@/components/ui/toastStore';
import { canShareBackup, downloadBackup, markBackedUp, shareBackup } from '@/lib/backup';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';

/** Export or share the current progress and remember that it happened. */
export function useBackupActions() {
  const exportState = useProgress((s) => s.exportState);
  const ratedAttempts = useProgress((s) => s.ratedAttempts);
  const [busy, setBusy] = useState(false);

  const download = () => {
    downloadBackup(exportState());
    markBackedUp(ratedAttempts);
    toast('Backup saved.', { tone: 'success' });
  };

  const share = async () => {
    setBusy(true);
    try {
      const done = await shareBackup(exportState(), siteConfig.name);
      if (done) {
        markBackedUp(ratedAttempts);
        toast('Backup shared. Open it in the app on the other device to import it.', {
          tone: 'success',
        });
      }
    } catch {
      download();
    } finally {
      setBusy(false);
    }
  };

  return { download, share, busy, canShare: canShareBackup() };
}
