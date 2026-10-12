import { useState } from 'react';
import { Card, Field, Select, Switch } from '@/components/ui';
import {
  subscribeToPush,
  unsubscribeFromPush,
  usePushSubscription,
} from '@/features/notifications/pushSubscription';
import {
  deleteReminder,
  type ReminderAnswer,
  saveReminder,
} from '@/features/notifications/reminders';
import {
  allowNotifications,
  notificationsHere,
  type NotificationsHere,
  pushHere,
} from '@/features/notifications/support';
import { useSettings } from '@/store/settings';

/** Every quarter of an hour in a day, as minutes after midnight. */
const QUARTERS = Array.from({ length: 24 * 4 }, (_, i) => i * 15);

const pad = (n: number) => String(n).padStart(2, '0');
/** "07:45". */
const timeOfDay = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

const NO_RELAY = 'The relay could not be reached. Try again in a moment.';
const RELAY_FULL = 'The relay has all the reminders it can keep just now. Try again another day.';

/** Why nothing can be switched on here, or null when something can. */
function blockedText(here: NotificationsHere): string | null {
  switch (here) {
    case 'home-screen':
      return 'On iPhone and iPad, only the app on your Home Screen can show notifications. Add it there (Share, then Add to Home Screen) and switch them on in it.';
    case 'unsupported':
      return 'This browser cannot show notifications.';
    case 'denied':
      return 'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back here.';
    default:
      return null;
  }
}

const answerText = (answer: ReminderAnswer) => (answer === 'full' ? RELAY_FULL : NO_RELAY);

/**
 * Settings → App → Notifications, for this device only: live games (shown by
 * the app itself while it is in the background), correspondence games and the
 * daily reminder (pushed by the relay, so they come with the app closed).
 * Each asks for the browser's permission as it goes on.
 */
export function NotificationSettings() {
  const live = useSettings((s) => s.notifyLive);
  const correspondence = useSettings((s) => s.notifyCorrespondence);
  const reminder = useSettings((s) => s.notifyReminder);
  const minute = useSettings((s) => s.notifyReminderMinute);
  const update = useSettings((s) => s.update);
  const [here, setHere] = useState<NotificationsHere>(notificationsHere);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const blocked = blockedText(here);
  const push = pushHere();

  /** Runs one change at a time, its problem (if any) said under the switches. */
  const run = (task: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    void task()
      .then(setProblem, () => setProblem(NO_RELAY))
      .finally(() => setBusy(false));
  };

  /** The browser's permission, asked for as a switch goes on: whether it is given. */
  const allow = async () => {
    const granted = await allowNotifications();
    setHere(notificationsHere());
    return granted;
  };

  /** The subscription goes once nothing needs it. */
  const stopPushIfUnused = async () => {
    const { notifyCorrespondence, notifyReminder } = useSettings.getState();
    if (!notifyCorrespondence && !notifyReminder) await unsubscribeFromPush();
  };

  const switchLive = (on: boolean) =>
    run(async () => {
      if (on && !(await allow())) return null;
      update({ notifyLive: on });
      return null;
    });

  const switchCorrespondence = (on: boolean) =>
    run(async () => {
      if (!on) {
        update({ notifyCorrespondence: false });
        await stopPushIfUnused();
        return null;
      }
      if (!(await allow())) return null;
      if (!(await subscribeToPush())) return NO_RELAY;
      update({ notifyCorrespondence: true });
      return null;
    });

  const switchReminder = (on: boolean) =>
    run(async () => {
      if (!on) {
        update({ notifyReminder: false });
        // Not reached now: the app tries again as it next starts.
        await deleteReminder();
        await stopPushIfUnused();
        return null;
      }
      if (!(await allow())) return null;
      const subscription = await subscribeToPush();
      if (!subscription) return NO_RELAY;
      const answer = await saveReminder(minute, subscription);
      if (answer !== 'kept') return answerText(answer);
      update({ notifyReminder: true });
      return null;
    });

  const changeTime = (next: number) =>
    run(async () => {
      update({ notifyReminderMinute: next });
      if (!useSettings.getState().notifyReminder) return null;
      const subscription = usePushSubscription.getState().subscription ?? (await subscribeToPush());
      if (!subscription) return NO_RELAY;
      const answer = await saveReminder(next, subscription);
      return answer === 'kept' ? null : answerText(answer);
    });

  const pushBlocked = blocked !== null || !push;
  return (
    <div className="settings__grid settings__grid--single">
      <Card id="notifications" data-testid="notifications">
        <h2 style={{ fontSize: '1.15rem' }}>Notifications</h2>
        <p className="small muted">
          Notes from the app while you are elsewhere. They are set on this device only.
        </p>
        <div className="settings__group">
          <Switch
            checked={live && blocked === null}
            onChange={switchLive}
            disabled={busy || blocked !== null}
            label="Live games"
            description="When someone takes the game you posted, your opponent moves or a game ends, while the app is in the background."
          />
          <Switch
            checked={correspondence && !pushBlocked}
            onChange={switchCorrespondence}
            disabled={busy || pushBlocked}
            label="Correspondence games"
            description="Your move, an invitation taken and the end of a game, even when the app is closed."
          />
          <Switch
            checked={reminder && !pushBlocked}
            onChange={switchReminder}
            disabled={busy || pushBlocked}
            label="Daily reminder"
            description="A note at the time you choose, unless you have trained that day."
          />
          <Field label="Reminder time" hint="In this device’s time zone.">
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={minute}
                disabled={busy || pushBlocked}
                onChange={(e) => changeTime(Number(e.target.value))}
                data-testid="reminder-time"
              >
                {QUARTERS.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    {timeOfDay(quarter)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {blocked ? (
            <p className="small muted" style={{ margin: 0 }} data-testid="notifications-blocked">
              {blocked}
            </p>
          ) : !push ? (
            <p className="small muted" style={{ margin: 0 }} data-testid="notifications-no-push">
              This browser cannot be reached when the app is closed: correspondence games and the
              reminder need that.
            </p>
          ) : null}
          {problem ? (
            <p className="small" role="alert" style={{ margin: 0 }}>
              {problem}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
