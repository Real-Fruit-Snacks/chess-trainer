import { type ReactNode, useRef, useState } from 'react';
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
  // Each file offered is its own question, with a dialog of its own: a file picked again just
  // after Cancel is asked about afresh, and the closing of the dialog before it (an event that
  // comes a moment later) does not take the new question away.
  const [pending, setPending] = useState<(PendingImport & { id: number }) | null>(null);
  const offers = useRef(0);

  const offerParsed = (raw: unknown) => {
    const preview = inspectBackup(raw);
    if (!preview.ok) {
      toast(preview.reason, { tone: preview.problem === 'damaged' ? 'danger' : 'warning' });
      return;
    }
    offers.current += 1;
    setPending({ raw, preview, id: offers.current });
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
    dialog: (
      <ImportBackupDialog
        key={pending?.id ?? 0}
        pending={pending}
        onClose={() => {
          const closing = pending?.id;
          setPending((current) => (current && current.id === closing ? null : current));
        }}
      />
    ),
  };
}
