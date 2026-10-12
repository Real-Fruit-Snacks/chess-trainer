import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstall } from '@/app/pwa';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { NotificationSettings } from './NotificationSettings';

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/this-device',
  keys: { p256dh: 'p256dh', auth: 'auth' },
};

const push = vi.hoisted(() => ({
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(() => Promise.resolve()),
}));
const reminders = vi.hoisted(() => ({
  saveReminder: vi.fn(),
  deleteReminder: vi.fn(() => Promise.resolve(true)),
}));
vi.mock(import('@/features/notifications/pushSubscription'), async (original) => ({
  ...(await original()),
  ...push,
}));
vi.mock('@/features/notifications/reminders', () => reminders);

/** The Notification API with `permission`, which answers `answer` when asked. */
function notifications(permission: NotificationPermission, answer: NotificationPermission) {
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

/** A browser the relay can push to. */
function pushable() {
  vi.stubGlobal('PushManager', vi.fn());
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => Promise.resolve(undefined) },
  });
}

const toggle = (name: string) => screen.getByRole('switch', { name });

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS });
  useInstall.setState({ platform: 'android', isStandalone: false });
  push.subscribeToPush.mockResolvedValue(SUB);
  reminders.saveReminder.mockResolvedValue('kept');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('Settings → Notifications', () => {
  it('asks for permission as live games go on, and keeps the switch off when refused', async () => {
    const api = notifications('default', 'granted');
    render(<NotificationSettings />);
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(toggle('Live games'));
    await waitFor(() => expect(useSettings.getState().notifyLive).toBe(true));
    expect(api.requestPermission).toHaveBeenCalledTimes(1);
    expect(toggle('Live games')).toBeChecked();
    fireEvent.click(toggle('Live games'));
    await waitFor(() => expect(useSettings.getState().notifyLive).toBe(false));
  });

  it('says why nothing can go on when permission is refused', async () => {
    notifications('default', 'denied');
    render(<NotificationSettings />);
    fireEvent.click(toggle('Live games'));
    expect(await screen.findByText(/Notifications are blocked for this site/)).toBeInTheDocument();
    expect(useSettings.getState().notifyLive).toBe(false);
    expect(toggle('Live games')).toBeDisabled();
  });

  it('subscribes for correspondence games, and ends the subscription once nothing needs it', async () => {
    notifications('granted', 'granted');
    pushable();
    render(<NotificationSettings />);
    fireEvent.click(toggle('Correspondence games'));
    await waitFor(() => expect(useSettings.getState().notifyCorrespondence).toBe(true));
    expect(push.subscribeToPush).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle('Correspondence games'));
    await waitFor(() => expect(useSettings.getState().notifyCorrespondence).toBe(false));
    expect(push.unsubscribeFromPush).toHaveBeenCalledTimes(1);

    // The relay out of reach: the switch stays off, and the card says so.
    push.subscribeToPush.mockResolvedValue(null);
    fireEvent.click(toggle('Correspondence games'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The relay could not be reached. Try again in a moment.',
    );
    expect(useSettings.getState().notifyCorrespondence).toBe(false);
  });

  it('keeps the daily reminder on the relay at the time chosen, and deletes it', async () => {
    notifications('granted', 'granted');
    pushable();
    render(<NotificationSettings />);
    fireEvent.change(screen.getByLabelText('Reminder time'), {
      target: { value: String(7 * 60 + 45) },
    });
    await waitFor(() => expect(useSettings.getState().notifyReminderMinute).toBe(7 * 60 + 45));
    expect(reminders.saveReminder).not.toHaveBeenCalled();
    fireEvent.click(toggle('Daily reminder'));
    await waitFor(() => expect(useSettings.getState().notifyReminder).toBe(true));
    expect(reminders.saveReminder).toHaveBeenCalledWith(7 * 60 + 45, SUB);
    expect(screen.getByRole('option', { name: '07:45' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Reminder time'), {
      target: { value: String(20 * 60) },
    });
    await waitFor(() => expect(reminders.saveReminder).toHaveBeenLastCalledWith(20 * 60, SUB));

    fireEvent.click(toggle('Daily reminder'));
    await waitFor(() => expect(useSettings.getState().notifyReminder).toBe(false));
    expect(reminders.deleteReminder).toHaveBeenCalledTimes(1);
    expect(push.unsubscribeFromPush).toHaveBeenCalledTimes(1);

    reminders.saveReminder.mockResolvedValue('full');
    fireEvent.click(toggle('Daily reminder'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/all the reminders it can keep/);
    expect(useSettings.getState().notifyReminder).toBe(false);
  });

  it('explains what this device cannot do', () => {
    notifications('granted', 'granted');
    const { unmount } = render(<NotificationSettings />);
    // No Push API here: only live games.
    expect(screen.getByTestId('notifications-no-push')).toBeInTheDocument();
    expect(toggle('Live games')).toBeEnabled();
    expect(toggle('Correspondence games')).toBeDisabled();
    expect(toggle('Daily reminder')).toBeDisabled();
    unmount();

    // An iPhone outside the Home Screen app: nothing at all.
    useInstall.setState({ platform: 'ios', isStandalone: false });
    render(<NotificationSettings />);
    expect(screen.getByTestId('notifications-blocked')).toHaveTextContent(
      /only the app on your Home Screen can show notifications/,
    );
    expect(toggle('Live games')).toBeDisabled();
  });
});
