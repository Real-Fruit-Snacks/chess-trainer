import { useEffect } from 'react';
import { useImportBackup } from '@/features/settings/useImportBackup';

/**
 * A backup the app was opened with: checked and confirmed like any other
 * import, never applied on its own. Loaded only when such a file arrives.
 */
export default function LaunchImport({ file }: { file: File }) {
  const { offerFile, dialog } = useImportBackup();
  useEffect(() => {
    void offerFile(file);
    // One offer per file: `offerFile` changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  return dialog;
}
