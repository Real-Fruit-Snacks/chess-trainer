import { type ReactNode, useState } from 'react';
import { toast } from '@/components/ui/toastStore';
import { readBackupFile } from '@/lib/backup';
import { inspectBackup } from '@/store/progress';
import { ImportBackupDialog, type PendingImport } from './ImportBackupDialog';

/**
 * The import flow shared by the Settings page and files the OS opens the app
 * with: read, validate, then ask. Nothing is imported until the learner confirms.
 */
export function useImportBackup(): {
  offerFile: (file: File) => Promise<void>;
  offerParsed: (raw: unknown) => void;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingImport | null>(null);

  const offerParsed = (raw: unknown) => {
    const preview = inspectBackup(raw);
    if (!preview.ok) {
      toast(preview.reason, { tone: preview.problem === 'damaged' ? 'danger' : 'warning' });
      return;
    }
    setPending({ raw, preview });
  };

  const offerFile = async (file: File) => {
    const read = await readBackupFile(file);
    if (!read.ok) {
      toast(read.reason, { tone: 'warning' });
      return;
    }
    offerParsed(read.parsed);
  };

  return {
    offerFile,
    offerParsed,
    dialog: <ImportBackupDialog pending={pending} onClose={() => setPending(null)} />,
  };
}
