import { relayBase } from '@/features/live/relayUrls';
import { safeLocalStorage } from '@/lib/persistStorage';

/**
 * The token this device's daily reminder is known by on the relay (32 random
 * bytes, base64url; the relay keeps only its hash). Kept while the reminder is
 * on, for this device rather than a profile: the reminder is the device's.
 */
export const REMINDER_TOKEN_KEY = 'open-file:reminder-token';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** This device's reminder token, or null when it has no reminder on the relay. */
export function reminderToken(): string | null {
  const token = safeLocalStorage.getItem(REMINDER_TOKEN_KEY);
  return typeof token === 'string' && TOKEN.test(token) ? token : null;
}

export function keepReminderToken(token: string): void {
  void safeLocalStorage.setItem(REMINDER_TOKEN_KEY, token);
}

export function forgetReminderToken(): void {
  void safeLocalStorage.removeItem(REMINDER_TOKEN_KEY);
}

/** This device's time zone ("Europe/London"), which the relay keeps the reminder's time in. */
export function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * A training day was recorded (`day`, "YYYY-MM-DD" here): the relay hears of
 * it, so that day's reminder is not sent. Only while this device has a
 * reminder; a failure is let go (the reminder then comes anyway).
 */
export function noteTrainingDay(day: string): void {
  const token = reminderToken();
  const base = relayBase();
  if (!token || !base || typeof fetch !== 'function') return;
  try {
    void fetch(`${base}/v1/push/trained`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, day, tz: timeZone() }),
      // A day trained just before the app closes still reaches the relay.
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // No network here: the reminder comes anyway.
  }
}
