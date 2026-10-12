import { relayBase } from '@/features/live/relayUrls';
import { localDateKey } from '@/lib/dates';
import { useProgress } from '@/store/progress';
import type { PushDetails } from './pushSubscription';
import { forgetReminderToken, keepReminderToken, reminderToken, timeZone } from './trained';

/**
 * The daily reminder, kept on the relay (relay/src/push/reminders.mjs): it
 * pushes this device a note at the time chosen, in this device's time zone,
 * unless the device has said that day was a training day (trained.ts).
 */

/** The answers a reminder can get: kept, or why not. */
export type ReminderAnswer = 'kept' | 'full' | 'failed';

/** A new token: 32 random bytes, base64url. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Keeps this device's reminder on the relay, at `minute` after midnight here,
 * pushed to `subscription`; when today is a training day already, today's is
 * not sent. Made, or changed (the same token).
 */
export async function saveReminder(
  minute: number,
  subscription: PushDetails,
): Promise<ReminderAnswer> {
  const base = relayBase();
  if (!base) return 'failed';
  const token = reminderToken() ?? newToken();
  const today = localDateKey();
  const trained = useProgress.getState().trainingDays.includes(today);
  try {
    const response = await fetch(`${base}/v1/push/reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        subscription,
        minute,
        tz: timeZone(),
        ...(trained ? { trained: today } : {}),
      }),
    });
    if (response.status === 503) return 'full';
    if (!response.ok) return 'failed';
    keepReminderToken(token);
    return 'kept';
  } catch {
    return 'failed';
  }
}

/**
 * Deletes this device's reminder on the relay; its token is forgotten once the
 * relay has it gone. Whether it is gone.
 */
export async function deleteReminder(): Promise<boolean> {
  const token = reminderToken();
  if (!token) return true;
  const base = relayBase();
  if (!base) {
    forgetReminderToken();
    return true;
  }
  try {
    const response = await fetch(`${base}/v1/push/reminder`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return false;
    forgetReminderToken();
    return true;
  } catch {
    return false;
  }
}
