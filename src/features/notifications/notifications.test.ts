import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstall } from '@/app/pwa';
import { localDateKey } from '@/lib/dates';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { installFakeRelay } from '@/test/fakeRelay';
import { hashToken } from '../../../relay/src/handler.mjs';
import { memoryPushStore } from '../../../relay/src/push/memoryPushStore.mjs';
import { createPushApi } from '../../../relay/src/push/reminders.mjs';
import { showNotice } from './notices';
import {
  correspondencePush,
  onCorrespondencePush,
  PUSH_SUBSCRIPTION_KEY,
  subscribeToPush,
  unsubscribeFromPush,
  usePushSubscription,
} from './pushSubscription';
import { deleteReminder, saveReminder } from './reminders';
import { allowNotifications, notificationsHere, pushHere } from './support';
import { syncNotifications } from './sync';
import { noteTrainingDay, REMINDER_TOKEN_KEY, reminderToken } from './trained';

/** A browser's keys for its subscription (RFC 8291's example). */
const KEYS = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};

const bytesOf = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** The relay, with its push endpoints, behind `fetch`. */
function pushRelay() {
  const store = memoryPushStore();
  const relay = installFakeRelay({ push: createPushApi({ store }) });
  return { relay, store };
}

/** A service worker registration whose push manager makes subscriptions, and that shows notices. */
function fakeWorker() {
  let count = 0;
  let current: ReturnType<typeof subscriptionWith> | null = null;
  function subscriptionWith(key: ArrayBuffer) {
    count += 1;
    const endpoint = `https://fcm.googleapis.com/fcm/send/device-${count}`;
    const subscription = {
      endpoint,
      options: { applicationServerKey: key },
      toJSON: () => ({ endpoint, expirationTime: null, keys: KEYS }),
      unsubscribe: vi.fn(() => {
        if (current === subscription) current = null;
        return Promise.resolve(true);
      }),
    };
    return subscription;
  }
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn((options: { applicationServerKey: Uint8Array }) => {
      current = subscriptionWith(options.applicationServerKey.slice().buffer);
      return Promise.resolve(current);
    }),
  };
  const registration = {
    pushManager,
    showNotification: vi.fn((_title: string, _options?: NotificationOptions) => Promise.resolve()),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => Promise.resolve(registration) },
  });
  vi.stubGlobal('PushManager', vi.fn());
  return {
    registration,
    pushManager,
    current: () => current,
    /** A subscription the browser made with some other key (an older relay's). */
    other: () => {
      current = subscriptionWith(new Uint8Array(65).fill(9).buffer);
    },
  };
}

/** The Notification API, with the permission given. */
function notifications(
  permission: NotificationPermission,
  answer: NotificationPermission = permission,
) {
  const api = Object.assign(vi.fn(), {
    permission,
    requestPermission: vi.fn(() => {
      api.permission = answer;
      return Promise.resolve(answer);
    }),
  });
  vi.stubGlobal('Notification', api);
  return api;
}

let hidden = false;

beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  useSettings.setState({ ...DEFAULT_SETTINGS });
  usePushSubscription.setState({ subscription: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(document, 'hidden');
  localStorage.clear();
  useProgress.setState({ trainingDays: [] });
  useInstall.setState({ platform: 'desktop', isStandalone: false });
});

describe('the push subscription', () => {
  it('is made with the relay’s key, kept for the game rooms, and ended', async () => {
    pushRelay();
    const worker = fakeWorker();
    const made = await subscribeToPush();
    expect(made).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', keys: KEYS });
    expect(usePushSubscription.getState().subscription).toEqual(made);
    expect(JSON.parse(localStorage.getItem(PUSH_SUBSCRIPTION_KEY) ?? 'null')).toEqual(made);
    const key = (await (await fetch(`${siteConfig.syncRelay}/v1/push/key`)).json()) as {
      key: string;
    };
    const [options] = worker.pushManager.subscribe.mock.calls[0] ?? [];
    expect(Array.from(options?.applicationServerKey ?? [])).toEqual(Array.from(bytesOf(key.key)));

    // The browser's own is used again; one made with another key is replaced.
    expect(await subscribeToPush()).toEqual(made);
    expect(worker.pushManager.subscribe).toHaveBeenCalledTimes(1);
    worker.other();
    expect((await subscribeToPush())?.endpoint).toBe(
      'https://fcm.googleapis.com/fcm/send/device-3',
    );

    await unsubscribeFromPush();
    expect(worker.current()).toBeNull();
    expect(usePushSubscription.getState().subscription).toBeNull();
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_KEY)).toBeNull();
  });

  it('cannot be made without a worker, or with the relay out of reach', async () => {
    const { relay } = pushRelay();
    expect(await subscribeToPush()).toBeNull();
    fakeWorker();
    relay.offline = true;
    expect(await subscribeToPush()).toBeNull();
    expect(usePushSubscription.getState().subscription).toBeNull();
  });

  it('goes to correspondence rooms only while their switch is on, and says when that changes', async () => {
    pushRelay();
    fakeWorker();
    const heard: unknown[] = [];
    const stop = onCorrespondencePush((push) => heard.push(push));
    const made = await subscribeToPush();
    expect(correspondencePush()).toBeNull();
    useSettings.getState().update({ notifyCorrespondence: true });
    expect(correspondencePush()).toEqual(made);
    useSettings.getState().update({ notifyLive: true });
    useSettings.getState().update({ notifyCorrespondence: false });
    stop();
    useSettings.getState().update({ notifyCorrespondence: true });
    expect(heard).toEqual([made, null]);
  });
});

