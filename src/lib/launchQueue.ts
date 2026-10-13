/**
 * Files the operating system opened the app with (the manifest's
 * file_handlers). Kept apart from the backup code so the start-up code can
 * register the consumer without loading it.
 */
interface LaunchParams {
  files: { getFile: () => Promise<File> }[];
}

/**
 * Handles files the OS opened the app with (the manifest's file_handlers).
 * Calls `onFile` for each; returns false when the browser has no launch queue.
 */
export function consumeLaunchFiles(onFile: (file: File) => void): boolean {
  const queue = (
    window as unknown as { launchQueue?: { setConsumer: (fn: (p: LaunchParams) => void) => void } }
  ).launchQueue;
  if (!queue) return false;
  queue.setConsumer((params) => {
    for (const handle of params.files ?? []) {
      handle
        .getFile()
        .then(onFile)
        .catch(() => undefined);
    }
  });
  return true;
}
