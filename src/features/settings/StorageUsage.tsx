import { useEffect, useState } from 'react';
import { Alert, ProgressBar } from '@/components/ui';
import { formatBytes, storageUsage, useStorageHealth } from '@/lib/persistStorage';

/**
 * How much of the browser's local storage the app is using, and whether writes
 * still fit. The limit is what the lab's fill test measured on this device, or
 * the usual 5 MB as a rough guide.
 */
export function StorageUsage() {
  const full = useStorageHealth((s) => s.full);
  const failedKey = useStorageHealth((s) => s.failedKey);
  const [usage, setUsage] = useState(() => storageUsage());

  useEffect(() => {
    setUsage(storageUsage());
  }, [full, failedKey]);

  const limitText = usage.measured
    ? `${formatBytes(usage.limit)} this browser allows (measured by the test lab)`
    : `about ${formatBytes(usage.limit)}, what most browsers allow`;
  const summary = `Local data: ${formatBytes(usage.bytes)} of ${limitText}`;

  return (
    <div className="settings__row" data-testid="storage-usage">
      <div style={{ flex: '1 1 240px' }}>
        <ProgressBar
          value={usage.bytes}
          max={usage.limit}
          label={summary}
          valueText={`${formatBytes(usage.bytes)} of ${formatBytes(usage.limit)}, ${Math.round(Math.min(1, usage.ratio) * 100)}%`}
        />
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {summary}. Imported games and the analysis library take the most room.
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