describe('the daily reminder', () => {
  it('is kept on the relay by a token’s hash, hears of training days, and is deleted', async () => {
    const { store } = pushRelay();
    fakeWorker();
    const subscription = await subscribeToPush();
    if (!subscription) throw new Error('No subscription.');
    expect(await saveReminder(7 * 60 + 30, subscription)).toBe('kept');
    const token = reminderToken() ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const key = await hashToken(token);
    expect(await store.reminder(key)).toMatchObject({
      endpoint: subscription?.endpoint,
      minute: 7 * 60 + 30,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      trainedDay: null,
    });

    // A training day recorded here reaches the relay.
    act(() => useProgress.getState().touchTraining());
    await vi.waitFor(async () =>
      expect((await store.reminder(key))?.trainedDay).toBe(localDateKey()),
    );
    // A new time keeps the same reminder, today still trained.
    expect(await saveReminder(20 * 60, subscription)).toBe('kept');
    expect(await store.reminder(key)).toMatchObject({
      minute: 20 * 60,
      trainedDay: localDateKey(),
    });
    expect(store.size()).toBe(1);

    expect(await deleteReminder()).toBe(true);
    expect(store.size()).toBe(0);
    expect(reminderToken()).toBeNull();
  });

  it('tells the relay nothing without a reminder, and lets a failure go', async () => {
    const { relay } = pushRelay();
    noteTrainingDay('2026-10-11');
    expect(relay.requests).toEqual([]);
    localStorage.setItem(REMINDER_TOKEN_KEY, 'T'.repeat(43));
    relay.offline = true;
    expect(() => noteTrainingDay('2026-10-11')).not.toThrow();
    // A reminder the relay could not take says why.
    relay.offline = false;
    expect(
      await saveReminder(17, { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: KEYS }),
    ).toBe('failed');
  });

  it('tells the limit until tomorrow from a wait of a minute', async () => {
    pushRelay();
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: KEYS };
    const refuse = (seconds: string) =>
      vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('{}', { status: 429, headers: { 'Retry-After': seconds } }),
        );
    refuse('7200');
    expect(await saveReminder(17, subscription)).toBe('limited');
    refuse('60');
    expect(await saveReminder(17, subscription)).toBe('busy');
    expect(reminderToken()).toBeNull();
  });
});

describe('what this browser can do', () => {
  it('says whether notifications can be shown, asked for, or not at all', async () => {
    expect(notificationsHere()).toBe('unsupported');
    notifications('default', 'granted');
    expect(notificationsHere()).toBe('ask');
    expect(await allowNotifications()).toBe(true);
    expect(notificationsHere()).toBe('granted');
    notifications('denied');
    expect(notificationsHere()).toBe('denied');
    expect(await allowNotifications()).toBe(false);
    // iPhone and iPad: only the app on the Home Screen.
    useInstall.setState({ platform: 'ios', isStandalone: false });
    expect(notificationsHere()).toBe('home-screen');
    useInstall.setState({ isStandalone: true });
    expect(notificationsHere()).toBe('denied');
  });

  it('says whether the relay can push here', () => {
    expect(pushHere()).toBe(false);
    fakeWorker();
    expect(pushHere()).toBe(true);
  });
});

describe('a notice shown by the app', () => {
  it('shows only while the app is in the background, with permission, through the worker', async () => {
    const worker = fakeWorker();
    const api = notifications('granted');
    const notice = {
      title: 'Your move against Swift Knight',
      body: 'Swift Knight played e5.',
      url: 'play/online/abc',
      tag: 'abc',
    };
    expect(await showNotice(notice)).toBe(false);
    hidden = true;
    expect(await showNotice(notice)).toBe(true);
    expect(worker.registration.showNotification).toHaveBeenCalledWith(
      'Your move against Swift Knight',
      expect.objectContaining({
        body: 'Swift Knight played e5.',
        tag: 'abc',
        data: { url: 'play/online/abc' },
      }),
    );
    api.permission = 'denied';
    expect(await showNotice(notice)).toBe(false);
    expect(worker.registration.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe('the relay brought in line as the app starts', () => {
  it('deletes a reminder switched off, ends a subscription nothing needs, and keeps the rest', async () => {
    const { store } = pushRelay();
    const worker = fakeWorker();
    notifications('granted');
    const subscription = await subscribeToPush();
    if (!subscription) throw new Error('No subscription.');
    await saveReminder(18 * 60, subscription);
    // Settings reset: every switch off, yet the relay has the reminder.
    await syncNotifications();
    expect(store.size()).toBe(0);
    expect(reminderToken()).toBeNull();
    expect(worker.current()).toBeNull();

    // On: the browser's subscription is checked and the reminder kept again.
    useSettings.getState().update({ notifyReminder: true, notifyReminderMinute: 9 * 60 });
    await syncNotifications();
    expect(store.size()).toBe(1);
    expect((await store.dueReminders(Number.MAX_SAFE_INTEGER, 1))[0]).toMatchObject({
      minute: 9 * 60,
      endpoint: worker.current()?.endpoint,
    });
  });
});
