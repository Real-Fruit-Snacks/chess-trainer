/** Types for reminders.mjs, for the relay's tests. */
import type { QuotaStore } from '../quota.mjs';
import type { PushMessage, Subscription, VapidKeys } from './webpush.mjs';

export interface Reminder {
  /** SHA-256 of the device's token, lowercase hex. */
  key: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The time of day, minutes after midnight in `tz` (quarter hours). */
  minute: number;
  /** An IANA time zone ("Europe/London"). */
  tz: string;
  /** When the next reminder is due. */
  nextAt: number;
  /** The last day the device trained, "YYYY-MM-DD" in `tz`. */
  trainedDay: string | null;
  createdAt: number;
  touchedAt: number;
}

export interface PushStore {
  keys(): Promise<VapidKeys | null>;
  /** Keeps the first pair only: another relay may have kept one a moment before. */
  saveKeys(keys: VapidKeys): Promise<void>;
  reminder(key: string): Promise<Reminder | null>;
  saveReminder(reminder: Reminder): Promise<void>;
  deleteReminder(key: string): Promise<boolean>;
  forgetEndpoint(endpoint: string): Promise<number>;
  countReminders(): Promise<number>;
  /** The reminders due by `now`, the oldest first, `limit` at most. */
  dueReminders(now: number, limit: number): Promise<Reminder[]>;
  expireReminders(before: number): Promise<number>;
}

export interface Respond {
  json(status: number, body: unknown, extra?: Record<string, string>): Response;
  empty(status: number, extra?: Record<string, string>): Response;
  fail(status: number, error: string, extra?: Record<string, string>): Response;
}

export const REMINDER_STEP_MINUTES: number;
export const MAX_REMINDERS: number;
export const NEW_REMINDERS_PER_ADDRESS: number;
export const REMINDERS_PER_RUN: number;
export const REMINDER_LATE_MS: number;
export const REMINDER_KEEP_MS: number;
export const PUSH_BODY_BYTES: number;
export const PUSH_REQUESTS_PER_MINUTE: number;
export const DEFAULT_PUSH_CONTACT: string;
export const REMINDER_MESSAGE: Readonly<PushMessage>;

export function pushContact(allowedOrigins: readonly string[], configured?: unknown): string;
export function knownTimeZone(tz: unknown): boolean;
export function localDay(instant: number, tz: string): string;
export function instantOf(day: string, minute: number, tz: string): number;
export function nextReminderAt(
  now: number,
  minute: number,
  tz: string,
  trainedDay: string | null,
): number;
export function pushSender(options: {
  store: Pick<PushStore, 'keys' | 'saveKeys'>;
  contact: string;
  fetch?: typeof fetch;
}): (subscription: Subscription, message: PushMessage) => Promise<'sent' | 'gone' | 'failed'>;
export function sendDueReminders(options: {
  store: PushStore;
  contact: string;
  fetch?: typeof fetch;
  now?: number;
  limit?: number;
}): Promise<{ sent: number; skipped: number; gone: number; failed: number }>;
export function expireReminders(store: PushStore, now?: number): Promise<number>;
export function rateLimiter(
  limit: number,
  windowMs: number,
): (address: string, now: number) => boolean;
export function createPushApi(options: {
  store: PushStore;
  allowedOrigins?: readonly string[];
  /** Asked before a new reminder is kept: false refuses it with 429 (a platform's limit). */
  allowReminder?: (request: Request) => boolean | Promise<boolean>;
  /** Where the daily counts are kept (the vault store's `quotas`); without them, no daily limit. */
  quotas?: QuotaStore;
  /** New reminders one address may make a UTC day (`NEW_REMINDERS_PER_ADDRESS`). */
  newRemindersPerAddress?: number;
  now?: () => number;
}): (request: Request, respond: Respond) => Promise<Response>;
