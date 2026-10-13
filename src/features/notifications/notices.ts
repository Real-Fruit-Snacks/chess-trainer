import { type Notice, notificationOptions } from '@/sw/notifications';

export type { Notice } from '@/sw/notifications';

/**
 * Shows a notice as a system notification while the app is in the background
 * (a page in view says it on the page), and only with the browser's
 * permission. It goes through the service worker where there is one (a page's
 * own notification is not allowed on Android, and the worker opens the page
 * the notice names when it is clicked). Whether it was shown.
 */
export async function showNotice(notice: Notice): Promise<boolean> {
  if (typeof document === 'undefined' || !document.hidden) return false;
  if (typeof Notification !== 'function' || Notification.permission !== 'granted') return false;
  const options = notificationOptions(notice, import.meta.env.BASE_URL);
  try {
    const worker = await navigator.serviceWorker?.getRegistration();
    if (worker) {
      await worker.showNotification(notice.title, options);
    } else {
      // No worker (the dev server): the page's own, which brings the page back when clicked.
      const shown = new Notification(notice.title, options);
      shown.onclick = () => {
        window.focus();
        shown.close();
      };
    }
    return true;
  } catch {
    return false;
  }
}
