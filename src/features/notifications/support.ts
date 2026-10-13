import { useInstall } from '@/app/pwa';
import { relayBase } from '@/features/live/relayUrls';

/**
 * What this browser can do about notifications: show them ('granted'), ask
 * for them ('ask'), nothing until the learner allows them in the browser's
 * settings ('denied'), nothing outside the app on the Home Screen (iPhone and
 * iPad: 'home-screen'), or nothing at all ('unsupported').
 */
export type NotificationsHere = 'granted' | 'ask' | 'denied' | 'home-screen' | 'unsupported';

export function notificationsHere(): NotificationsHere {
  const { platform, isStandalone } = useInstall.getState();
  // iPhone and iPad give notifications only to a web app added to the Home Screen.
  if (platform === 'ios' && !isStandalone) return 'home-screen';
  if (typeof Notification !== 'function') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.permission === 'denied' ? 'denied' : 'ask';
}

/**
 * Whether the relay can push to this browser when the app is closed: the Push
 * API, a service worker, and a relay in this build.
 */
export function pushHere(): boolean {
  return (
    relayBase() !== '' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof PushManager === 'function'
  );
}

/** Asks for permission to notify (in answer to a click): whether it is granted. */
export async function allowNotifications(): Promise<boolean> {
  if (typeof Notification !== 'function') return false;
  if (Notification.permission !== 'default') return Notification.permission === 'granted';
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
