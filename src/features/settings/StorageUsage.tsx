import { useEffect, useState } from 'react';
import { Alert, ProgressBar } from '@/components/ui';
import {
  formatBytes,
  STORAGE_LIMIT_BYTES,
  storageUsage,
  useStorageHealth,
} from '@/lib/persistStorage';

/** How much of the browser's local storage the app is using, and whether writes still fit. */
export function StorageUsage() {
  const full = useStorageHealth((s) => s.full);
  const [bytes, setBytes] = useState(0);

  useEffect(() => {
    setBytes(storageUsage().bytes);
  }, [full]);

  return (
    <div className="settings__row" data-testid="storage-usage">
      <div style={{ flex: '1 1 240px' }}>
        <ProgressBar
          value={bytes}
          max={STORAGE_LIMIT_BYTES}
          label={`Local data: ${formatBytes(bytes)} of about ${formatBytes(STORAGE_LIMIT_BYTES)} the browser allows`}
        />
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Local data: {formatBytes(bytes)} of about {formatBytes(STORAGE_LIMIT_BYTES)} the browser
          allows. Imported games and the analysis library take the most room.
        </p>
        {full ? (
          <Alert tone="danger" role="status">
            Storage is full: the latest change could not be saved. Export a backup, then remove old
            analyses or games.
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
