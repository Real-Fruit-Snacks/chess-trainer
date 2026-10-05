/** Why a download failed, in words: the browser's own messages are terse ("Failed to fetch"). */
export function describeFailure(err: unknown): string {
  // A network failure is the one TypeError fetch throws.
  if (err instanceof TypeError) return 'the network could not be reached.';
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'there is not enough storage space on this device.';
  }
  return err instanceof Error ? err.message : String(err);
}
