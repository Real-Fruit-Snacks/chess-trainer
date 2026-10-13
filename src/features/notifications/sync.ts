import { useSettings } from '@/store/settings';
import { subscribeToPush, unsubscribeFromPush, usePushSubscription } from './pushSubscription';
import { deleteReminder, saveReminder } from './reminders';
import { reminderToken } from './trained';

/**
 * Brings the relay in line with this device's notification switches as the
 * app starts: a reminder switched off while the relay still has it (settings
 * reset) is deleted, and a subscription nothing needs any more is ended. With
 * a switch on, the browser's subscription is checked (one it replaced is
 * passed on) and the reminder kept again, in the time zone the device is in
 * now. Nothing is asked of the learner here: without permission, nothing happens.
 */
export async function syncNotifications(): Promise<void> {
  const { notifyReminder, notifyCorrespondence, notifyReminderMinute } = useSettings.getState();
  if (!notifyReminder && reminderToken()) await deleteReminder();
  if (!notifyReminder && !notifyCorrespondence) {
    if (usePushSubscription.getState().subscription) await unsubscribeFromPush();
    return;
  }
  if (typeof Notification !== 'function' || Notification.permission !== 'granted') return;
  const subscription = await subscribeToPush();
  if (subscription && notifyReminder) await saveReminder(notifyReminderMinute, subscription);
}
